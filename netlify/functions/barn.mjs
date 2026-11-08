// /api/barn  — load, create and update a shared barn.
import { E, json, validId, loadBarn, saveBarn, store } from "../lib/common.mjs";

const CODE_ALPH = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_DAYS = 14;

export default async (req) => {
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("invite")) {
    const code = url.searchParams.get("invite").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const inv = code.length >= 6 ? await store().get("invite/" + code, { type: "json" }) : null;
    if (!inv || Date.now() - inv.at > INVITE_DAYS * 864e5) return json({ error: "not_found" }, 404);
    const doc = await loadBarn(inv.barnId);
    return doc ? json({ barnId: doc.id, name: doc.name }) : json({ error: "not_found" }, 404);
  }
  if (req.method === "GET") {
    const doc = await loadBarn(url.searchParams.get("id"));
    return doc ? json(doc) : json({ error: "not_found" }, 404);
  }
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (JSON.stringify(body).length > 200000) return json({ error: "too_big" }, 413);

  if (body.action === "create") {
    const d = body.doc;
    if (!d || !Array.isArray(d.horses) || !Array.isArray(d.blankets) || !Array.isArray(d.members)) return json({ error: "bad_doc" }, 400);
    // Rebuild the document through the same sanitizing operations the app uses.
    let doc = { id: E.uid(22), name: "Barn", place: null, am: "07:00", pm: "18:00", horses: [], blankets: [], overrides: {}, members: [],
      shifts: { am: null, pm: null }, checks: {}, version: 0, createdAt: Date.now(), updatedAt: Date.now() };
    const ops = [{ op: "barn", set: { name: d.name, place: d.place, am: d.am, pm: d.pm } }];
    d.members.slice(0, 25).forEach(m => ops.push({ op: "member", id: m.id, set: { name: m.name } }));
    d.horses.slice(0, 30).forEach(h => { ops.push({ op: "horse", id: h.id, set: h }); ops.push({ op: "feed", horseId: h.id, set: h.feed || {} }); });
    d.blankets.slice(0, 150).forEach(b => ops.push({ op: "blanket", id: b.id, set: b }));
    Object.entries(d.overrides || {}).forEach(([hid, m]) => Object.entries(m || {}).forEach(([k, v]) => ops.push({ op: "override", horseId: hid, key: k, value: v })));
    doc = E.applyOps(doc, ops);
    if (!doc.horses.length || !doc.members.length) return json({ error: "bad_doc" }, 400);
    await saveBarn(doc);
    return json(doc, 201);
  }

  if (body.action === "invite") {
    const doc = await loadBarn(body.id);
    if (!doc) return json({ error: "not_found" }, 404);
    let code = "";
    const r = new Uint8Array(6); crypto.getRandomValues(r);
    for (const x of r) code += CODE_ALPH[x % CODE_ALPH.length];
    await store().setJSON("invite/" + code, { barnId: doc.id, at: Date.now() });
    return json({ code });
  }

  if (!validId(body.id) || !Array.isArray(body.ops)) return json({ error: "bad_request" }, 400);
  const cur = await loadBarn(body.id);
  if (!cur) return json({ error: "not_found" }, 404);
  const doc = E.applyOps(cur, body.ops.slice(0, 200));
  doc.version = (cur.version || 0) + 1;
  await saveBarn(doc);
  return json(doc);
};

export const config = { path: "/api/barn" };
