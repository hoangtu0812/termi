const PROJECT_HISTORY = 250;
const CONVERSATIONS_PER_PROJECT = 20;
const SECOND_MS = 1000;

function groupByDir(sessions, conversations) {
  const projects = new Map();
  const projectOf = dir => {
    if (!projects.has(dir)) projects.set(dir, { dir, sessions: [], conversations: [], last: 0 });
    return projects.get(dir);
  };
  for (const session of sessions) {
    const project = projectOf(session.dir);
    project.sessions.push(session.name);
    project.last = Math.max(project.last, session.activity * SECOND_MS);
  }
  for (const conversation of conversations) {
    const project = projectOf(conversation.cwd);
    if (project.conversations.length < CONVERSATIONS_PER_PROJECT) project.conversations.push(conversation);
    project.last = Math.max(project.last, conversation.mtime);
  }
  return [...projects.values()];
}

const byRelevance = (a, b) => b.sessions.length - a.sessions.length || b.last - a.last;

export function projectRoutes({ sessions, history, repos, paths, agents }) {
  return {
    async 'GET /api/dirs'() {
      const [open, past, found] = await Promise.all([sessions.list(), history().catch(() => []), repos()]);
      const candidates = new Set([...open.map(s => s.dir), ...past.map(h => h.cwd), ...found]);
      const recent = [];
      for (const dir of candidates) {
        if (await paths.inside(dir)) recent.push(dir);
      }
      return { roots: paths.roots, recent };
    },

    'GET /api/history': query => history(query.get('dir') || undefined),

    async 'GET /api/projects'() {
      const [open, past] = await Promise.all([sessions.list(), history(undefined, PROJECT_HISTORY)]);
      const projects = groupByDir(open, past);
      const reachable = await Promise.all(projects.map(async project => (await paths.inside(project.dir)) && project));
      return reachable.filter(Boolean).sort(byRelevance);
    },

    'GET /api/agents': () => agents.installed(),
  };
}
