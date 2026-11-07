"""Vertrauensband pro Tag seit der Eichung (0-59), Modell OffsetGain.

Nutzt die Eichzyklus-Simulation aus analyze.py. Schreibt analysis/bands_daily.json.
Je Tag: 5./95. Perzentil des Fehlers (kalibrierter günstiger Sensor minus Referenz),
danach über 3 Tage geglättet.

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
DAYS = 60
OUT = Path(__file__).with_name("bands_daily.json")


def csv_of(pattern):
    return next((A.DATA / next(A.DATA.glob(pattern)).name).glob("*.csv"))


def daily(name, cws_pat, itst_pat):
    ref = A.load_sensor(csv_of(cws_pat), "surface_temperature")
    cheap = A.load_sensor(csv_of(itst_pat), "temperature_target")
    rdf = A.simulate_cycles(A.align(ref, cheap), A.CAL)
    err = rdf["pred_OffsetGain"] - rdf["ref"]
    rows = []
    for d in range(DAYS):
        e = err[(rdf["age_days"] >= d) & (rdf["age_days"] < d + 1)]
        rows.append({"day": d, "n": int(len(e)),
                     "p05": float(e.quantile(0.05)), "p95": float(e.quantile(0.95)), "mae": float(e.abs().mean())})
    df = pd.DataFrame(rows)
    for c in ("p05", "p95", "mae"):
        df[c] = df[c].rolling(3, center=True, min_periods=1).mean().round(3)
    print(f"{name}: {len(rdf)} Punkte, Tag 0: {df.p05[0]:.2f}..{df.p95[0]:.2f}, Tag 29: {df.p05[29]:.2f}..{df.p95[29]:.2f}")
    return df.to_dict("records")


if __name__ == "__main__":
    out = {name: daily(name, *pats) for name, pats in SITES.items()}
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("->", OUT)
