// Minimal Upstash Redis REST client (no dependencies). Vercel's Upstash integration
// sets KV_REST_API_URL / KV_REST_API_TOKEN (older setups: UPSTASH_REDIS_REST_*).
const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasStore = Boolean(URL_ && TOKEN);

/** Run several commands in one round trip; returns their results in order. */
export async function pipeline(...cmds) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return (await r.json()).map((o) => {
    if (o.error) throw new Error(o.error);
    return o.result;
  });
}

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
