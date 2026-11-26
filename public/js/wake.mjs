let wakeLock = null;
async function keepAwake() {
  if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch {}
}
export function setupWake() {
  document.addEventListener('visibilitychange', keepAwake);
  addEventListener('pointerdown', keepAwake);
  keepAwake();
}
