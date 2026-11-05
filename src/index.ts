import { once, type EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { createDrawingServer } from './server';

const { name, description, version }: {
  name: string;
  description: string;
  version: string;
} = require('../package.json');

export const type = 'startup';

export const meta = {
  name,
  description,
  version,
  needVersion: '0.43.12',
};

export async function mainScript(
  _settings: unknown,
  tools: { emitter: Pick<EventEmitter, 'emit'> },
): Promise<void> {
  const server = createDrawingServer(resolve(__dirname, '..'));
  const listening = once(server, 'listening');
  server.listen(57830, '127.0.0.1');
  await listening;
  server.unref();
  tools.emitter.emit('plugin:sikineo:ready');
}
