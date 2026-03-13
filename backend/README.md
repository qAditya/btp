# PV Bifacial Backend

Express backend for:
- Free geolocation lookup by place name
- Free irradiance-only time series by geo-coordinates
- Bifacial PV sweep (height, tilt, albedo; configurable azimuth)
- Optional MATLAB execution path

## Folder Layout
- `backend/simulink/models/btp8thsemmodel.slx`
- `backend/simulink/functions/calculate_irradiance.m`
- `backend/simulink/scripts/run_bifacial_sweep.m`

## Free Data Sources
- Geocoding: OpenStreetMap Nominatim (`/search`) - no API key
- Irradiance: NASA POWER hourly endpoint (`ALLSKY_SFC_SW_DWN`) - no API key

`/irradiance` includes `source.csvUrl` to open data in Excel.

## Run
```bash
npm install
npm run dev
```

Server default: `http://localhost:4000`
- Frontend UI: `http://localhost:4000/app`

## Endpoints

### `POST /api/simulation/irradiance`
Fetches irradiance (GHI) only for a location and date range.

Request:
```json
{
  "location": "Phoenix, Arizona",
  "startDate": "2026-02-10",
  "endDate": "2026-02-12"
}
```

Rules:
- Date format: `YYYY-MM-DD`
- Max span: `31` days
- If dates are omitted, defaults to previous UTC day

### `POST /api/simulation/analyze`
Runs bifacial configuration sweep.

Request (JavaScript engine default):
```json
{
  "location": "Phoenix, Arizona",
  "startDate": "2026-02-10",
  "endDate": "2026-02-12",
  "ranges": {
    "heightCm": { "min": 50, "max": 150, "step": 25 },
    "tiltDeg": [10, 20, 30, 40, 50],
    "albedo": { "min": 0.2, "max": 0.6, "step": 0.1 }
  },
  "panelConfig": {
    "areaM2": 2.2,
    "frontEfficiency": 0.21,
    "inverterEfficiency": 0.96,
    "bifaciality": 0.7,
    "azimuthDeg": 180,
    "rearStructureLossFraction": 0.08,
    "noctC": 45,
    "temperatureCoeffPerC": -0.004
  }
}
```

Request with MATLAB attempt:
```json
{
  "location": "Phoenix, Arizona",
  "useMatlab": true,
  "strictMatlab": false
}
```

Behavior:
- `useMatlab: true`: tries MATLAB execution.
- `strictMatlab: false`: if MATLAB fails, returns JS fallback (still success).
- `strictMatlab: true`: if MATLAB fails, returns error.

Response includes:
- `chartData`, `topConfigurations`, `optimalConfiguration`
- `engine`: `javascript`, `matlab`, or `javascript-fallback`

### `POST /api/simulation/run`
Backward-compatible alias to `/api/simulation/analyze`.

## Quick Visual Check
1. Start backend: `npm run dev`
2. Open: `http://localhost:4000/app`
3. Click `Fetch Irradiance`
4. Click `Run Analysis`

## MATLAB Runtime Config (Optional)
- `USE_MATLAB=true` to force MATLAB mode globally
- `MATLAB_EXECUTABLE` if executable is not `matlab`
- `MATLAB_TIMEOUT_MS` default `300000`

## Effective Irradiance Formula
The model combines front-side transposition, rear-side ground reflection,
view-factor shading, and thermal derating.

- **Front irradiance**: Liu‑Jordan isotropic transposition of beam + diffuse
  + ground reflection.
- **Rear irradiance**: ground‑reflected + diffuse component
  `rear_ground = GHI × albedo × rearViewFactor × heightFactor`
  `rear_diffuse = GHI_diffuse × 0.1`
  `rear = (rear_ground + rear_diffuse) × bifaciality`
- **Total effective** = front + rear.
- **Cell temperature model**: $T_{cell} \approx T_{amb} + \frac{G_{total}}{800}(NOCT-20)$
- **Temperature derate**: power multiplied by $1 + \gamma (T_{cell}-25)$, clamped to `[0.5, 1.15]`

Rear-side structure loss is modeled with `rearStructureLossFraction` (default 0.08).
