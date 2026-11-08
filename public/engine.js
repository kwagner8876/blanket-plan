/* Blanket Plan shared engine: used by the app (browser) and the reminder server.
   Plain script: sets globalThis.BPEngine. */
(function (root) {
  "use strict";

  /* ---------- small utils ---------- */
  const pad = n => String(n).padStart(2, "0");
  const hr = t => parseInt(String(t || "0").split(":")[0], 10) || 0;
  const addDays = (ds, n) => { const [y, m, d] = ds.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const ALPH = "abcdefghijkmnpqrstuvwxyz23456789";
  function uid(n) {
    n = n || 12; const r = new Uint8Array(n); (root.crypto || globalThis.crypto).getRandomValues(r);
    let s = ""; for (const x of r) s += ALPH[x % ALPH.length]; return s;
  }
  const ID_RE = /^[a-z0-9]{2,40}$/;
  const KEY_RE = /^\d{4}-\d{2}-\d{2}-(day|night)$/;
  const CHECK_RE = /^\d{4}-\d{2}-\d{2}-(am|pm)$/;
  const TIME_RE = /^\d{2}:\d{2}$/;
  const str = (v, max) => String(v == null ? "" : v).slice(0, max || 80);
  const num = (v, lo, hi, dflt) => { const x = Number(v); return isFinite(x) ? Math.min(hi, Math.max(lo, x)) : dflt; };
  const COLORS = ["#2C4A7A", "#2F6B4F", "#7A2E3A", "#5B9BD5", "#6B4E8A", "#B08550", "#4A4A4A", "#C46A2F"];
  const KINDS = ["Rain sheet", "Light", "Medium", "Heavy", "Liner", "Cooler", "Fly sheet", "Stable blanket"];

  /* ---------- defaults ---------- */
  function defaultFeed() { return { grain: "Tribute", bagLbs: 50, am: 0, pm: 0, amExtra: "", pmExtra: "", warnDays: 5, stockLbs: null, stockAt: null }; }
  function newHorse(id, name) { return { id, name: name || "Horse", clipped: false, senior: false, noShelter: false, runs: 0, feed: defaultFeed() }; }
  function defaultBlankets() {
    return [
      { id: uid(8), name: "Rain sheet", kind: "Rain sheet", grams: 0, min: 45, max: 60, wp: true, rainOnly: true, color: "#5B9BD5", status: "ready", notes: "", horseId: null },
      { id: uid(8), name: "Light turnout", kind: "Light", grams: 100, min: 35, max: 45, wp: true, rainOnly: false, color: "#2F6B4F", status: "ready", notes: "", horseId: null },
      { id: uid(8), name: "Medium turnout", kind: "Medium", grams: 250, min: 25, max: 35, wp: true, rainOnly: false, color: "#2C4A7A", status: "ready", notes: "", horseId: null },
      { id: uid(8), name: "Heavy turnout", kind: "Heavy", grams: 400, min: -30, max: 25, wp: true, rainOnly: false, color: "#7A2E3A", status: "ready", notes: "", horseId: null }
    ];
  }
  function newBarn(o) {
    const memberId = uid(10), horseId = uid(8);
    const h = newHorse(horseId, o.horseName);
    return {
      memberId,
      doc: {
        id: null, name: str(o.barnName || (o.horseName ? o.horseName + "'s barn" : "My barn"), 60),
        place: o.place || null, am: o.am || "07:00", pm: o.pm || "18:00",
        horses: [h], blankets: defaultBlankets(), overrides: {}, members: [{ id: memberId, name: str(o.memberName || "Me", 40) }],
        shifts: { am: null, pm: null }, checks: {}, version: 0, createdAt: Date.now(), updatedAt: Date.now()
      }
    };
  }
  /* Convert the single-horse, on-device version into a barn. */
  function migrate(old, memberName) {
    const memberId = uid(10), horseId = uid(8);
    const oh = old.horse || {};
    const h = newHorse(horseId, oh.name || "My horse");
    ["clipped", "senior", "noShelter"].forEach(k => h[k] = !!oh[k]); h.runs = num(oh.runs, -10, 10, 0);
    if (old.feed) h.feed = Object.assign(defaultFeed(), old.feed);
    const idMap = {};
    const blankets = (Array.isArray(old.blankets) ? old.blankets : defaultBlankets()).filter(b => b && b.id).map(b => {
      const nid = uid(8); idMap[b.id] = nid;
      return Object.assign({ rainOnly: false, notes: "", status: "ready" }, b, { id: nid, horseId: null });
    });
    const ov = {}; Object.keys(old.overrides || {}).forEach(k => {
      const v = old.overrides[k];
      if (KEY_RE.test(k) && (v === "none" || idMap[v])) ov[k] = v === "none" ? "none" : idMap[v];
    });
    return {
      memberId,
      doc: {
        id: null, name: str((h.name || "My") + "'s barn", 60), place: old.place || null,
        am: TIME_RE.test(oh.am) ? oh.am : "07:00", pm: TIME_RE.test(oh.pm) ? oh.pm : "18:00",
        horses: [h], blankets, overrides: { [horseId]: ov }, members: [{ id: memberId, name: str(memberName || "Me", 40) }],
        shifts: { am: null, pm: null }, checks: {}, version: 0, createdAt: Date.now(), updatedAt: Date.now()
      }
    };
  }

  /* ---------- sanitizers ---------- */
  function cleanHorseSet(s) {
    const o = {};
    if ("name" in s) o.name = str(s.name, 40) || "Horse";
    ["clipped", "senior", "noShelter"].forEach(k => { if (k in s) o[k] = !!s[k]; });
    if ("runs" in s) o.runs = num(s.runs, -10, 10, 0);
    return o;
  }
  function cleanFeedSet(s) {
    const o = {};
    if ("grain" in s) o.grain = str(s.grain, 40);
    if ("amExtra" in s) o.amExtra = str(s.amExtra, 60);
    if ("pmExtra" in s) o.pmExtra = str(s.pmExtra, 60);
    if ("bagLbs" in s) o.bagLbs = num(s.bagLbs, 0, 500, 50);
    if ("am" in s) o.am = num(s.am, 0, 100, 0);
    if ("pm" in s) o.pm = num(s.pm, 0, 100, 0);
    if ("warnDays" in s) o.warnDays = num(s.warnDays, 0, 60, 5);
    if ("stockLbs" in s) o.stockLbs = s.stockLbs == null ? null : num(s.stockLbs, 0, 100000, 0);
    if ("stockAt" in s) o.stockAt = s.stockAt == null ? null : num(s.stockAt, 0, 9e15, null);
    return o;
  }
  function cleanBlanketSet(s, doc) {
    const o = {};
    if ("name" in s) o.name = str(s.name, 40) || "Blanket";
    if ("kind" in s) o.kind = KINDS.includes(s.kind) ? s.kind : "Medium";
    if ("grams" in s) o.grams = num(s.grams, 0, 1000, 0);
    if ("min" in s) o.min = Math.round(num(s.min, -60, 120, 0));
    if ("max" in s) o.max = Math.round(num(s.max, -60, 120, 50));
    ["wp", "rainOnly"].forEach(k => { if (k in s) o[k] = !!s[k]; });
    if ("color" in s) o.color = /^#[0-9A-Fa-f]{6}$/.test(s.color) ? s.color : COLORS[0];
    if ("status" in s) o.status = ["ready", "laundry", "repair"].includes(s.status) ? s.status : "ready";
    if ("notes" in s) o.notes = str(s.notes, 200);
    if ("horseId" in s) o.horseId = s.horseId && doc.horses.some(h => h.id === s.horseId) ? s.horseId : null;
    return o;
  }
  function cleanPlace(p) {
    if (!p || !isFinite(p.lat) || !isFinite(p.lon)) return null;
    return { name: str(p.name, 80), lat: Number(p.lat), lon: Number(p.lon), timezone: p.timezone ? str(p.timezone, 60) : null };
  }

  /* ---------- operations (applied the same way on device and server) ---------- */
  function applyOps(doc, ops, nowMs) {
    doc = JSON.parse(JSON.stringify(doc));
    doc.overrides = doc.overrides || {}; doc.checks = doc.checks || {}; doc.shifts = doc.shifts || { am: null, pm: null };
    for (const op of (ops || [])) {
      try { applyOne(doc, op); } catch (e) { /* skip a bad op */ }
    }
    // tidy: old overrides and check-offs
    const now = nowMs || Date.now();
    const cutO = new Date(now - 3 * 864e5).toISOString().slice(0, 10), cutC = new Date(now - 21 * 864e5).toISOString().slice(0, 10);
    Object.keys(doc.overrides).forEach(h => { const m = doc.overrides[h] || {}; Object.keys(m).forEach(k => { if (k.slice(0, 10) < cutO) delete m[k]; }); });
    Object.keys(doc.checks).forEach(k => { if (k.slice(0, 10) < cutC) delete doc.checks[k]; });
    return doc;
  }
  function applyOne(doc, op) {
    if (!op || typeof op !== "object") return;
    const hIdx = id => doc.horses.findIndex(h => h.id === id);
    switch (op.op) {
      case "barn": {
        const s = op.set || {};
        if ("name" in s) doc.name = str(s.name, 60) || doc.name;
        if ("am" in s && TIME_RE.test(s.am)) doc.am = s.am;
        if ("pm" in s && TIME_RE.test(s.pm)) doc.pm = s.pm;
        if ("place" in s) doc.place = cleanPlace(s.place) || doc.place;
        if ("timezone" in s && doc.place) doc.place.timezone = str(s.timezone, 60);
        break;
      }
      case "horse": {
        if (!ID_RE.test(op.id)) return;
        let i = hIdx(op.id);
        if (i < 0) { if (doc.horses.length >= 30) return; doc.horses.push(newHorse(op.id)); i = doc.horses.length - 1; }
        Object.assign(doc.horses[i], cleanHorseSet(op.set || {}));
        break;
      }
      case "delHorse": {
        const i = hIdx(op.id); if (i < 0 || doc.horses.length <= 1) return;
        doc.horses.splice(i, 1);
        doc.blankets = doc.blankets.filter(b => b.horseId !== op.id);
        delete doc.overrides[op.id];
        break;
      }
      case "feed": {
        const i = hIdx(op.horseId); if (i < 0) return;
        doc.horses[i].feed = Object.assign(defaultFeed(), doc.horses[i].feed || {}, cleanFeedSet(op.set || {}));
        break;
      }
      case "blanket": {
        if (!ID_RE.test(op.id)) return;
        let b = doc.blankets.find(x => x.id === op.id);
        if (!b) {
          if (doc.blankets.length >= 150) return;
          b = { id: op.id, name: "Blanket", kind: "Medium", grams: 0, min: 25, max: 35, wp: true, rainOnly: false, color: COLORS[0], status: "ready", notes: "", horseId: null };
          doc.blankets.push(b);
        }
        Object.assign(b, cleanBlanketSet(op.set || {}, doc));
        if (b.min >= b.max) b.max = b.min + 1;
        break;
      }
      case "delBlanket": {
        doc.blankets = doc.blankets.filter(b => b.id !== op.id);
        Object.values(doc.overrides).forEach(m => Object.keys(m || {}).forEach(k => { if (m[k] === op.id) delete m[k]; }));
        break;
      }
      case "override": {
        if (hIdx(op.horseId) < 0 || !KEY_RE.test(op.key)) return;
        const m = doc.overrides[op.horseId] = doc.overrides[op.horseId] || {};
        if (op.value == null) delete m[op.key];
        else if (op.value === "none" || doc.blankets.some(b => b.id === op.value)) m[op.key] = op.value;
        break;
      }
      case "member": {
        if (!ID_RE.test(op.id)) return;
        let m = doc.members.find(x => x.id === op.id);
        if (!m) { if (doc.members.length >= 25) return; m = { id: op.id, name: "Helper" }; doc.members.push(m); }
        if (op.set && "name" in op.set) m.name = str(op.set.name, 40) || m.name;
        break;
      }
      case "delMember": {
        doc.members = doc.members.filter(m => m.id !== op.id);
        ["am", "pm"].forEach(s => { if (doc.shifts[s] === op.id) doc.shifts[s] = null; });
        break;
      }
      case "shift": {
        if (op.slot !== "am" && op.slot !== "pm") return;
        doc.shifts[op.slot] = op.memberId && doc.members.some(m => m.id === op.memberId) ? op.memberId : null;
        break;
      }
      case "check": {
        if (!CHECK_RE.test(op.key)) return;
        if (op.done) doc.checks[op.key] = { by: ID_RE.test(op.memberId) ? op.memberId : null, at: num(op.at, 0, 9e15, Date.now()) };
        else delete doc.checks[op.key];
        break;
      }
    }
  }

  /* ---------- weather → day/night periods around barn times ---------- */
  function buildWeek(fcData, am, pm, nowMs, startOffset, count) {
    if (!fcData || !fcData.hourly || !fcData.hourly.time) return null;
    const H = fcData.hourly, off = fcData.utc_offset_seconds || 0;
    const now = new Date((nowMs || Date.now()) + off * 1000).toISOString().slice(0, 16);
    const today = now.slice(0, 10);
    const amH = hr(am), pmH = Math.max(hr(pm), amH + 1);
    const hours = H.time.map((t, i) => ({ t, temp: H.temperature_2m[i], rain: (H.precipitation_probability && H.precipitation_probability[i]) || 0, wind: (H.wind_speed_10m && H.wind_speed_10m[i]) || 0 })).filter(h => h.temp != null);
    function period(from, to, kind) {
      const hs = hours.filter(h => h.t >= from && h.t < to);
      if (hs.length < Math.min(3, kind === "day" ? pmH - amH : 24 - pmH + amH)) return null;
      const ext = hs.reduce((a, h) => kind === "day" ? (h.temp > a.temp ? h : a) : (h.temp < a.temp ? h : a));
      return { kind, t: Math.round(ext.temp), at: ext.t, wind: Math.round(hs.reduce((s, h) => s + h.wind, 0) / hs.length),
        rain: Math.round(Math.max.apply(null, hs.map(h => h.rain || 0))), hours: hs, start: from, end: to };
    }
    const days = [];
    for (let i = 0; i < (count || 7); i++) {
      const D = addDays(today, i + (startOffset || 0)), N = addDays(D, 1);
      days.push({ date: D, day: period(`${D}T${pad(amH)}:00`, `${D}T${pad(pmH)}:00`, "day"), night: period(`${D}T${pad(pmH)}:00`, `${N}T${pad(amH)}:00`, "night") });
    }
    return { now, today, days };
  }

  /* ---------- the blanket decision for one horse ---------- */
  function blanketsFor(doc, horseId) { return doc.blankets.filter(b => !b.horseId || b.horseId === horseId); }
  function decide(p, horse, blankets) {
    let feels = p.t; const notes = [];
    if (p.wind >= 10) { const w = Math.round((p.wind - 5) / 2); feels -= w; notes.push(`wind ${p.wind} mph (−${w}°)`); }
    const wet = p.rain >= 50;
    if (wet) { feels -= 5; notes.push(`${p.rain}% chance of rain (−5°)`); }
    let adj = 0;
    if (horse.clipped) { adj += 10; notes.push("clipped (−10°)"); }
    if (horse.senior) { adj += 5; notes.push("senior/hard keeper (−5°)"); }
    if (horse.noShelter) { adj += 5; notes.push("no shelter (−5°)"); }
    const runs = +horse.runs || 0;
    if (runs) { adj -= runs; notes.push(`runs ${runs > 0 ? "warm" : "cold"} (${runs > 0 ? "+" : "−"}${Math.abs(runs)}°)`); }
    const eff = feels - adj;
    const r = blankets.filter(b => b.status === "ready" && (wet || !b.rainOnly)).sort((a, b) => a.min - b.min);
    if (!blankets.some(b => b.status === "ready")) return { eff, notes, pick: null, warn: "No blankets are marked ready", wet };
    let pick = null, warn = null;
    if (r.length && eff < Math.max.apply(null, r.map(b => +b.max))) {
      let c = r.filter(b => eff >= +b.min && eff < +b.max);
      if (wet && c.some(b => b.wp)) c = c.filter(b => b.wp);
      if (c.length) pick = c[0];
      else if (eff < Math.min.apply(null, r.map(b => +b.min))) { pick = r[0]; warn = "Colder than your warmest blanket's range"; }
      else pick = r.filter(b => +b.max > eff).sort((a, b) => b.max - a.max).pop() || r[0];
      if (pick && wet && !pick.wp) warn = "Rain likely and this blanket isn't waterproof";
    }
    return { eff, notes, pick, warn, wet };
  }
  /* Week plan for one horse: weather periods + decision + that horse's overrides. */
  function planHorse(doc, wk, horse) {
    const bl = blanketsFor(doc, horse.id), ov = (doc.overrides || {})[horse.id] || {};
    return wk.days.map(d => {
      const out = { date: d.date };
      ["day", "night"].forEach(k => {
        const p = d[k]; if (!p) { out[k] = null; return; }
        const dec = decide(p, horse, bl), key = d.date + "-" + k, o = ov[key];
        let chosen = dec.pick, overridden = false;
        if (o !== undefined) { overridden = true; chosen = o === "none" ? null : (doc.blankets.find(b => b.id === o) || dec.pick); }
        out[k] = Object.assign({}, dec, { p, key, kind: k, date: d.date, chosen, overridden, auto: dec.pick, horse,
          done: wk.now >= p.end, current: wk.now >= p.start && wk.now < p.end });
      });
      return out;
    });
  }

  /* ---------- feed ---------- */
  function feedStatus(feed, nowMs, todayStr) {
    const f = feed || {}, daily = (+f.am || 0) + (+f.pm || 0);
    if (!daily) return { setup: false };
    if (f.stockLbs == null || !f.stockAt) return { setup: true, known: false, daily };
    const elapsed = Math.max(0, (nowMs - f.stockAt) / 864e5);
    const left = Math.max(0, f.stockLbs - daily * elapsed);
    const days = Math.floor(left / daily), buyIn = days - (+f.warnDays || 0);
    const level = days <= 1 ? "red" : buyIn <= 0 ? "orange" : "green";
    return { setup: true, known: true, daily, left, days, bags: left / (+f.bagLbs || 50), buyIn,
      buyBy: addDays(todayStr, Math.max(0, buyIn)), runOut: addDays(todayStr, days), level };
  }

  const api = { pad, hr, addDays, uid, COLORS, KINDS, ID_RE, defaultFeed, newHorse, newBarn, migrate, applyOps, buildWeek, blanketsFor, decide, planHorse, feedStatus };
  root.BPEngine = api;
})(typeof self !== "undefined" ? self : globalThis);
