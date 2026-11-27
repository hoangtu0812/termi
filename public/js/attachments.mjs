import { autosize, base, safely } from './api.mjs';
import { $, el } from './dom.mjs';
import { icon } from './icons.mjs';
import { S } from './state.mjs';

async function addFiles(files) {
  await Promise.all(
    files.map(async f => {
      const a = { name: f.name, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, path: null };
      S.atts.push(a);
      renderAtts();
      try {
        const r = await fetch(base() + 'api/upload', {
          method: 'POST',
          headers: { 'x-termi': '1', 'x-filename': encodeURIComponent(f.name) },
          body: f,
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        a.path = j.path;
      } catch (err) {
        removeAtt(a);
        throw err;
      }
      renderAtts();
    }),
  );
}
function removeAtt(a) {
  if (a.url) URL.revokeObjectURL(a.url);
  S.atts = S.atts.filter(x => x !== a);
  renderAtts();
}
export function renderAtts() {
  $('atts').hidden = !S.atts.length;
  $('atts').replaceChildren(
    ...S.atts.map(a => {
      const c = el('div', 'att' + (a.url ? '' : ' file') + (a.path ? '' : ' busy'));
      c.title = a.name;
      if (a.url) c.append(Object.assign(el('img'), { src: a.url, alt: a.name }));
      else {
        c.innerHTML = icon('file');
        c.append(el('span', null, a.name));
      }
      const x = el('button', 'x', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', 'Bỏ ' + a.name);
      x.onclick = () => removeAtt(a);
      c.append(x);
      return c;
    }),
  );
}
export function insertText(s) {
  const t = $('text');
  t.value = (t.value && !t.value.endsWith(' ') ? t.value + ' ' : t.value) + s + ' ';
  autosize(t);
}
export function setupAttachments() {
  $('b-attach').onclick = () => $('f-input').click();
  $('b-photo').onclick = () => $('f-photo').click();
  $('f-photo').onchange = $('f-input').onchange = safely(async e => {
    const files = [...e.target.files];
    e.target.value = '';
    await addFiles(files);
  });
  $('text').addEventListener(
    'paste',
    safely(async e => {
      const files = [...(e.clipboardData?.files || [])];
      if (!files.length) return;
      e.preventDefault();
      const at = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
      await addFiles(
        files.map(f =>
          f.name && f.name !== 'image.png'
            ? f
            : new File([f], `paste-${at}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }),
        ),
      );
    }),
  );
  $('composer').addEventListener('dragover', e => e.dataTransfer?.types.includes('Files') && e.preventDefault());
  $('composer').addEventListener(
    'drop',
    safely(async e => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      await addFiles([...e.dataTransfer.files]);
    }),
  );
}
