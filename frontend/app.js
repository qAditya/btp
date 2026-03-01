/* ─── DOM References ─── */
const locationInput = document.getElementById("locationInput");
const startDateInput = document.getElementById("startDateInput");
const endDateInput = document.getElementById("endDateInput");
const fetchIrradianceBtn = document.getElementById("fetchIrradianceBtn");
const runAnalysisBtn = document.getElementById("runAnalysisBtn");
const useMatlabInput = document.getElementById("useMatlabInput");
const strictMatlabInput = document.getElementById("strictMatlabInput");
const statusText = document.getElementById("statusText");
const irradianceSection = document.getElementById("irradianceSection");
const analysisSection = document.getElementById("analysisSection");
const irradianceContent = document.getElementById("irradianceContent");
const analysisContent = document.getElementById("analysisContent");
const irradianceSummary = document.getElementById("irradianceSummary");
const analysisSummary = document.getElementById("analysisSummary");
const csvLinkRow = document.getElementById("csvLinkRow");
const topTableBody = document.querySelector("#topTable tbody");
const objectiveSelect = document.getElementById("objectiveSelect");
const objectiveMetricHeader = document.getElementById("objectiveMetricHeader");
const heightMinInput = document.getElementById("heightMin");
const heightMaxInput = document.getElementById("heightMax");
const heightStepInput = document.getElementById("heightStep");
const tiltMinInput = document.getElementById("tiltMin");
const tiltMaxInput = document.getElementById("tiltMax");
const tiltStepInput = document.getElementById("tiltStep");
const albedoMinInput = document.getElementById("albedoMin");
const albedoMaxInput = document.getElementById("albedoMax");
const albedoStepInput = document.getElementById("albedoStep");
const albedoSingleInput = document.getElementById("albedoSingle");
const albedoModeSelect = document.getElementById("albedoModeSelect");
const albedoPresetSelect = document.getElementById("albedoPresetSelect");
const albedoPresetLabel = document.getElementById("albedoPresetLabel");
const albedoSingleLabel = document.getElementById("albedoSingleLabel");
const albedoMinLabel = document.getElementById("albedoMinLabel");
const albedoMaxLabel = document.getElementById("albedoMaxLabel");
const albedoStepLabel = document.getElementById("albedoStepLabel");

/* ─── Config ─── */
const API_BASE_URL = (window.localStorage.getItem("pvApiBaseUrl") || "http://localhost:4000").replace(/\/$/, "");
const REQUEST_TIMEZONE = "IST";

let irradianceChart = null;
let rankingChart = null;
let ivChart = null;
let pvChart = null;
let latestAnalysisData = null;

const CHART_COLORS = ["#4f46e5", "#0891b2", "#f59e0b", "#ef4444", "#8b5cf6"];

const OBJECTIVE_META = {
  energy: { label: "Max Energy (kWh)", metricLabel: "Total Energy (kWh)", metricKey: "totalEnergyKWh", digits: 4 },
  rearGain: { label: "Max Rear Gain (%)", metricLabel: "Rear Gain (%)", metricKey: "rearGainPercent", digits: 4 },
  balanced: { label: "Balanced", metricLabel: "Balanced Score", metricKey: "balancedScore", digits: 2 },
  peakPower: { label: "Max Peak Power (kW)", metricLabel: "Peak Power (kW)", metricKey: "peakPowerKW", digits: 4 }
};

// map common surface type names to albedo values (2-decimal strings)
const ALBEDO_PRESETS_MAP = {
  "0.20": "Grass",
  "0.26": "Fresh grass",
  "0.30": "Concrete",
  "0.18": "Urban",
  "0.12": "Dry asphalt",
  "0.33": "Red tiles",
  "0.82": "Fresh snow",
  "0.65": "Wet snow",
  "0.85": "Aluminum",
  "0.35": "Galvanized steel"
};

