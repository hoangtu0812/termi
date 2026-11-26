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
          await api('/api/send', { session: st().s, text, enter: true });
          toast(`Đã gửi: ${name}`);
        });
        return b;
      })
      .filter(Boolean),
  );
}
export function setupQuick() {
  $('b-quick').onclick = () => {
    if (!cur()?.agent) return toast('Phiên này chưa chạy agent nào', true);
    renderQuick(cur().agent);
    $('d-quick').showModal();
    api('/api/quick')
      .then(q => {
        S.quickCustom = q;
        if ($('d-quick').open && !S.quickEditing) renderQuick(cur().agent);
      })
      .catch(() => {});
  };
  $('quick-edit').onclick = () => {
    S.quickEditing = true;
    const agent = cur()?.agent;
    const items = quickList().map(([emoji, name, desc, cmd, ask]) => ({
      emoji,
      name,
      desc,
      text: typeof cmd === 'string' ? cmd : (cmd[agent] ?? cmd['*'] ?? ''),
      ask: !!ask,
    }));
    const row = q => {
      const r = el('div', 'qrow');
      const inp = (v, ph, cls) => Object.assign(el('input', cls), { value: v, placeholder: ph });
      const e = inp(q.emoji, '⚡', 'qe'),
        n = inp(q.name, 'Tên', 'qn'),
        d = inp(q.desc, 'Mô tả ngắn', 'qd');
      const t = Object.assign(el('textarea', 'qt'), { value: q.text, placeholder: 'Câu lệnh gửi cho agent', rows: 2 });
      const a = el('label', 'qa');
      const c = Object.assign(el('input'), { type: 'checkbox', checked: q.ask });
      a.append(c, ' Hỏi trước khi gửi');
      const del = el('button', 'ibtn');
      del.type = 'button';
      del.innerHTML = icon('trash');
      del.onclick = () => r.remove();
      del.setAttribute('aria-label', 'Xoá');
      const top = el('div', 'qtop');
      top.append(e, n, del);
      r.append(top, d, t, a);
      r.read = () => ({
        emoji: e.value.trim(),
        name: n.value.trim(),
        desc: d.value.trim(),
        text: t.value.trim(),
        ask: c.checked,
      });
      return r;
    };
    const list = el('div', 'qedit');
    list.append(...items.map(row));
    const add = el('button', 'btn sm', '＋ Thêm'),
      save = el('button', 'btn pri sm', 'Lưu'),
      reset = el('button', 'btn sm', 'Khôi phục mặc định');
    add.type = save.type = reset.type = 'button';
    add.onclick = () => list.append(row({ emoji: '⚡', name: '', desc: '', text: '', ask: false }));
    save.onclick = safely(async () => {
      S.quickCustom = await api('/api/quick', { items: [...list.children].map(r => r.read()) });
      S.quickEditing = false;
      renderQuick(agent);
      toast('Đã lưu thao tác nhanh');
    });
    reset.onclick = safely(async () => {
      if (!confirm('Dùng lại danh sách mặc định?')) return;
      await api('/api/quick', { items: null });
      S.quickCustom = null;
      S.quickEditing = false;
      renderQuick(agent);
    });
    const acts = el('div', 'acts');
    acts.append(reset, add, save);
    $('quick-list').replaceChildren(list, acts);
  };
  $('d-quick').addEventListener('close', () => {
    S.quickEditing = false;
  });
}
