"""Hilft ein lernendes Modell mit mehr Merkmalen gegenüber y = a*x + b?

Gleiches Protokoll wie analyze.py: Eichung über CAL Tage, danach 60 Tage ohne Referenz,
Eichstart alle 7 Tage. Fehler = korrigierter günstiger Sensor minus Referenz.

Merkmale (an jedem günstigen Sensor ohne Referenz verfügbar): Messwert, Kopftemperatur, Tageszeit.

Aufruf:  TRUSTBAND_DATA=<Datenordner> python analysis/ml_experiment.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

import analyze as A

SITES = {
    "arlinger": ("*CWS 26183*", "*ITST 22249*"),
    "schellbronner": ("*CWS 26184*", "*ITST 24741*"),
}
OUT = Path(__file__).with_name("ml_results.json")
BUCKETS = [(0, 7), (7, 14), (14, 30)]


def csv_of(pattern):
    return next((A.DATA / next(A.DATA.glob(pattern)).name).glob("*.csv"))


def load(cws_pat, itst_pat):
    ref = A.load_sensor(csv_of(cws_pat), "surface_temperature")
    cheap = A.load_sensor(csv_of(itst_pat), "temperature_target")
    head = A.load_sensor(csv_of(itst_pat), "temperature_head")
    df = pd.concat([ref.resample("10min").mean().rename("ref"), cheap.resample("10min").mean().rename("cheap"),
                    head.resample("10min").mean().rename("head")], axis=1).dropna()
    h = df.index.tz_convert("Europe/Berlin")
    hour = h.hour + h.minute / 60
    df["s"] = np.sin(2 * np.pi * hour / 24)
    df["c"] = np.cos(2 * np.pi * hour / 24)
    df["night"] = (h.hour >= 20) | (h.hour < 6)
    return df


def ridge(X, y, lam=1.0):
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = (X - mu) / sd
    Z1 = np.column_stack([Z, np.ones(len(Z))])
    P = np.eye(Z1.shape[1]) * lam
    P[-1, -1] = 0
    w = np.linalg.solve(Z1.T @ Z1 + P, Z1.T @ y)
    return lambda Xn: np.column_stack([(Xn - mu) / sd, np.ones(len(Xn))]) @ w


def models():
    def base(cal):  # y = a*x + b
        f = ridge(cal[["cheap"]].values, cal["ref"].values, lam=1e-6)
        return lambda d: f(d[["cheap"]].values)

    def offset(cal):  # y = x + b (Steigung fest 1)
        b = float((cal["ref"] - cal["cheap"]).mean())
        return lambda d: d["cheap"].values + b

    def head(cal):  # + Kopftemperatur
        f = ridge(cal[["cheap", "head"]].values, cal["ref"].values)
        return lambda d: f(d[["cheap", "head"]].values)

    def time(cal):  # + Tageszeit
        cols = ["cheap", "head", "s", "c"]
        f = ridge(cal[cols].values, cal["ref"].values)
        return lambda d: f(d[cols].values)

    def gbm(cal):  # kleiner Entscheidungsbaum-Verbund auf dem Rest
        cols = ["cheap", "head", "s", "c"]
        m = HistGradientBoostingRegressor(max_iter=60, max_depth=3, learning_rate=0.1, min_samples_leaf=20, random_state=0)
        m.fit(cal[cols].values, (cal["ref"] - cal["cheap"]).values)
        return lambda d: d["cheap"].values + m.predict(d[cols].values)

    return {"Nur Offset (x+b)": offset, "Basis (a·x+b)": base, "+ Kopftemperatur": head, "+ Tageszeit": time, "Baumverbund": gbm}


def run(df):
    ms = models()
    rows = []
    start, end = df.index[0], df.index[-1]
    cs = start
    while cs < end:
        ce = cs + pd.Timedelta(days=A.CAL)
        pe = min(ce + pd.Timedelta(days=30), end)
        cal = df[(df.index >= cs) & (df.index < ce)]
        pred = df[(df.index >= ce) & (df.index < pe)].copy()
        if len(cal) >= A.MIN_CAL_POINTS and len(pred):
            pred["age"] = (pred.index - ce).total_seconds() / 86400
            for name, fit in ms.items():
                pred[name] = fit(cal)(pred) - pred["ref"]
            pred["raw"] = pred["cheap"] - pred["ref"]
            rows.append(pred)
        cs += pd.Timedelta(days=7)
    return pd.concat(rows)


def summarize(r):
    out = {}
    for name in ["raw", *models().keys()]:
        e = r[name]
        d = {"mae": float(e.abs().mean()), "mae_night": float(e[r["night"]].abs().mean()),
             "mae_cold": float(e[r["ref"] < 3].abs().mean()), "n_cold": int((r["ref"] < 3).sum())}
        for lo, hi in BUCKETS:
            sub = r[(r["age"] >= lo) & (r["age"] < hi)]
            es = sub[name]
            d[f"mae_{lo}-{hi}d"] = float(es.abs().mean())
            d[f"width90_{lo}-{hi}d"] = float(es.quantile(0.95) - es.quantile(0.05))
        cold = r[r["ref"] < 3]
        for lo, hi in BUCKETS:
            ec = cold[(cold["age"] >= lo) & (cold["age"] < hi)][name]
            d[f"cold_p05_{lo}-{hi}d"] = float(ec.quantile(0.05))
            d[f"cold_p95_{lo}-{hi}d"] = float(ec.quantile(0.95))
        night = r[r["night"]][name]
        d["width90_night"] = float(night.quantile(0.95) - night.quantile(0.05))
        d["width90_all"] = float(e.quantile(0.95) - e.quantile(0.05))
        out[name] = d
    return out


if __name__ == "__main__":
    res = {}
    for site, pats in SITES.items():
        r = run(load(*pats))
        res[site] = summarize(r)
        print(f"\n== {site} ({len(r)} Vorhersagepunkte, davon unter 3 °C: {int((r['ref'] < 3).sum())}, Nacht: {int(r['night'].sum())}) ==")
        cold = r[r["ref"] < 3]
        print(f"Kaltpunkte nach Alter: " + ", ".join(f"{lo}-{hi}d: {int(((cold['age'] >= lo) & (cold['age'] < hi)).sum())}" for lo, hi in BUCKETS))
        print(f"{'Modell':20s} {'MAE':>6s} {'Nacht':>6s} {'<3°C':>6s} {'0-7d':>6s} {'7-14d':>6s} {'14-30d':>7s} {'Band90':>7s}")
        for name, d in res[site].items():
            print(f"{name:20s} {d['mae']:6.2f} {d['mae_night']:6.2f} {d['mae_cold']:6.2f} {d['mae_0-7d']:6.2f} {d['mae_7-14d']:6.2f} {d['mae_14-30d']:7.2f} {d['width90_all']:7.2f}")
        print("Band bei Kälte (<3 °C), 5./95. Perzentil je Eichalter:")
        for name in ["raw", "Nur Offset (x+b)", "Basis (a·x+b)"]:
            d = res[site][name]
            print(f"  {name:18s} " + "  ".join(f"{lo}-{hi}d: {d[f'cold_p05_{lo}-{hi}d']:+.2f}..{d[f'cold_p95_{lo}-{hi}d']:+.2f}" for lo, hi in BUCKETS))
    OUT.write_text(json.dumps(res, indent=1), encoding="utf-8")
    print("->", OUT)
