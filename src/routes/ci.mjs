export function ciRoutes({ paths, ci }) {
  return {
    async 'GET /api/ci'(query) {
      const dir = await paths.need(query.get('dir'));
      return ci.list(dir, { fresh: query.get('fresh') === '1' });
    },
  };
}
