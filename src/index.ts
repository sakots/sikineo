import type { EventEmitter } from 'node:events';

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
  needVersion: '0.43.6',
};

export function mainScript(
  _settings: unknown,
  tools: { emitter: Pick<EventEmitter, 'emit'> },
): void {
  tools.emitter.emit('plugin:sikineo:ready');
}
