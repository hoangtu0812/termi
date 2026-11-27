export const RESPONSIVE_CSS = new Set(['public/css/layout.css', 'public/css/mobile.css']);

const RULE = 'css-class';
const PLAIN_CLASS = /^\.([\w-]+)(?::{1,2}[\w-]+(?:\(\))?|\[[^\]]*\])*$/;
const LEADING_CLASS = /^\.([\w-]+)/;

const withoutParens = selector => selector.replace(/\([^()]*\)/g, '()');

function ruleSelectors(src) {
  return [...src.matchAll(/([^{}]+)\{/g)]
    .map(match => withoutParens(match[1].trim()))
    .filter(prelude => prelude && !prelude.startsWith('@'))
    .map(prelude => prelude.split(',').map(selector => selector.trim()).filter(Boolean));
}

function addUse(map, name, file) {
  if (!map.has(name)) map.set(name, new Set());
  map.get(name).add(file);
}

export function cssClassUses(sheets) {
  const owners = new Map();
  const contextual = new Map();
  for (const { file, src } of sheets) {
    for (const selectors of ruleSelectors(src)) {
      for (const selector of selectors) {
        const parts = selector.split(/\s*[\s>+~]\s*/).filter(Boolean);
        const subject = LEADING_CLASS.exec(parts.at(-1));
        if (!subject) continue;
        const plain = PLAIN_CLASS.exec(selector);
        if (plain && selectors.length === 1) addUse(owners, plain[1], file);
        else if (parts.length > 1) addUse(contextual, subject[1], file);
      }
    }
  }
  return { owners, contextual };
}

function sharedOwner(name, files) {
  const [first, ...others] = [...files].filter(file => !RESPONSIVE_CSS.has(file)).sort();
  const detail = `.${name} is also defined in ${first}: keep one owner file or rename the class`;
  return others.map(file => ({ file, rule: RULE, detail }));
}

function leakedOverride(name, files, contextual) {
  if ([...files].some(file => !RESPONSIVE_CSS.has(file))) return [];
  const users = [...(contextual.get(name) || [])].filter(file => !files.has(file)).sort();
  if (!users.length) return [];
  const detail = `.${name} is defined only here but also styled in ${users.join(', ')}: rename one of them`;
  return [...files].sort().map(file => ({ file, rule: RULE, detail }));
}

export function cssClassViolations(sheets) {
  const { owners, contextual } = cssClassUses(sheets);
  return [...owners].flatMap(([name, files]) => [
    ...sharedOwner(name, files),
    ...leakedOverride(name, files, contextual),
  ]);
}
