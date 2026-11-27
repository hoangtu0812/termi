#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { commentFinder } from './check-comments.mjs';
import { cssClassViolations } from './check-css.mjs';

const run = promisify(execFile);
const ROOT = path.join(import.meta.dirname, '..');
const SOURCE_DIRS = ['src', 'public', 'scripts', 'test'];
const VENDORED_DIRS = ['public/fonts/'];
const SYNTAX_EXTENSIONS = new Set(['.mjs', '.js']);
const MAX_FILE_LINES = 300;
const MAX_LINE_LENGTH = 120;
const ALLOWLIST_FILE = 'scripts/check-allowlist.json';
const DOC_PREFIXES = {
  plan: ['PLAN'],
  docs: ['ARCH', 'ADR', 'SPEC', 'GUIDE', 'NOTES', 'REVIEW'],
};
const DOC_NAME = /^([A-Z]+)-v\d+\.\d+-[a-z0-9]+(?:-[a-z0-9]+)*(?:\.vi)?\.md$/;
const SAMPLE_SIZE = 5;

export const isAppleDouble = file => file.split('/').at(-1).startsWith('._');

async function listFiles(dir) {
  const entries = await fs.readdir(path.join(ROOT, dir), { recursive: true, withFileTypes: true }).catch(() => []);
  return entries
    .filter(entry => entry.isFile())
    .map(entry => path.relative(ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .filter(file => !isAppleDouble(file))
    .sort();
}

const sample = lines => {
  const shown = lines.slice(0, SAMPLE_SIZE).join(', ');
  return lines.length > SAMPLE_SIZE ? `${shown}, …` : shown;
};

export function sourceViolations(file, src) {
  const violations = [];
  const lines = src.endsWith('\n') ? src.slice(0, -1).split('\n') : src.split('\n');
  const finder = commentFinder(path.extname(file));
  const comments = finder ? finder(src) : [];
  if (comments.length) {
    violations.push({ file, rule: 'comments', detail: `${comments.length} comment(s) at line ${sample(comments)}` });
  }
  if (lines.length > MAX_FILE_LINES) {
    violations.push({ file, rule: 'file-length', detail: `${lines.length} lines (max ${MAX_FILE_LINES})` });
  }
  const long = lines.flatMap((line, i) => (line.length > MAX_LINE_LENGTH ? [i + 1] : []));
  if (long.length) {
    const detail = `${long.length} line(s) over ${MAX_LINE_LENGTH} at ${sample(long)}`;
    violations.push({ file, rule: 'line-length', detail });
  }
  return violations;
}

export function docNameViolation(file) {
  const [top, ...rest] = file.split('/');
  if (top === 'docs' && rest[0] === 'assets') return null;
  const name = rest.at(-1);
  const match = DOC_NAME.exec(name);
  if (match && DOC_PREFIXES[top].includes(match[1])) return null;
  const expected = DOC_PREFIXES[top].join('|');
  return { file, rule: 'doc-name', detail: `expected <${expected}>-v<MAJOR>.<MINOR>-<kebab-slug>[.vi].md` };
}

async function syntaxViolation(file) {
  try {
    await run(process.execPath, ['--check', path.join(ROOT, file)]);
    return null;
  } catch (error) {
    const message = (error.stderr || error.message).trim().split('\n').slice(0, 4).join(' ');
    return { file, rule: 'syntax', detail: message };
  }
}

const isVendored = file => VENDORED_DIRS.some(dir => file.startsWith(dir));

async function collectViolations() {
  const sources = (await Promise.all(SOURCE_DIRS.map(listFiles))).flat().filter(file => !isVendored(file));
  const docs = (await Promise.all(Object.keys(DOC_PREFIXES).map(listFiles))).flat();
  const fromSources = await Promise.all(sources.map(async file => {
    if (!commentFinder(path.extname(file))) return [];
    return sourceViolations(file, await fs.readFile(path.join(ROOT, file), 'utf8'));
  }));
  const scripts = sources.filter(file => SYNTAX_EXTENSIONS.has(path.extname(file)));
  const syntax = await Promise.all(scripts.map(syntaxViolation));
  const sheets = await Promise.all(sources.filter(file => path.extname(file) === '.css')
    .map(async file => ({ file, src: await fs.readFile(path.join(ROOT, file), 'utf8') })));
  const css = cssClassViolations(sheets);
  return [...fromSources.flat(), ...docs.map(docNameViolation), ...syntax, ...css].filter(Boolean);
}

export function classify(violations, allowlist) {
  const allowed = (file, rule) => rule !== 'syntax' && (allowlist[file] || []).includes(rule);
  const errors = violations.filter(v => !allowed(v.file, v.rule));
  const warnings = violations.filter(v => allowed(v.file, v.rule));
  const stale = Object.entries(allowlist).flatMap(([file, rules]) => rules
    .filter(rule => !violations.some(v => v.file === file && v.rule === rule))
    .map(rule => ({ file, rule, detail: `no longer violated: remove it from ${ALLOWLIST_FILE}` })));
  return { errors: [...errors, ...stale], warnings };
}

const format = (level, v) => `${level.padEnd(7)} ${v.file}  [${v.rule}]  ${v.detail}`;

async function main() {
  const allowlist = JSON.parse(await fs.readFile(path.join(ROOT, ALLOWLIST_FILE), 'utf8').catch(() => '{}'));
  const { errors, warnings } = classify(await collectViolations(), allowlist);
  for (const v of warnings) console.log(format('legacy', v));
  for (const v of errors) console.log(format('error', v));
  console.log(`\ncheck: ${errors.length} error(s), ${warnings.length} legacy violation(s) allowlisted`);
  process.exitCode = errors.length ? 1 : 0;
}

if (import.meta.main) await main();
