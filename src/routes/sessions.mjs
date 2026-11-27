import { ownsResponse } from '../http/router.mjs';

async function restoreAll({ sessions, snapshots }) {
  const done = [];
  const failed = [];
  for (const saved of await snapshots.pending()) {
    try {
      await sessions.create(saved);
      done.push(saved.name);
    } catch (error) {
      failed.push(`${saved.name}: ${error.message}`);
    }
  }
  await snapshots.dismiss();
  await snapshots.save();
  return { done, failed };
}

export function sessionRoutes({ sessions, snapshots, live }) {
  return {
    'GET /api/sessions': () => sessions.list(),

    'GET /api/stream': ownsResponse((_, req, res) => live.subscribe(req, res)),

    async 'POST /api/sessions'(_, body) {
      await sessions.create(body);
      snapshots.save().catch(error => console.error('snapshot', error.message));
      return { ok: true };
    },

    async 'POST /api/sessions/rename'(_, body) {
      await sessions.rename(body.name, body.to);
      return { ok: true };
    },

    async 'POST /api/sessions/kill'(_, body) {
      await sessions.kill(body.name);
      await snapshots.forget(body.name);
      return { ok: true };
    },

    'GET /api/restore': () => snapshots.pending(),

    'POST /api/restore': () => restoreAll({ sessions, snapshots }),

    async 'POST /api/restore/dismiss'() {
      await snapshots.dismiss();
      return { ok: true };
    },
  };
}
