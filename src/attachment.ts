import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AttachmentTarget {
  tabid: string;
  location: string;
  title: string;
  width: number;
  height: number;
  webContentsId: number;
}

export interface AttachmentBridge {
  resolveTarget(): Promise<AttachmentTarget>;
  attach(target: AttachmentTarget, dataUrl: string): Promise<void>;
}

interface SikiWebContents {
  id: number;
  isDestroyed(): boolean;
  getURL(): string;
  executeJavaScript(source: string): Promise<unknown>;
}

interface SikiElectron {
  app: { getAppPath(): string };
  webContents: { getAllWebContents(): SikiWebContents[] };
  nativeImage: {
    createFromDataURL(dataUrl: string): {
      isEmpty(): boolean;
      getSize(): { width: number; height: number };
    };
  };
}

type RendererRoot = 'main' | 'floating';

interface NativeThread {
  location: string;
  sitename: string;
  server: string;
  board: string;
  threadkey: string;
}

interface ResolvedThread {
  tabid: string;
  thread: NativeThread;
  title: string;
  width: number;
  height: number;
}

interface RendererRequest {
  root: RendererRoot;
  tabid: string;
  location: string;
  expected?: ResolvedThread;
  dataUrl?: string;
}

// This function is serialized into Siki's renderer. Keep it self-contained; all
// request data crosses executeJavaScript through JSON.stringify, never as code.
async function inSikiRenderer(request: RendererRequest): Promise<ResolvedThread | null> {
  const host = window as unknown as {
    rootID?: string;
    rendererApi?: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
    siki_execCommand?: (command: string, ...args: unknown[]) => unknown;
  };
  const assertHost = (): void => {
    const rootElement = request.root === 'main' ? 'root' : 'floatingRoot';
    if (host.rootID !== request.root || !document.getElementById(rootElement)) {
      throw new Error('Siki main/floating renderer is unavailable. Reopen the drawing from its thread.');
    }
  };
  const findTab = (): Element | undefined => {
    assertHost();
    return Array.from(document.querySelectorAll('.tabbase[data-tabid]'))
      .find((element) => element.getAttribute('data-tabid') === request.tabid);
  };
  const assertTab = (thread: NativeThread): Element => {
    const tab = findTab();
    const classes = [
      'thread-item',
      `th__${thread.threadkey}`,
      `bd__${thread.board}`,
      `sv__${thread.server.replace(/\./g, '_')}`,
      `st__${thread.sitename.replace(/\./g, '_')}`,
    ];
    if (!tab || !classes.every((name) => tab.classList.contains(name))) {
      throw new Error('The captured Siki thread was closed or changed. Reopen the drawing from that thread.');
    }
    return tab;
  };

  if (!request.expected && !request.tabid && !request.location) {
    assertHost();
    const active = document.querySelector('.tabbase.thread-active[data-tabid]');
    const tabid = active?.getAttribute('data-tabid');
    const address = Array.from(document.querySelectorAll('.urlbar-info[data-tabid][data-location]'))
      .find((element) => element.getAttribute('data-tabid') === tabid);
    const location = address?.getAttribute('data-location');
    if (!tabid || !location || !/^[1-9]\d*$/.test(tabid)) return null;
    request.tabid = tabid;
    request.location = location;
  }
  const initialTab = findTab();
  if (!initialTab) {
    if (request.expected) {
      throw new Error('The captured Siki tab is closed. Reopen the drawing from that thread.');
    }
    return null;
  }
  if (request.expected) assertTab(request.expected.thread);
  if (typeof host.rendererApi?.invoke !== 'function' || typeof host.siki_execCommand !== 'function') {
    throw new Error('Siki native attachment APIs are unavailable. This integration requires Siki 0.43.12-compatible APIs.');
  }
  const invoke = host.rendererApi.invoke.bind(host.rendererApi);
  const routed = await invoke('invokeNNC', 'gpbc', 'url_router', request.location) as {
    type?: string;
    location?: unknown;
    sitename?: unknown;
    server?: unknown;
    board?: unknown;
    threadkey?: unknown;
  } | undefined;
  if (!routed || routed.type !== 'thread' ||
      typeof routed.location !== 'string' || !routed.location ||
      typeof routed.sitename !== 'string' || !routed.sitename ||
      typeof routed.server !== 'string' || !routed.server ||
      typeof routed.board !== 'string' || !routed.board ||
      !['string', 'number'].includes(typeof routed.threadkey) || !String(routed.threadkey)) {
    throw new Error('Siki could not normalize a native thread target. Open Neo from a supported 5ch thread.');
  }
  const thread: NativeThread = {
    location: routed.location,
    sitename: routed.sitename,
    server: routed.server,
    board: routed.board,
    threadkey: String(routed.threadkey),
  };
  if (request.expected && Object.entries(thread).some(([key, value]) =>
    value !== request.expected!.thread[key as keyof NativeThread])) {
    throw new Error('The captured Siki thread URL changed. Reopen the drawing from that thread.');
  }
  assertTab(thread);
  if (!['5ch.io', '5ch.net'].includes(thread.sitename)) {
    throw new Error('Neo attachment supports native 5ch threads only. Open it from a 5ch thread.');
  }
  const metadata = await invoke('invokeNNC', 'gpbc', 'load_site_meta', routed, 0, null) as {
    site_option?: { drawing_size?: unknown };
  } | undefined;
  const size = metadata?.site_option?.drawing_size;
  if (size !== '500x250') {
    throw new Error('This 5ch thread does not advertise the supported native drawing_size 500x250. No image was attached.');
  }
  assertTab(thread);
  const resolved: ResolvedThread = {
    tabid: request.tabid,
    thread,
    title: Array.from(document.querySelectorAll('.tab[data-tabid]'))
      .find((element) => element.getAttribute('data-tabid') === request.tabid)
      ?.getAttribute('title')?.trim() || thread.location,
    width: 500,
    height: 250,
  };
  if (!request.expected) return resolved;
  if (request.expected.width !== resolved.width || request.expected.height !== resolved.height) {
    throw new Error('The native drawing dimensions changed. Reopen the drawing from that thread.');
  }
  if (typeof request.dataUrl !== 'string') throw new Error('The PNG attachment data is missing.');

  // Both reducers look up the explicit tab ID without falling back to the active
  // tab. tab:post.open is deliberately not used: its delayed focus helper can
  // reopen an unrelated active tab's form when the captured tab has gone away.
  host.siki_execCommand('core:dispatch.action', {
    actions: 'TAB_SET_VALUES', tabid: request.tabid, key: 'drawing', value: true,
  });
  host.siki_execCommand('core:dispatch.action', {
    actions: 'TAB_POSTAREA_SET', tabid: Number(request.tabid), open: true,
  });
  // Allow Siki to mount its preview listener before saveDrawing emits the native
  // drawingUpdated notification. No textarea or post-body action is touched.
  // The ES2020 compiler library omits this API, which Siki's Chromium provides.
  const rendererPromise = Promise as unknown as {
    withResolvers(): { promise: Promise<void>; resolve: () => void };
  };
  if (typeof rendererPromise.withResolvers !== 'function') {
    throw new Error('Siki Chromium attachment APIs are unavailable. Update Siki before attaching a drawing.');
  }
  const tick = rendererPromise.withResolvers();
  setTimeout(tick.resolve, 0);
  await tick.promise;
  assertTab(thread);
  await invoke('invokeNNC', 'saveDrawing', null, thread.location, request.dataUrl, 'png');
  assertTab(thread);
  // invokeNNC also returns undefined for a missing method. Read back the native
  // file so an unavailable/changed save API cannot be reported as success.
  const saved = await invoke('invokeNNC', 'loadDrawing', null, thread.location) as {
    image?: unknown;
  } | undefined;
  assertTab(thread);
  if (saved?.image !== request.dataUrl) {
    throw new Error('Siki did not persist the PNG through its native drawing API. Check Siki version and image-directory permissions.');
  }
  // In windowed/hidden layout there is no inline post form. This native action
  // uses an exact getTab lookup and never falls back to another thread.
  if (request.root === 'main' && !assertTab(thread).querySelector('.form-body')) {
    host.siki_execCommand('core:dispatch.action', {
      actions: 'POSTFORM_WINDOW', tabid: Number(request.tabid), mode: 'open',
    });
  }
  return resolved;
}

