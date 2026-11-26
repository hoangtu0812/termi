import crypto from 'node:crypto';

const FILE = 'vapid.json';
const UNCOMPRESSED_POINT = 4;
const TOKEN_LIFETIME_S = 12 * 60 * 60;
const CONTACT = 'mailto:termi@example.com';

const base64url = value => Buffer.from(value).toString('base64url');

export function createVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const point = Buffer.concat([Buffer.from([UNCOMPRESSED_POINT]), x, y]);
  return { pub: base64url(point), priv: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
}

export async function loadVapidKeys(store) {
  const saved = await store.read(FILE, { strict: true });
  if (saved) {
    if (typeof saved.pub !== 'string' || typeof saved.priv !== 'string') {
      throw new Error('vapid.json has no pub/priv keys; fix or remove it');
    }
    return saved;
  }
  const created = createVapidKeys();
  await store.write(FILE, created);
  return created;
}

export function vapidAuthorization(keys, endpoint, nowMs = Date.now()) {
  const audience = new URL(endpoint).origin;
  const expires = Math.floor(nowMs / 1000) + TOKEN_LIFETIME_S;
  const claims = base64url(JSON.stringify({ aud: audience, exp: expires, sub: CONTACT }));
  const header = base64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: keys.priv, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${base64url(signature)}, k=${keys.pub}`;
}
