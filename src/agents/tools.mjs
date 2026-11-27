const MAX_DETAIL_CHARS = 140;
const QUOTED_COMMAND = /cmd:\s*"((?:[^"\\]|\\.){1,200})/;
const SHELL_TOOLS = new Set(['exec', 'shell']);

const baseName = file => (file ? String(file).split('/').pop() : '');
const editTarget = input => ['Sửa', baseName(input.file_path || input.notebook_path)];
const delegate = input => ['Giao việc', input.description];

const NAMED_TOOLS = new Map([
  ['Read', input => ['Đọc', baseName(input.file_path)]],
  ['Edit', editTarget],
  ['MultiEdit', editTarget],
  ['NotebookEdit', editTarget],
  ['Write', input => ['Tạo', baseName(input.file_path)]],
  ['Bash', input => ['Chạy', input.description || input.command]],
  ['Grep', input => ['Tìm', input.pattern]],
  ['Glob', input => ['Tìm file', input.pattern]],
  ['WebFetch', input => ['Đọc web', input.url]],
  ['WebSearch', input => ['Tìm web', input.query]],
  ['Agent', delegate],
  ['Task', delegate],
  ['TodoWrite', () => ['Cập nhật danh sách việc', '']],
  ['AskUserQuestion', input => ['Hỏi bạn', input.questions?.[0]?.question]],
]);

function parseInput(input) {
  if (typeof input !== 'string') return input || {};
  try {
    return JSON.parse(input) ?? {};
  } catch {
    return { raw: input };
  }
}

function shellCommand(input) {
  const quoted = QUOTED_COMMAND.exec(input.raw || '')?.[1];
  if (quoted) return quoted;
  return Array.isArray(input.command) ? input.command.join(' ') : input.command || input.cmd;
}

const FILE_TOOLS = { Edit: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit', Write: 'create' };

export function toolSummary(name, rawInput) {
  const input = parseInput(rawInput);
  const describe = NAMED_TOOLS.get(name);
  const [verb, detail] = describe ? describe(input) : [SHELL_TOOLS.has(name) ? 'Chạy' : name, shellCommand(input)];
  const step = { verb, detail: String(detail || '').replace(/\s+/g, ' ').trim().slice(0, MAX_DETAIL_CHARS) };
  const file = input.file_path || input.notebook_path;
  if (FILE_TOOLS[name] && typeof file === 'string' && file.startsWith('/')) {
    Object.assign(step, { file, change: FILE_TOOLS[name] });
  }
  return step;
}
