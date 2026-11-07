window.TRUSTBAND_DATA = {
 "today": "2026-11-07",
 "calDays": 3,
 "prices": {
  "cheap": 1430,
  "expensive": 4020
 },
 "bands": {
  "arlinger": [
   {
    "label": "0-7 Tage",
    "from": 0,
    "to": 7,
    "p05": -0.93,
    "p95": 1.04,
    "mae_roh": 0.73,
    "mae_cal": 0.49,
    "frost_missed": 0,
    "frost_events": 154
   },
   {
    "label": "7-14 Tage",
    "from": 7,
    "to": 14,
    "p05": -1.07,
    "p95": 1.27,
    "mae_roh": 0.71,
    "mae_cal": 0.58,
    "frost_missed": 10,
    "frost_events": 154
   },
   {
    "label": "14-30 Tage",
    "from": 14,
    "to": 30,
    "p05": -1.11,
    "p95": 1.4,
    "mae_roh": 0.71,
    "mae_cal": 0.63,
    "frost_missed": 53,
    "frost_events": 300
   },
   {
    "label": "30-60 Tage",
    "from": 30,
    "to": 60,
    "p05": -1.47,
    "p95": 1.4,
    "mae_roh": 0.73,
    "mae_cal": 0.71,
    "frost_missed": 0,
    "frost_events": 365
   }
  ],
  "schellbronner": [
   {
    "label": "0-7 Tage",
    "from": 0,
    "to": 7,
    "p05": -0.99,
    "p95": 0.86,
    "mae_roh": 0.74,
    "mae_cal": 0.42,
    "frost_missed": 0,
    "frost_events": 192
   },
   {
    "label": "7-14 Tage",
    "from": 7,
    "to": 14,
    "p05": -1.17,
    "p95": 0.92,
    "mae_roh": 0.76,
    "mae_cal": 0.48,
    "frost_missed": 0,
    "frost_events": 151
   },
   {
    "label": "14-30 Tage",
    "from": 14,
    "to": 30,
    "p05": -1.03,
    "p95": 0.9,
    "mae_roh": 0.71,
    "mae_cal": 0.46,
    "frost_missed": 0,
    "frost_events": 309
   },
   {
    "label": "30-60 Tage",
    "from": 30,
    "to": 60,
    "p05": -0.97,
    "p95": 0.88,
    "mae_roh": 0.7,
    "mae_cal": 0.44,
    "frost_missed": 0,
    "frost_events": 256
   }
  ]
 },
 "refs": [
  {
   "id": "refA",
   "name": "Referenz A",
   "serial": "DL-CWS 26183",
   "site": "172024",
   "lat": 48.8826739,
   "lon": 8.652837
  },
  {
   "id": "refB",
   "name": "Referenz B",
   "serial": "DL-CWS 26184",
   "site": "138222",
   "lat": 48.8231682347,
   "lon": 8.7380594397
  }
 ],
 "sites": [
  {
   "id": "172024",
   "name": "Arlinger Tunnel Südeingang",
   "lat": 48.8826739,
   "lon": 8.652837,
   "real": true,
   "profile": "arlinger",
   "bandScale": 1.0,
   "lastCalAge": 0,
   "frost": false
  },
  {
   "id": "130385",
   "name": "Eisinger Landstraße",
   "lat": 48.9138478,
   "lon": 8.6938858,
   "real": false,
   "profile": "arlinger",
   "bandScale": 0.8,
   "lastCalAge": 3,
   "frost": false
  },
  {
   "id": "150688",
   "name": "Hermannseeweg",
   "lat": 48.846444375,
   "lon": 8.6575858868,
   "real": false,
   "profile": "schellbronner",
   "bandScale": 1.0,
   "lastCalAge": null,
   "frost": false
  },
  {
   "id": "130387",
   "name": "Huchenfeld L574",
   "lat": 48.8515079,
   "lon": 8.7029904,
   "real": false,
   "profile": "arlinger",
   "bandScale": 1.25,
   "lastCalAge": 24,
   "frost": false
  },
  {
   "id": "164837",
   "name": "Huchenfelder Straße",
   "lat": 48.8656589277,
   "lon": 8.6930095615,
   "real": false,
   "profile": "schellbronner",
   "bandScale": 0.9,
   "lastCalAge": 38,
   "frost": false
  },
  {
   "id": "138228",
   "name": "Kieselbronner Straße",
   "lat": 48.9243379879,
   "lon": 8.7342290207,
   "real": false,
   "profile": "arlinger",
   "bandScale": 1.15,
   "lastCalAge": 14,
   "frost": false
  },
  {
   "id": "138226",
   "name": "Klingenstraße",
   "lat": 48.894742,
   "lon": 8.752829,
   "real": false,
   "profile": "schellbronner",
   "bandScale": 1.0,
   "lastCalAge": 5,
   "frost": false
  },
  {
   "id": "130390",
   "name": "Kupferhammerbrücke",
   "lat": 48.8779807,
   "lon": 8.6992751,
   "real": false,
   "profile": "arlinger",
   "bandScale": 0.85,
   "lastCalAge": 27,
   "frost": true
  },
  {
   "id": "129994",
   "name": "Leopoldplatz (Norden)",
   "lat": 48.8918388,
   "lon": 8.6978521,
   "real": false,
   "profile": "schellbronner",
   "bandScale": 1.3,
   "lastCalAge": 33,
   "frost": false
  },
  {
   "id": "130378",
   "name": "Leopoldplatz (Süden)",
   "lat": 48.8916571,
   "lon": 8.6977804,
   "real": false,
   "profile": "arlinger",
   "bandScale": 1.05,
   "lastCalAge": 8,
   "frost": false
  },
  {
   "id": "138222",
   "name": "Schellbronner Straße",
   "lat": 48.8231682347,
   "lon": 8.7380594397,
   "real": true,
   "profile": "schellbronner",
   "bandScale": 1.0,
   "lastCalAge": 0,
   "frost": false
  },
  {
   "id": "129935",
   "name": "Schulberg",
   "lat": 48.8929658,
   "lon": 8.704713,
   "real": false,
   "profile": "schellbronner",
   "bandScale": 0.95,
   "lastCalAge": null,
   "frost": false
  },
  {
   "id": "164847",
   "name": "Seehaus",
   "lat": 48.8669925747,
   "lon": 8.747277845,
   "real": false,
   "profile": "arlinger",
   "bandScale": 1.2,
   "lastCalAge": 4,
   "frost": false
  },
  {
   "id": "130382",
   "name": "Turnstraße",
   "lat": 48.88951,
   "lon": 8.69681,
   "real": false,
   "profile": "schellbronner",
   "bandScale": 0.9,
   "lastCalAge": 41,
   "frost": false
  },
  {
   "id": "135077",
   "name": "Wildpark",
   "lat": 48.8761056594,
   "lon": 8.7152633038,
   "real": false,
   "profile": "arlinger",
   "bandScale": 1.1,
   "lastCalAge": 11,
   "frost": false
  },
  {
   "id": "164852",
   "name": "Würmer Sträßchen",
   "lat": 48.8559838327,
   "lon": 8.7462085904,
   "real": false,
   "profile": "schellbronner",
   "bandScale": 1.0,
   "lastCalAge": 2,
   "frost": false
  },
  {
   "id": "138224",
   "name": "Würmstraße",
   "lat": 48.8573266518,
   "lon": 8.7214341336,
   "real": false,
   "profile": "arlinger",
   "bandScale": 0.8,
   "lastCalAge": 21,
   "frost": false
  }
 ]
};
