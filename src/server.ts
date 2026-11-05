import { randomBytes } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { AttachmentBridge, AttachmentTarget } from './attachment';

const contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function createDrawingServer(pluginDirectory: string, bridge: AttachmentBridge) {
  const neoScript = join(pluginDirectory, 'neo/neo.js');
  const neoStyle = join(pluginDirectory, 'neo/neo.css');
  const resources: Record<string, { file: string; mime: string }> = {
    '/drawing.js': { file: join(pluginDirectory, 'dist/drawing.js'), mime: 'text/javascript; charset=utf-8' },
    '/drawing.css': { file: join(pluginDirectory, 'public/drawing.css'), mime: 'text/css; charset=utf-8' },
    '/neo/neo.js': { file: neoScript, mime: 'text/javascript; charset=utf-8' },
    '/neo/neo.css': { file: neoStyle, mime: 'text/css; charset=utf-8' },
  };
  const sessions = new Map<string, AttachmentTarget>();
  const escapedCharacters: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  let allowedHost = '';

  const server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', contentSecurityPolicy);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');

    function reject(status: number, message: string): void {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ error: message }));
    }

    function send(data: Buffer | string, mime: string, status = 200): void {
      response.writeHead(status, { 'Content-Type': mime, 'Content-Length': Buffer.byteLength(data) });
      response.end(request.method === 'HEAD' ? undefined : data);
    }

    async function sendFile(file: string, mime: string, status = 200): Promise<void> {
      try {
        send(await readFile(file), mime, status);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(404, 'Not Found');
          return;
        }
        throw error;
      }
    }

    async function handle(): Promise<void> {
      if (request.headers.host !== allowedHost) {
        reject(403, 'Forbidden');
        return;
      }
      const origin = `http://${allowedHost}`;
      let url: URL;
      try {
        url = new URL(request.url ?? '/', origin);
      } catch {
        reject(400, 'Invalid URL');
        return;
      }
      if (url.pathname === '/attachment' && request.method === 'POST') {
        if (request.headers.origin !== origin) {
          reject(403, 'Originが一致しません');
          return;
        }
        if (request.headers['content-type']?.split(';', 1)[0].trim() !== 'application/json') {
          reject(415, 'JSONが必要です');
          return;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes <= 2 * 1024 * 1024) chunks.push(chunk);
        }
        if (bytes > 2 * 1024 * 1024) {
          reject(413, '画像の受信上限は2MiBです');
          return;
        }
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          reject(400, 'JSONを読み込めません');
          return;
        }
        if (!body || typeof body !== 'object') {
          reject(400, '添付情報がありません');
          return;
        }
        const { token, dataUrl } = body as { token?: unknown; dataUrl?: unknown };
        const target = typeof token === 'string' ? sessions.get(token) : undefined;
        if (!target) {
          reject(403, '描画画面をSikiの対象スレッドから開き直してください');
          return;
        }
        if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) {
          reject(400, 'PNG画像が必要です');
          return;
        }
        try {
          await bridge.attach(target, dataUrl);
        } catch (error) {
          reject(409, error instanceof Error ? error.message : 'Sikiへの画像引き渡しに失敗しました');
          return;
        }
        send('{"ok":true}', 'application/json; charset=utf-8');
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        reject(405, 'Method Not Allowed');
        return;
      }
      if (url.pathname === '/') {
        try {
          await Promise.all([access(neoScript), access(neoStyle)]);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          await sendFile(join(pluginDirectory, 'public/setup.html'), 'text/html; charset=utf-8', 503);
          return;
        }
        let target: AttachmentTarget;
        try {
          target = await bridge.resolveTarget();
        } catch (error) {
          reject(409, error instanceof Error ? error.message : '添付先を確認できません');
          return;
        }
        const token = randomBytes(32).toString('hex');
        const metadata = JSON.stringify({
          token, title: target.title, width: target.width, height: target.height,
        }).replace(/[&<>"']/g, (character) => escapedCharacters[character]);
        const html = (await readFile(join(pluginDirectory, 'public/index.html'), 'utf8'))
          .replace('__SIKINEO_SESSION__', () => metadata);
        if (request.method === 'GET') sessions.set(token, target);
        send(html, 'text/html; charset=utf-8');
        return;
      }
      const path = url.pathname;
      if (!Object.prototype.hasOwnProperty.call(resources, path)) {
        reject(404, 'Not Found');
        return;
      }
      const resource = resources[path];
      await sendFile(resource.file, resource.mime);
    }

    void handle().catch((error: unknown) => {
      console.error('[sikineo] 描画ページの配信に失敗しました', error);
      reject(500, 'Internal Server Error');
    });
  });
  server.once('listening', () => {
    allowedHost = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  return server;
}
