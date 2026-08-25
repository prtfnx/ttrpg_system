import assert from 'node:assert/strict';
import fs from 'node:fs';

const [, , trackedPath, builtPath] = process.argv;
if (!trackedPath || !builtPath) {
  throw new Error('usage: verify-wasm-fingerprint.mjs <tracked.wasm> <built.wasm>');
}

function fingerprint(path) {
  const matches = fs.readFileSync(path)
    .toString('latin1')
    .match(/fnv1a64:[0-9a-f]{16}/g) ?? [];
  const unique = [...new Set(matches)];
  assert.equal(
    unique.length,
    1,
    `${path} must contain exactly one Rust build fingerprint`,
  );
  return unique[0];
}

const trackedFingerprint = fingerprint(trackedPath);
const builtFingerprint = fingerprint(builtPath);
assert.equal(
  trackedFingerprint,
  builtFingerprint,
  `tracked WASM is stale (${trackedFingerprint} != ${builtFingerprint})`,
);
console.log(`Tracked WASM fingerprint is current: ${trackedFingerprint}`);
