const FILE = 'run.json';

export const endedUncleanly = previous => Boolean(previous) && previous.clean === false;

export function createRunMarker(store, now = Date.now) {
  return {
    async begin() {
      const previous = await store.read(FILE);
      await store.write(FILE, { clean: false, startedAt: now(), pid: process.pid });
      return endedUncleanly(previous);
    },
    end: () => store.write(FILE, { clean: true, stoppedAt: now(), pid: process.pid }),
  };
}
