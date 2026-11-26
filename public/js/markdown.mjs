import { base } from './api.mjs';
import { el } from './dom.mjs';
import { rawUrl } from './viewer.mjs';

let markedP;
export const loadMarked = () =>
  (markedP ??= new Promise((ok, fail) => {
    const s = Object.assign(document.createElement('script'), {
      src: 'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
      crossOrigin: 'anonymous',
      integrity: 'sha384-/TQbtLCAerC3jgaim+N78RZSDYV7ryeoBCVqTuzRrFec2akfBkHS7ACQ3PQhvMVi',
    });
    s.onload = () => ok(window.marked);
    s.onerror = () => {
      markedP = null;
      fail(new Error('Không tải được trình hiển thị Markdown (cần mạng)'));
    };
    document.head.append(s);
  }));
const MD_CSS = `:root{
  color-scheme:light;
  --bg:#f6f7f9;
  --fg:#171a21;
  --dim:#5f6675;
  --line:#e4e7ec;
  --code:#eceef2;
  --acc:#c95f3a}
:root[data-theme=dark]{
  color-scheme:dark;
  --bg:#111318;
  --fg:#e8eaee;
  --dim:#8d94a3;
  --line:#2a2f3a;
  --code:#1d2129;
  --acc:#e07a55}
body{
  margin:0;
  padding:16px 18px 56px;
  background:var(--bg);
  color:var(--fg);
  font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  overflow-wrap:break-word}
h1,h2,h3,h4{line-height:1.3;margin:1.4em 0 .6em}
h1{font-size:1.75em}
h2{font-size:1.35em}
h3{font-size:1.15em}
h1,h2{padding-bottom:.3em;border-bottom:1px solid var(--line)}
a{color:var(--acc)}
img{max-width:100%;vertical-align:middle}
code{
  font:.87em ui-monospace,"SF Mono",Menlo,monospace;
  background:var(--code);
  padding:.15em .4em;
  border-radius:5px}
pre{background:var(--code);padding:12px 14px;border-radius:10px;overflow:auto;line-height:1.5}
pre code{padding:0;background:none}
table{border-collapse:collapse;display:block;overflow:auto;max-width:100%;margin:1em 0}
th,td{border:1px solid var(--line);padding:6px 12px}
th{background:var(--code)}
blockquote{margin:0;padding:0 1em;color:var(--dim);border-left:3px solid var(--line)}
hr{border:0;border-top:1px solid var(--line);margin:2em 0}
p[align=center],div[align=center]{text-align:center}
li+li{margin-top:.25em}
pre.mermaid{background:none;text-align:center;overflow:auto}`;
export async function markdownNode(text, file) {
  const marked = await loadMarked();
  const t = document.createElement('template');
  t.innerHTML = marked.parse(text, { gfm: true });
  const base = 'file://' + file.slice(0, file.lastIndexOf('/') + 1);
  for (const img of t.content.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src))
      img.src = rawUrl(decodeURIComponent(new URL(src, encodeURI(base)).pathname));
  }
  const diagrams = [...t.content.querySelectorAll('pre > code.language-mermaid')];
  for (const code of diagrams)
    code.parentElement.replaceWith(
      Object.assign(document.createElement('pre'), { className: 'mermaid', textContent: code.textContent }),
    );
  let sandbox = 'allow-popups allow-popups-to-escape-sandbox',
    scripts = '';
  let csp = "default-src 'none'; img-src * data: blob:; style-src 'unsafe-inline'; font-src * data:";
  if (diagrams.length) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(MERMAID.init));
    csp += `; script-src ${MERMAID.src} 'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
    scripts = [
      `<script src="${MERMAID.src}" integrity="${MERMAID.sri}" crossorigin="anonymous"><\/script>`,
      `<script>${MERMAID.init}<\/script>`,
    ].join('');
    sandbox += ' allow-scripts';
  }
  const f = el('iframe', 'md');
  f.setAttribute('sandbox', sandbox);
  f.title = 'Xem trước Markdown';
  f.srcdoc = [
    `<!doctype html><html data-theme="${document.documentElement.dataset.theme}"><meta charset="utf-8">`,
    `<meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank">`,
    `<style>${MD_CSS}</style><body>${t.innerHTML}${scripts}</body>`,
  ].join('');
  return f;
}
const MERMAID = {
  src: 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js',
  sri: 'sha384-WmdflGW9aGfoBdHc4rRyWzYuAjEmDwMdGdiPNacbwfGKxBW/SO6guzuQ76qjnSlr',
  init:
    "mermaid.initialize({startOnLoad:true,securityLevel:'strict',theme:document.documentElement" +
    ".dataset.theme==='dark'?'dark':'default'})",
};
