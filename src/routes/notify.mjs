import { pushText } from '../push/texts.mjs';
export function notifyRoutes({ pusher, prefs, watcher }) {
  return {
    'GET /api/push/key': () => ({ key: pusher.publicKey() }),
    'GET /api/push/alert': () => pusher.lastAlert(),
    'GET /api/events': () => watcher.events(),
    'GET /api/notify': () => prefs.get(),
    'POST /api/notify': (_, body) => prefs.set(body),

    async 'POST /api/push/sub'(_, body) {
      await pusher.subscribe(body.endpoint);
      return { ok: true };
    },

    'POST /api/push/test': async () => {
      const results = await pusher.send('termi', pushText(prefs.get().lang, 'test'), '');
      return { results };
    },
  };
}
