import { el } from './dom.mjs';

const HLJS = {
  src: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
  sri: 'sha384-F/bZzf7p3Joyp5psL90p/p89AZJsndkSoGwRpXcZhleCWhd8SnRuoYo4d0yirjJp',
};
let hljsP;
export const loadHljs = () =>
  (hljsP ??= new Promise((ok, fail) => {
    const s = Object.assign(document.createElement('script'), {
      src: HLJS.src,
      crossOrigin: 'anonymous',
      integrity: HLJS.sri,
    });
    s.onload = () => ok(window.hljs);
    s.onerror = () => {
      hljsP = null;
      fail(new Error('Không tải được bộ tô màu'));
    };
    document.head.append(s);
  }));
const LANG = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  env: 'bash',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  php: 'php',
  rb: 'ruby',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cs: 'csharp',
  lua: 'lua',
  r: 'r',
  toml: 'ini',
  ini: 'ini',
  diff: 'diff',
  patch: 'diff',
  graphql: 'graphql',
  m: 'objectivec',
};
export async function codeNode(text, file) {
  const name = file.split('/').pop(),
    lang = /^(makefile|gnumakefile)$/i.test(name) ? 'makefile' : LANG[name.split('.').pop().toLowerCase()];
  if (!lang || text.length > 200_000) return el('pre', 'code', text);
  const hljs = await loadHljs();
  const pre = el('pre', 'code hljs');
  pre.innerHTML = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
  return pre;
}
