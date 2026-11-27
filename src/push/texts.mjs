const TEXTS = {
  vi: {
    waiting: 'cần bạn xác nhận',
    done: 'đã xong',
    test: 'Thông báo hoạt động 👍',
    machineDown: 'Máy {0} mất kết nối',
    machineDownBody: 'termi trên máy này không trả lời quá 5 phút.',
    machineUp: 'Máy {0} đã kết nối lại',
    machineUpBody: 'termi trên máy này đã trả lời trở lại.',
    diskLow: 'Ổ đĩa sắp đầy',
    diskLowBody: 'Ổ chứa thư mục nhà đã dùng {0}%{1}.',
    diskFree: ', còn trống {0} GB',
    crashed: 'termi đã tự khởi động lại',
    crashedBody: 'Máy chủ termi dừng bất thường và vừa được chạy lại.',
    ttyd: 'Terminal được khởi động lại',
    ttydBody: 'ttyd bị kẹt {0} kết nối nên đã chạy lại.',
    cifail: '❌ {0} lỗi',
    cidone: '✅ {0} chạy xong',
  },
  en: {
    waiting: 'needs your confirmation',
    done: 'is done',
    test: 'Notifications work 👍',
    machineDown: '{0} is offline',
    machineDownBody: 'termi on this machine has not answered for over 5 minutes.',
    machineUp: '{0} is back online',
    machineUpBody: 'termi on this machine is answering again.',
    diskLow: 'Disk almost full',
    diskLowBody: 'The disk with the home folder is {0}% used{1}.',
    diskFree: ', {0} GB free',
    crashed: 'termi restarted',
    crashedBody: 'The termi server stopped unexpectedly and was started again.',
    ttyd: 'Terminal restarted',
    ttydBody: 'ttyd had {0} stuck connections and was restarted.',
    cifail: '❌ {0} failed',
    cidone: '✅ {0} succeeded',
  },
};

export const PUSH_LANGS = Object.keys(TEXTS);

export function pushText(lang, key, ...args) {
  const text = (TEXTS[lang] ?? TEXTS.vi)[key] ?? TEXTS.vi[key];
  return text.replace(/\{(\d+)\}/g, (match, i) => (i < args.length ? String(args[i]) : match));
}
