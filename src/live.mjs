export const CHECK_MS = 1500;
export const HEARTBEAT_MS = 20_000;
export const RETRY_MS = 3000;

const STREAM_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache',
  'x-accel-buffering': 'no',
};

export const sseMessage = (event, data) => `event: ${event}\ndata: ${data}\n\n`;

export function createLiveFeed({ list, checkMs = CHECK_MS, heartbeatMs = HEARTBEAT_MS }) {
  const clients = new Set();
  let last = null;
  let checkTimer = null;
  let beatTimer = null;

  const broadcast = text => {
    for (const res of clients) res.write(text);
  };

  async function check() {
    const next = JSON.stringify(await list());
    if (next === last) return;
    last = next;
    broadcast(sseMessage('sessions', next));
  }

  function startTimers() {
    if (checkTimer) return;
    checkTimer = setInterval(() => check().catch(error => console.error('live', error.message)), checkMs);
    beatTimer = setInterval(() => broadcast(': ping\n\n'), heartbeatMs);
  }

  function stopTimers() {
    clearInterval(checkTimer);
    clearInterval(beatTimer);
    checkTimer = beatTimer = null;
    last = null;
  }

  async function subscribe(req, res) {
    res.writeHead(200, STREAM_HEADERS);
    res.write(`retry: ${RETRY_MS}\n\n`);
    clients.add(res);
    req.on('close', () => {
      clients.delete(res);
      if (!clients.size) stopTimers();
    });
    const current = JSON.stringify(await list());
    if (clients.size === 1) last = current;
    res.write(sseMessage('sessions', current));
    startTimers();
  }

  return { subscribe, check, size: () => clients.size, stop: stopTimers };
}
