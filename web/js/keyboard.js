(function (root) {
  'use strict';
  function handle(controller, event) {
    // Los campos nativos y atajos del navegador conservan su comportamiento.
    if (event.target && event.target.closest && event.target.closest('input, textarea, select, [contenteditable="true"]')) return true;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return true;
    const search = controller.state.screen === 'songs' && controller.state.search.open;
    if (search) {
      if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); controller.closeSearch(); return true; }
      if (event.key === 'Backspace') { event.preventDefault(); controller.typeQ(null); return true; }
      if (event.key.length === 1) { event.preventDefault(); controller.typeQ(event.key); return true; }
    }
    // Mantener Enter no debe saltar varias pantallas; las flechas sí se repiten.
    if (event.repeat && !event.key.startsWith('Arrow')) { event.preventDefault(); return true; }
    return false;
  }
  if (typeof module === 'object' && module.exports) module.exports = { handle };
  else root.GramolaKeyboard = { handle };
})(typeof window === 'object' ? window : this);
