import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

const contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export function createDrawingServer(pluginDirectory: string) {
  const neoScript = join(pluginDirectory, 'neo/neo.js');
  const neoStyle = join(pluginDirectory, 'neo/neo.css');
  const resources: Record<string, { file: string; mime: string }> = {
    '/drawing.js': { file: join(pluginDirectory, 'dist/drawing.js'), mime: 'text/javascript; charset=utf-8' },
    '/drawing.css': { file: join(pluginDirectory, 'public/drawing.css'), mime: 'text/css; charset=utf-8' },
    '/neo/neo.js': { file: neoScript, mime: 'text/javascript; charset=utf-8' },
    '/neo/neo.css': { file: neoStyle, mime: 'text/css; charset=utf-8' },
  };
  let allowedHost = '';

  const server = createServer((request, response) => {
    response.setHeader('Content-Security-Policy', contentSecurityPolicy);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');

    function reject(status: number, message: string): void {
      response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : message);
    }

    async function sendFile(file: string, mime: string, status = 200): Promise<void> {
      let data: Buffer;
      try {
        data = await readFile(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(404, 'Not Found');
          return;
        }
        throw error;
      }
      response.writeHead(status, { 'Content-Type': mime, 'Content-Length': data.byteLength });
      response.end(request.method === 'HEAD' ? undefined : data);
    }

    async function handle(): Promise<void> {
      if (request.headers.host !== allowedHost) {
        reject(403, 'Forbidden');
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.setHeader('Allow', 'GET, HEAD');
        reject(405, 'Method Not Allowed');
        return;
      }
      if (request.url === '/') {
        let configured = true;
        try {
          await Promise.all([access(neoScript), access(neoStyle)]);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          configured = false;
        }
        await sendFile(
          join(pluginDirectory, configured ? 'public/index.html' : 'public/setup.html'),
          'text/html; charset=utf-8',
          configured ? 200 : 503,
        );
        return;
      }
      const path = request.url ?? '';
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
