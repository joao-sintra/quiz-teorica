import cfg from './config.js';

export const enabled = Boolean(cfg.url);

export async function rpc(fn, args, keepalive = false) {
  const res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    keepalive,
    headers: { 'content-type': 'application/json', apikey: cfg.key, authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
  return body;
}
