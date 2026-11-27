import { el } from './dom.mjs';
import { seenKeyOf, seenMap } from './seen.mjs';
import { S, cur, st } from './state.mjs';
import { CODE_TABS } from './tab-memory.mjs';

const MAX_COUNT = 99;

export function badgeFor(tab, { session, seen, ci, viewing }) {
  if (!session) return null;
  if (tab === 'chat' && viewing !== 'chat' && session.replyAt > seen) return { kind: 'unread', dot: true };
  if (tab === 'git' && session.changes) return { kind: 'changes', text: String(Math.min(session.changes, MAX_COUNT)) };
  if (tab === 'ci' && ci) return { kind: ci, dot: true };
  return null;
}

function codeBadge(context) {
  const badges = CODE_TABS.map(tab => badgeFor(tab, context)).filter(Boolean);
  return badges.find(b => b.kind === 'failure') || badges.find(b => b.text) || badges[0] || null;
}

function place(button, badge) {
  button.querySelector('.tbadge')?.remove();
  if (!badge) return;
  const node = el('span', `tbadge ${badge.kind}${badge.dot ? ' dot' : ''}`, badge.dot ? '' : badge.text);
  button.append(node);
}

export function renderTabBadges() {
  const session = cur();
  const context = {
    session,
    seen: session ? seenMap()[seenKeyOf(session.name)] || 0 : 0,
    ci: S.ciState && session && S.ciState.dir === session.dir ? S.ciState.badge : null,
    viewing: st().t,
  };
  for (const b of document.querySelectorAll('#seg button, #tabbar button, #codetabs button')) {
    place(b, b.dataset.t === 'code' ? codeBadge(context) : badgeFor(b.dataset.t, context));
  }
}
