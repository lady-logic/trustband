"""
analyze.py – Vertrauensband für günstige Oberflächentemperatursensoren
Smart City Hackathon Pforzheim 2026, Challenge "Präziser Winterdienst"

Schreibt results.json und druckt Kennzahlentabellen.
Umgebungsvariable CAL = Kalibrierungsdauer in Tagen (Standard: 3).
"""

import os, json, warnings
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from pathlib import Path

warnings.filterwarnings("ignore")

# ── Konfiguration ────────────────────────────────────────────────────────────
CAL = int(os.environ.get("CAL", 3))
POINTS_PER_DAY = 144
MIN_CAL_POINTS = int(0.5 * CAL * POINTS_PER_DAY)

TRAIN_CUTOFF = {
    "arlinger":      pd.Timestamp("2026-06-15", tz="UTC"),
    "schellbronner": pd.Timestamp("2026-08-01", tz="UTC"),
}
AGE_BUCKETS = [(0, 7), (7, 14), (14, 30), (30, 60)]

BASE = Path(os.environ.get("TRUSTBAND_DATA", "C:/Hackathon/Smart City Hackathon"))
DATA = BASE / "data"


# ── Laden & Ausrichten ───────────────────────────────────────────────────────
def load_sensor(csv_path: Path, state_id: str) -> pd.Series:
    df = pd.read_csv(csv_path)
    df["_time"] = pd.to_datetime(df["_time"], format="ISO8601", utc=True)
    sub = df[df["state_identifier"] == state_id][["_time", "_value"]].copy()
    sub = sub.set_index("_time")["_value"].sort_index()
    return sub[~sub.index.duplicated(keep="first")]


def align(ref: pd.Series, cheap: pd.Series) -> pd.DataFrame:
    r = ref.resample("10min").mean().rename("ref")
    c = cheap.resample("10min").mean().rename("cheap")
    return pd.concat([r, c], axis=1).dropna()


# ── Modelle (vektorisiert) ───────────────────────────────────────────────────
def fit_offset(cal: pd.DataFrame) -> dict:
    return {"model": "Offset", "a": 1.0, "b": float((cal["ref"] - cal["cheap"]).mean())}


def fit_offset_gain(cal: pd.DataFrame) -> dict:
    X = np.column_stack([cal["cheap"].values, np.ones(len(cal))])
    y = cal["ref"].values
    (a, b), *_ = np.linalg.lstsq(X, y, rcond=None)
    return {"model": "OffsetGain", "a": float(a), "b": float(b)}


def fit_day_night(cal: pd.DataFrame) -> dict:
    h = cal.index.hour
    day = (h >= 6) & (h < 20)
    b_day   = float((cal.loc[day,  "ref"] - cal.loc[day,  "cheap"]).mean()) if day.any()   else 0.0
    b_night = float((cal.loc[~day, "ref"] - cal.loc[~day, "cheap"]).mean()) if (~day).any() else 0.0
    return {"model": "DayNight", "a": 1.0, "b_day": b_day, "b_night": b_night}


FITTERS = {
    "roh":        lambda c: {"model": "roh",    "a": 1.0, "b": 0.0},
    "Offset":     fit_offset,
    "OffsetGain": fit_offset_gain,
    "DayNight":   fit_day_night,
}


def apply_model_vec(params: dict, cheap: pd.Series) -> pd.Series:
    m = params["model"]
    if m == "DayNight":
        h   = cheap.index.hour
        day = (h >= 6) & (h < 20)
        out = cheap.copy()
        out[day]  += params["b_day"]
        out[~day] += params["b_night"]
        return out
    return params["a"] * cheap + params["b"]  # roh, Offset, OffsetGain


