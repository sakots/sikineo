const neoResources = { styleLoaded: false };

document.addEventListener('load', (event) => {
  if (event.target instanceof HTMLLinkElement && event.target.id === 'neo-style') {
    neoResources.styleLoaded = true;
  }
}, true);
