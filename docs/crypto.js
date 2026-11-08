// Shared by the browser (app.js) and Node (tools/build.mjs): both expose Web Crypto as globalThis.crypto.
// One key per build (PBKDF2 once), then every blob (bundle JSON, each image) is sealed as iv(12) || AES-GCM ciphertext.
const ITERATIONS = 600_000; // OWASP 2023 minimum for PBKDF2-SHA256
const IV = 12;
const enc = new TextEncoder();

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function deriveKey(password, salt, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(IV + ct.length);
  out.set(iv);
  out.set(ct, IV);
  return out;
}

// Throws a DOMException named "OperationError" when the key is wrong (GCM auth tag mismatch).
export async function open(key, sealed) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, IV) }, key, sealed.subarray(IV)));
}

export const newSalt = () => crypto.getRandomValues(new Uint8Array(16));

// Bundle file: { v, iter, salt, data } where data is the sealed JSON.
export async function pack(key, salt, value) {
  return { v: 2, iter: ITERATIONS, salt: toB64(salt), data: toB64(await seal(key, enc.encode(JSON.stringify(value)))) };
}

export async function decrypt(box, password) {
  const key = await deriveKey(password, fromB64(box.salt), box.iter);
  const value = JSON.parse(new TextDecoder().decode(await open(key, fromB64(box.data))));
  return { value, key, salt: fromB64(box.salt) };
}
