import { api, safely, toast } from './api.mjs';
import { $, agentName, el } from './dom.mjs';
import { icon } from './icons.mjs';
import { S, cur, st } from './state.mjs';
import { t } from './i18n.mjs';

const QUICK = [
  [
    '📋',
    t('Tình trạng'),
    t('Nhánh, thay đổi, commit chưa push'),
    t('Cho tôi biết ngắn gọn: đang ở nhánh nào, có thay đổi gì chưa commit, có commit nào chưa push.'),
  ],
  [
    '💾',
    'Commit',
    t('Xem thay đổi và commit'),
    t('Xem các thay đổi hiện tại và commit với message rõ ràng (tách thành nhiều commit nếu hợp lý).'),
  ],
  ['⬆️', 'Push', t('Đẩy nhánh lên remote'), t('Push nhánh hiện tại lên remote.'), true],
  [
    '🔀',
    t('Tạo PR'),
    t('Pull request kèm mô tả'),
    t('Tạo pull request cho nhánh hiện tại bằng gh, viết tiêu đề và mô tả tóm tắt các thay đổi.'),
    true,
  ],
  [
    '✅',
    'Merge PR',
    t('Kiểm tra CI rồi merge'),
    t('Kiểm tra CI của pull request cho nhánh hiện tại; nếu tất cả đều qua thì merge, nếu không thì báo lại lỗi.'),
    true,
  ],
  [
    '🔍',
    'Review',
    t('Rà lỗi trong thay đổi'),
    {
      claude: '/code-review',
      codex: '/review',
      '*': t('Review các thay đổi chưa commit: tìm lỗi logic, bảo mật, chỗ thiếu test.'),
    },
  ],
  [
    '🧪',
    t('Chạy test'),
    t('Báo kết quả, giải thích lỗi'),
    t('Chạy test của dự án và báo kết quả; nếu có lỗi thì giải thích nguyên nhân.'),
  ],
  ['🗜️', t('Thu gọn'), t('Giảm ngữ cảnh hội thoại'), { claude: '/compact', codex: '/compact' }],
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
          if (ask && !confirm(t('{0}: gửi yêu cầu này cho {1}?\n\n{2}', name, agentName(agent), text))) return;
          await api('api/send', { session: st().s, text, enter: true });
          toast(t('Đã gửi: {0}', name));
        });
        return b;
      })
      .filter(Boolean),
  );
}
const BLANK_ACTION = { emoji: '⚡', name: '', desc: '', text: '', ask: false };

function openQuick() {
  if (!cur()?.agent) return toast(t('Phiên này chưa chạy agent nào'), true);
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
  del.setAttribute('aria-label', t('Xoá'));
  return del;
}

function quickRow(q) {
  const r = el('div', 'qrow');
  const e = textInput(q.emoji, '⚡', 'qe');
  const n = textInput(q.name, t('Tên'), 'qn');
  const d = textInput(q.desc, t('Mô tả ngắn'), 'qd');
  const area = Object.assign(el('textarea', 'qt'), { value: q.text, rows: 2 });
  area.placeholder = t('Câu lệnh gửi cho agent');
  const a = el('label', 'qa');
  const c = Object.assign(el('input'), { type: 'checkbox', checked: q.ask });
  a.append(c, t(' Hỏi trước khi gửi'));
  const top = el('div', 'qtop');
  top.append(e, n, deleteButton(r));
  r.append(top, d, area, a);
  r.read = () => ({
    emoji: e.value.trim(),
    name: n.value.trim(),
    desc: d.value.trim(),
    text: area.value.trim(),
    ask: c.checked,
  });
  return r;
}

function editorActions(list, agent) {
  const add = el('button', 'btn sm', t('＋ Thêm'));
  const save = el('button', 'btn pri sm', t('Lưu'));
  const reset = el('button', 'btn sm', t('Khôi phục mặc định'));
  add.type = save.type = reset.type = 'button';
  add.onclick = () => list.append(quickRow(BLANK_ACTION));
  save.onclick = safely(async () => {
    S.quickCustom = await api('api/quick', { items: [...list.children].map(r => r.read()) });
    S.quickEditing = false;
    renderQuick(agent);
    toast(t('Đã lưu thao tác nhanh'));
  });
  reset.onclick = safely(async () => {
    if (!confirm(t('Dùng lại danh sách mặc định?'))) return;
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
