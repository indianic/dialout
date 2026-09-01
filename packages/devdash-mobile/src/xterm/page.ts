export const XTERM_HTML = `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css">
<style>
  html,body,#t{margin:0;height:100%;background:#0c0e13}
  body{overflow:hidden;-webkit-touch-callout:default}
  .xterm{height:100%}
  .xterm-viewport{overflow-y:auto !important;-webkit-overflow-scrolling:touch}
  /* xterm.css sets user-select:none so iOS never shows drag handles. Typing
     goes through the composer, so the helper textarea can ignore touches. */
  .xterm, .xterm-screen, .xterm-rows, .xterm-rows span, .xterm-rows div {
    -webkit-user-select: text !important;
    user-select: text !important;
    -webkit-touch-callout: default !important;
  }
  .xterm-helpers, .xterm-helper-textarea, .xterm-char-measure-element, .xterm-selection {
    pointer-events: none !important;
  }
</style>
</head><body>
<div id="t"></div>
<script src="https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js"></script>
<script>
const term = new Terminal({
  cursorBlink: true,
  disableStdin: true,
  fontSize: 13,
  fontFamily: 'Menlo, monospace',
  scrollback: 5000,
  theme: { background: '#0c0e13', foreground: '#d6dae3', cursor: '#d6dae3' },
});
const fit = new FitAddon.FitAddon();
term.loadAddon(fit);
term.open(document.getElementById('t'));
if (term.textarea) {
  term.textarea.setAttribute('readonly', 'readonly');
  term.textarea.setAttribute('disabled', 'disabled');
}
function reportSize() {
  try { fit.fit(); } catch (e) {}
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'size', cols: term.cols, rows: term.rows }));
}
function onNative(e) {
  var raw = typeof e.data === 'string' ? e.data : '';
  if (!raw) return;
  var msg;
  try { msg = JSON.parse(raw); } catch (err) { return; }
  if (msg.type === 'out') term.write(msg.data);
  if (msg.type === 'fit') reportSize();
}
window.addEventListener('message', onNative);
document.addEventListener('message', onNative);
window.addEventListener('resize', reportSize);
setTimeout(function() {
  reportSize();
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', cols: term.cols, rows: term.rows }));
}, 50);
</script></body></html>`;
