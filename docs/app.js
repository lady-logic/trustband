(function () {
  const D = window.TRUSTBAND_DATA;
  const $ = (s) => document.querySelector(s);
  const eur = (n) => Math.round(n).toLocaleString("de-DE") + " €";
  const num = (n, d = 2) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const DAY = 864e5;
  const TODAY = new Date(D.today + "T00:00:00");
  const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const fmt = (d) => `${WD[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;

  const COL = { valid: "#2F6B47", expiring: "#B87A0E", expired: "#B02A2A", uncalibrated: "#8C8C8C" };
  const LABEL = { valid: "Vertrauen gültig", expiring: "Läuft bald ab", expired: "Abgelaufen", uncalibrated: "Nie kalibriert" };
  const RUST = "#974C31";
  const TRUST_CAP = 30;
  const GPS_RADIUS_M = 30;
  const STELLE = { fach: 47500, azubi: 16000 };

  const S = {
    tol: 1.5, mode: "vertrauen", scen: null, selected: null, hot: null, showAll: false, vsite: "arlinger",
    eco: { stelle: "fach", brutto: 47500, lnk: 21, n: D.sites.length, years: 5, cheap: D.prices.cheap, exp: D.prices.expensive,
      refs: D.refs.length, calDays: D.calDays, tracker: 150, season: 150, hours: 2, hoursYear: 1600 },
  };

  const km = (a, b) => {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };

  function trustDays(site) {
    for (const r of D.daily[site.profile].slice(0, TRUST_CAP)) {
      if (Math.max(Math.abs(r.p05), Math.abs(r.p95)) * site.bandScale > S.tol) return r.day;
    }
    return TRUST_CAP;
  }

  /* Trichter: Band (5.-95. Perzentil des Fehlers) je Tag seit der Eichung */
  function funnel(rows, scale, tol, o) {
    const W = o.w, H = o.h, DAYS = TRUST_CAP, ymax = o.mini ? 2.2 : 2.5;
    const p = o.mini ? { l: 2, r: 2, t: 3, b: 3 } : { l: 40, r: 12, t: 14, b: 46 };
    const X = (d) => p.l + (d / DAYS) * (W - p.l - p.r);
    const Y = (v) => p.t + (1 - (v + ymax) / (2 * ymax)) * (H - p.t - p.b);
    const pts = rows.slice(0, DAYS + 1);
    const poly = pts.map((r) => `${X(r.day)},${Y(r.p95 * scale)}`).concat(pts.map((r) => `${X(r.day)},${Y(r.p05 * scale)}`).reverse()).join(" ");
    const zy = Y(tol), zh = Y(-tol) - Y(tol), zw = W - p.l - p.r;
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Vertrauensband über die Zeit"><defs><clipPath id="c${o.id}"><rect x="${p.l}" y="${zy}" width="${zw}" height="${zh}"/></clipPath></defs>
      <rect x="${p.l}" y="${zy}" width="${zw}" height="${zh}" fill="rgba(47,107,71,.09)"/>
      <g opacity="${o.sim ? 0.5 : 1}"><polygon points="${poly}" fill="${COL.expired}" fill-opacity=".42"/>
      <polygon points="${poly}" fill="${COL.valid}" fill-opacity=".6" clip-path="url(#c${o.id})"/></g>
      <line x1="${p.l}" x2="${W - p.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#8A867F" stroke-dasharray="3 4"/>
      <line x1="${p.l}" x2="${W - p.r}" y1="${zy}" y2="${zy}" stroke="${COL.valid}" stroke-width="${o.mini ? 1 : 2}"/>
      <line x1="${p.l}" x2="${W - p.r}" y1="${zy + zh}" y2="${zy + zh}" stroke="${COL.valid}" stroke-width="${o.mini ? 1 : 2}"/>`;
    if (o.mini) {
      if (o.sim) s += `<text x="${W - 4}" y="11" text-anchor="end" style="font-size:10px;font-weight:700">Beispielprofil</text>`;
      if (o.age !== null && o.age !== undefined) {
        const a = Math.min(o.age, DAYS);
        s += `<line x1="${X(a)}" x2="${X(a)}" y1="${p.t}" y2="${H - p.b}" stroke="${RUST}" stroke-width="2"/><circle cx="${X(a)}" cy="${Y(0)}" r="4" fill="${RUST}" stroke="#fff" stroke-width="1.5"/>`;
      }
    } else {
      s += `<text x="${p.l - 6}" y="${zy + 4}" text-anchor="end">+${num(tol, 1)}</text><text x="${p.l - 6}" y="${zy + zh + 4}" text-anchor="end">−${num(tol, 1)}</text><text x="${p.l - 6}" y="${Y(0) + 4}" text-anchor="end">0</text>`;
      for (const d of [0, 7, 14, 21, 30]) s += `<text x="${X(d)}" y="${H - 28}" text-anchor="middle">${d}</text>`;
      s += `<text x="${(p.l + W - p.r) / 2}" y="${H - 6}" text-anchor="middle" style="font-weight:700">Tage seit Eichung</text>`;
      if (o.trust < DAYS) s += `<line x1="${X(o.trust)}" x2="${X(o.trust)}" y1="${p.t}" y2="${H - p.b}" stroke="${RUST}" stroke-width="2.5" stroke-dasharray="6 4"/><text x="${X(o.trust) + (o.trust > 20 ? -6 : 6)}" y="${p.t + 10}" text-anchor="${o.trust > 20 ? "end" : "start"}" style="fill:${RUST};font-weight:800;font-size:13px">Vertrauen endet Tag ${o.trust}</text>`;
      s += `<line id="fcur" y1="${p.t}" y2="${H - p.b}" stroke="#141412" stroke-width="1.5" visibility="hidden"/>`;
    }
    return s + "</svg>";
  }

  function enrich() {
    return D.sites.map((s) => {
      const trust = trustDays(s), age = s.lastCalAge;
      const remaining = age === null ? null : trust - age;
      let status = "valid";
      if (remaining === null) status = "uncalibrated";
      else if (remaining < 0) status = "expired";
      else if (remaining <= 3) status = "expiring";
      return { ...s, trust, remaining, status };
    });
  }

  function urgencyText(s) {
    if (s.status === "uncalibrated") return "Nie kalibriert";
    if (s.status === "expired") return `Seit ${-s.remaining} Tagen abgelaufen`;
    if (s.remaining === 0) return "Läuft heute ab";
    if (s.remaining === 1) return "Läuft morgen ab";
    return `Läuft in ${s.remaining} Tagen ab`;
  }

  function waitingOf(sites) {
    const g = { expired: 0, uncalibrated: 1, expiring: 2 };
    return sites.filter((s) => s.status !== "valid")
      .sort((a, b) => g[a.status] - g[b.status] || (b.frost - a.frost) || ((a.remaining ?? 0) - (b.remaining ?? 0)));
  }

  function gpsOf(r) {
    const gps = { lat: r.lat + 0.00003, lon: r.lon + 0.00002 };
    let near = null;
    for (const s of D.sites) { const m = km(gps, s) * 1000; if (!near || m < near.m) near = { s, m }; }
    return { ...gps, near: near.s, m: Math.round(near.m), ok: near.m <= GPS_RADIUS_M && near.s.id === r.site };
  }

  function nearestRef(site) {
    let best = null;
    for (const r of D.refs) { const d = km(r, site); if (!best || d < best.d) best = { r, d }; }
    return { ref: best.r, km: best.d * 1.3 };
  }

  /* ---------- Live-Daten (niotix) ---------- */
  const API = "https://xapi.niota.io/xapi/v1/states/";
  const PREFER = ["surface_temperature", "temperature_target"];
  const LIVE = { data: {}, at: null, busy: false, pref: {} };
  try { Object.assign(LIVE, JSON.parse(localStorage.getItem("trustband.live") || "{}")); } catch (_) {}

  function liveOf(s) {
    const list = LIVE.data[s.id] || [];
    for (const k of PREFER) { const v = list.find((x) => x.key === k); if (v) return v; }
    return list.find((x) => x.unit === "°C") || null;
  }
  const hhmm = (iso) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  function liveLine(s) {
    const v = liveOf(s);
    return v ? `<div class="live">Jetzt <b>${num(v.value, 1)} ${v.unit}</b><small>${v.name} · ${hhmm(v.time)}</small></div>` : "";
  }
  /* ---------- Streuen oder nicht ---------- */
  const DEC = { frost: { c: "#1F5FA8", l: "Frost: streuen" }, gray: { c: "#B87A0E", l: "Grauzone: streuen empfohlen" }, clear: { c: "#2F6B47", l: "Kein Frost" } };
  function liveMean() {
    const v = D.sites.map((s) => liveOf(s)).filter(Boolean).map((x) => x.value);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  function valueOf(s) {
    const lv = liveOf(s), m = liveMean();
    if (S.scen !== null) return S.scen + (lv && m !== null ? lv.value - m : 0);
    return lv ? lv.value : null;
  }
  function decide(s) {
    const v = valueOf(s);
    if (v === null) return null;
    const row = D.daily[s.profile][Math.min(s.lastCalAge === null ? 59 : s.lastCalAge, 59)];
    const lo = v - row.p95 * s.bandScale, hi = v - row.p05 * s.bandScale;
    return { v, lo, hi, kind: hi < 0 ? "frost" : lo > 0 ? "clear" : "gray" };
  }
  const markerColor = (s) => { if (S.mode !== "streuen") return COL[s.status]; const d = decide(s); return d ? DEC[d.kind].c : COL.uncalibrated; };
  function strip(d) {
    const W = 260, H = 72, lo0 = Math.min(-3, d.lo - 1), hi0 = Math.max(4, d.hi + 1), X = (v) => 6 + ((v - lo0) / (hi0 - lo0)) * (W - 12), c = DEC[d.kind].c;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Messwert mit Band"><rect x="6" y="24" width="${X(0) - 6}" height="26" fill="rgba(31,95,168,.12)"/>
      <line x1="${X(0)}" x2="${X(0)}" y1="18" y2="56" stroke="#141412" stroke-width="2"/><text x="${X(0)}" y="13" text-anchor="middle" style="font-weight:700">0 °C</text>
      <rect x="${X(d.lo)}" y="31" width="${Math.max(2, X(d.hi) - X(d.lo))}" height="12" rx="6" fill="${c}" opacity=".85"/>
      <circle cx="${X(d.v)}" cy="37" r="7" fill="#fff" stroke="${c}" stroke-width="3.5"/>
      <text x="${X(d.lo)}" y="68" text-anchor="end">${num(d.lo, 1)}</text><text x="${X(d.hi)}" y="68" text-anchor="start">${num(d.hi, 1)}</text></svg>`;
  }
  function streuBlock(s) {
    const d = decide(s);
    if (!d) return '<div class="live"><small>Keine Messwerte. Live-Daten abrufen oder Szenario wählen.</small></div>';
    const lv = liveOf(s), m = liveMean();
    const dev = S.scen !== null && lv && m !== null ? lv.value - m : null;
    const devTxt = dev !== null && Math.abs(dev) >= 0.5 ? `<small>Dieser Standort ist ${num(Math.abs(dev), 1)} °C ${dev > 0 ? "wärmer" : "kälter"} als der Durchschnitt</small>` : "";
    return `<div class="dec" style="color:${DEC[d.kind].c}">${DEC[d.kind].l}</div><div class="live">Messwert <b>${num(d.v, 1)} °C</b><small>wahrer Wert ${num(d.lo, 1)} bis ${num(d.hi, 1)} °C</small>${devTxt}</div><div class="fun">${strip(d)}</div>`;
  }
  function renderMapUI(sites) {
    document.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === S.mode));
    const wi = $("#whatif"), m = liveMean();
    wi.hidden = S.mode !== "streuen";
    $("#wi").value = S.scen !== null ? S.scen : m !== null ? Math.round(m * 2) / 2 : 2;
    $("#wv").textContent = S.scen !== null ? "Ø " + num(S.scen, 1) + " °C" : m !== null ? "Ø " + num(m, 1) + " °C" : "–";
    $("#wl").textContent = S.scen !== null ? "Simulation" : m !== null ? "Live-Werte" : "";
    $("#wlive").hidden = !(S.scen !== null && m !== null);
    let items;
    if (S.mode === "streuen") {
      const cnt = { frost: 0, gray: 0, clear: 0 };
      sites.forEach((x) => { const d = decide(x); if (d) cnt[d.kind]++; });
      items = Object.keys(DEC).map((k) => `<span><i style="background:${DEC[k].c}"></i>${DEC[k].l.split(":")[0]} ${cnt[k]}</span>`);
    } else {
      const names = { valid: "gültig", expiring: "läuft ab", expired: "abgelaufen", uncalibrated: "nie kalibriert" };
      items = Object.keys(names).map((k) => `<span><i style="background:${COL[k]}"></i>${names[k]}</span>`);
    }
    $("#legend").innerHTML = items.join("") + `<span>${diamond(RUST, 14)} Referenz</span>`;
  }

  const tip = (s) => {
    if (S.mode === "streuen") { const d = decide(s); return d ? `${s.name} · ${num(d.v, 1)} °C · ${DEC[d.kind].l}` : s.name; }
    const v = liveOf(s); return v ? `${s.name} · ${num(v.value, 1)} ${v.unit}` : s.name;
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let toastTimer = null;
  function toast(msg, frac, kind) {
    const el = $("#toast");
    clearTimeout(toastTimer);
    el.hidden = false;
    el.className = "toast " + (kind || "");
    el.innerHTML = `<span>${msg}</span>${frac == null ? "" : `<div class="tb"><div style="width:${Math.round(frac * 100)}%"></div></div>`}`;
    if (kind === "ok" || kind === "warn") toastTimer = setTimeout(() => (el.hidden = true), 5000);
  }
  function flash(s, v) {
    const m = L.marker([s.lat, s.lon], { interactive: false, zIndexOffset: 900,
      icon: L.divIcon({ className: "", iconSize: [60, 60], iconAnchor: [30, 30],
        html: `<div class="flash"></div><div class="valtag">${num(v.value, 1)} °</div>` }) }).addTo(flashLayer);
    setTimeout(() => flashLayer.removeLayer(m), 3400);
  }

  async function fetchLive(key) {
    const twins = [];
    for (const s of D.sites) for (const [tid, ids] of Object.entries(s.twins)) twins.push({ s, tid, ids });
    const go = $("#live-go"), st = $("#live-status"), pop = $("#live-pop");
    LIVE.busy = true; go.disabled = true;
    pop.hidden = true;
    const data = {};
    let done = 0, ok = 0, fail = 0, fatal = null;
    const total = twins.length;
    const progress = () => { st.textContent = `Abruf ${done} von ${total}`; toast(`Live-Abruf ${done} von ${total}`, done / total); };
    updateLiveBtn("busy"); progress();

    const get = async (id) => {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      try {
        const r = await fetch(API + id, { headers: { "X-API-Key": key, Accept: "application/json" }, signal: ctl.signal });
        if (r.status === 503) throw Object.assign(new Error("Schlüssel ungültig."), { fatal: true });
        if (r.status === 401 || r.status === 429) throw Object.assign(new Error("Abruflimit erreicht. Eine Minute warten, dann erneut."), { fatal: true });
        if (!r.ok) return null;
        const d = (await r.json()).data || {}, m = d.meta || {}, b = d.binding || {};
        return typeof b.value === "number" ? { key: m.key, name: m.name, unit: m.unit || "", value: b.value, time: b.time } : null;
      } finally { clearTimeout(to); }
    };

    await Promise.all(twins.map(async ({ s, tid, ids }, i) => {
      await sleep(i * 120);
      if (fatal) return;
      const order = LIVE.pref[tid] ? [LIVE.pref[tid], ...ids.filter((x) => x !== LIVE.pref[tid])] : ids;
      let pick = null, fallback = null;
      try {
        for (const id of order) {
          const v = await get(id);
          if (v && PREFER.includes(v.key)) { pick = v; LIVE.pref[tid] = id; break; }
          if (v && v.unit === "°C" && !fallback) fallback = v;
        }
        pick = pick || fallback;
        if (pick) { (data[s.id] = data[s.id] || []).push(pick); flash(s, pick); ok++; } else fail++;
      } catch (e) { if (e.fatal) fatal = e.message; else fail++; }
      finally { done++; progress(); }
    }));

    LIVE.busy = false; go.disabled = false;
    const problem = fatal || (ok === 0 ? "Keine Antwort von niotix. Verbindung prüfen." : null);
    if (problem) { st.textContent = problem; toast(problem, null, "bad"); updateLiveBtn("err"); pop.hidden = false; return; }
    LIVE.data = data; LIVE.at = new Date().toISOString();
    try { localStorage.setItem("trustband.live", JSON.stringify({ data, at: LIVE.at, pref: LIVE.pref })); } catch (_) {}
    $("#live-key").value = "";
    const msg = `${ok} von ${total} Sensoren aktualisiert` + (fail ? ` · ${fail} ohne Antwort` : "");
    st.textContent = msg; toast(msg, null, fail ? "warn" : "ok");
    updateLiveBtn(); renderAll();
  }

  function updateLiveBtn(state) {
    const b = $("#live-btn");
    b.classList.toggle("on", !!LIVE.at && !state);
    b.classList.toggle("busy", state === "busy");
    b.classList.toggle("err", state === "err");
    b.querySelector("span").textContent = state === "busy" ? "Abruf läuft …" : state === "err" ? "Live-Fehler" : LIVE.at ? "Live · " + new Date(LIVE.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "Live-Daten";
  }

  /* ---------- Karte ---------- */
  const map = L.map("map", { zoomControl: false }).setView([48.87, 8.70], 12);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  }).addTo(map);
  const fit = () => { map.invalidateSize(); map.fitBounds(L.latLngBounds(D.sites.map((s) => [s.lat, s.lon])).pad(0.12)); };
  window.addEventListener("load", fit);
  window.addEventListener("resize", () => map.invalidateSize());

  const markers = {};
  const routeLayer = L.layerGroup().addTo(map);
  const refLayer = L.layerGroup().addTo(map);
  const flashLayer = L.layerGroup().addTo(map);
  const diamond = (c, s) => `<svg width="${s}" height="${s}" viewBox="0 0 12 12" style="vertical-align:-2px"><path d="M6 1L11 6L6 11L1 6Z" fill="#fff" stroke="${c}" stroke-width="1.5"/><path d="M6 4L9 6L6 9L3 6Z" fill="${c}"/></svg>`;

  function refreshMarkers(sites) {
    const hotSite = sites.find((s) => s.id === S.hot);
    for (const s of sites) {
      const cls = [S.selected === s.id ? "sel" : "", hotSite ? (hotSite.id === s.id ? "hot" : "dim") : ""].join(" ");
      const icon = L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="mk ${cls}" style="background:${markerColor(s)}"></div>` });
      if (!markers[s.id]) {
        markers[s.id] = L.marker([s.lat, s.lon], { icon }).addTo(map)
          .bindTooltip(tip(s), { direction: "top", offset: [0, -9] })
          .on("click", () => { S.selected = S.selected === s.id ? null : s.id; renderAll(); });
      } else { markers[s.id].setIcon(icon); markers[s.id].setTooltipContent(tip(s)); }
    }
    routeLayer.clearLayers();
    if (hotSite) {
      const { ref } = nearestRef(hotSite), g = gpsOf(ref);
      L.polyline([[g.lat, g.lon], [hotSite.lat, hotSite.lon]],
        { color: RUST, weight: 5, dashArray: "10 8", opacity: 0.95, interactive: false }).addTo(routeLayer);
      L.marker([hotSite.lat, hotSite.lon], { interactive: false, zIndexOffset: -100,
        icon: L.divIcon({ className: "", iconSize: [48, 48], iconAnchor: [24, 24], html: '<div class="ring"></div>' }) }).addTo(routeLayer);
    }
    refLayer.clearLayers();
    D.refs.forEach((r) => {
      const g = gpsOf(r), c = g.ok ? RUST : COL.expired;
      L.marker([g.lat, g.lon], { zIndexOffset: 1000, interactive: false,
        icon: L.divIcon({ className: "refmk", iconSize: [32, 32], iconAnchor: [-2, 38],
          html: `<svg width="32" height="32" viewBox="0 0 34 34"><path d="M17 2L32 17L17 32L2 17Z" fill="#fff" stroke="${c}" stroke-width="2.5"/><path d="M17 8.5L25.5 17L17 25.5L8.5 17Z" fill="${c}"/></svg>` }) })
        .addTo(refLayer).bindTooltip(`${r.name} · ${r.serial}`);
    });
  }

  /* ---------- Rendering ---------- */
  function renderAll() {
    const sites = enrich(), waiting = waitingOf(sites);
    renderMapUI(sites);
    renderBetrieb(sites, waiting);
    renderDetail(sites);
    renderVertrauen();
    renderKosten(sites);
    refreshMarkers(sites);
  }

  function renderBetrieb(sites, waiting) {
    const ok = sites.filter((s) => s.status === "valid").length;
    const stat = (n, l, c) => `<div class="stat"><b style="color:${c}">${n}</b><span>${l}</span></div>`;
    const refs = D.refs.map((r) => {
      const g = gpsOf(r), site = D.sites.find((s) => s.id === r.site);
      return `<div class="row"><span>${diamond(g.ok ? RUST : COL.expired, 18)}</span>
        <div class="mid"><div class="nm">${r.name}</div>
        <div class="s">${g.ok ? `bei ${site.name} · ${g.m} m` : `${g.m} m neben ${site.name}`}</div></div>
        <span class="pill ${g.ok ? "ok" : "bad"}">${g.ok ? "GPS ✓" : "GPS !"}</span></div>`;
    }).join("");
    const shown = S.showAll ? waiting : waiting.slice(0, 5);
    const wl = shown.map((w) => {
      const n = nearestRef(w);
      return `<div class="row click ${S.hot === w.id ? "hot" : ""}" data-site="${w.id}"><span class="dot" style="background:${COL[w.status]}"></span>
        <div class="mid"><div class="nm">${w.name}</div><div class="s">${urgencyText(w)}${w.frost ? " · Brücke" : ""}</div></div>
        <div class="r">${n.ref.name.replace("Referenz ", "Ref. ")}<br>${num(n.km, 1)} km</div></div>`;
    }).join("") || '<div class="empty">Alle Sensoren sind im Vertrauensband.</div>';
    const more = waiting.length > 5 ? `<button class="link" data-more>${S.showAll ? "Weniger anzeigen" : `Alle ${waiting.length} anzeigen`}</button>` : "";
    $("#tab-betrieb").innerHTML = `
      <div class="stats">${stat(ok, "gültig", COL.valid)}${stat(waiting.length, "Warteliste", COL.expired)}${stat(D.refs.length, "Referenzen frei", RUST)}</div>
      <div class="sh">Warteliste</div>${wl}${more}
      <div class="sh">Referenzsensoren</div>${refs}`;
  }

  function renderDetail(sites) {
    const el = $("#detail"), s = sites.find((x) => x.id === S.selected);
    if (!s) { el.hidden = true; return; }
    el.hidden = false;
    const c = COL[s.status];
    const rem = s.remaining === null ? "–" : s.remaining < 0 ? `${-s.remaining} T. überfällig` : `${s.remaining} Tage`;
    const last = s.lastCalAge === null ? "nie" : s.lastCalAge === 0 ? "laufend" : fmt(new Date(TODAY - s.lastCalAge * DAY));
    const n = s.status !== "valid" ? nearestRef(s) : null;
    el.innerHTML = `
      <div class="hd"><span class="dot" style="background:${c};margin-top:6px"></span>
        <div><div class="nm">${s.name}</div><div class="st" style="color:${c}">${LABEL[s.status]}</div></div>
        <button class="x" data-close aria-label="Schließen">×</button></div>
      <div class="g"><div><small>Letzte Eichung</small><b>${last}</b></div><div><small>Noch gültig</small><b>${rem}</b></div></div>
      ${S.mode === "streuen" ? streuBlock(s) : liveLine(s) + `<div class="fun">${funnel(D.daily[s.profile], s.bandScale, S.tol, { w: 260, h: 64, mini: true, age: s.lastCalAge, id: "m", sim: !s.real })}</div>`}
      ${n ? `<div class="nx">${n.ref.name} fährt hin · ${num(n.km, 1)} km</div>` : ""}
      <div class="src">${s.real ? "Echte Messdaten" : "Simuliert"} · Vertrauensdauer ${s.trust >= TRUST_CAP ? "≥ " : ""}${s.trust} Tage</div>`;
  }

  function initVertrauen() {
    $("#tab-vertrauen").innerHTML = `
      <div class="seg"><button data-vsite="arlinger">Arlinger</button><button data-vsite="schellbronner">Schellbronner</button></div>
      <div id="v-big"></div>
      <div class="slider"><div class="t"><span>Toleranz</span><b id="tolv"></b></div>
        <input type="range" id="tol" min="0.8" max="2" step="0.05" value="${S.tol}" aria-label="Toleranz"></div>
      <div class="fun" id="v-funnel"></div><div class="hv" id="v-hover"></div>`;
    $("#tol").addEventListener("input", (e) => { S.tol = +e.target.value; renderAll(); });
  }

  function renderVertrauen() {
    document.querySelectorAll("[data-vsite]").forEach((b) => b.classList.toggle("on", b.dataset.vsite === S.vsite));
    $("#tolv").textContent = "± " + num(S.tol, 2) + " °C";
    const real = D.sites.find((s) => s.profile === S.vsite && s.real), t = trustDays(real), bands = D.bands[S.vsite].slice(0, 3);
    $("#v-big").innerHTML = `<div class="big">${t >= TRUST_CAP ? "≥ " : ""}${t}<small>Tage Vertrauen</small></div>
      <div class="cap">Fehler ${num(bands[0].mae_roh)} → ${num(bands[0].mae_cal)} °C nach Kalibrierung</div>`;
    const rows = D.daily[S.vsite], W = 380, H = 270;
    const box = $("#v-funnel");
    box.innerHTML = funnel(rows, 1, S.tol, { w: W, h: H, trust: t, id: "big" });
    const svg = box.firstChild, cur = svg.querySelector("#fcur"), hv = $("#v-hover");
    hv.textContent = "Fahre über die Grafik";
    const at = (e) => {
      const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * W;
      const day = Math.min(TRUST_CAP, Math.max(0, Math.round(((x - 40) / (W - 52)) * TRUST_CAP)));
      const row = rows[day], X = 40 + (day / TRUST_CAP) * (W - 52);
      cur.setAttribute("x1", X); cur.setAttribute("x2", X); cur.setAttribute("visibility", "visible");
      const hw = Math.max(Math.abs(row.p05), Math.abs(row.p95));
      hv.innerHTML = `Tag ${day}: ${num(row.p05, 1)} bis +${num(row.p95, 1)} °C <span style="color:${hw <= S.tol ? COL.valid : COL.expired}">${hw <= S.tol ? "im Vertrauen" : "außerhalb"}</span>`;
    };
    svg.addEventListener("pointermove", at);
    svg.addEventListener("pointerleave", () => { cur.setAttribute("visibility", "hidden"); hv.textContent = "Fahre über die Grafik"; });
  }

  /* ---------- Kosten ---------- */
  function initKosten() {
    const f = (k, label) => `<label class="f"><span class="l">${label}</span><input type="number" data-eco="${k}" value="${S.eco[k]}" min="0" step="any"></label>`;
    $("#tab-kosten").innerHTML = `
      <div id="k-hero"></div>
      <div class="seg"><button data-stelle="fach">Fachkraft</button><button data-stelle="azubi">Azubi</button></div>
      <div id="k-out"></div>
      <details><summary>Annahmen ändern</summary>
        <div class="two">${f("brutto", "Brutto pro Jahr (€)")}${f("lnk", "Lohnnebenkosten (%)")}
        ${f("n", "Standorte")}${f("years", "Jahre")}${f("cheap", "Günstiger Sensor (€)")}${f("exp", "Teurer Sensor (€)")}
        ${f("refs", "Referenzsensoren")}${f("tracker", "GPS-Tracker je Referenz (€)")}${f("calDays", "Referenz am Sensor (Tage)")}${f("season", "Winterdienst-Tage pro Jahr")}${f("hours", "Arbeitszeit je Eichung (Std.)")}${f("hoursYear", "Arbeitsstunden pro Stelle und Jahr")}</div>
      </details>`;
    document.querySelectorAll("[data-eco]").forEach((i) => i.addEventListener("input", (e) => {
      S.eco[e.target.dataset.eco] = Math.max(e.target.dataset.eco === "calDays" ? 1 : 0, +e.target.value || 0); renderAll();
    }));
  }

  function renderKosten(sites) {
    document.querySelectorAll("[data-stelle]").forEach((b) => b.classList.toggle("on", b.dataset.stelle === S.eco.stelle));
    const e = S.eco, yrs = e.years;
    const hourly = (e.brutto * (1 + e.lnk / 100)) / e.hoursYear, trip = e.hours * hourly;
    const be = (yrs * e.season * trip) / (e.exp - e.cheap);
    const calPerYear = (s) => e.season / Math.max(1, s.trust);
    const cheapOnes = sites.filter((s) => s.trust >= be);
    const allExp = sites.length * e.exp;
    const allPers = sites.reduce((a, s) => a + yrs * calPerYear(s) * trip, 0);
    const allSens = sites.length * e.cheap + e.refs * (e.exp + e.tracker);
    const mixSens = cheapOnes.length * e.cheap + (sites.length - cheapOnes.length) * e.exp + (cheapOnes.length ? e.refs * (e.exp + e.tracker) : 0);
    const mixPers = cheapOnes.reduce((a, s) => a + yrs * calPerYear(s) * trip, 0);
    const mix = mixSens + mixPers;
    const cal = cheapOnes.reduce((a, s) => a + calPerYear(s), 0);
    const fte = ((cal * e.hours) / e.hoursYear) * 100;
    const saving = Math.max(0, allExp - mix);
    const max = Math.max(allExp, allSens + allPers, mix);
    const bar = (label, sens, pers, hl) => `<div class="cb"><div class="t"><span>${label}</span><b>${eur(sens + pers)}</b></div>
      <div class="tr"><div style="width:${(sens / max) * 100}%;background:${hl ? RUST : "#9C9890"}"></div><div style="width:${(pers / max) * 100}%;background:${COL.expiring}"></div></div></div>`;
    $("#saving").textContent = eur(saving);
    $("#save-y").textContent = yrs;
    $("#k-hero").innerHTML = `<div class="hero"><small>Ersparnis in ${yrs} Jahren</small><b>${eur(saving)}</b><span>${Math.round((saving / allExp) * 100)} % weniger als nur teure Sensoren</span></div>`;
    $("#k-out").innerHTML = `
      ${bar("Nur teure Sensoren", allExp, 0, false)}${bar("Günstige überall", allSens, allPers, false)}${bar("Mix (empfohlen)", mixSens, mixPers, true)}
      <div class="cap">Personal ≈ ${num(fte, 1)} % einer Stelle · ${eur(hourly)}/Std. · ${eur(trip)} je Eichung</div>`;
  }

  /* ---------- Events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-close],[data-mode],[data-tab],[data-more],[data-vsite],[data-stelle],.row[data-site]");
    if (!t) return;
    const d = t.dataset;
    if (d.tab) return switchTab(d.tab);
    if (d.vsite) { S.vsite = d.vsite; return renderVertrauen(); }
    if (d.stelle) { S.eco.stelle = d.stelle; S.eco.brutto = STELLE[d.stelle]; document.querySelector('[data-eco="brutto"]').value = S.eco.brutto; return renderAll(); }
    if (d.mode) { S.mode = d.mode; if (d.mode === "streuen" && S.scen === null && liveMean() === null) S.scen = 2; return renderAll(); }
    if (t.hasAttribute("data-close")) { S.selected = null; return renderAll(); }
    if (t.hasAttribute("data-more")) { S.showAll = !S.showAll; return renderAll(); }
    if (d.site) { S.selected = d.site; const s = D.sites.find((x) => x.id === d.site); map.panTo([s.lat, s.lon]); renderAll(); }
  });
  const betrieb = $("#tab-betrieb");
  betrieb.addEventListener("mouseover", (e) => {
    const r = e.target.closest(".row[data-site]"), id = r ? r.dataset.site : null;
    if (id !== S.hot) { S.hot = id; const sites = enrich(); refreshMarkers(sites); document.querySelectorAll(".row.click").forEach((el) => el.classList.toggle("hot", el.dataset.site === S.hot)); }
  });
  betrieb.addEventListener("mouseleave", () => {
    if (S.hot) { S.hot = null; refreshMarkers(enrich()); document.querySelectorAll(".row.click.hot").forEach((el) => el.classList.remove("hot")); }
  });

  function switchTab(name) {
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== "tab-" + name));
  }

  /* Breite per Maus ziehen */
  const split = $("#split"), aside = $("#aside");
  split.addEventListener("pointerdown", (e) => { split.setPointerCapture(e.pointerId); split.classList.add("drag"); });
  split.addEventListener("pointermove", (e) => {
    if (!split.classList.contains("drag")) return;
    aside.style.width = Math.min(Math.max(window.innerWidth - e.clientX, 320), Math.round(window.innerWidth * 0.7)) + "px";
    map.invalidateSize();
  });
  split.addEventListener("pointerup", () => { split.classList.remove("drag"); map.invalidateSize(); });

  $("#wi").addEventListener("input", (e) => { S.scen = +e.target.value; renderAll(); });
  $("#wlive").addEventListener("click", () => { S.scen = null; renderAll(); });

  $("#live-btn").addEventListener("click", () => { $("#live-pop").hidden = !$("#live-pop").hidden; if (!$("#live-pop").hidden) $("#live-key").focus(); });
  $("#live-go").addEventListener("click", () => { const k = $("#live-key").value.trim(); if (!k) { $("#live-status").textContent = "Bitte Schlüssel eingeben."; return; } fetchLive(k); });
  $("#live-key").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#live-go").click(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("#live-pop").hidden = true; });

  initVertrauen();
  initKosten();
  updateLiveBtn();
  renderAll();
})();
