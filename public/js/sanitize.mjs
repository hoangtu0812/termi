import { loadHljs } from './highlight.mjs';
import { loadMarked } from './markdown.mjs';

const ALLOWED_TAGS = new Set(
  (
    'P BR STRONG EM B I DEL S CODE PRE BLOCKQUOTE UL OL LI H1 H2 H3 H4 H5 H6 A TABLE THEAD TBOD' +
    'Y TR TH TD HR SPAN INPUT'
  ).split(' '),
);
function sanitize(root) {
  for (const n of [...root.querySelectorAll('*')]) {
    if (!ALLOWED_TAGS.has(n.tagName)) {
      n.replaceWith(document.createTextNode(n.textContent));
      continue;
    }
    for (const a of [...n.attributes]) {
      const ok =
        (n.tagName === 'A' && a.name === 'href' && /^(https?:|mailto:)/i.test(a.value.trim())) ||
        (n.tagName === 'CODE' && a.name === 'class' && /^language-[\w+-]+$/.test(a.value)) ||
        (n.tagName === 'INPUT' &&
          ((a.name === 'type' && a.value === 'checkbox') || a.name === 'checked' || a.name === 'disabled')) ||
        ((n.tagName === 'TH' || n.tagName === 'TD') && a.name === 'align');
      if (!ok) n.removeAttribute(a.name);
    }
    if (n.tagName === 'A') {
      n.target = '_blank';
      n.rel = 'noopener noreferrer';
    }
  }
  return root;
}
export async function mdSafe(text) {
  const marked = await loadMarked();
  const t = document.createElement('template');
  t.innerHTML = marked.parse(text, { gfm: true, breaks: true });
  sanitize(t.content);
  const codes = t.content.querySelectorAll('pre > code');
  if (codes.length) {
    const hljs = await loadHljs().catch(() => null);
    if (hljs)
      for (const c of codes) {
        const lang = /language-([\w+-]+)/.exec(c.className)?.[1];
        if (lang && hljs.getLanguage(lang) && c.textContent.length < 100_000)
          c.innerHTML = hljs.highlight(c.textContent, { language: lang, ignoreIllegals: true }).value;
      }
  }
  return t.content;
}
