import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyUpdateManifest } from './verify-update-manifest.mjs';

const entryFor = (name, bytes) => [
  `  - url: ${name}`,
  `    sha512: ${crypto.createHash('sha512').update(bytes).digest('base64')}`,
  `    size: ${bytes.length}`,
];

const fixture = (t, manifestName, artifactNames, fields) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-manifest-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifactPaths = artifactNames.map((name) => {
    const artifactPath = path.join(root, name);
    fs.writeFileSync(artifactPath, Buffer.from(`artifact:${name}`));
    return artifactPath;
  });
  const manifestPath = path.join(root, manifestName);
  fs.writeFileSync(manifestPath, [
    'version: 1.15.0',
    'files:',
    ...(fields || artifactNames.flatMap((name) => entryFor(name, Buffer.from(`artifact:${name}`)))),
    `path: ${artifactNames[0]}`,
    'releaseDate: 2026-07-10T00:00:00.000Z',
    '',
  ].join('\n'));
  return { root, artifactPaths, manifestPath };
};

for (const [manifestName, arch, debArch] of [
  ['latest-linux.yml', 'x86_64', 'amd64'],
  ['latest-linux-arm64.yml', 'arm64', 'arm64'],
]) {
  test(`validates architecture-specific ${manifestName} with the AppImage, .deb and .rpm`, (t) => {
    const names = [
      `OpenChamber-1.15.0-linux-${arch}.AppImage`,
      `OpenChamber-1.15.0-linux-${debArch}.deb`,
      `OpenChamber-1.15.0-linux-${arch === 'x86_64' ? 'x86_64' : 'aarch64'}.rpm`,
    ];
    const value = fixture(t, manifestName, names);
    const result = verifyUpdateManifest({ ...value, expectedVersion: '1.15.0' });
    assert.deepEqual(result.artifacts.map(({ name }) => name), names);
  });
}

test('accepts electron-builder field ordering and optional blockMapSize', (t) => {
  const artifactName = 'OpenChamber-1.15.0-linux-x86_64.AppImage';
  const bytes = Buffer.from(`artifact:${artifactName}`);
  const value = fixture(t, 'latest-linux.yml', [artifactName], [
    `  - sha512: ${crypto.createHash('sha512').update(bytes).digest('base64')}`,
    `    size: ${bytes.length}`,
    '    blockMapSize: 1234',
    `    url: ${artifactName}`,
  ]);
  assert.equal(verifyUpdateManifest({ ...value, expectedVersion: '1.15.0' }).artifacts[0].name, artifactName);
});

test('rejects a manifest that points at the other architecture artifact', (t) => {
  const value = fixture(t, 'latest-linux-arm64.yml', ['OpenChamber-1.15.0-linux-arm64.AppImage']);
  const x64Artifact = path.join(value.root, 'OpenChamber-1.15.0-linux-x86_64.AppImage');
  fs.copyFileSync(value.artifactPaths[0], x64Artifact);
  assert.throws(() => verifyUpdateManifest({
    manifestPath: value.manifestPath,
    artifactPaths: [x64Artifact],
    expectedVersion: '1.15.0',
  }), /artifact mismatch/);
});

test('rejects a manifest that leaves out one of the release files', (t) => {
  const names = ['OpenChamber-1.15.0-linux-x86_64.AppImage', 'OpenChamber-1.15.0-linux-amd64.deb'];
  const value = fixture(t, 'latest-linux.yml', names, entryFor(names[0], Buffer.from(`artifact:${names[0]}`)));
  assert.throws(() => verifyUpdateManifest({ ...value, expectedVersion: '1.15.0' }), /artifact mismatch/);
});

test('rejects a listed file whose bytes changed', (t) => {
  const names = ['OpenChamber-1.15.0-linux-x86_64.AppImage', 'OpenChamber-1.15.0-linux-amd64.deb'];
  const value = fixture(t, 'latest-linux.yml', names);
  fs.writeFileSync(value.artifactPaths[1], 'tampered');
  assert.throws(() => verifyUpdateManifest({ ...value, expectedVersion: '1.15.0' }), /mismatch for OpenChamber-1\.15\.0-linux-amd64\.deb/);
});

// The release workflows call this script as a CLI; only the exported function
// was covered before, so a swapped argument order shipped and failed in CI
// ("expected <artifact path>, got <version>"). Lock the argv contract:
// <manifest> <version> <artifact>...
test('the CLI takes <manifest> <version> <artifact> and rejects a swapped order', (t) => {
  const value = fixture(t, 'latest-linux.yml', ['OpenChamber-1.15.0-linux-x86_64.AppImage']);
  const scriptPath = fileURLToPath(new URL('./verify-update-manifest.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [scriptPath, ...args], { encoding: 'utf8' });

  const ok = run(value.manifestPath, '1.15.0', value.artifactPaths[0]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /verified latest-linux\.yml for OpenChamber-1\.15\.0-linux-x86_64\.AppImage/);

  const swapped = run(value.manifestPath, value.artifactPaths[0], '1.15.0');
  assert.equal(swapped.status, 1);
  assert.match(swapped.stderr, /version mismatch/);
});