# ── Eichzyklus-Simulation (vektorisiert) ────────────────────────────────────
def simulate_cycles(df: pd.DataFrame, cal_days: int) -> pd.DataFrame:
    """
    Starte Eichung alle 7 Tage. Fit je Modell auf cal_days, predict auf Rest.
    Gibt DataFrame mit Spalten: ref, cheap_raw, age_days, pred_*, cal_id zurück.
    """
    if df.empty:
        return pd.DataFrame()

    start = df.index[0]
    end   = df.index[-1]
    pieces = []
    cal_id = 0

    cal_start = start
    while cal_start < end:
        cal_end  = cal_start + pd.Timedelta(days=cal_days)
        pred_end = min(cal_start + pd.Timedelta(days=cal_days + 60), end)

        cal_data  = df[(df.index >= cal_start) & (df.index < cal_end)]
        pred_data = df[(df.index >= cal_end)   & (df.index < pred_end)].copy()

        if len(cal_data) >= MIN_CAL_POINTS and len(pred_data) > 0:
            pred_data["age_days"]   = (pred_data.index - cal_end).total_seconds() / 86400
            pred_data["cheap_raw"]  = pred_data["cheap"]
            pred_data["cal_id"]     = cal_id

            for mname, fitter in FITTERS.items():
                params = fitter(cal_data)
                pred_data[f"pred_{mname}"] = apply_model_vec(params, pred_data["cheap"])

            pieces.append(pred_data.drop(columns=["cheap"]))

        cal_start += pd.Timedelta(days=7)
        cal_id += 1

    if not pieces:
        return pd.DataFrame()
    return pd.concat(pieces).sort_index()


# ── Metriken ─────────────────────────────────────────────────────────────────
MODELS = ["roh", "Offset", "OffsetGain", "DayNight"]


def compute_metrics(rdf: pd.DataFrame) -> dict:
    if rdf.empty:
        return {}
    out = {}

    # Gesamt-MAE
    for m in MODELS:
        col = f"pred_{m}"
        if col in rdf:
            out[f"mae_overall_{m}"] = float((rdf[col] - rdf["ref"]).abs().mean())

    # Je Alters-Bucket
    out["by_age"] = {}
    for lo, hi in AGE_BUCKETS:
        sub = rdf[(rdf["age_days"] >= lo) & (rdf["age_days"] < hi)]
        key = f"{lo}-{hi}d"
        bkt = {"n": int(len(sub))}
        for m in MODELS:
            col = f"pred_{m}"
            if col not in sub.columns or sub.empty:
                continue
            errs = sub[col] - sub["ref"]
            q05, q95 = errs.quantile(0.05), errs.quantile(0.95)
            bkt[f"mae_{m}"]        = float(errs.abs().mean())
            bkt[f"p05_{m}"]        = float(q05)
            bkt[f"p95_{m}"]        = float(q95)
            bkt[f"coverage90_{m}"] = float(((errs >= q05) & (errs <= q95)).mean())
            # Verpasster Frost
            frost   = sub["ref"] < 0
            lo_band = sub[col] + q05
            bkt[f"missed_frost_{m}"] = int((frost & (lo_band > 0)).sum())
            bkt[f"frost_events_{m}"] = int(frost.sum())
        out["by_age"][key] = bkt

    # Gesamt-Frost
    for m in MODELS:
        col = f"pred_{m}"
        if col not in rdf.columns:
            continue
        errs  = rdf[col] - rdf["ref"]
        q05   = errs.quantile(0.05)
        frost = rdf["ref"] < 0
        lb    = rdf[col] + q05
        out[f"missed_frost_total_{m}"] = int((frost & (lb > 0)).sum())
        out[f"frost_total_{m}"]        = int(frost.sum())

    return out