function formatAlbedo(value) {
  const num = toNumber(value, null);
  if (!Number.isFinite(num)) return "-";
  const key = num.toFixed(2);
  // exact match first
  let name = ALBEDO_PRESETS_MAP[key];
  if (name) return `${name} (${key})`;
  // no exact match - find closest preset by numeric difference
  let closest = null;
  let closestDiff = Infinity;
  for (const k in ALBEDO_PRESETS_MAP) {
    const v = Number(k);
    if (!Number.isFinite(v)) continue;
    const d = Math.abs(v - num);
    if (d < closestDiff) {
      closestDiff = d;
      closest = k;
    }
  }
  if (closest !== null) {
    name = ALBEDO_PRESETS_MAP[closest];
    return `${name} (${num.toFixed(2)})`;
  }
  return key;
}

/* ─── Utilities ─── */
function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toOptionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundTo(value, digits = 3) {
  return Number(toNumber(value, 0).toFixed(digits));
}

function formatDateInput(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setInitialDates() {
  const nowUtc = new Date();
  const defaultUtcDay = new Date(Date.UTC(nowUtc.getUTCFullYear() - 1, nowUtc.getUTCMonth(), nowUtc.getUTCDate()));
  startDateInput.value = formatDateInput(defaultUtcDay);
  endDateInput.value = startDateInput.value;
  endDateInput.disabled = true;
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#dc2626" : "";
}

function setBusy(isBusy) {
  fetchIrradianceBtn.disabled = isBusy;
  runAnalysisBtn.disabled = isBusy;
}

function setVisible(el, show) { if (el) el.classList.toggle("is-hidden", !show); }
function summaryItem(label, value) {
  return `<div class="summary-item"><div class="k">${label}</div><div class="v">${value}</div></div>`;
}

function formatHourLabel(t) { return typeof t === "string" && t.length >= 16 ? t.slice(11, 16) : String(t || "-"); }
function formatValue(v, d = 4) { const p = Number(v); return Number.isFinite(p) ? p.toFixed(d) : "-"; }
function getObjectiveMode() { return objectiveSelect && OBJECTIVE_META[objectiveSelect.value] ? objectiveSelect.value : "energy"; }
function getObjectiveMeta(mode) { return OBJECTIVE_META[mode] || OBJECTIVE_META.energy; }

/* ─── Ranking ─── */
function getBaseRowsForRanking(data) {
  // chartData holds hourly points (used for plotting); it must *not* be used
  // for ranking because the structure is different and leads to incorrect
  // values in the table (e.g. average irradiance being shown as energy).
  // Always prefer configuration summaries when available.
  if (Array.isArray(data?.pureRankingTopConfigurations) && data.pureRankingTopConfigurations.length) {
    return data.pureRankingTopConfigurations;
  }
  if (Array.isArray(data?.topConfigurations) && data.topConfigurations.length) {
    return data.topConfigurations;
  }
  if (data?.optimalConfiguration) return [data.optimalConfiguration];
  // fall back to chartData only if no configuration summaries exist
  if (Array.isArray(data?.chartData) && data.chartData.length) return data.chartData;
  return [];
}

function getMinMax(rows, key) {
  let min = Infinity, max = -Infinity;
  for (const r of rows) { const v = toNumber(r[key], NaN); if (Number.isFinite(v)) { min = Math.min(min, v); max = Math.max(max, v); } }
  return Number.isFinite(min) ? { min, span: Math.max(1e-9, max - min) } : { min: 0, span: 1 };
}

function normalizeRow(row) {
  return {
    ...row,
    configurationId: row?.configurationId || `H${toNumber(row?.heightCm)}_T${toNumber(row?.tiltDeg)}_A${toNumber(row?.albedo)}`,
    heightCm: toNumber(row?.heightCm, 0),
    tiltDeg: toNumber(row?.tiltDeg, 0),
    albedo: toNumber(row?.albedo, 0),
    totalEnergyKWh: toNumber(row?.totalEnergyKWh, 0),
    peakPowerKW: toNumber(row?.peakPowerKW, 0),
    rearGainPercent: toNumber(row?.rearGainPercent, 0),
    frontSharePercent: toOptionalNumber(row?.frontSharePercent)
  };
}

function rankRowsByObjective(rows, mode) {
  const normalized = rows.map(normalizeRow);

  if (mode === "balanced") {
    const en = getMinMax(normalized, "totalEnergyKWh");
    const rn = getMinMax(normalized, "rearGainPercent");
    const pn = getMinMax(normalized, "peakPowerKW");
    normalized.forEach((r) => {
      const score = 0.5 * ((r.totalEnergyKWh - en.min) / en.span)
                  + 0.3 * ((r.rearGainPercent - rn.min) / rn.span)
                  + 0.2 * ((r.peakPowerKW - pn.min) / pn.span);
      r.objectiveSortValue = score;
      r.balancedScore = score * 100;
      r.objectiveValue = r.balancedScore;
    });
  } else {
    const key = getObjectiveMeta(mode).metricKey;
    normalized.forEach((r) => { r.objectiveSortValue = toNumber(r[key], 0); r.objectiveValue = r.objectiveSortValue; });
  }

  normalized.sort((a, b) => b.objectiveSortValue - a.objectiveSortValue || b.totalEnergyKWh - a.totalEnergyKWh || b.peakPowerKW - a.peakPowerKW || b.rearGainPercent - a.rearGainPercent);
  return normalized.map((r, i) => ({ ...r, rank: i + 1 }));
}

/* ─── Render Functions ─── */
function renderIrradianceSummary(data) {
  const s = data.summary || {}, loc = data.location || {}, dr = data.dateRange || {}, src = data.source || {};
  irradianceSummary.innerHTML = [
    summaryItem("Location", loc.name || "-"),
    summaryItem("Date", `${dr.startDate || "-"} → ${dr.endDate || "-"}`),
    summaryItem("Timezone", loc.timezone || "-"),
    summaryItem("Hours", s.hours ?? "-"),
    summaryItem("Total GHI (Wh/m²)", s.totalGhiWhM2 ?? "-"),
    summaryItem("Avg Irradiance (W/m²)", s.averageEquivalentGhiWm2 ?? s.averageGhiWm2 ?? "-"),
    summaryItem("Peak GHI (Wh/m²)", s.peakGhiWhM2 ?? s.peakGhiWm2 ?? "-")
  ].join("");
  csvLinkRow.innerHTML = src?.csvUrl ? `NASA CSV: <a href="${src.csvUrl}" target="_blank" rel="noreferrer">Download</a>` : "";
}

function renderAnalysisSummary(data, mode, winner) {
  const obj = getObjectiveMeta(mode);
  const w = winner || data?.optimalConfiguration || {};
  analysisSummary.innerHTML = [
    summaryItem("Engine", data.engine || data.source || "-"),
    summaryItem("Objective", obj.label),
    summaryItem("Combinations", data.combinationsTested ?? "-"),
    summaryItem("Optimal Height", `${w.heightCm ?? "-"} cm`),
    summaryItem("Optimal Tilt", `${w.tiltDeg ?? "-"}°`),
    summaryItem("Albedo", formatAlbedo(w.albedo)),
    summaryItem("Energy (kWh)", w.totalEnergyKWh ?? "-"),
    summaryItem("Peak (kW)", w.peakPowerKW ?? "-"),
    summaryItem("Rear Gain", `${w.rearGainPercent ?? "-"}%`)
  ].join("");
}

function renderTopTable(rows, mode) {
  const obj = getObjectiveMeta(mode);
  if (objectiveMetricHeader) objectiveMetricHeader.textContent = obj.metricLabel;
  topTableBody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    // note: header does not include a front-share column, so we omit it here
    tr.innerHTML = `<td>${r.rank}</td><td>${r.heightCm}</td><td>${r.tiltDeg}</td><td>${formatAlbedo(r.albedo)}</td><td>${r.totalEnergyKWh}</td><td>${r.peakPowerKW}</td><td>${r.rearGainPercent}</td><td>${formatValue(r.objectiveValue, obj.digits)}</td>`;
    topTableBody.appendChild(tr);
  });
}

