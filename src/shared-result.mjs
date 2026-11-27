export function sharedResult(build, { ttlMs, now = Date.now }) {
  let generation = 0;
  let cached = null;
  let inFlight = null;

  const isFresh = () => cached && cached.generation === generation && now() - cached.at < ttlMs;

  function start() {
    const run = { generation, promise: null };
    run.promise = build().then(value => {
      if (run.generation === generation) cached = { generation, at: now(), value };
      return value;
    }).finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
    return run.promise;
  }

  function get() {
    if (isFresh()) return Promise.resolve(cached.value);
    if (inFlight?.generation === generation) return inFlight.promise;
    return start();
  }

  function invalidate() {
    generation++;
  }

  return { get, invalidate };
}
