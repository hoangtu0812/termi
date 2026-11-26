const REGEX_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);

function createScanner(src) {
  return { src, i: 0, line: 1, comments: [] };
}

function advance(s, count = 1) {
  for (let k = 0; k < count && s.i < s.src.length; k++) {
    if (s.src[s.i] === '\n') s.line++;
    s.i++;
  }
}

function skipUntil(s, end) {
  while (s.i < s.src.length && !s.src.startsWith(end, s.i)) advance(s);
  advance(s, end.length);
}

function skipQuoted(s, quote) {
  advance(s);
  while (s.i < s.src.length) {
    const c = s.src[s.i];
    if (c === '\\') { advance(s, 2); continue; }
    if (c === quote || c === '\n') break;
    advance(s);
  }
  advance(s);
}

function skipTemplate(s) {
  advance(s);
  while (s.i < s.src.length) {
    const c = s.src[s.i];
    if (c === '\\') { advance(s, 2); continue; }
    if (c === '`') { advance(s); return; }
    if (s.src.startsWith('${', s.i)) { advance(s, 2); scanJsCode(s, true); continue; }
    advance(s);
  }
}

function skipRegex(s) {
  advance(s);
  let inClass = false;
  while (s.i < s.src.length) {
    const c = s.src[s.i];
    if (c === '\n') return;
    if (c === '\\') { advance(s, 2); continue; }
    if (c === '[') inClass = true;
    if (c === ']') inClass = false;
    advance(s);
    if (c === '/' && !inClass) break;
  }
  while (/[a-z]/.test(s.src[s.i] || '')) advance(s);
}

function regexAllowed(src, at) {
  let j = at - 1;
  while (j >= 0 && /\s/.test(src[j])) j--;
  if (j < 0) return true;
  if (/[)\]}]/.test(src[j])) return false;
  if (!/[\w$]/.test(src[j])) return true;
  let start = j;
  while (start > 0 && /[\w$]/.test(src[start - 1])) start--;
  return REGEX_KEYWORDS.has(src.slice(start, j + 1));
}

function scanJsCode(s, untilBrace) {
  let depth = 0;
  while (s.i < s.src.length) {
    const c = s.src[s.i];
    const next = s.src[s.i + 1];
    if (c === '/' && next === '/') { s.comments.push(s.line); skipUntil(s, '\n'); continue; }
    if (c === '/' && next === '*') { s.comments.push(s.line); skipUntil(s, '*/'); continue; }
    if (c === '\'' || c === '"') { skipQuoted(s, c); continue; }
    if (c === '`') { skipTemplate(s); continue; }
    if (c === '/' && regexAllowed(s.src, s.i)) { skipRegex(s); continue; }
    if (c === '{') depth++;
    if (c === '}' && untilBrace && depth === 0) { advance(s); return; }
    if (c === '}') depth--;
    advance(s);
  }
}

export function findJsComments(src) {
  const s = createScanner(src);
  if (src.startsWith('#!')) skipUntil(s, '\n');
  scanJsCode(s, false);
  return s.comments;
}

export function findCssComments(src) {
  const s = createScanner(src);
  while (s.i < s.src.length) {
    const c = s.src[s.i];
    if (c === '\'' || c === '"') { skipQuoted(s, c); continue; }
    if (src.startsWith('/*', s.i)) { s.comments.push(s.line); skipUntil(s, '*/'); continue; }
    advance(s);
  }
  return s.comments;
}

function shellCommentStart(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && quote !== '\'') { i++; continue; }
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '\'' || c === '"') { quote = c; continue; }
    if (c === '#' && (i === 0 || /[\s;]/.test(line[i - 1]))) return true;
  }
  return false;
}

export function findShellComments(src) {
  const comments = [];
  const lines = src.split('\n');
  let heredocEnd = null;
  lines.forEach((line, index) => {
    if (heredocEnd !== null) {
      if (line.trim() === heredocEnd) heredocEnd = null;
      return;
    }
    if (index === 0 && line.startsWith('#!')) return;
    if (shellCommentStart(line)) comments.push(index + 1);
    const heredoc = /(?<!<)<<(?!<)-?\s*['"]?(\w+)['"]?/.exec(line);
    if (heredoc) heredocEnd = heredoc[1];
  });
  return comments;
}

const blank = text => text.replace(/[^\n]/g, ' ');

function embeddedComments(src, tag, finder) {
  const comments = [];
  const pattern = new RegExp(`(<${tag}\\b[^>]*>)([\\s\\S]*?)</${tag}>`, 'gi');
  for (const match of src.matchAll(pattern)) {
    const offset = src.slice(0, match.index + match[1].length).split('\n').length - 1;
    comments.push(...finder(match[2]).map(line => line + offset));
  }
  return comments;
}

export function findHtmlComments(src) {
  const markup = src.replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi, (_, open, _tag, body, close) =>
    open + blank(body) + close);
  const comments = [];
  for (const match of markup.matchAll(/<!--/g)) comments.push(markup.slice(0, match.index).split('\n').length);
  comments.push(...embeddedComments(src, 'script', findJsComments));
  comments.push(...embeddedComments(src, 'style', findCssComments));
  return comments.sort((a, b) => a - b);
}

const FINDERS = {
  '.mjs': findJsComments,
  '.js': findJsComments,
  '.css': findCssComments,
  '.sh': findShellComments,
  '.html': findHtmlComments,
};

export const commentFinder = ext => FINDERS[ext] || null;
