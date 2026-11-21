import { spawn } from 'node:child_process';
import assert from 'node:assert';
import { encrypt, decrypt } from './dist/services/crypto.js';

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('--- 1. Testing AES-256-GCM Encryption / Decryption ---');
const secret = 'my-super-secret-ssh-private-key-12345';
const encrypted = encrypt(secret);
console.log('Encrypted:', encrypted);
assert(encrypted.ciphertext !== secret, 'Ciphertext must not match secret');
assert(encrypted.ivTag.includes(':'), 'ivTag must contain colon separator');

const decrypted = decrypt(encrypted.ciphertext, encrypted.ivTag);
assert.strictEqual(decrypted, secret, 'Decrypted text must match original secret');
console.log('✅ AES-256-GCM Encryption/Decryption test passed!\n');

console.log('--- 2. Starting Server for API Integration Test ---');
const serverProc = spawn('node', [path.join(__dirname, 'dist/index.js')], {
  cwd: __dirname,
  stdio: 'pipe',
  env: {
    ...process.env,
    PORT: '3099',
    DATA_DIR: path.join(__dirname, 'test_data'),
    DB_PATH: path.join(__dirname, 'test_data/test.db'),
  },
});

let serverStarted = false;
serverProc.stdout.on('data', (d) => {
  const msg = d.toString();
  if (msg.includes('NexusSSH Server running')) {
    serverStarted = true;
  }
});
serverProc.stderr.on('data', (d) => {
  // console.error('server err:', d.toString());
});

async function runTests() {
  // Wait up to 5s for server
  for (let i = 0; i < 20; i++) {
    if (serverStarted) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(serverStarted, 'Server failed to start in time');
  console.log('✅ Server started on port 3099\n');

  const BASE = 'http://localhost:3099';

  console.log('Testing GET /api/auth/status...');
  const statusRes = await fetch(`${BASE}/api/auth/status`).then((r) => r.json());
  assert.strictEqual(statusRes.needsSetup, true, 'needsSetup should be true initially');
  console.log('✅ Auth status verified:', statusRes);

  console.log('Testing POST /api/auth/setup...');
  const setupRes = await fetch(`${BASE}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'superadmin', password: 'password123' }),
  }).then((r) => r.json());
  assert(setupRes.token, 'Must return JWT token');
  assert.strictEqual(setupRes.user.username, 'superadmin');
  console.log('✅ Admin account created successfully!');
  const token = setupRes.token;

  console.log('Testing GET /api/auth/me...');
  const meRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert.strictEqual(meRes.user.username, 'superadmin');
  console.log('✅ /api/auth/me token verified');

  console.log('Testing POST /api/nodes (Add VM Node)...');
  const addNodeRes = await fetch(`${BASE}/api/nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'test-lab-vm',
      groupName: 'HomeLab',
      host: '127.0.0.1',
      port: 22,
      username: 'root',
      authType: 'password',
      credential: 'dummy-password-for-test',
    }),
  }).then((r) => r.json());
  assert(addNodeRes.id, 'Node ID must be generated');
  assert.strictEqual(addNodeRes.name, 'test-lab-vm');
  console.log('✅ Node added successfully:', addNodeRes.id);

  console.log('Testing GET /api/nodes (List VM Nodes)...');
  const listNodesRes = await fetch(`${BASE}/api/nodes`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert(Array.isArray(listNodesRes) && listNodesRes.length === 1);
  assert.strictEqual(listNodesRes[0].name, 'test-lab-vm');
  assert(!('encrypted_credential' in listNodesRes[0]), 'encrypted_credential must not be exposed to client');
  console.log('✅ Nodes list verified (credentials protected)');

  console.log('Testing GET /api/snippets...');
  const snippetsRes = await fetch(`${BASE}/api/snippets`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  assert(Array.isArray(snippetsRes) && snippetsRes.length > 0, 'Default snippets should be seeded');
  console.log(`✅ Default snippets verified (${snippetsRes.length} snippets available)`);

  console.log('Testing Frontend Static Serving...');
  const frontendHtml = await fetch(`${BASE}/`).then((r) => r.text());
  assert(frontendHtml.includes('NexusSSH'), 'Frontend index.html served correctly');
  console.log('✅ Frontend static assets served properly');

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED PERFECTLY! 🎉\n');
}

runTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    serverProc.kill();
  });
