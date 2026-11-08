// /api/push — reminder subscriptions for each person's device.
import { json, validId, loadBarn, vapid, getSubs, setSubs, sendPush } from "../lib/common.mjs";

export default async (req) => {
  if (req.method === "GET") { const k = await vapid(); return json({ publicKey: k.publicKey }); }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b; try { b = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!validId(b.barnId) || typeof b.memberId !== "string") return json({ error: "bad_request" }, 400);
  const doc = await loadBarn(b.barnId); if (!doc) return json({ error: "not_found" }, 404);
  if (!doc.members.some(m => m.id === b.memberId)) return json({ error: "not_member" }, 403);
  let subs = await getSubs(b.barnId);
  const ep = b.sub && b.sub.endpoint;
  if (b.action === "subscribe") {
    if (!ep || typeof ep !== "string" || !ep.startsWith("https://") || !b.sub.keys) return json({ error: "bad_sub" }, 400);
    subs = subs.filter(s => s.sub.endpoint !== ep);
    subs.push({ memberId: b.memberId, sub: { endpoint: ep, keys: { p256dh: String(b.sub.keys.p256dh), auth: String(b.sub.keys.auth) } }, at: Date.now() });
    await setSubs(b.barnId, subs.slice(-60));
    return json({ ok: true });
  }
  if (b.action === "unsubscribe") {
    await setSubs(b.barnId, subs.filter(s => s.sub.endpoint !== ep));
    return json({ ok: true });
  }
  if (b.action === "test") {
    const mine = subs.filter(s => s.sub.endpoint === ep);
    if (!mine.length) return json({ error: "not_subscribed" }, 404);
    const r = await sendPush(b.barnId, mine[0].sub, { title: "Blanket Plan", body: "Reminders are on for this device. 🐴" });
    return json({ ok: r === true });
  }
  return json({ error: "bad_action" }, 400);
};

export const config = { path: "/api/push" };
