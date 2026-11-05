declare const Neo: {
  params: { paintbbs: { image_width: number; image_height: number } };
  start: (standalone: boolean) => void;
};

interface Document {
  paintBBSCallback: (phase: string) => false | undefined;
}

Neo.params = {
  paintbbs: {
    image_width: 300,
    image_height: 300,
  },
};

document.paintBBSCallback = (phase) => phase === 'check' ? false : undefined;

document.addEventListener('DOMContentLoaded', () => {
  if (navigator.userAgent.includes('Electron')) {
    Neo.start(false);
  }
});