/* ─── Charts ─── */
function renderIrradianceChart(hourly) {
  const labels = hourly.map((p) => formatHourLabel(p.time));
  const points = hourly.map((p) => p.ghiWhM2 ?? p.ghiWm2);
  if (irradianceChart) irradianceChart.destroy();
  irradianceChart = new Chart(document.getElementById("irradianceChart"), {
    type: "line",
    data: { labels, datasets: [{ label: "GHI (Wh/m²)", data: points, borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,0.1)", fill: true, tension: 0.3, pointRadius: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxTicksLimit: 10 } }, y: { beginAtZero: true } } }
  });
}

function renderRankingChart(rows, mode) {
  const obj = getObjectiveMeta(mode);
  const top = rows.slice(0, 10);
  if (rankingChart) rankingChart.destroy();
  rankingChart = new Chart(document.getElementById("rankingChart"), {
    type: "bar",
    data: { labels: top.map((r) => r.configurationId), datasets: [{ label: obj.metricLabel, data: top.map((r) => toNumber(r.objectiveValue, 0)), backgroundColor: "#0891b2", borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { maxRotation: 55, minRotation: 25 } }, y: { beginAtZero: true } } }
  });
}

function getColor(i, a = 1) {
  const hex = CHART_COLORS[i % CHART_COLORS.length];
  if (a >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function getDash(i) { return [[], [8, 4], [3, 3], [10, 3, 2, 3], [2, 3, 8, 3]][i % 5]; }

function renderIvPvCharts(curves) {
  if (ivChart) { ivChart.destroy(); ivChart = null; }
  if (pvChart) { pvChart.destroy(); pvChart = null; }
  const sel = [...(curves || [])].sort((a, b) => (a.energyRank || 9999) - (b.energyRank || 9999)).slice(0, 5);
  if (!sel.length) return;

  function lbl(c) {
    const r = Number(c.estimatedParameters?.energyRatioToBest);
    return Number.isFinite(r) ? `Rank ${c.energyRank || "-"} (${Math.round(r * 100)}%)` : `Rank ${c.energyRank || "-"}`;
  }

  const ivLine = sel.map((c, i) => ({ label: lbl(c), data: (c.ivCurve || []).map((p) => ({ x: p.voltageV, y: p.currentA })), parsing: false, borderColor: getColor(i), backgroundColor: getColor(i, 0.12), borderDash: getDash(i), borderWidth: 2, tension: 0.2, pointRadius: 0 }));
  const ivMpp = sel.map((c, i) => ({ type: "scatter", label: `${lbl(c)} MPP`, data: [{ x: c.estimatedParameters?.vmppV ?? 0, y: c.estimatedParameters?.imppA ?? 0 }], parsing: false, borderColor: getColor(i), backgroundColor: getColor(i), pointRadius: 4, showLine: false }));
  const pvLine = sel.map((c, i) => ({ label: lbl(c), data: (c.pvCurve || []).map((p) => ({ x: p.voltageV, y: p.powerKW })), parsing: false, borderColor: getColor(i), backgroundColor: getColor(i, 0.12), borderDash: getDash(i), borderWidth: 2, tension: 0.2, pointRadius: 0 }));
  const pvMpp = sel.map((c, i) => ({ type: "scatter", label: `${lbl(c)} MPP`, data: [{ x: c.estimatedParameters?.vmppV ?? 0, y: c.estimatedParameters?.pmppKW ?? 0 }], parsing: false, borderColor: getColor(i), backgroundColor: getColor(i), pointRadius: 4, showLine: false }));

  ivChart = new Chart(document.getElementById("ivChart"), { type: "line", data: { datasets: [...ivLine, ...ivMpp] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: "linear", title: { display: true, text: "Voltage (V)" } }, y: { beginAtZero: true, title: { display: true, text: "Current (A)" } } } } });
  pvChart = new Chart(document.getElementById("pvChart"), { type: "line", data: { datasets: [...pvLine, ...pvMpp] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: "linear", title: { display: true, text: "Voltage (V)" } }, y: { beginAtZero: true, title: { display: true, text: "Power (kW)" } } } } });
}

