import { EN_SERVER } from './en-server.mjs';
import { EN_UI_1 } from './en-ui-1.mjs';
import { EN_UI_2 } from './en-ui-2.mjs';
import { EN_UI_3 } from './en-ui-3.mjs';

export const LANGS = ['vi', 'en'];
export const LANG_NAMES = { vi: 'Tiếng Việt', en: 'English' };
export const LANG_LABEL = 'Ngôn ngữ · Language';
const EN = { ...EN_SERVER, ...EN_UI_1, ...EN_UI_2, ...EN_UI_3 };
const LANG_KEY = 'termi-lang';
const TRANSLATED_ATTRIBUTES = ['title', 'placeholder', 'aria-label'];

export const currentLang = () => (globalThis.document?.documentElement.lang === 'en' ? 'en' : 'vi');

export const locale = () => (currentLang() === 'en' ? 'en-US' : 'vi-VN');

const PLACEHOLDER = /\{(\d+)\}/g;

export const fill = (text, args) =>
  text.replace(PLACEHOLDER, (match, i) => (i < args.length ? String(args[i]) : match));

export const translate = (text, lang) => (lang === 'en' ? EN[text] ?? text : text);

export const t = (text, ...args) => fill(translate(text, currentLang()), args);

export const hasEnglish = text => Object.hasOwn(EN, text);

function translateNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue.trim();
    if (text && hasEnglish(text)) node.nodeValue = node.nodeValue.replace(text, EN[text]);
    return;
  }
  for (const name of TRANSLATED_ATTRIBUTES) {
    const value = node.getAttribute?.(name);
    if (value && hasEnglish(value)) node.setAttribute(name, EN[value]);
  }
  for (const child of node.childNodes) translateNode(child);
}

export function setLang(lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    return;
  }
}

export function setupI18n() {
  if (currentLang() === 'en') translateNode(document.body);
}
