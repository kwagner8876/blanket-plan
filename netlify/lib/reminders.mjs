import { E, store } from "./common.mjs";

export const LEAD_MIN = 30;

export function localParts(tz, d) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const o = {}; f.formatToParts(d).forEach(p => o[p.type] = p.value);
  return { date: `${o.year}-${o.month}-${o.day}`, mins: (+o.hour % 24) * 60 + (+o.minute) };
}
export const toMin = t => { const [h, m] = String(t).split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const fmtT = t => { const [h, m] = String(t).split(":").map(Number); return ((h % 12) || 12) + (m ? ":" + String(m).padStart(2, "0") : "") + (h >= 12 ? "pm" : "am"); };

export async function forecast(doc) {
  const key = "fc/" + doc.id, cached = await store().get(key, { type: "json" });
  if (cached && cached.lat === doc.place.lat && cached.lon === doc.place.lon && Date.now() - cached.at < 60 * 60 * 1000) return cached.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${doc.place.lat}&longitude=${doc.place.lon}` +
    `&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph` +
    `&precipitation_unit=inch&timezone=auto&forecast_days=3&past_days=1`;
  const r = await fetch(url); if (!r.ok) throw new Error("forecast " + r.status);
  const data = await r.json();
  await store().setJSON(key, { at: Date.now(), lat: doc.place.lat, lon: doc.place.lon, data });
  return data;
}

function changeLine(name, before, after) {
  const b = before && before.chosen, a = after && after.chosen;
  if (!a && !b) return `${name}: no blanket`;
  if (!b && a) return `${name}: put on ${a.name}`;
  if (b && !a) return `${name}: take off ${b.name}`;
  if (a.id === b.id) return `${name}: keep ${a.name} on`;
  return `${name}: ${b.name} → ${a.name}`;
}

export function buildMessage(doc, fc, slot, localDate, nowMs) {
  const wk = E.buildWeek(fc, doc.am, doc.pm, nowMs, -1, 3);
  if (!wk) return null;
  const yIdx = wk.days.findIndex(d => d.date === localDate) - 1; // index of yesterday
  if (yIdx < 0) return null;
  const lines = [];
  let wx = null;
  doc.horses.forEach(h => {
    const plan = E.planHorse(doc, wk, h);
    const before = slot === "am" ? plan[yIdx].night : plan[yIdx + 1].day;
    const after = slot === "am" ? plan[yIdx + 1].day : plan[yIdx + 1].night;
    if (!after) return;
    wx = wx || after.p;
    lines.push(changeLine(h.name, before, after));
  });
  if (!lines.length) return null;
  const weather = wx ? (slot === "am" ? `High ${wx.t}°` : `Low ${wx.t}°`) + (wx.wind >= 10 ? `, wind ${wx.wind} mph` : "") + (wx.rain >= 50 ? `, ${wx.rain}% rain` : "") : "";
  if (slot === "am") {
    doc.horses.forEach(h => {
      const fs = E.feedStatus(h.feed, nowMs, localDate);
      if (fs.known && fs.level !== "green") lines.push(`${h.feed.grain || "Feed"}${doc.horses.length > 1 ? ` (${h.name})` : ""}: ${fs.days} day${fs.days === 1 ? "" : "s"} left`);
    });
  }
  return { title: `${fmtT(slot === "am" ? doc.am : doc.pm)} blankets${weather ? " · " + weather : ""}`, body: lines.join("\n"), url: "/", tag: localDate + "-" + slot };
}