# ── Standort-Analyse ─────────────────────────────────────────────────────────
def analyse_site(name: str, cws_csv: Path, itst_csv: Path) -> dict:
    print(f"\n{'='*60}\nStandort: {name}  |  CAL={CAL} Tage\n{'='*60}")

    ref   = load_sensor(cws_csv,  "surface_temperature")
    cheap = load_sensor(itst_csv, "temperature_target")
    df    = align(ref, cheap)

    print(f"Gemeinsame Punkte (10-min): {len(df)}")
    print(f"Zeitraum: {df.index[0].date()} – {df.index[-1].date()}")

    cutoff = TRAIN_CUTOFF[name]
    train  = df[df.index < cutoff]
    test   = df[df.index >= cutoff]
    print(f"Train: {len(train)}  Test: {len(test)}")

    # S4: Streuung bei Installation
    first = df.iloc[:min(3*POINTS_PER_DAY, len(df))]
    offset_start = float((first["cheap"] - first["ref"]).mean())
    std_start    = float((first["cheap"] - first["ref"]).std())

    # S4: Drift (monatliche Mittelwerte)
    monthly = df.groupby(df.index.to_period("M")).apply(
        lambda g: (g["cheap"] - g["ref"]).mean()
    )
    drift = float(monthly.iloc[-1] - monthly.iloc[0]) if len(monthly) > 1 else np.nan

    # S4: MAE roh + globale Eichung
    mae_roh = float((df["cheap"] - df["ref"]).abs().mean())
    b_glob  = float((train["ref"] - train["cheap"]).mean())
    mae_cal = float((df["cheap"] + b_glob - df["ref"]).abs().mean())

    # S4: DWD Offset-Schätzfehler nachts
    dwd = pd.read_csv(BASE / "dwd/temperatur_feuchte_03925.csv")
    dwd["_time"] = pd.to_datetime(dwd["timestamp_utc"], utc=True)
    dwd_s = dwd.set_index("_time")["lufttemperatur_2m_degC"].resample("10min").mean()
    merged_dwd = pd.concat([ref.resample("10min").mean().rename("ref"),
                            dwd_s.rename("dwd")], axis=1).dropna()
    if not merged_dwd.empty:
        night = merged_dwd[(merged_dwd.index.hour < 6) | (merged_dwd.index.hour >= 20)]
        mae_dwd      = float((night["dwd"] - night["ref"]).abs().mean())
        offset_err_dwd = float((night["dwd"] - night["ref"]).std())
    else:
        mae_dwd = offset_err_dwd = np.nan

    print(f"\n[S4] Streuung bei Installation (erste 3 Tage):")
    print(f"     Offset: {offset_start:+.2f} °C  Std: {std_start:.2f} °C")
    print(f"[S4] Drift über {len(monthly)} Monate: {drift:+.3f} °C")
    print(f"[S4] MAE roh: {mae_roh:.3f} °C  MAE kalibriert (global): {mae_cal:.3f} °C")
    if not np.isnan(mae_dwd):
        print(f"[S4] DWD-Offset-Schätzfehler nachts (Std): {offset_err_dwd:.2f} °C  MAE: {mae_dwd:.2f} °C")

    # Eichzyklus-Simulation
    print(f"\nSimuliere Eichzyklen (CAL={CAL}d, Start alle 7d)...")
    rdf = simulate_cycles(df, CAL)
    print(f"  Vorhersagepunkte: {len(rdf)}")

    metrics = compute_metrics(rdf)

    print(f"\n[S4] MAE overall (Eichzyklen):")
    for m in MODELS:
        v = metrics.get(f"mae_overall_{m}", np.nan)
        print(f"     {m:12s}: {v:.3f} °C")

    print(f"\n[S4] MAE nach Eichalter:")
    print(f"     {'Bucket':12s} {'n':>6} {'MAE_roh':>8} {'MAE_OG':>8} {'Cover90_OG':>11} {'FrostMiss_OG':>13}")
    for bk, bm in metrics.get("by_age", {}).items():
        n   = bm.get("n", 0)
        mr  = bm.get("mae_roh", np.nan)
        mog = bm.get("mae_OffsetGain", np.nan)
        cov = bm.get("coverage90_OffsetGain", np.nan)
        fm  = bm.get("missed_frost_OffsetGain", 0)
        ft  = bm.get("frost_events_OffsetGain", 0)
        print(f"     {bk:12s} {n:>6d} {mr:>8.3f} {mog:>8.3f} {cov:>10.1%} {fm:>6d}/{ft:<5d}")

    return {
        "name": name,
        "n_total":          len(df),
        "n_train":          len(train),
        "n_test":           len(test),
        "date_start":       str(df.index[0].date()),
        "date_end":         str(df.index[-1].date()),
        "offset_start":     offset_start,
        "std_start":        std_start,
        "drift_months":     len(monthly),
        "drift_total":      None if np.isnan(drift) else float(drift),
        "mae_roh":          mae_roh,
        "mae_calibrated":   mae_cal,
        "mae_dwd_night":    None if np.isnan(mae_dwd) else float(mae_dwd),
        "offset_err_dwd":   None if np.isnan(offset_err_dwd) else float(offset_err_dwd),
        "cycle_metrics":    metrics,
        "cal_days":         CAL,
        "_train_cutoff":    str(cutoff.date()),
        "_df":              df,
        "_rdf":             rdf,
    }


