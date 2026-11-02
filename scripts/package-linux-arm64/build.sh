#!/usr/bin/env bash
#
# Build a single, offline, standalone binary of `aiworker` for linux/arm64.
#
# This runs inside a linux/arm64 container (or on a native arm64 Linux box).
# It installs the published `aiworker` package exactly as `npm install -g aiworker`
# would, converts the ESM source tree to CommonJS per file, and bundles it with
# @yao-pkg/pkg into one executable that embeds Node 22 (pkg-fetch 6.x provides a
# linux/arm64 Node 22.23.2 base).
#
# Why the ESM -> CJS step exists: the app is an ESM package, and pkg 6.x cannot
# run it as ESM (its bytecode path compiles ESM as CJS, and --fallback-to-source
# then loads that CJS as ESM -> "module is not defined"). Bundling everything
# into one file is equally wrong: the app resolves package.json, the built UI
# under dist/, and per-module siblings through `import.meta.url`/`__dirname`
# (24 sites in bin/ + server/), which a bundle collapses. So every runtime .js
# file is transformed in place, the directory tree is preserved, and pkg
# packages an ordinary CJS app. See transform-cjs.cjs for the mechanics.
#
# Scope: Web UI + API only. Native modules used by the terminal (node-pty/bun-pty)
# and on-device voice (sherpa-onnx-node) are lazy and excluded from this build, so
# they are replaced with tiny stubs to keep the bundle clean and avoid native builds.
# As a result `serve` runs in-process (foreground); daemon/startup/tunnel background
# orchestration is not available in the single binary.
#
# Usage:
#   ./build.sh [AIWORKER_VERSION] [PKG_VERSION]
#   e.g.  ./build.sh 2.1.1 5.13.0
# Result: /out/aiworker  (single ELF binary for linux/arm64)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AIWORKER_VERSION="${1:-latest}"
PKG_VERSION="${2:-6.23.0}"
# esbuild does the per-file ESM -> CJS transform; pinned for reproducibility.
ESBUILD_VERSION="${ESBUILD_VERSION:-0.24.0}"
OUT_DIR="${OUT_DIR:-/out}"
# Package spec to install when building from registry (override for scoped
# publishes, e.g. @aiworker/web). Ignored when PKG_DIR is provided.
AIWORKER_PKG="${AIWORKER_PKG:-@aiworker/web}"

mkdir -p "$OUT_DIR"

if [ -n "${PKG_DIR:-}" ]; then
  echo "==> Using pre-installed package tree at ${PKG_DIR}"
else
  echo "==> Installing ${AIWORKER_PKG}@${AIWORKER_VERSION} (global, scripts ignored)"
  # --ignore-scripts avoids any postinstall that downloads/compiles opencode or
  # native addons; the published package already ships built dist/server.
  npm install -g "${AIWORKER_PKG}@${AIWORKER_VERSION}" --ignore-scripts
  PKG_DIR="$(npm root -g)/${AIWORKER_PKG}"
fi

cd "$PKG_DIR"
echo "==> Packaging from ${PKG_DIR}"

