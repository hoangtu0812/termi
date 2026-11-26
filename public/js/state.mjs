export const st = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
export function go(patch) {
  const n = { ...st(), ...patch };
  for (const k in n) if (n[k] == null || n[k] === '') delete n[k];
  location.hash = new URLSearchParams(n).toString();
}
export const S = { list: [], repos: null, seen: {}, atts: [] };
export const cur = () => S.list.find(x => x.name === st().s);
