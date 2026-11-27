import { fail } from '../errors.mjs';
import { git } from '../git/run.mjs';
import { sharedResult } from '../shared-result.mjs';
import { runAction, runLog } from './actions.mjs';
import { pipelinesOf } from './normalize.mjs';
import { azureRuns, githubRuns, pipelinesPage } from './providers.mjs';
import { parseRemote } from './remote.mjs';

const CACHE_MS = 15_000;
const MAX_CACHED_REPOS = 20;

const repoLabel = remote => (remote.provider === 'github'
  ? `${remote.owner}/${remote.repo}`
  : `${remote.org}/${remote.project}/${remote.repo}`);

const DEFAULT_TOOLS = { github: githubRuns, azure: azureRuns, log: runLog, act: runAction };

export function createCi({ fetchRuns = DEFAULT_TOOLS } = {}) {
  const caches = new Map();

  async function build(dir) {
    const url = await git(dir, 'remote', 'get-url', 'origin').catch(() => '');
    const remote = parseRemote(url);
    if (!remote) return { provider: null };
    const fetched = await (remote.provider === 'github'
      ? fetchRuns.github(remote)
      : fetchRuns.azure(remote, dir));
    const runs = fetched.sort((a, b) => (b.queuedAt || 0) - (a.queuedAt || 0));
    const branch = (await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').catch(() => '')).trim();
    return {
      remote,
      provider: remote.provider,
      branch: branch === 'HEAD' ? '' : branch,
      repo: repoLabel(remote),
      page: pipelinesPage(remote),
      pipelines: pipelinesOf(runs),
      runs,
    };
  }

  function list(dir, { fresh = false } = {}) {
    if (!caches.has(dir)) {
      if (caches.size >= MAX_CACHED_REPOS) caches.delete(caches.keys().next().value);
      caches.set(dir, sharedResult(() => build(dir), { ttlMs: CACHE_MS }));
    }
    const cache = caches.get(dir);
    if (fresh) cache.invalidate();
    return cache.get();
  }

  async function findRun(dir, id) {
    const data = await list(dir);
    const run = data.runs?.find(item => item.id === String(id));
    if (!run) throw fail(404, 'Không tìm thấy lần chạy');
    return { remote: data.remote, run };
  }

  async function log(dir, id) {
    const { remote, run } = await findRun(dir, id);
    return fetchRuns.log(remote, run);
  }

  async function act(dir, id, action) {
    const { remote, run } = await findRun(dir, id);
    const result = await fetchRuns.act(remote, run, action);
    caches.get(dir)?.invalidate();
    return result;
  }

  return { list, log, act };
}
