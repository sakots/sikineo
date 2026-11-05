const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const manifest = require('../package.json');

test('CommonJSで読み込んだ有効なstartupプラグインが起動完了を通知する', async () => {
  const plugin = require('..');
  const enabledPlugins = new Set([manifest.name]);
  const emitter = new EventEmitter();
  const notifications = [];
  emitter.on('plugin:sikineo:ready', (...args) => notifications.push(args));

  if (plugin.type === 'startup' && enabledPlugins.has(plugin.meta.name)) {
    await plugin.mainScript({ config: {}, userSettings: {} }, { emitter });
  }

  assert.deepEqual(notifications, [[]]);
});