# ── Transfer-Test ────────────────────────────────────────────────────────────
def transfer_test(a: dict, b: dict) -> dict:
    df_a, df_b = a["_df"], b["_df"]
    p  = fit_offset_gain(df_a[df_a.index < pd.Timestamp(a["_train_cutoff"], tz="UTC")])
    p2 = fit_offset_gain(df_b[df_b.index < pd.Timestamp(b["_train_cutoff"], tz="UTC")])

    mae_tr  = float((apply_model_vec(p,  df_b["cheap"]) - df_b["ref"]).abs().mean())
    mae_own = float((apply_model_vec(p2, df_b["cheap"]) - df_b["ref"]).abs().mean())
    fails   = mae_tr > mae_own

    print(f"\n[S4] Transfer {a['name']} -> {b['name']}:")
    print(f"     MAE Transfer:    {mae_tr:.3f} deg C")
    print(f"     MAE Eigenmodell: {mae_own:.3f} deg C  -> scheitert: {fails}")

    return {"from": a["name"], "to": b["name"],
            "mae_transfer": mae_tr, "mae_own": mae_own, "transfer_fails": fails}


# ── CAL-Dauer-Vergleich (1,3,7,14 Tage) ─────────────────────────────────────
def cal_duration_comparison(df: pd.DataFrame, name: str) -> dict:
    print(f"\n[S4] Kalibrierungsdauer-Vergleich ({name}):")
    print(f"     {'CAL':>4}d  {'MAE_roh':>8} {'MAE_OG':>8}")
    result = {}
    for c in [1, 3, 7, 14]:
        old_min = int(0.5 * c * POINTS_PER_DAY)
        old_global = MIN_CAL_POINTS
        # Simuliere mit c Tagen
        rdf_c = simulate_cycles_cal(df, c)
        if rdf_c.empty:
            continue
        mr  = float((rdf_c["pred_roh"]        - rdf_c["ref"]).abs().mean())
        mog = float((rdf_c["pred_OffsetGain"] - rdf_c["ref"]).abs().mean())
        result[f"{c}d"] = {"mae_roh": mr, "mae_OffsetGain": mog}
        print(f"     {c:>4d}  {mr:>8.3f} {mog:>8.3f}")
    return result


def simulate_cycles_cal(df: pd.DataFrame, cal_days: int) -> pd.DataFrame:
    """simulate_cycles mit überschreibbarem cal_days (für Vergleich)."""
    min_pts = int(0.5 * cal_days * POINTS_PER_DAY)
    if df.empty:
        return pd.DataFrame()
    start, end = df.index[0], df.index[-1]
    pieces, cal_id = [], 0
    cal_start = start
    while cal_start < end:
        cal_end  = cal_start + pd.Timedelta(days=cal_days)
        pred_end = min(cal_start + pd.Timedelta(days=cal_days + 60), end)
        cal_data  = df[(df.index >= cal_start) & (df.index < cal_end)]
        pred_data = df[(df.index >= cal_end)   & (df.index < pred_end)].copy()
        if len(cal_data) >= min_pts and len(pred_data) > 0:
            pred_data["age_days"]  = (pred_data.index - cal_end).total_seconds() / 86400
            pred_data["cheap_raw"] = pred_data["cheap"]
            pred_data["cal_id"]    = cal_id
            for mname, fitter in FITTERS.items():
                params = fitter(cal_data)
                pred_data[f"pred_{mname}"] = apply_model_vec(params, pred_data["cheap"])
            pieces.append(pred_data.drop(columns=["cheap"]))
        cal_start += pd.Timedelta(days=7)
        cal_id += 1
    return pd.concat(pieces).sort_index() if pieces else pd.DataFrame()


