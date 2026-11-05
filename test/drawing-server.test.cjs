const assert = require('node:assert/strict');
const { cp, mkdir, mkdtemp, rm, writeFile } = require('node:fs/promises');
const { request } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { createDrawingServer } = require('../dist/server.js');

async function startServer(t) {
  const directory = await mkdtemp(join(tmpdir(), 'sikineo-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(join(__dirname, '../public'), join(directory, 'public'), { recursive: true });
  await writeFile(join(directory, 'package.json'), 'private-profile-marker');
  const server = createDrawingServer(directory);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const port = server.address().port;

  const get = (path, options = {}) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, ...options }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
  return { directory, get };
}

test('neo本体の両ファイルを配置すると再起動なしで案内から描画画面へ切り替わる', async (t) => {
  const { directory, get } = await startServer(t);
  assert.equal((await get('/')).status, 503);
  await mkdir(join(directory, 'neo'));
  await writeFile(join(directory, 'neo/neo.js'), 'globalThis.fixture = true;');
  assert.equal((await get('/')).status, 503);
  await writeFile(join(directory, 'neo/neo.css'), 'body { margin: 0; }');
  assert.equal((await get('/')).status, 200);
});

test('別ホスト・書き込み・許可リスト外のファイルは配信しない', async (t) => {
  const { get } = await startServer(t);
  const foreignHost = await get('/', { headers: { host: 'attacker.example' } });
  assert.equal(foreignHost.status, 403);
  const post = await get('/', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, 'GET, HEAD');
  for (const path of ['/package.json', '/neo/%2e%2e/package.json']) {
    const response = await get(path);
    assert.equal(response.status, 404);
    assert.doesNotMatch(response.body, /private-profile-marker/);
  }
});
