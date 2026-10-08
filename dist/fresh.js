// Atualiza o site no endereço normal sem guardar versões antigas no navegador.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
if (new URL(location.href).searchParams.has('refresh')) {
  const clean = new URL(location.href);
  clean.searchParams.delete('refresh');
  history.replaceState(null, '', clean.pathname + clean.search + clean.hash);
}
window.addEventListener('pageshow', event => {
  if (event.persisted) location.reload();
});
