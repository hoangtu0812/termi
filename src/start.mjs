import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHistory } from './agents/history.mjs';
import { createAgents } from './agents/index.mjs';
import { createReplyReader } from './agents/reply.mjs';
import { resolveRoots } from './config.mjs';
import { createGuard } from './http/guard.mjs';
import { createHandler } from './http/handler.mjs';
import { createUpgradeHandler } from './http/proxy.mjs';
import { createRouter } from './http/router.mjs';
import { createStaticServer, loadStaticFiles } from './http/static.mjs';
import { createMachines } from './machines.mjs';
import { createPaths } from './paths.mjs';
import { loadNotifyPrefs } from './push/prefs.mjs';
import { loadVapidKeys } from './push/vapid.mjs';
import { createWatcher } from './push/watcher.mjs';
import { createPusher } from './push/webpush.mjs';
import { createRepoFinder } from './repos.mjs';
import { fileRoutes } from './routes/files.mjs';
import { gitRoutes } from './routes/git.mjs';
import { notifyRoutes } from './routes/notify.mjs';
import { projectRoutes } from './routes/projects.mjs';
import { sessionRoutes } from './routes/sessions.mjs';
import { settingsRoutes } from './routes/settings.mjs';
import { terminalRoutes } from './routes/terminal.mjs';
import { usageRoutes } from './routes/usage.mjs';
import { createSessions } from './sessions.mjs';
import { createSnapshots } from './snapshot.mjs';
import { createStore } from './store.mjs';
import { createTtydWatchdog } from './ttyd-watchdog.mjs';

const PRIVATE_DIR = 0o700;
const WATCH_MS = 3000;
const SNAPSHOT_MS = 30_000;
const FIRST_SNAPSHOT_MS = 5000;
const WATCHDOG_MS = 120_000;

async function prepareDataDir(dataDir) {
  const uploadDir = path.join(dataDir, 'uploads');
  await fs.mkdir(uploadDir, { recursive: true, mode: PRIVATE_DIR });
  await fs.chmod(dataDir, PRIVATE_DIR);
  return uploadDir;
}

export async function init(config) {
  const paths = createPaths(await resolveRoots(config.roots));
  const uploadDir = await prepareDataDir(config.dataDir);
  const store = createStore(config.dataDir);
  const agents = createAgents({ home: config.home, dataDir: config.dataDir });
  const sessions = createSessions({ agents, lastReply: createReplyReader(), paths });
  const machines = createMachines({ tailscale: config.tailscale, allowedUsers: config.allowedUsers });
  const pusher = await createPusher({ store, keys: await loadVapidKeys(store) });
  const prefs = await loadNotifyPrefs(store);
  const watcher = createWatcher({ sessions, machines, agents, pusher, prefs });
  const statics = createStaticServer(config.publicDir, await loadStaticFiles(config.publicDir));
  return {
    config, paths, uploadDir, store, agents, sessions, machines, pusher, prefs, watcher, statics,
    home: config.home,
    history: createHistory(agents),
    repos: createRepoFinder(paths.roots),
    snapshots: createSnapshots({ store, sessions }),
    checkTtyd: createTtydWatchdog(config.ttydPort),
  };
}

const ROUTE_TABLES = [
  sessionRoutes, terminalRoutes, projectRoutes, fileRoutes, gitRoutes, notifyRoutes, usageRoutes, settingsRoutes,
];

function createServer(context) {
  const guard = createGuard(context.machines.allowedUsers);
  const dispatch = createRouter(ROUTE_TABLES.map(routes => routes(context)), context.statics.buildId);
  const { machines, statics } = context;
  const ttydPort = context.config.ttydPort;
  const server = http.createServer(createHandler({ guard, machines, statics, dispatch, ttydPort }));
  server.on('upgrade', createUpgradeHandler({ guard, machines, ttydPort }));
  return server;
}

const logged = (name, task) => () => task().catch(error => console.error(name, error.message));

function startTimers({ watcher, snapshots, checkTtyd }) {
  return [
    setInterval(logged('watch', watcher.tick), WATCH_MS),
    setInterval(logged('snapshot', snapshots.save), SNAPSHOT_MS),
    setInterval(logged('watchdog', checkTtyd), WATCHDOG_MS),
    setTimeout(logged('snapshot', snapshots.save), FIRST_SNAPSHOT_MS),
  ];
}

export async function start(config) {
  const context = await init(config);
  const server = createServer(context);
  await new Promise((resolve, reject) => server.once('error', reject).listen(config.port, config.host, resolve));
  console.log(`termi: http://${config.host}:${config.port}  roots=${context.paths.roots.join(', ')}`);
  const timers = startTimers(context);
  return {
    server,
    close: () => {
      timers.forEach(clearTimeout);
      return new Promise(resolve => server.close(resolve));
    },
  };
}
