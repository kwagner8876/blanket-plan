import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import "../../public/engine.js";
export const E = globalThis.BPEngine;

// Tests can swap in a fake store via globalThis.__BP_STORE.
export const store = () => globalThis.__BP_STORE || getStore({ name: "blanketplan", consistency: "strong" });

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const validId = id => typeof id === "string" && /^[a-z0-9]{16,40}$/.test(id);

export async function loadBarn(id) { return validId(id) ? await store().get("barn/" + id, { type: "json" }) : null; }
export async function saveBarn(doc) { doc.updatedAt = Date.now(); await store().setJSON("barn/" + doc.id, doc); }

// VAPID keys for push: created once and kept in the store, so no setup is needed.
let vapidCache = null;
export async function vapid() {
  if (vapidCache) return vapidCache;
  let k = await store().get("config/vapid", { type: "json" });
  if (!k) { k = webpush.generateVAPIDKeys(); await store().setJSON("config/vapid", k); }
  webpush.setVapidDetails("mailto:" + (process.env.CONTACT_EMAIL || "reminders@blanketplan.app"), k.publicKey, k.privateKey);
  vapidCache = k; return k;
}
export async function getSubs(barnId) { return (await store().get("subs/" + barnId, { type: "json" })) || []; }
export async function setSubs(barnId, subs) { await store().setJSON("subs/" + barnId, subs); }

export async function sendPush(barnId, sub, payload) {
  await vapid();
  try { await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 }); return true; }
  catch (e) { return (e && (e.statusCode === 404 || e.statusCode === 410)) ? "gone" : false; }
}