# npm install -g hoists scoped siblings (e.g. @aiworker/sdk) to the global
# node_modules root instead of nesting them under this package. pkg resolves
# modules from the entry file's node_modules tree, so link any hoisted
# @aiworker/* sibling into place so the bundle can resolve it.
GLOBAL_ROOT="$(npm root -g)"
# Skip the package's own directory (npm hoists the installed package itself to
# the global root alongside its scoped siblings, so its basename collides with
# the package dir's basename). Linking it onto itself would confuse pkg.
PKG_BASENAME="$(basename "$PKG_DIR")"
if [ -d "$GLOBAL_ROOT/@aiworker" ]; then
  mkdir -p node_modules/@aiworker
  for sib in "$GLOBAL_ROOT"/@aiworker/*; do
    name="$(basename "$sib")"
    [ "$name" = "$PKG_BASENAME" ] && continue
    if [ ! -e "node_modules/@aiworker/$name" ]; then
      ln -sfn "$sib" "node_modules/@aiworker/$name"
      echo "    linked hoisted sibling @aiworker/$name"
    fi
  done
fi

echo "==> Patching for single-binary (pkg) runtime"
# 1) Always treat the process as a CLI invocation when packaged.
# `-i.bak` works on both GNU (Linux) and BSD (macOS) sed; we drop the backup.
sed -i.bak 's/const isCliExecution = isModuleCliExecution(/const isCliExecution = (process.pkg) || isModuleCliExecution(/' bin/cli.js && rm -f bin/cli.js.bak
# 2) Force `serve` to run in-process (no detached child spawn) under pkg.
sed -i.bak 's/if (options.foreground) {/if (options.foreground || process.pkg) {/' bin/lib/commands-serve.js && rm -f bin/lib/commands-serve.js.bak
# 3) The foreground server is loaded via a RUNTIME-COMPUTED dynamic import
#    (import(pathToFileURL(serverPath).href)). pkg cannot resolve a dynamic
#    import it cannot see statically, so we rewrite it to a STATIC literal.
#    serverPath is package-root/server/index.js; from bin/lib/ that is
#    ../../server/index.js (bin/lib -> up two levels -> package root). Keep the
#    `await`: the replacement must still resolve to the module namespace. The
#    ESM -> CJS transform later turns this literal into a require().
sed -i.bak "s|await import(pathToFileURL(serverPath).href)|await import('../../server/index.js')|" bin/lib/commands-serve.js && rm -f bin/lib/commands-serve.js.bak
# 4) `update` self-updates by importing an arbitrary file path at runtime — also a
#    computed dynamic import, and out of scope for an offline single binary. Make
#    it throw explicitly instead of surfacing the dynamic-import callback error.
sed -i.bak "s|  return import(pathToFileURL(filePath).href);|  throw new Error('self-update is unavailable in the single-binary build');|" bin/cli.js && rm -f bin/cli.js.bak
# 5) Two module-level constants hand a URL object straight to fs. pkg's patched
#    fs layer takes string paths only (it calls path.resolve() on the argument),
#    so these throw under pkg. fileURLToPath() is a semantic no-op here and
#    works in every environment.
# 6) server/index.js has a top-level await for the legacy data-dir migration.
#    CJS cannot express top-level await, so the call moves into the exported
#    async main(), before the server starts listening — same ordering, no lost
#    work. Any edit below fails the build loudly if the upstream source moved.
node - <<'PATCH'
const fs = require('node:fs');
const path = require('node:path');

function patch(rel, edits) {
  const file = path.join(process.cwd(), rel);
  let code = fs.readFileSync(file, 'utf8');
  for (const [from, to] of edits) {
    const parts = code.split(from);
    if (parts.length !== 2) {
      throw new Error(`${rel}: expected exactly one occurrence of:\n${from}\nfound ${parts.length - 1}`);
    }
    code = parts.join(to);
  }
  fs.writeFileSync(file, code);
}

patch('server/lib/spaces/gatekeeper-channel.js', [
  [
    "import { readFileSync } from 'node:fs';",
    "import { readFileSync } from 'node:fs';\nimport { fileURLToPath } from 'node:url';",
  ],
  [
    "readFileSync(new URL('./gatekeeper-program.cjs', import.meta.url), 'utf8')",
    "readFileSync(fileURLToPath(new URL('./gatekeeper-program.cjs', import.meta.url)), 'utf8')",
  ],
]);

patch('server/lib/spaces/tools.js', [
  [
    "import fs from 'node:fs';",
    "import fs from 'node:fs';\nimport { fileURLToPath } from 'node:url';",
  ],
  [
    "packageJsonUrl = new URL('../../../package.json', import.meta.url)",
    "packageJsonUrl = fileURLToPath(new URL('../../../package.json', import.meta.url))",
  ],
]);

const MIGRATION_BLOCK = `const movedUserDirs = await migrateLegacyUserDirs({
  fsPromises,
  path,
  dataDir: AIWORKER_USER_CONFIG_ROOT,
  legacyRoot: AIWORKER_DEFAULT_CONFIG_ROOT,
  warn: (message) => console.warn(\`[data-dir] \${message}\`),
});
if (movedUserDirs.length > 0) {
  console.log(\`[data-dir] Copied \${movedUserDirs.join(', ')} into \${AIWORKER_USER_CONFIG_ROOT}\`);
}
`;
patch('server/index.js', [
  [MIGRATION_BLOCK, ''],
  ['async function main(options = {}) {\n', `async function main(options = {}) {\n${MIGRATION_BLOCK.replace(/^/gm, '  ')}`],
]);
console.log('patched URL-to-fs sites; moved the data-dir migration into main()');
PATCH

echo "==> Stubbing native modules (web-only build)"
for m in node-pty bun-pty sherpa-onnx-node; do
  d="node_modules/$m"
  rm -rf "$d"
  mkdir -p "$d"
  printf '{"name":"%s","version":"0.0.0-stub","main":"index.js"}' "$m" > "$d/package.json"
  cat > "$d/index.js" <<'EOF'
// Stub for the single-binary, web-only build. The real native addon is only
// used by terminal (node-pty/bun-pty) and on-device voice (sherpa-onnx-node),
// which are out of scope here. Throwing keeps failures explicit.
module.exports = {
  spawn: () => { throw new Error('native module stub: not available in web-only single-binary build'); },
};
EOF
done

echo "==> Installing esbuild@${ESBUILD_VERSION} (per-file ESM -> CJS transform)"
npm install -g "esbuild@${ESBUILD_VERSION}"

# pkg cannot load this app as ESM, and a single-file bundle would break the
# app's per-module relative paths. Transform every runtime .js file in place
# instead; the script fails loudly on anything it cannot convert (e.g. a new
# top-level await upstream) rather than shipping a mixed tree.
echo "==> Transforming ESM -> CJS (per-file, directory tree preserved)"
NODE_PATH="${GLOBAL_ROOT}" node "${SCRIPT_DIR}/transform-cjs.cjs" "${PKG_DIR}"

# The tree is plain CJS now; say so, so nothing downstream re-detects the old
# "type": "module". The embedded package.json only carries version metadata.
node -e '
  const fs = require("node:fs");
  const file = "package.json";
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (pkg.type === "module") {
    pkg.type = "commonjs";
    fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
    console.log("package.json: type module -> commonjs");
  }
'

echo "==> Installing @yao-pkg/pkg@${PKG_VERSION}"
npm install -g "@yao-pkg/pkg@${PKG_VERSION}"

# --- Pre-seed the patched Node base binary into pkg's cache -------------------
# pkg-fetch downloads the *patched* Node base from GitHub releases, which is
# unreachable in some networks (the download redirects to a blocked asset host).
# npmmirror mirrors the exact same artifact, so we fetch it ahead of time into
# PKG_CACHE_PATH/<tag>/<name>; pkg then uses it offline instead of fetching.
# This is a no-op if the binary is already cached (e.g. GitHub reachable envs).
PKG_CACHE_PATH="${PKG_CACHE_PATH:-$HOME/.pkg-cache}"
export PKG_CACHE_PATH
PF_DIR="$(npm root -g)/@yao-pkg/pkg/node_modules/@yao-pkg/pkg-fetch"
export PF_DIR
# tag = pkg-fetch major.minor (e.g. 3.6); base node version = latest satisfying
# the target range in pkg-fetch's patches.json.
read -r PF_TAG NODE_BASE_VER <<< "$(node -e '
  const pfVer = require(process.env.PF_DIR + "/package.json").version;
  const tag = "v" + pfVer.split(".").slice(0, 2).join(".");
  const patches = require(process.env.PF_DIR + "/patches/patches.json");
  // We target node22; pick the highest v22.x base pkg-fetch knows about.
  const vs = Object.keys(patches)
    .filter(v => v.startsWith("v22."))
    .sort();
  console.log(tag, vs[vs.length - 1]);
')"
# pkg-fetch stores the cached base as "fetched-<node>-<plat>-<arch>".
PKG_BASE_NAME="fetched-${NODE_BASE_VER}-linux-arm64"
PKG_BASE_DIR="${PKG_CACHE_PATH}/${PF_TAG}"
PKG_BASE_PATH="${PKG_BASE_DIR}/${PKG_BASE_NAME}"
export PKG_BASE_PATH
if [ ! -f "${PKG_BASE_PATH}" ]; then
  mkdir -p "${PKG_BASE_DIR}"
  echo "==> Fetching patched Node base (${PF_TAG}/node-${NODE_BASE_VER}-linux-arm64) from npmmirror"
  # npmmirror publishes it as "node-<ver>-linux-arm64"; we save it locally under
  # the name pkg-fetch expects ("fetched-<ver>-linux-arm64"). Use Node's built-in
  # fetch (always present on Node 18+); fall back to curl/wget if needed.
  export NPMM_URL="https://cdn.npmmirror.com/binaries/pkg-fetch/${PF_TAG}/node-${NODE_BASE_VER}-linux-arm64"
  if command -v node >/dev/null 2>&1; then
    # Best-effort only: if this fails, pkg falls back to its own GitHub fetch
    # (which works from Linux build environments). Never abort the build here.
    node -e '
      const fs = require("fs");
      const url = process.env.NPMM_URL, out = process.env.PKG_BASE_PATH;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 120000);
      (async () => {
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) throw new Error("HTTP " + r.status + " for " + url);
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(out, buf);
        console.log("  saved " + buf.length + " bytes");
      })().catch(e => { console.error("  preseed download skipped:", e.message); })
        .finally(() => clearTimeout(t));
    '
  elif command -v curl >/dev/null 2>&1; then
    curl -fsSL "${NPMM_URL}" -o "${PKG_BASE_PATH}" || true
  elif command -v wget >/dev/null 2>&1; then
    wget -q "${NPMM_URL}" -O "${PKG_BASE_PATH}" || true
  else
    echo "ERROR: no download tool (node/curl/wget) available" >&2
    exit 1
  fi
fi
# The preseed is saved at pkg-fetch's expected cache path
# ($PKG_CACHE_PATH/<tag>/fetched-<node>-linux-arm64) with the exact official
# hash, so pkg picks it up locally (no GitHub download) and can still generate
# V8 bytecode against it. No PKG_NODE_PATH needed.

# pkg 6.x no longer accepts --assets on the CLI; asset globs live in a config
# file. The server reads dist/public and server JSON/wasm/cjs via fs at runtime,
# so they must be explicitly embedded. Paths are relative to this package dir.
cat > pkg.config.json <<'EOF'
{
  "assets": [
    "dist/**/*",
    "public/**/*",
    "package.json",
    "server/**/*.json",
    "server/**/*.wasm",
    "server/**/*.cjs"
  ]
}
EOF

