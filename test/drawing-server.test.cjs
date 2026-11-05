const assert = require('node:assert/strict');
const { cp, mkdtemp, rm, writeFile } = require('node:fs/promises');
const { request } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { createDrawingServer } = require('../dist/server.js');

async function startServer(t, resolveTarget = async () => ({
  tabid: '2', location: 'https://egg.5ch.io/test/read.cgi/software/1234567890/',
  title: 'HTTP boundary fixture', width: 500, height: 250, webContentsId: 1,
})) {
  const directory = await mkdtemp(join(tmpdir(), 'sikineo-http-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(join(__dirname, '../public'), join(directory, 'public'), { recursive: true });
  await writeFile(join(directory, 'package.json'), 'private-profile-marker');
  const server = createDrawingServer(directory, {
    resolveTarget,
    attach: async () => assert.fail('拒否されたリクエストがSikiを変更してはいけない'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const port = server.address().port;

  const get = (path, options = {}) => new Promise((resolve, reject) => {
    const { body: requestBody, ...requestOptions } = options;
    const req = request({ host: '127.0.0.1', port, path, ...requestOptions }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(requestBody);
  });
  return { directory, get, origin: `http://127.0.0.1:${port}` };
}

test('ローカルneoの配置に関係なくSikiの添付先がなければ開始を拒否する', async (t) => {
  const { get } = await startServer(t, async () => { throw new Error('対象スレッドがありません'); });
  assert.equal((await get('/')).status, 409);
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

test('添付APIは別オリジン・偽造セッション・不正な本文をSikiへ渡さない', async (t) => {
  const { get, origin } = await startServer(t);
  const headers = { origin, 'content-type': 'application/json' };
  assert.equal((await get('/attachment', {
    method: 'POST', headers: { ...headers, origin: 'http://attacker.example' }, body: '{}',
  })).status, 403);
  assert.equal((await get('/attachment', {
    method: 'POST', headers, body: JSON.stringify({ token: 'forged', dataUrl: 'data:image/png;base64,AAAA' }),
  })).status, 403);
  assert.equal((await get('/attachment', {
    method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: '{}',
  })).status, 415);
  assert.equal((await get('/attachment', {
    method: 'POST', headers, body: '{',
  })).status, 400);
  assert.equal((await get('/attachment', {
    method: 'POST', headers, body: 'x'.repeat(2 * 1024 * 1024 + 1),
  })).status, 413);
});
