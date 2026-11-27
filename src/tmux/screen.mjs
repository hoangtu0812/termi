const WAITING = /Do you want to|Would you like to|Esc to cancel|Allow command|\(y\/n\)|\[y\/n\]|^\s*[›❯]\s*1\./im;
const WORKING = /esc to interrupt/i;
const BOX_EDGES = /[│┃]/g;
const SUBMIT_ROW = /^\s*([❯›>])?\s*Submit\s*$/;
const MENU_ROW = /^\s*([❯›>])?\s*(Submit|\d+[.)]\s)/;
const CURSOR_ROW = /^\s*[❯›>]/;
const CHOICE_ROW = /^\s*([❯›>]\s*)?(\d)[.)]\s+(.+)$/;
const MULTI_OPTION_ROW = /^\s*([❯›>])?\s*(\d+)[.)]\s+(?:\[([ xX✓✔]?)\]\s*)?(.+)$/;
const CHECKBOX_LABEL = /^\[[ xX✓✔]?\]/;
const CHECKED = /[xX✓✔]/;
const FREE_TEXT_OPTION = /^Type something/i;
const MORE_LINES = /more lines?/;
const QUESTION = /\?\s*$/;
const STATE_TAIL_LINES = 15;
const CHOICE_TAIL_LINES = 20;
const MULTI_TAIL_LINES = 24;

function menuLines(screen) {
  return screen.split('\n').map(line => line.replace(BOX_EDGES, '').trimEnd()).filter(line => line.trim());
}

function questionBefore(lines, index) {
  const above = lines.slice(0, Math.max(0, index)).reverse();
  return above.find(line => QUESTION.test(line.trim()))?.trim() || null;
}

export function agentState(screen) {
  const tail = screen.split('\n').filter(line => line.trim()).slice(-STATE_TAIL_LINES).join('\n');
  if (WAITING.test(tail)) return 'waiting';
  if (WORKING.test(tail)) return 'working';
  return 'idle';
}

function numberedRuns(lines) {
  const runs = [];
  lines.forEach((line, index) => {
    const match = CHOICE_ROW.exec(line);
    if (!match) return;
    const n = Number(match[2]);
    const choice = { n, label: match[3].trim() };
    const current = runs.at(-1);
    if (n === 1) {
      runs.push({ first: index, cursor: Boolean(match[1]), choices: [choice] });
    } else if (current && n === current.choices.length + 1) {
      current.choices.push(choice);
      current.cursor ||= Boolean(match[1]);
    }
  });
  return runs;
}

function isMultiSelectOrScrolling(choices, lines) {
  if (choices.some(choice => CHECKBOX_LABEL.test(choice.label))) return true;
  return lines.some(line => SUBMIT_ROW.test(line) || MORE_LINES.test(line));
}

export function parseChoices(screen) {
  const tail = menuLines(screen).slice(-CHOICE_TAIL_LINES);
  const menu = numberedRuns(tail).filter(run => run.cursor).at(-1);
  if (!menu || isMultiSelectOrScrolling(menu.choices, tail)) return {};
  return { question: questionBefore(tail, menu.first), choices: menu.choices };
}

function readMultiSelect(lines) {
  const options = [];
  let firstOption = -1;
  let hasSubmit = false;
  lines.forEach((line, index) => {
    if (SUBMIT_ROW.test(line)) {
      hasSubmit = true;
      return;
    }
    const match = MULTI_OPTION_ROW.exec(line);
    if (!match) return;
    if (firstOption < 0) firstOption = index;
    const [, , number, box, label] = match;
    if (box !== undefined && !FREE_TEXT_OPTION.test(label)) {
      options.push({ n: Number(number), label: label.trim(), checked: CHECKED.test(box) });
    }
  });
  return { options, firstOption, hasSubmit };
}

export function parseMulti(screen) {
  const lines = menuLines(screen).slice(-MULTI_TAIL_LINES);
  const { options, firstOption, hasSubmit } = readMultiSelect(lines);
  const looksLikeMultiSelect = hasSubmit || lines.some(line => MORE_LINES.test(line));
  if (!options.length || !looksLikeMultiSelect) return {};
  return { multi: true, question: questionBefore(lines, firstOption), options };
}

export function stepsToSubmit(screen) {
  const rows = screen.split('\n').map(line => line.replace(BOX_EDGES, '')).filter(line => MENU_ROW.test(line));
  const cursor = rows.findIndex(line => CURSOR_ROW.test(line));
  const submit = rows.findIndex(line => SUBMIT_ROW.test(line));
  return cursor < 0 || submit < 0 ? null : submit - cursor;
}

const PREVIEW_LINES = 3;
const FRAME_CHARS = /[─━│╭╮╰╯\s]/g;
const LOGO_BLOCKS = /[▐▛▜▝▘█▀]/;
const FOOTER_HINT = /^\s*(⏵|\? for shortcuts)/;

const hasContent = line => line.replace(FRAME_CHARS, '').length > 1
  && !LOGO_BLOCKS.test(line)
  && !FOOTER_HINT.test(line);

export function screenPreview(screen) {
  return screen.split('\n').map(line => line.trimEnd()).filter(hasContent).slice(-PREVIEW_LINES).join('\n');
}
