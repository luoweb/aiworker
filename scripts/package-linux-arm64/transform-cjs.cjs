#!/usr/bin/env node
/**
 * Per-file ESM -> CJS transform for the single-binary (pkg) build.
 *
 * Why not bundle: the app resolves package.json, the built UI under dist/, and
 * per-module siblings through `import.meta.url` / `__dirname` (24 sites in
 * bin/ + server/). A single-file bundle collapses the directory tree, so every
 * one of those relative resolves lands in the wrong place.
 *
 * Why not ship ESM to pkg: pkg 6.x bytecompiles ESM as CJS, and its
 * --fallback-to-source path emits CJS that is then loaded as ESM
 * ("module is not defined"). A CJS entry also has no dynamic-import callback,
 * so `import()` must not survive into the packaged output.
 *
 * So: transform every runtime .js file in place, preserving the tree, and let
 * pkg package an ordinary CJS app.
 *
 *   - static import/export   -> require()/module.exports (esbuild, with
 *                               Node-compatible __toESM interop)
 *   - import.meta.url        -> require('url').pathToFileURL(__filename).href
 *                               (esbuild emits an empty `const import_meta = {}`)
 *   - dynamic import('lit')  -> Promise.resolve().then(() => __awDynImport(require('lit')))
 *                               __awDynImport reproduces Node's CJS-from-ESM
 *                               namespace: named props plus default === module.exports.
 *                               Only real code is rewritten: matches inside
 *                               strings and comments (e.g. JSDoc
 *                               `{import('pkg').Type}` annotations) are left be.
 *
 * Left untouched: test/fixture files, .mjs/.d.ts, and the standalone git
 * credential-helper scripts (top-level await; spawned by git by path, never
 * required by the serve graph).
 *
 * Usage: node transform-cjs.cjs <package-root>
 * Exit codes: 0 = everything transformed; 1 = something needs a source patch
 * first (the file list is printed).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2];
if (!root) {
  console.error('usage: node transform-cjs.cjs <package-root>');
  process.exit(2);
}

// pkg resolves 'esbuild' through NODE_PATH (it is installed globally next to it).
let esbuild;
try {
  esbuild = require('esbuild');
} catch (error) {
  console.error(`cannot load esbuild: ${error.message}`);
  console.error('install it globally (npm install -g esbuild) and set NODE_PATH=$(npm root -g)');
  process.exit(2);
}

const SOURCE_DIRS = ['bin', 'server'];

// Standalone git credential helpers: top-level await, executed by git by path,
// never required by the server. Excluded rather than patched.
const EXCLUDED_FILES = new Set([
  'server/lib/git/credential-helper.js',
  'server/lib/git/repository-credential-helper.js',
]);
const EXCLUDED_PATTERNS = [
  /\.test\.js$/, /\.test\.mjs$/, /\.spec\.js$/,
  /test-support\.js$/, /\.fixture\.js$/,
  /\.mjs$/, /\.cjs$/, /\.d\.ts$/,
];

const IMPORT_META_MARKER = 'const import_meta = {};';

const AW_DYN_IMPORT_HELPER = `
// Reproduces Node's CJS-from-ESM namespace for a rewritten dynamic import():
// named props of module.exports plus default === module.exports.
function __awDynImport(mod) {
  if (mod !== null && (typeof mod === 'object' || typeof mod === 'function')) {
    return { ...mod, default: mod };
  }
  return { default: mod };
}
`;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/** Index just past the string literal starting at `start` (handles escapes). */
function skipString(code, start) {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === quote) return i + 1;
    i += 1;
  }
  return code.length;
}

/**
 * Rewrites real dynamic `import('literal')` calls to a require-based promise,
 * in one pass that never descends into strings or comments. Returns the count
 * of rewrites and of real import() calls whose argument is not a string
 * literal (those cannot be rewritten and must be patched at the source).
 */
function rewriteDynamicImports(code) {
  let out = '';
  let i = 0;
  let rewrites = 0;
  let nonLiteral = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = skipString(code, i);
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      let end = i;
      while (end < code.length && code[end] !== '\n') end += 1;
      out += code.slice(i, end);
      i = end;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      let end = i + 2;
      while (end < code.length && !(code[end] === '*' && code[end + 1] === '/')) end += 1;
      end = Math.min(end + 2, code.length);
      out += code.slice(i, end);
      i = end;
      continue;
    }
    const prev = i > 0 ? code[i - 1] : '';
    const atWordStart = !/[\w$]/.test(prev);
    const memberAccess = prev === '.';
    if (atWordStart && !memberAccess && code.startsWith('import', i)) {
      let j = i + 6;
      while (j < code.length && /\s/.test(code[j])) j += 1;
      if (code[j] === '(') {
        let k = j + 1;
        while (k < code.length && /\s/.test(code[k])) k += 1;
        const quote = code[k];
        if (quote === '"' || quote === "'") {
          const strEnd = skipString(code, k);
          const specifier = code.slice(k + 1, strEnd - 1);
          let close = strEnd;
          while (close < code.length && /\s/.test(code[close])) close += 1;
          if (code[close] === ')') {
            out += `Promise.resolve().then(() => __awDynImport(require(${quote}${specifier}${quote})))`;
            rewrites += 1;
            i = close + 1;
            continue;
          }
        }
        // Real import() with a non-literal argument: keep it, count it, and
        // keep scanning from inside the parentheses.
        nonLiteral += 1;
        out += code.slice(i, j + 1);
        i = j + 1;
        continue;
      }
    }
    out += c;
    i += 1;
  }
  return { code: out, rewrites, nonLiteral };
}

