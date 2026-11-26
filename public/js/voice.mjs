import { autosize, base, toast } from './api.mjs';
import { saveDraft } from './composer.mjs';
import { $ } from './dom.mjs';

const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
export function setupVoice() {
  if (Speech) {
    $('b-mic').hidden = false;
    $('b-mic').onpointerdown = e => e.preventDefault();
    $('b-mic').onclick = () => {
      if (rec) return rec.stop();
      const t = $('text'),
        base = t.value ? t.value.replace(/\s*$/, ' ') : '';
      rec = new Speech();
      rec.lang = 'vi-VN';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = e => {
        t.value = base + [...e.results].map(r => r[0].transcript).join('');
        autosize(t);
        saveDraft();
      };
      rec.onerror = e => {
        if (e.error !== 'aborted' && e.error !== 'no-speech')
          toast('Micro: ' + (e.error === 'not-allowed' ? 'chưa cho phép dùng micro' : e.error), true);
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