PKG_ARGS=(
  # The tree is CJS after the transform step, so the real CLI entry is the pkg
  # entry directly. No ESM shim is needed (and a CJS entry cannot use pkg's
  # dynamic-import callback anyway — every dynamic import was rewritten).
  bin/cli.js
  -c pkg.config.json
  # Embedded Node runtime. pkg-fetch publishes prebuilt linux/arm64 bases for
  # v22.23.2 / v24.20.0 / v26.8.1 (6.x); we use the LTS closest to the app's
  # Node 20. (pkg-fetch 5.x only had v20.17.0 which was never published as a
  # linux/arm64 base, so it couldn't be fetched.)
  --targets node22-linux-arm64
  # If V8 bytecode generation fails for a file, ship it as plain source instead
  # of dropping it (otherwise a dependency would be missing and the binary
  # crashes).
  --fallback-to-source
  --output "${OUT_DIR}/aiworker"
)

# NOTE: This build must run on a Linux host (native or via Docker). pkg 6.x
# generates bytecode by executing the *target* base Node, so it cannot
# cross-compile from macOS/Windows to linux/arm64. The Dockerfile below runs the
# build on linux/arm64, where it works natively.

echo "==> Packaging binary (node22-linux-arm64)"
pkg "${PKG_ARGS[@]}"

echo "==> Built: ${OUT_DIR}/aiworker"
ls -lh "${OUT_DIR}/aiworker"
file "${OUT_DIR}/aiworker" 2>/dev/null || true
