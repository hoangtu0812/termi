import { MAX_OUTPUT_CHARS } from './config.mjs';

const TRUNCATION_MARK = '\n… (đã cắt bớt)';
const CLAUDE_MODEL_ID = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-|$|\[)/;
const MARKDOWN_TO_PLAIN = [
  [/```[\s\S]*?```/g, ' '],
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  [/^\s*(#{1,6}|[-*>]|\d+\.)\s+/gm, ''],
  [/[*_`~|]/g, ''],
  [/\s+/g, ' '],
];

export function clip(text, limit = MAX_OUTPUT_CHARS) {
  return text.length > limit ? text.slice(0, limit) + TRUNCATION_MARK : text;
}

export function prettyModel(id) {
  const match = CLAUDE_MODEL_ID.exec(id || '');
  if (!match) return id || null;
  const [, family, major, minor] = match;
  const version = minor ? `${major}.${minor}` : major;
  return `${family[0].toUpperCase()}${family.slice(1)} ${version}`;
}

const applyRule = (text, [pattern, replacement]) => text.replace(pattern, replacement);

export function plainText(markdown) {
  return MARKDOWN_TO_PLAIN.reduce(applyRule, markdown).trim();
}
