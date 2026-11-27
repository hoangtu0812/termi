import { api, safely, toast } from './api.mjs';
import { $, agentName, el } from './dom.mjs';
import { icon } from './icons.mjs';
import { S, cur, st } from './state.mjs';

const QUICK = [
  [
    '📋',
    'Tình trạng',
    'Nhánh, thay đổi, commit chưa push',
    'Cho tôi biết ngắn gọn: đang ở nhánh nào, có thay đổi gì chưa commit, có commit nào chưa pu' + 'sh.',
  ],
  [
    '💾',
    'Commit',
    'Xem thay đổi và commit',
    'Xem các thay đổi hiện tại và commit với message rõ ràng (tách thành nhiều commit nếu hợp l' + 'ý).',
  ],
  ['⬆️', 'Push', 'Đẩy nhánh lên remote', 'Push nhánh hiện tại lên remote.', true],
  [
    '🔀',
    'Tạo PR',
    'Pull request kèm mô tả',
    'Tạo pull request cho nhánh hiện tại bằng gh, viết tiêu đề và mô tả tóm tắt các thay đổi.',
    true,
  ],
  [
    '✅',
    'Merge PR',
    'Kiểm tra CI rồi merge',
    'Kiểm tra CI của pull request cho nhánh hiện tại; nếu tất cả đều qua thì merge, nếu không t' + 'hì báo lại lỗi.',
    true,
  ],
  [
    '🔍',
    'Review',
    'Rà lỗi trong thay đổi',
    {
      claude: '/code-review',
      codex: '/review',
      '*': 'Review các thay đổi chưa commit: tìm lỗi logic, bảo mật, chỗ thiếu test.',
    },
  ],
  [
    '🧪',
    'Chạy test',
    'Báo kết quả, giải thích lỗi',
    'Chạy test của dự án và báo kết quả; nếu có lỗi thì giải thích nguyên nhân.',
  ],
  ['🗜️', 'Thu gọn', 'Giảm ngữ cảnh hội thoại', { claude: '/compact', codex: '/compact' }],
];
const quickList = () => (S.quickCustom ? S.quickCustom.map(q => [q.emoji, q.name, q.desc, q.text, q.ask]) : QUICK);
function renderQuick(agent) {
  $('quick-list').replaceChildren(
    ...quickList()
      .map(([emoji, name, desc, cmd, ask]) => {
        const text = typeof cmd === 'string' ? cmd : (cmd[agent] ?? cmd['*']);
        if (!text) return null;
        const b = el('button');
        b.type = 'button';
        b.append(el('b', null, `${emoji} ${name}`), el('span', null, desc));
        b.onclick = safely(async () => {
          $('d-quick').close();
          if (ask && !confirm(`${name}: gửi yêu cầu này cho ${agentName(agent)}?\n\n${text}`)) return;
          await api('api/send', { session: st().s, text, enter: true });
          toast(`Đã gửi: ${name}`);
        });
        return b;
      })
      .filter(Boolean),
  );
}
const BLANK_ACTION = { emoji: '⚡', name: '', desc: '', text: '', ask: false };

function openQuick() {
  if (!cur()?.agent) return toast('Phiên này chưa chạy agent nào', true);
  renderQuick(cur().agent);
  $('d-quick').showModal();
  api('api/quick')
    .then(q => {
      S.quickCustom = q;
      if ($('d-quick').open && !S.quickEditing) renderQuick(cur().agent);
    })
    .catch(() => {});
}

const editableItems = agent =>
  quickList().map(([emoji, name, desc, cmd, ask]) => ({
    emoji,
    name,
    desc,
    text: typeof cmd === 'string' ? cmd : (cmd[agent] ?? cmd['*'] ?? ''),
    ask: !!ask,
  }));

const textInput = (value, placeholder, cls) => Object.assign(el('input', cls), { value, placeholder });

function deleteButton(row) {
  const del = el('button', 'ibtn');
  del.type = 'button';
  del.innerHTML = icon('trash');
  del.onclick = () => row.remove();
  del.setAttribute('aria-label', 'Xoá');
  return del;
}

function quickRow(q) {
  const r = el('div', 'qrow');
  const e = textInput(q.emoji, '⚡', 'qe');
  const n = textInput(q.name, 'Tên', 'qn');
  const d = textInput(q.desc, 'Mô tả ngắn', 'qd');
  const t = Object.assign(el('textarea', 'qt'), { value: q.text, placeholder: 'Câu lệnh gửi cho agent', rows: 2 });
  const a = el('label', 'qa');
  const c = Object.assign(el('input'), { type: 'checkbox', checked: q.ask });
  a.append(c, ' Hỏi trước khi gửi');
  const top = el('div', 'qtop');
  top.append(e, n, deleteButton(r));
  r.append(top, d, t, a);
  r.read = () => ({
    emoji: e.value.trim(),
    name: n.value.trim(),
    desc: d.value.trim(),
    text: t.value.trim(),
    ask: c.checked,
  });
  return r;
}

function editorActions(list, agent) {
  const add = el('button', 'btn sm', '＋ Thêm');
  const save = el('button', 'btn pri sm', 'Lưu');
  const reset = el('button', 'btn sm', 'Khôi phục mặc định');
  add.type = save.type = reset.type = 'button';
  add.onclick = () => list.append(quickRow(BLANK_ACTION));
  save.onclick = safely(async () => {
    S.quickCustom = await api('api/quick', { items: [...list.children].map(r => r.read()) });
    S.quickEditing = false;
    renderQuick(agent);
    toast('Đã lưu thao tác nhanh');
  });
  reset.onclick = safely(async () => {
    if (!confirm('Dùng lại danh sách mặc định?')) return;
    await api('api/quick', { items: null });
    S.quickCustom = null;
    S.quickEditing = false;
    renderQuick(agent);
  });
  const acts = el('div', 'acts');
  acts.append(reset, add, save);
  return acts;
}

function openQuickEditor() {
  S.quickEditing = true;
  const agent = cur()?.agent;
  const list = el('div', 'qedit');
  list.append(...editableItems(agent).map(quickRow));
  $('quick-list').replaceChildren(list, editorActions(list, agent));
}

export function setupQuick() {
  $('b-quick').onclick = openQuick;
  $('quick-edit').onclick = openQuickEditor;
  $('d-quick').addEventListener('close', () => {
    S.quickEditing = false;
  });
}
