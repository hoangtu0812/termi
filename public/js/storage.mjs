export const store = {
  get: k => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      v == null || v === '' ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  },
};
