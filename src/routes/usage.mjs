import { machineUsage } from '../system.mjs';
import { validName } from '../validate.mjs';

async function findSession(sessions, name) {
  if (!validName(name)) return null;
  return (await sessions.list()).find(session => session.name === name) || null;
}

export function usageRoutes({ sessions, agents, machines, home }) {
  return {
    async 'GET /api/usage'(query) {
      const session = await findSession(sessions, query.get('session'));
      const [machine, limits, tokens] = await Promise.all([
        machineUsage(home),
        agents.limits(),
        session?.agent ? agents.get(session.agent).sessionTokens(session.dir, session.agentPid) : null,
      ]);
      return { machine, limits, session: session && { name: session.name, agent: session.agent, ...tokens } };
    },

    'GET /api/machines': async () => (await machines.list()).map(({ dns, ...machine }) => machine),
  };
}
