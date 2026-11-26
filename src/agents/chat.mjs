import { parseJson } from './jsonl.mjs';

const recordTime = record => Date.parse(record.timestamp) || null;

function collectEvents(adapter, lines, limit) {
  const events = [];
  let messageCount = 0;
  for (const line of lines) {
    const record = parseJson(line);
    if (record === null) continue;
    const t = recordTime(record);
    const lineEvents = adapter.chatEvents(record).map(event => ({ ...event, t }));
    events.push(...lineEvents.reverse());
    messageCount += lineEvents.filter(event => event.who).length;
    if (messageCount >= limit) break;
  }
  return events.reverse();
}

function groupSteps(events) {
  const items = [];
  for (const event of events) {
    const previous = items.at(-1);
    if (event.tool && previous?.kind === 'tools') {
      previous.steps.push(event.tool);
      previous.t = event.t;
    } else if (event.tool) {
      items.push({ kind: 'tools', steps: [event.tool], t: event.t });
    } else {
      items.push({ kind: 'msg', who: event.who, text: event.text, t: event.t });
    }
  }
  return items;
}

export function chatItems(adapter, lines, limit = 80) {
  return groupSteps(collectEvents(adapter, lines, limit));
}

export function transcriptMessages(adapter, lines, limit = 40) {
  const messages = [];
  for (const line of lines) {
    const record = parseJson(line);
    const message = record && adapter.message(record);
    if (!message) continue;
    messages.push({ ...message, t: recordTime(record) });
    if (messages.length >= limit) break;
  }
  return messages.reverse();
}