const files = [];
for (const dir of SOURCE_DIRS) {
  const abs = path.join(root, dir);
  if (fs.existsSync(abs)) walk(abs, files);
}

const transformed = [];
const skipped = [];
const failed = [];
const nonLiteralImports = [];
let dynamicImportSites = 0;
let importMetaSites = 0;

for (const file of files) {
  const rel = path.relative(root, file);
  if (EXCLUDED_FILES.has(rel) || EXCLUDED_PATTERNS.some((re) => re.test(rel))) {
    skipped.push(rel);
    continue;
  }

  const source = fs.readFileSync(file, 'utf8');
  // The ESM idiom `const __filename = fileURLToPath(import.meta.url)` (and
  // the `__dirname` derived from it) shadows CommonJS's module-scope
  // __filename/__dirname, which makes the transformed file a SyntaxError
  // ("already declared"). Rename the local bindings: in ESM source every
  // __filename/__dirname reference belongs to that local declaration.
  const usesCjsPathBuiltins = /^(?:const|let|var) (?:__filename|__dirname) =/m.test(source);
  const patchedSource = usesCjsPathBuiltins
    ? source.replace(/\b__filename\b/g, '__awFilename').replace(/\b__dirname\b/g, '__awDirname')
    : source;
  let code;
  try {
    code = esbuild.transformSync(patchedSource, {
      format: 'cjs',
      platform: 'node',
      target: 'node22',
      loader: 'js',
      sourcefile: rel,
    }).code;
  } catch (error) {
    // Most likely top-level await (not expressible in CJS). The caller must
    // patch the source first; failing loudly beats shipping a mixed tree.
    failed.push(`${rel}: ${error.errors ? error.errors.map((e) => e.text).join('; ') : error.message}`);
    continue;
  }

  // 1) import.meta.url: esbuild emits an empty object. Point it at this file's
  //    own snapshot path so every `new URL(..., import.meta.url)`,
  //    `fileURLToPath(import.meta.url)` and `createRequire(import.meta.url)`
  //    keeps resolving relative to the right module.
  if (source.includes('import.meta')) {
    if (!code.includes(IMPORT_META_MARKER)) {
      failed.push(`${rel}: uses import.meta but esbuild emitted no ${IMPORT_META_MARKER} marker`);
      continue;
    }
    code = code.split(IMPORT_META_MARKER).join(
      'const import_meta = { url: require("url").pathToFileURL(__filename).href };',
    );
    importMetaSites += 1;
  }

  // 2) dynamic import() -> require(). pkg's CJS runtime has no dynamic-import
  //    callback, and every specifier in the serve graph is a literal after the
  //    build's source patches.
  if (/\bimport\s*\(/.test(code)) {
    const rewritten = rewriteDynamicImports(code);
    code = rewritten.code;
    dynamicImportSites += rewritten.rewrites;
    if (rewritten.rewrites > 0) code += AW_DYN_IMPORT_HELPER;
    if (rewritten.nonLiteral > 0) nonLiteralImports.push(rel);
  }

  if (code !== source) fs.writeFileSync(file, code);
  transformed.push(rel);
}

console.log(`transform: ${transformed.length} files, ${skipped.length} skipped (tests/helpers)`);
console.log(`transform: ${importMetaSites} import.meta sites, ${dynamicImportSites} dynamic imports rewritten`);

if (failed.length > 0) {
  console.error('\ntransform FAILED for:');
  for (const line of failed) console.error(`  ${line}`);
  console.error('\nPatch these sources (e.g. move top-level await into an async function) and rebuild.');
  process.exit(1);
}
if (nonLiteralImports.length > 0) {
  console.error('\nnon-literal dynamic import() left in transformed output (pkg cannot load it):');
  for (const rel of nonLiteralImports) console.error(`  ${rel}`);
  console.error('\nRewrite these to literal specifiers in the source and rebuild.');
  process.exit(1);
}