/* ─── Objective View ─── */
function applyObjectiveView() {
  if (!latestAnalysisData) return;
  const mode = getObjectiveMode();
  const ranked = rankRowsByObjective(getBaseRowsForRanking(latestAnalysisData), mode);
  renderAnalysisSummary(latestAnalysisData, mode, ranked[0] || null);
  renderRankingChart(ranked, mode);
  renderTopTable(ranked.slice(0, 10), mode);
}

/* ─── Payload Builders ─── */
function getBasePayload() {
  const selectedDay = startDateInput.value || endDateInput.value;
  endDateInput.value = selectedDay;
  return { location: locationInput.value.trim(), startDate: selectedDay, endDate: selectedDay, timezone: REQUEST_TIMEZONE };
}

function getAlbedoMode() { return albedoModeSelect?.value === "sweep" ? "sweep" : "single"; }

function applyAlbedoPreset() {
  if (!albedoPresetSelect || !albedoSingleInput || getAlbedoMode() !== "single") return;
  const v = albedoPresetSelect.value;
  if (v === "custom") { albedoSingleInput.disabled = false; return; }
  const n = Number(v);
  if (Number.isFinite(n)) { albedoSingleInput.value = n.toFixed(2); albedoSingleInput.disabled = true; }
  else albedoSingleInput.disabled = false;
}