export function createAttachmentBridge(): AttachmentBridge {
  let electron: SikiElectron;
  try {
    electron = require('electron') as SikiElectron;
  } catch {
    throw new Error('The native attachment bridge must run inside Siki\'s Electron main process.');
  }
  if (typeof electron.app?.getAppPath !== 'function' ||
      typeof electron.webContents?.getAllWebContents !== 'function' ||
      typeof electron.nativeImage?.createFromDataURL !== 'function') {
    throw new Error('Siki Electron main-process attachment APIs are unavailable.');
  }
  const appPath = electron.app.getAppPath();
  const manifest = require(resolve(appPath, 'package.json')) as { main: string };
  const assetsDirectory = dirname(resolve(appPath, manifest.main));
  const mainPath = resolve(assetsDirectory, 'index.html');
  const floatingPath = resolve(assetsDirectory, 'floating.html');
  const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const captured = new WeakMap<AttachmentTarget, {
    target: AttachmentTarget;
    root: RendererRoot;
    resolved: ResolvedThread;
  }>();
  const rootOf = (contents: SikiWebContents): RendererRoot | undefined => {
    if (contents.isDestroyed()) return undefined;
    try {
      const url = new URL(contents.getURL());
      if (url.protocol !== 'file:') return undefined;
      const path = resolve(fileURLToPath(url));
      if (path === mainPath) return 'main';
      if (path === floatingPath) return 'floating';
    } catch {
      return undefined;
    }
    return undefined;
  };
  const execute = (contents: SikiWebContents, request: RendererRequest): Promise<unknown> =>
    contents.executeJavaScript(`(${inSikiRenderer.toString()})(${JSON.stringify(request)})`);

  return {
    async resolveTarget() {
      const matches: Array<{
        contents: SikiWebContents;
        root: RendererRoot;
        resolved: ResolvedThread;
      }> = [];
      let failure: unknown;
      for (const contents of electron.webContents.getAllWebContents()) {
        const root = rootOf(contents);
        if (!root) continue;
        try {
          const resolved = await execute(contents, { root, tabid: '', location: '' }) as ResolvedThread | null;
          if (resolved && rootOf(contents) === root) matches.push({ contents, root, resolved });
        } catch (error) {
          failure = error;
        }
      }
      if (matches.length > 1) {
        throw new Error('The captured tab is ambiguous across Siki windows. Reopen Neo from the intended thread.');
      }
      if (!matches.length) {
        if (failure instanceof Error) throw failure;
        throw new Error('The captured Siki thread is unavailable or closed. Open Neo from the intended thread.');
      }
      const { contents, root, resolved } = matches[0];
      const target: AttachmentTarget = Object.freeze({
        tabid: resolved.tabid,
        location: resolved.thread.location,
        title: resolved.title,
        width: resolved.width,
        height: resolved.height,
        webContentsId: contents.id,
      });
      captured.set(target, { target, root, resolved });
      return target;
    },

    async attach(target, dataUrl) {
      const capture = captured.get(target);
      if (!capture) throw new Error('The drawing target was not captured by this Siki session. Reopen Neo from its thread.');
      const contents = electron.webContents.getAllWebContents()
        .find((candidate) => candidate.id === capture.target.webContentsId);
      if (!contents || rootOf(contents) !== capture.root) {
        throw new Error('The captured Siki window is closed or changed. Reopen Neo from its thread.');
      }
      if (typeof dataUrl !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
        throw new Error('The attachment must be a PNG data URL.');
      }
      const bytes = Buffer.from(dataUrl.slice(22, 34), 'base64');
      if (bytes.length < 8 || !bytes.subarray(0, 8).equals(pngSignature)) {
        throw new Error('The attachment data is not a PNG image.');
      }
      const image = electron.nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) throw new Error('Siki could not decode the PNG attachment.');
      const size = image.getSize();
      if (size.width !== capture.target.width || size.height !== capture.target.height) {
        throw new Error(`The PNG must match the native drawing size ${capture.target.width}x${capture.target.height}.`);
      }
      const result = await execute(contents, {
        root: capture.root,
        tabid: capture.target.tabid,
        location: capture.target.location,
        expected: capture.resolved,
        dataUrl,
      });
      if (!result || rootOf(contents) !== capture.root) {
        throw new Error('The captured Siki thread became unavailable while attaching the PNG. Reopen Neo from that thread.');
      }
    },
  };
}
