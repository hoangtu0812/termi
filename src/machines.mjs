import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const run = promisify(execFile);
const STATUS_MAX_BUFFER = 8e6;
const STATUS_TIMEOUT_MS = 5000;
const CACHE_MS = 20_000;
const PROBE_TIMEOUT_MS = 2500;
const DESKTOP_OS = new Set(['windows', 'linux', 'macOS']);
const PEER_PATH = /^\/m\/([a-z0-9-]{1,63})(\/.*)?$/i;

export function matchPeer(url) {
  const match = PEER_PATH.exec(url);
  return match && { id: match[1].toLowerCase(), rest: match[2] || '/' };
}

const dnsOf = peer => (peer.DNSName || '').replace(/\.$/, '');
const isDesktopPeer = peer => DESKTOP_OS.has(peer.OS) && dnsOf(peer) && !peer.Tags?.length;
const probeTermi = dns => fetch(`https://${dns}/api/agents`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
  .then(res => res.ok, () => false);

async function describePeer(peer) {
  const dns = dnsOf(peer);
  const termi = Boolean(peer.Online) && await probeTermi(dns);
  const id = dns.split('.')[0].toLowerCase();
  return { id, dns, name: peer.HostName, os: peer.OS, online: Boolean(peer.Online), termi };
}

const byRelevance = (a, b) => b.termi - a.termi || b.online - a.online || a.name.localeCompare(b.name);

async function discover(status) {
  const name = os.hostname().replace(/\.local$/, '');
  const self = { id: '', name, os: process.platform, online: true, termi: true, self: true };
  let current;
  try {
    current = await status();
  } catch {
    return [self];
  }
  self.name = current.Self?.HostName || self.name;
  const peers = await Promise.all(Object.values(current.Peer || {}).filter(isDesktopPeer).map(describePeer));
  return [self, ...peers.sort(byRelevance)];
}

function createOwner(status, allowedUsers) {
  let owner = null;
  return async function users() {
    if (allowedUsers) return allowedUsers;
    if (!owner) {
      const current = await status().catch(() => null);
      const login = current?.User?.[String(current.Self?.UserID)]?.LoginName;
      if (login) owner = [login.toLowerCase()];
    }
    return owner || [];
  };
}

function tailscaleStatus(tailscale) {
  return async () => JSON.parse((await run(tailscale, ['status', '--json'], {
    maxBuffer: STATUS_MAX_BUFFER,
    timeout: STATUS_TIMEOUT_MS,
  })).stdout);
}

export function createMachines({ tailscale, allowedUsers, now = Date.now }) {
  const status = tailscaleStatus(tailscale);
  let cache = { at: -Infinity, list: [] };

  async function list() {
    if (now() - cache.at < CACHE_MS) return cache.list;
    const found = await discover(status);
    cache = { at: now(), list: found };
    return cache.list;
  }

  const peerDns = async id => (await list()).find(machine => !machine.self && machine.termi && machine.id === id)?.dns;

  return { list, peerDns, allowedUsers: createOwner(status, allowedUsers) };
}