# ── Schaubild: Arlinger-Rückblick ─────────────────────────────────────────────
def plot_arlinger(site: dict):
    df  = site["_df"]
    rdf = site["_rdf"]
    if rdf.empty:
        print("Keine Zyklus-Daten für Plot.")
        return

    # Plotfenster: erste 90 Tage ab Datenbeginn
    p_start = df.index[0]
    p_end   = p_start + pd.Timedelta(days=90)
    cal_end = p_start + pd.Timedelta(days=CAL)

    df_p  = df[(df.index >= p_start)  & (df.index <= p_end)].resample("1h").mean()
    rdf_p = rdf[(rdf.index >= cal_end) & (rdf.index <= p_end)].resample("1h").mean()

    if rdf_p.empty:
        print("Zu wenige Daten für Plot.")
        return

    # Band aus globalen Quantilen je Alters-Bucket
    band_lo = rdf_p["pred_OffsetGain"].copy() * np.nan
    band_hi = rdf_p["pred_OffsetGain"].copy() * np.nan

    for lo, hi in AGE_BUCKETS:
        sub_all = rdf[(rdf["age_days"] >= lo) & (rdf["age_days"] < hi)]
        if len(sub_all) < 10:
            continue
        errs = sub_all["pred_OffsetGain"] - sub_all["ref"]
        q05, q95 = errs.quantile(0.05), errs.quantile(0.95)

        # Zeitfenster für diesen Bucket (relativ zu cal_end des ersten Zyklus)
        t_lo = cal_end + pd.Timedelta(days=lo)
        t_hi = cal_end + pd.Timedelta(days=hi)
        mask = (rdf_p.index >= t_lo) & (rdf_p.index < t_hi)
        band_lo[mask] = rdf_p.loc[mask, "pred_OffsetGain"] + q05
        band_hi[mask] = rdf_p.loc[mask, "pred_OffsetGain"] + q95

    fig, (ax_main, ax_age) = plt.subplots(
        2, 1, figsize=(14, 8),
        gridspec_kw={"height_ratios": [4, 1]},
        sharex=True
    )
    fig.patch.set_facecolor("#f8f9fa")
    for ax in (ax_main, ax_age):
        ax.set_facecolor("#f8f9fa")

    # Referenz & Sensoren
    ax_main.plot(df_p.index, df_p["ref"],   color="#1a6faf", lw=2.0,
                 label="CWS-Referenz (teuer)", zorder=5)
    ax_main.plot(df_p.index, df_p["cheap"], color="#aab4be", lw=0.9, alpha=0.6,
                 label="ITST roh", zorder=3)
    ax_main.plot(rdf_p.index, rdf_p["pred_OffsetGain"], color="#e07b39", lw=1.5,
                 label="ITST korrigiert (OffsetGain)", zorder=4)
    ax_main.fill_between(rdf_p.index, band_lo, band_hi,
                         alpha=0.3, color="#e07b39", label="90%-Vertrauensband", zorder=2)

    # Eich-Fenster
    ax_main.axvspan(p_start, cal_end, alpha=0.18, color="#2ca02c",
                    label=f"Eichphase ({CAL} Tage)")
    ax_main.axhline(0, color="#1a3a6f", lw=0.8, ls="--", alpha=0.5)

    ax_main.set_ylabel("Oberflächentemperatur [°C]", fontsize=11)
    ax_main.set_title(
        f"Arlingertunnel – Vertrauensband nach Eichalter  (CAL={CAL} Tage)",
        fontsize=13, fontweight="bold", pad=10
    )
    ax_main.legend(loc="upper right", fontsize=9, framealpha=0.9)
    ax_main.grid(True, alpha=0.25, color="#ccc")

    # Alters-Leiste
    rdf_window = rdf[(rdf.index >= cal_end) & (rdf.index <= p_end)]
    if not rdf_window.empty:
        # Stündliche Auflösung für saubere Darstellung
        rdf_hr = rdf_window.resample("1h").mean()
        ages_hr = rdf_hr["age_days"]
        clrs = ["#2ca02c" if a < 30 else ("#ff7f0e" if a < 60 else "#d62728")
                for a in ages_hr]
        ax_age.scatter(rdf_hr.index, [1]*len(rdf_hr), c=clrs, marker="|", s=50, linewidths=0.8)

    ax_age.set_yticks([])
    ax_age.set_ylabel("Eichalter", fontsize=9, labelpad=4)
    ax_age.set_xlabel("Datum", fontsize=11)
    ax_age.set_facecolor("#f8f9fa")

    p_gruen  = mpatches.Patch(color="#2ca02c", label="< 30 Tage (vertrauen)")
    p_orange = mpatches.Patch(color="#ff7f0e", label="30–60 Tage (Warnung)")
    p_rot    = mpatches.Patch(color="#d62728", label="> 60 Tage (nachprüfen)")
    ax_age.legend(handles=[p_gruen, p_orange, p_rot],
                  loc="lower right", fontsize=8, ncol=3, framealpha=0.9)

    plt.tight_layout(h_pad=0.5)
    out = BASE / "arlinger_rueckblick.png"
    fig.savefig(out, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"\nSchaubild gespeichert: {out}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    # CSV-Pfade
    arlinger_cws_csv  = next((DATA / next(DATA.glob("*CWS 26183*")).name).glob("*.csv"))
    arlinger_itst_csv = next((DATA / next(DATA.glob("*ITST 22249*")).name).glob("*.csv"))
    schell_cws_csv    = next((DATA / next(DATA.glob("*CWS 26184*")).name).glob("*.csv"))
    schell_itst_csv   = next((DATA / next(DATA.glob("*ITST 24741*")).name).glob("*.csv"))

    print("Dateien:")
    for p in [arlinger_cws_csv, arlinger_itst_csv, schell_cws_csv, schell_itst_csv]:
        print(f"  {p.name}")

    # Analyse
    arlinger = analyse_site("arlinger", arlinger_cws_csv, arlinger_itst_csv)
    schell   = analyse_site("schellbronner", schell_cws_csv, schell_itst_csv)

    # Transfer
    t_ab = transfer_test(arlinger, schell)
    t_ba = transfer_test(schell, arlinger)

    # CAL-Dauer-Vergleich (auf Arlinger)
    print(f"\n{'='*60}\nKalibrierungsdauer-Vergleich (Arlinger)\n{'='*60}")
    cal_comp_arlinger   = cal_duration_comparison(arlinger["_df"], "arlinger")
    cal_comp_schell     = cal_duration_comparison(schell["_df"],   "schellbronner")

    # Schaubild
    plot_arlinger(arlinger)

    # Drei Kennzahlen groß
    print(f"\n{'='*70}\nDREI GROSSE KENNZAHLEN FÜR DEN PITCH\n{'='*70}")
    for s in [arlinger, schell]:
        m = s["cycle_metrics"]
        mae_before = s["mae_roh"]
        mae_after  = m.get("mae_overall_OffsetGain", s["mae_calibrated"])
        b30  = m.get("by_age", {}).get("14-30d", {}).get("mae_OffsetGain", np.nan)
        b60  = m.get("by_age", {}).get("30-60d", {}).get("mae_OffsetGain", np.nan)
        haltbar = "ca. 30 Tage ✓" if (not np.isnan(b30) and not np.isnan(b60) and b60 > b30 * 1.15) else "offen"
        print(f"\n  [{s['name']}]")
        print(f"  1. Fehler roh → kalibriert:  {mae_before:.2f} → {mae_after:.2f} °C")
        print(f"  2. Haltbarkeit Eichung:        {haltbar}")
        print(f"  3. Streuung bei Installation:  Offset {s['offset_start']:+.2f} °C  Std {s['std_start']:.2f} °C")

    # results.json
    def clean(d):
        return {k: v for k, v in d.items() if not k.startswith("_")}

    results = {
        "cal_days": CAL,
        "sites": [clean(arlinger), clean(schell)],
        "transfer": [t_ab, t_ba],
        "cal_duration_comparison": {
            "arlinger":      cal_comp_arlinger,
            "schellbronner": cal_comp_schell,
        },
        "models": MODELS,
        "age_buckets": [f"{lo}-{hi}d" for lo, hi in AGE_BUCKETS],
        "data_source": "Deutscher Wetterdienst (DL-DE-BY-2.0) + Decentlab DL-ITST/CWS",
    }

    out_json = BASE / "results.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)
    print(f"\nresults.json gespeichert: {out_json}")
    return results


if __name__ == "__main__":
    main()