function applyAlbedoMode() {
  const sweep = getAlbedoMode() === "sweep";
  setVisible(albedoPresetLabel, !sweep);
  setVisible(albedoSingleLabel, !sweep);
  setVisible(albedoMinLabel, sweep);
  setVisible(albedoMaxLabel, sweep);
  setVisible(albedoStepLabel, sweep);
  if (!sweep) applyAlbedoPreset();
}

function getRangesPayload() {
  const albedo = getAlbedoMode() === "sweep"
    ? { min: Number(albedoMinInput.value), max: Number(albedoMaxInput.value), step: Number(albedoStepInput.value) }
    : (() => { const s = Number(albedoSingleInput.value); return { min: s, max: s, step: 0.01 }; })();
  return {
    heightCm: { min: Number(heightMinInput.value), max: Number(heightMaxInput.value), step: Number(heightStepInput.value) },
    tiltDeg: { min: Number(tiltMinInput.value), max: Number(tiltMaxInput.value), step: Number(tiltStepInput.value) },
    albedo
  };
}

/* ─── API Calls ─── */
async function postJson(url, body) {
  const fullUrl = `${API_BASE_URL}${url}`;
  let res;
  try {
    res = await fetch(fullUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (err) {
    console.error("Network error during fetch", fullUrl, err);
    throw new Error(`Network error contacting ${fullUrl}: ${err.message}`);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && data.success === false)) {
    throw new Error((data && data.message) || `Request failed (${res.status})`);
  }
  return data ? data.data : null;
}

async function handleFetchIrradiance() {
  try {
    setBusy(true); setStatus("Fetching irradiance...");
    const data = await postJson("/api/simulation/irradiance", getBasePayload());
    setVisible(irradianceSection, true); setVisible(irradianceContent, true);
    renderIrradianceSummary(data); renderIrradianceChart(data.hourly || []);
    setStatus("Irradiance loaded.");
  } catch (e) { setStatus(e.message, true); } finally { setBusy(false); }
}

async function handleRunAnalysis() {
  try {
    setBusy(true); setStatus("Running analysis...");
    const data = await postJson("/api/simulation/analyze", { ...getBasePayload(), ranges: getRangesPayload(), useMatlab: useMatlabInput.checked, strictMatlab: strictMatlabInput.checked });
    latestAnalysisData = data;
    setVisible(analysisSection, true); setVisible(analysisContent, true);
    renderIvPvCharts(data.ivPvCurves || []); applyObjectiveView();
    setStatus(`Analysis done — ${data.engine || data.source}.`);
  } catch (e) { setStatus(e.message, true); } finally { setBusy(false); }
}

/* ─── Event Listeners ─── */
fetchIrradianceBtn.addEventListener("click", handleFetchIrradiance);
runAnalysisBtn.addEventListener("click", handleRunAnalysis);
startDateInput.addEventListener("change", () => { endDateInput.value = startDateInput.value; });
if (objectiveSelect) objectiveSelect.addEventListener("change", applyObjectiveView);
if (albedoPresetSelect) albedoPresetSelect.addEventListener("change", applyAlbedoPreset);
if (albedoModeSelect) albedoModeSelect.addEventListener("change", applyAlbedoMode);

/* ─── Init ─── */
locationInput.value = "Greater Noida";
setInitialDates();
applyAlbedoMode();
applyAlbedoPreset();
setVisible(irradianceSection, false);
setVisible(analysisSection, false);
setVisible(irradianceContent, false);
setVisible(analysisContent, false);
