import { api, safely, toast } from './api.mjs';
import { $, el } from './dom.mjs';
import { S } from './state.mjs';
import { t } from './i18n.mjs';

let editorUrl = null;

function folderLink(dir) {
  const url = new URL(editorUrl);
  url.searchParams.set('folder', dir);
  return url.href;
}

function showButton() {
  $('f-code').hidden = !editorUrl;
}

export function editorField(current) {
  const input = el('input');
  input.type = 'url';
  input.value = current || '';
  input.placeholder = 'https://mac-mini.tailnet.ts.net:9443';
  input.setAttribute('aria-label', t('Địa chỉ VS Code web'));
  input.onchange = safely(async () => {
    const saved = await api('api/editor', { url: input.value.trim() || null });
    editorUrl = saved.url;
    input.value = saved.url || '';
    showButton();
    toast(saved.url ? t('Đã lưu địa chỉ VS Code web') : t('Đã tắt nút mở VS Code'));
  });
  return input;
}

export function setupEditor() {
  $('f-code').onclick = () => {
    if (editorUrl && S.filesDir) window.open(folderLink(S.filesDir), '_blank', 'noopener');
  };
  api('api/info').then(info => {
    editorUrl = info.editorUrl;
    showButton();
  }, () => {});
}
