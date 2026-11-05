declare const Neo: {
  params: { paintbbs: { image_width: number; image_height: number } };
  painter?: { getImage: () => HTMLCanvasElement | null };
  start: (standalone: boolean) => void;
};

interface Document {
  paintBBSCallback: (phase: string) => false | undefined;
}

interface DrawingSession {
  token: string;
  title: string;
  width: number;
  height: number;
}

let drawingSession: DrawingSession | null = null;
let drawingSessionError = '';

try {
  const content = document.querySelector<HTMLMetaElement>('meta[name="sikineo-session"]')?.content;
  const session: unknown = JSON.parse(content || '');
  if (
    !session || typeof session !== 'object' ||
    !('token' in session) || typeof session.token !== 'string' || !session.token ||
    !('title' in session) || typeof session.title !== 'string' ||
    !('width' in session) || typeof session.width !== 'number' || !Number.isInteger(session.width) || session.width <= 0 ||
    !('height' in session) || typeof session.height !== 'number' || !Number.isInteger(session.height) || session.height <= 0
  ) {
    throw new Error('画像を渡す先の情報がありません。Sikiの対象スレッドから開き直してください。');
  }
  drawingSession = {
    token: session.token,
    title: session.title,
    width: session.width,
    height: session.height,
  };
  // Neo reads these parameters in its earlier DOMContentLoaded listener.
  if (typeof Neo !== 'undefined') {
    Neo.params = {
      paintbbs: {
        image_width: drawingSession.width,
        image_height: drawingSession.height,
      },
    };
  }
} catch {
  drawingSessionError = '画像を渡す先の情報を読み込めません。Sikiの対象スレッドから開き直してください。';
}

document.paintBBSCallback = (phase) => phase === 'check' ? false : undefined;

document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector<HTMLButtonElement>('#attach-image');
  const status = document.querySelector<HTMLElement>('#attachment-status');
  const target = document.querySelector<HTMLElement>('#attachment-target');
  const dimensions = document.querySelector<HTMLElement>('#drawing-dimensions');
  if (!button || !status || !target || !dimensions) return;

  const session = drawingSession;
  if (!session) {
    status.textContent = drawingSessionError;
    status.dataset.state = 'error';
    return;
  }

  target.textContent = session.title;
  dimensions.textContent = `${session.width} × ${session.height} px`;

  let loadingError = '';
  if (typeof Neo === 'undefined') {
    loadingError = 'neo.jsを読み込めません。https://oekakibbs.moe/apps/neo/neo.js への接続を確認してページを再読み込みしてください。';
  } else if (!neoResources.styleLoaded) {
    loadingError = 'neo.cssを読み込めません。https://oekakibbs.moe/apps/neo/neo.css への接続を確認してページを再読み込みしてください。';
  } else {
    try {
      if (navigator.userAgent.includes('Electron')) Neo.start(false);
      if (!Neo.painter) throw new Error('描画キャンバスが初期化されていません。');
    } catch (error) {
      loadingError = `neoを初期化できません。${error instanceof Error ? error.message : 'ページを再読み込みしてください。'}`;
    }
  }
  if (loadingError) {
    status.textContent = loadingError;
    status.dataset.state = 'error';
    const editor = document.querySelector<HTMLElement>('.editor-scroll');
    if (editor) editor.hidden = true;
    return;
  }

  button.disabled = false;
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    status.dataset.state = 'busy';
    status.textContent = 'Sikiの投稿欄へ画像を渡しています…';

    try {
      const image = Neo.painter?.getImage();
      if (!image) throw new Error('描画画像を取得できませんでした。');
      if (image.width !== session.width || image.height !== session.height) {
        throw new Error(`描画サイズが添付先の ${session.width} × ${session.height} px と異なります。画像の自動変形はしません。対象スレッドから描画画面を開き直してください。`);
      }
      const dataUrl = image.toDataURL('image/png');
      const response = await fetch('/attachment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: session.token, dataUrl }),
      });
      const result: { ok?: unknown; error?: unknown } = await response.json();
      if (!response.ok || result.ok !== true) {
        throw new Error(typeof result.error === 'string' ? result.error : `画像を渡せませんでした（HTTP ${response.status}）。`);
      }
      status.dataset.state = 'success';
      status.textContent = 'Sikiの投稿欄に画像を添付しました。まだ送信していません。本文と画像を確認して、Sikiから送信してください。描画はこの画面に残っています。';
    } catch (error) {
      status.dataset.state = 'error';
      status.textContent = `${error instanceof Error ? error.message : '画像を渡せませんでした。'} 描画は残っています。もう一度お試しください。`;
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
});
