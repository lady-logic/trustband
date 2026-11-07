"""Vertrauensband pro Tag seit der Eichung (0-59), nur für den Kältebereich (Referenz < 3 °C).

Je Standort wird aus zwei Eichmodellen das mit dem kleinsten Fehler bei Kälte gewählt:
  Offset      y = x + b        (nur Verschiebung)
  OffsetGain  y = a*x + b      (Verschiebung und Steigung)
Das Band je Tag ist das 5./95. Perzentil des Fehlers (korrigiert minus Referenz) über ein
Fenster von 5 Tagen. Zum Vergleich werden auch roh und alle Temperaturen ausgewiesen.

Aufruf:  TRUSTBAND_DATA=<Datenordner> python analysis/daily_bands.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

import analyze as A

SITES = {
    "arlinger": ("*CWS 26183*", "*ITST 22249*"),
    "schellbronner": ("*CWS 26184*", "*ITST 24741*"),
}
CANDIDATES = {"Offset": "nur Offset", "OffsetGain": "Offset und Steigung"}
COLD = 3.0
DAYS = 60
OUT = Path(__file__).with_name("bands_daily.json")


def csv_of(pattern):
    return next((A.DATA / next(A.DATA.glob(pattern)).name).glob("*.csv"))


def site_result(name, cws_pat, itst_pat):
    ref = A.load_sensor(csv_of(cws_pat), "surface_temperature")
    cheap = A.load_sensor(csv_of(itst_pat), "temperature_target")
    rdf = A.simulate_cycles(A.align(ref, cheap), A.CAL)
    cold = rdf[rdf["ref"] < COLD]
    first30 = cold[cold["age_days"] < 30]

    mae_cold = {m: float((first30[f"pred_{m}"] - first30["ref"]).abs().mean()) for m in CANDIDATES}
    best = min(mae_cold, key=mae_cold.get)
    err = cold[f"pred_{best}"] - cold["ref"]

    rows = []
    for d in range(DAYS):
        e = err[(cold["age_days"] >= d - 2) & (cold["age_days"] < d + 3)]
        rows.append({"day": d, "n": int(len(e)), "p05": round(float(e.quantile(0.05)), 3), "p95": round(float(e.quantile(0.95)), 3)})

    w = lambda df, m: float((df[f"pred_{m}"] - df["ref"]).abs().mean())
    first7_cold = cold[cold["age_days"] < 7]
    first7_all = rdf[rdf["age_days"] < 7]
    meta = {
        "model": best, "label": CANDIDATES[best], "cold_below_c": COLD, "n_cold": int(len(cold)),
        "mae_cold_by_model": {m: round(v, 3) for m, v in mae_cold.items()},
        "mae_roh_cold_0_7": round(w(first7_cold, "roh"), 3), "mae_cal_cold_0_7": round(w(first7_cold, best), 3),
        "mae_roh_all_0_7": round(w(first7_all, "roh"), 3), "mae_cal_all_0_7": round(w(first7_all, best), 3),
    }
    print(f"{name}: Modell {best} (Kälte-Fehler {mae_cold}), Tag 0: {rows[0]['p05']:+.2f}..{rows[0]['p95']:+.2f}, "
          f"Tag 14: {rows[14]['p05']:+.2f}..{rows[14]['p95']:+.2f}, Tag 29: {rows[29]['p05']:+.2f}..{rows[29]['p95']:+.2f}, n_kalt={len(cold)}")
    return {"meta": meta, "rows": rows}


if __name__ == "__main__":
    out = {name: site_result(name, *pats) for name, pats in SITES.items()}
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("->", OUT)
