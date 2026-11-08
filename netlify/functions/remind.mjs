// Runs every 15 minutes: sends each barn's blanket reminder ~30 minutes before
// the morning and evening barn times, to whoever is on that shift.
import { store, saveBarn, getSubs, setSubs, sendPush } from "../lib/common.mjs";
import { LEAD_MIN, localParts, toMin, forecast, buildMessage } from "../lib/reminders.mjs";

export default async () => {
  const st = store();
  const { blobs } = await st.list({ prefix: "barn/" });
  const sent = (await st.get("sent/log", { type: "json" })) || {};
  let sentChanged = false;
  for (const { key } of blobs) {
    try {
      const doc = await st.get(key, { type: "json" });
      if (!doc || !doc.place) continue;
      let subs = await getSubs(doc.id);
      if (!subs.length) continue;
      if (!doc.place.timezone) {
        const fc = await forecast(doc);
        if (!fc.timezone) continue;
        doc.place.timezone = fc.timezone; await saveBarn(doc);
      }
      const now = new Date(), lp = localParts(doc.place.timezone, now);
      for (const slot of ["am", "pm"]) {
        const at = toMin(slot === "am" ? doc.am : doc.pm), sentKey = `${doc.id}/${lp.date}-${slot}`;
        if (lp.mins < at - LEAD_MIN || lp.mins >= at || sent[sentKey]) continue;
        const fc = await forecast(doc);
        const msg = buildMessage(doc, fc, slot, lp.date, now.getTime());
        sent[sentKey] = Date.now(); sentChanged = true;
        if (!msg) continue;
        const who = doc.shifts && doc.shifts[slot];
        const targets = subs.filter(s => !who || s.memberId === who);
        const gone = [];
        for (const s of targets) { if ((await sendPush(doc.id, s.sub, msg)) === "gone") gone.push(s.sub.endpoint); }
        if (gone.length) { subs = subs.filter(s => !gone.includes(s.sub.endpoint)); await setSubs(doc.id, subs); }
      }
    } catch (e) { console.error("remind", key, e && e.message); }
  }
  if (sentChanged) {
    const cut = Date.now() - 3 * 864e5;
    Object.keys(sent).forEach(k => { if (sent[k] < cut) delete sent[k]; });
    await st.setJSON("sent/log", sent);
  }
};

export const config = { schedule: "*/15 * * * *" };
