import { api, base, safely, toast } from './api.mjs';
import { insertText } from './attachments.mjs';
import { $, el, ltr, short } from './dom.mjs';
import { codeNode } from './highlight.mjs';
import { markdownNode } from './markdown.mjs';
import { go, st } from './state.mjs';
import { t } from './i18n.mjs';

export function openViewer(title, node, insertPath, alt) {
  $('v-title').textContent = ltr(title);
  $('v-body').replaceChildren(node);
  $('v-body').scrollTop = 0;
  $('v-insert').hidden = !insertPath || !st().s;
  $('v-insert').onclick = () => {
    insertText(insertPath);
    go({ t: 'term', v: null });
  };
  $('v-alt').hidden = !alt;
  if (alt) {
    const nodes = [node, alt[1]],
      labels = [alt[0], alt[2] || t('Xem trước')];
    let i = 0;
    $('v-alt').textContent = labels[0];
    $('v-alt').onclick = () => {
      i ^= 1;
      $('v-body').replaceChildren(nodes[i]);
      $('v-body').scrollTop = 0;
      $('v-alt').textContent = labels[i];
    };
  }
  go({ v: 1 });
}
export const rawUrl = p => new URL(base() + 'api/raw?path=' + encodeURIComponent(p), location.href).href;
export const openFile = safely(async p => {
  const r = await api('api/file?path=' + encodeURIComponent(p));
  if (r.image) {
    const img = el('img');
    img.src = rawUrl(p);
    img.alt = p;
    return openViewer(short(p), img, p);
  }
  const raw = el('pre', null, r.binary ? t('(file nhị phân, không hiển thị được)') : r.text);
  if (!r.text) return openViewer(short(p), raw, p);
  if (!/\.(md|markdown)$/i.test(p)) return openViewer(short(p), await codeNode(r.text, p).catch(() => raw), p);
  let md;
  try {
    md = await markdownNode(r.text, p);
  } catch (e) {
    toast(e.message, true);
    return openViewer(short(p), raw, p);
  }
  openViewer(short(p), md, p, [t('Xem mã'), raw]);
});
export function setupViewer() {
  $('v-close').onclick = () => history.back();
}
