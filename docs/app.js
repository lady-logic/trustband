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
    tol: 1.5, selected: null, hot: null, showAll: false, gpsFault: false, vsite: "arlinger",
    eco: { stelle: "fach", brutto: 47500, lnk: 21, n: D.sites.length, years: 5, cheap: D.prices.cheap, exp: D.prices.expensive,
      refs: D.refs.length, calDays: D.calDays, tracker: 150, season: 150, hours: 2, hoursYear: 1600 },
  };

  const km = (a, b) => {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };

  function trustDays(site) {
    for (const b of D.bands[site.profile].slice(0, 3)) {
      if (Math.max(Math.abs(b.p05), Math.abs(b.p95)) * site.bandScale > S.tol) return b.from;
    }
    return TRUST_CAP;
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
    const gps = { lat: r.lat + 0.00003 + (S.gpsFault && r.id === "refB" ? 0.0016 : 0), lon: r.lon + 0.00002 };
    let near = null;
    for (const s of D.sites) { const m = km(gps, s) * 1000; if (!near || m < near.m) near = { s, m }; }
    return { ...gps, near: near.s, m: Math.round(near.m), ok: near.m <= GPS_RADIUS_M && near.s.id === r.site };
  }

  function nearestRef(site) {
    let best = null;
    for (const r of D.refs) { const d = km(r, site); if (!best || d < best.d) best = { r, d }; }
    return { ref: best.r, km: best.d * 1.3 };
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
  const diamond = (c, s) => `<svg width="${s}" height="${s}" viewBox="0 0 12 12" style="vertical-align:-2px"><path d="M6 1L11 6L6 11L1 6Z" fill="#fff" stroke="${c}" stroke-width="1.5"/><path d="M6 4L9 6L6 9L3 6Z" fill="${c}"/></svg>`;

  function refreshMarkers(sites) {
    const hotSite = sites.find((s) => s.id === S.hot);
    for (const s of sites) {
      const cls = [S.selected === s.id ? "sel" : "", hotSite ? (hotSite.id === s.id ? "hot" : "dim") : ""].join(" ");
      const icon = L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9], html: `<div class="mk ${cls}" style="background:${COL[s.status]}"></div>` });
      if (!markers[s.id]) {
        markers[s.id] = L.marker([s.lat, s.lon], { icon }).addTo(map)
          .bindTooltip(s.name, { direction: "top", offset: [0, -9] })
          .on("click", () => { S.selected = S.selected === s.id ? null : s.id; renderAll(); });
      } else markers[s.id].setIcon(icon);
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
      <div class="sh">Referenzsensoren</div>${refs}
      <button class="link" data-gps>${S.gpsFault ? "GPS-Prüfung zurücksetzen" : "GPS-Prüfung simulieren"}</button>`;
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
      ${n ? `<div class="nx">${n.ref.name} fährt hin · ${num(n.km, 1)} km</div>` : ""}
      <div class="src">${s.real ? "Echte Messdaten" : "Simuliert"} · Vertrauensdauer ${s.trust >= TRUST_CAP ? "≥ " : ""}${s.trust} Tage</div>`;
  }

  function initVertrauen() {
    $("#tab-vertrauen").innerHTML = `
      <div class="seg"><button data-vsite="arlinger">Arlinger</button><button data-vsite="schellbronner">Schellbronner</button></div>
      <div id="v-big"></div>
      <div class="slider"><div class="t"><span>Toleranz</span><b id="tolv"></b></div>
        <input type="range" id="tol" min="0.8" max="2" step="0.05" value="${S.tol}" aria-label="Toleranz"></div>
      <div class="bars" id="v-bars"></div>`;
    $("#tol").addEventListener("input", (e) => { S.tol = +e.target.value; renderAll(); });
  }

  function renderVertrauen() {
    document.querySelectorAll("[data-vsite]").forEach((b) => b.classList.toggle("on", b.dataset.vsite === S.vsite));
    $("#tolv").textContent = "± " + num(S.tol, 2) + " °C";
    const real = D.sites.find((s) => s.profile === S.vsite && s.real), t = trustDays(real), bands = D.bands[S.vsite].slice(0, 3);
    $("#v-big").innerHTML = `<div class="big">${t >= TRUST_CAP ? "≥ " : ""}${t}<small>Tage Vertrauen</small></div>
      <div class="cap">Fehler ${num(bands[0].mae_roh)} → ${num(bands[0].mae_cal)} °C nach Kalibrierung</div>`;
    const lo = -2, hi = 2, pos = (v) => ((v - lo) / (hi - lo)) * 100;
    $("#v-bars").innerHTML = bands.map((b) => {
      const hw = Math.max(Math.abs(b.p05), Math.abs(b.p95)), within = hw <= S.tol;
      return `<div class="bar"><span class="lb">${b.label}</span>
        <div class="tr"><div class="zone" style="left:${pos(-S.tol)}%;width:${pos(S.tol) - pos(-S.tol)}%"></div><div class="zero" style="left:${pos(0)}%"></div>
          <div class="rg" style="left:${pos(b.p05)}%;width:${pos(b.p95) - pos(b.p05)}%;background:${within ? COL.valid : COL.expired}"></div></div>
        <span class="v" style="color:${within ? COL.valid : COL.expired}">± ${num(hw, 1)}</span></div>`;
    }).join("");
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
    const util = cheapOnes.length ? (cal / ((e.refs * e.season) / e.calDays)) * 100 : 0;
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
      <div class="facts"><div><b>${cheapOnes.length} / ${sites.length}</b><span>Standorte mit günstigem Sensor</span></div>
        <div><b class="${util > 100 ? "bad" : ""}">${Math.round(util)} %</b><span>Referenzen ausgelastet</span></div></div>
      <div class="cap">Personal ≈ ${num(fte, 1)} % einer Stelle · ${eur(hourly)}/Std. · ${eur(trip)} je Eichung</div>`;
  }

  /* ---------- Grenzen ---------- */
  $("#tab-grenzen").innerHTML = `
    <div class="chips"><span class="r">2 Standorte echt</span><span class="s">15 simuliert</span></div>
    <div class="sh">Grenzen</div>
    <ul class="list"><li>Jeder Sensor braucht seine eigene Eichung</li><li>Nur 2 Standorte, kaum Winterdaten</li>
      <li>Frost verpasst: bis 53 von 300 (Arlinger, 14–30 Tage)</li><li>Referenz selbst ± 0,5 °C</li></ul>
    <div class="sh">Nächste Schritte</div>
    <ul class="list"><li>Pilot mit 2 Referenzen und GPS-Tracker</li><li>Live-Daten aus niotix</li><li>Einen Winter lang messen</li></ul>`;

  /* ---------- Events ---------- */
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-close],[data-tab],[data-more],[data-gps],[data-vsite],[data-stelle],.row[data-site]");
    if (!t) return;
    const d = t.dataset;
    if (d.tab) return switchTab(d.tab);
    if (d.vsite) { S.vsite = d.vsite; return renderVertrauen(); }
    if (d.stelle) { S.eco.stelle = d.stelle; S.eco.brutto = STELLE[d.stelle]; document.querySelector('[data-eco="brutto"]').value = S.eco.brutto; return renderAll(); }
    if (t.hasAttribute("data-close")) { S.selected = null; return renderAll(); }
    if (t.hasAttribute("data-more")) { S.showAll = !S.showAll; return renderAll(); }
    if (t.hasAttribute("data-gps")) { S.gpsFault = !S.gpsFault; return renderAll(); }
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

  const names = { valid: "gültig", expiring: "läuft ab", expired: "abgelaufen", uncalibrated: "nie kalibriert" };
  $("#legend").innerHTML = Object.keys(names).map((k) => `<span><i style="background:${COL[k]}"></i>${names[k]}</span>`).join("")
    + `<span>${diamond(RUST, 14)} Referenz</span>`;

  initVertrauen();
  initKosten();
  renderAll();
})();
