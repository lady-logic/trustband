"""Baut docs/data/dashboard.js aus results.json (echte Analyse) und der niotix-Standortliste.

Echt:       Vertrauensbänder je Eichalter (Arlinger, Schellbronner), Koordinaten der Standorte.
Simuliert:  Eichstand der übrigen Standorte (Demo-Szenario, deterministisch, siehe SIM_* unten).

Aufruf:  python scripts/build_dashboard_data.py [--api-md PFAD] [--results PFAD]
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HACK = Path("C:/Hackathon/Smart City Hackathon")

TODAY = "2026-11-07"
PRICES = {"cheap": 1430, "expensive": 4020}

REAL_SITES = {
    "172024": {"key": "arlinger", "ref": ("refA", "Referenz A", "DL-CWS 26183")},
    "138222": {"key": "schellbronner", "ref": ("refB", "Referenz B", "DL-CWS 26184")},
}
SKIP_IDS = {"130389"}  # Westtangente Südeingang: gleiche Koordinaten wie Arlinger Tunnel

SIM_LAST_CAL_AGE = [3, 9, 24, 38, 14, 5, 27, 33, 8, 18, 4, 41, 11, 2, 21]
SIM_SCALES = [0.8, 1.0, 1.25, 0.9, 1.15, 1.0, 0.85, 1.3, 1.05, 0.95, 1.2, 0.9, 1.1, 1.0, 0.8]
SIM_NEVER = {1, 9}
FROST_WORDS = ("brücke",)


def parse_sites(md_path):
    sites = []
    for line in md_path.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\|\s*(Oberflächentemperatur [^|]+?)\s*\|\s*(\d+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|", line)
        if m and m.group(2) not in SKIP_IDS:
            name = m.group(1).replace("Oberflächentemperatur ", "")
            sites.append({"id": m.group(2), "name": name, "lat": float(m.group(3)), "lon": float(m.group(4))})
    return sorted(sites, key=lambda s: s["name"])


def build_bands(results):
    out = {}
    for s in results["sites"]:
        rows = []
        for label, v in s["cycle_metrics"]["by_age"].items():
            a, b = label.rstrip("d").split("-")
            rows.append({
                "label": label.replace("d", " Tage"), "from": int(a), "to": int(b),
                "p05": round(v["p05_OffsetGain"], 2), "p95": round(v["p95_OffsetGain"], 2),
                "mae_roh": round(v["mae_roh"], 2), "mae_cal": round(v["mae_OffsetGain"], 2),
                "frost_missed": v["missed_frost_OffsetGain"], "frost_events": v["frost_events_OffsetGain"],
            })
        out[s["name"]] = rows
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-md", default=str(HACK / "api_uebersicht.md"))
    ap.add_argument("--results", default=str(ROOT / "analysis" / "results.json"))
    args = ap.parse_args()

    results = json.loads(Path(args.results).read_text(encoding="utf-8"))
    raw_sites = parse_sites(Path(args.api_md))

    sites, refs, sim_i = [], [], 0
    for s in raw_sites:
        real = REAL_SITES.get(s["id"])
        if real:
            sites.append({**s, "real": True, "profile": real["key"], "bandScale": 1.0,
                          "lastCalAge": 0, "frost": False})
            rid, rname, serial = real["ref"]
            refs.append({"id": rid, "name": rname, "serial": serial, "site": s["id"],
                         "lat": s["lat"], "lon": s["lon"]})
            continue
        i = sim_i % len(SIM_LAST_CAL_AGE)
        sites.append({
            **s, "real": False,
            "profile": "arlinger" if sim_i % 2 == 0 else "schellbronner",
            "bandScale": SIM_SCALES[i],
            "lastCalAge": None if sim_i in SIM_NEVER else SIM_LAST_CAL_AGE[i],
            "frost": any(w in s["name"].lower() for w in FROST_WORDS),
        })
        sim_i += 1

    data = {
        "today": TODAY,
        "calDays": results["cal_days"],
        "prices": PRICES,
        "bands": build_bands(results),
        "refs": refs,
        "sites": sites,
    }
    out = ROOT / "docs" / "data" / "dashboard.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("window.TRUSTBAND_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"{len(sites)} Standorte, {len(refs)} Referenzen -> {out}")


if __name__ == "__main__":
    main()
