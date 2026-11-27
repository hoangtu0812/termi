import { autosize, toast } from './api.mjs';
import { saveDraft } from './composer.mjs';
import { $ } from './dom.mjs';
import { locale, t } from './i18n.mjs';

let rec = null;
export function setupVoice() {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (Speech) {
    $('b-mic').hidden = false;
    $('b-mic').onpointerdown = e => e.preventDefault();
    $('b-mic').onclick = () => {
      if (rec) return rec.stop();
      const area = $('text'),
        base = area.value ? area.value.replace(/\s*$/, ' ') : '';
      rec = new Speech();
      rec.lang = locale();
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = e => {
        area.value = base + [...e.results].map(r => r[0].transcript).join('');
        autosize(area);
        saveDraft();
      };
      rec.onerror = e => {
        if (e.error !== 'aborted' && e.error !== 'no-speech')
          toast('Micro: ' + (e.error === 'not-allowed' ? t('chưa cho phép dùng micro') : e.error), true);
      };
      rec.onend = () => {
        rec = null;
        $('b-mic').classList.remove('rec');
      };
      rec.start();
      $('b-mic').classList.add('rec');
      navigator.vibrate?.(15);
    };
  }
}
