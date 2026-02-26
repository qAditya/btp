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

const API_BASE_URL = (window.localStorage.getItem("pvApiBaseUrl") || "http://localhost:4000").replace(/\/$/, "");
const REQUEST_TIMEZONE = "IST";

let irradianceChart = null;
let rankingChart = null;
let ivChart = null;
let pvChart = null;
let latestAnalysisData = null;

const CHART_COLORS = ["#1f6feb", "#0ea5a5", "#f59e0b", "#dc2626", "#6d28d9"];

const OBJECTIVE_META = {
  energy: {
    label: "Max Energy (kWh)",
    metricLabel: "Total Energy (kWh)",
    metricKey: "totalEnergyKWh",
    digits: 4
  },
  rearGain: {
    label: "Max Rear Gain (%)",
    metricLabel: "Rear Gain (%)",
    metricKey: "rearGainPercent",
    digits: 4
  },
  balanced: {
    label: "Balanced",
    metricLabel: "Balanced Score",
    metricKey: "balancedScore",
    digits: 2
  },
  peakPower: {
    label: "Max Peak Power (kW)",
    metricLabel: "Peak Power (kW)",
    metricKey: "peakPowerKW",
    digits: 4
  }
};

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
  const defaultUtcDay = new Date(
    Date.UTC(nowUtc.getUTCFullYear() - 1, nowUtc.getUTCMonth(), nowUtc.getUTCDate())
  );
  const selectedDay = formatDateInput(defaultUtcDay);

  startDateInput.value = selectedDay;
  endDateInput.value = selectedDay;
  endDateInput.disabled = true;
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? "#b42318" : "#6b7a8c";
}

function setBusy(isBusy) {
  fetchIrradianceBtn.disabled = isBusy;
  runAnalysisBtn.disabled = isBusy;
}

function setSectionVisible(sectionElement, isVisible) {
  if (!sectionElement) {
    return;
  }

  sectionElement.classList.toggle("is-hidden", !isVisible);
}

function summaryItem(label, value) {
  return `<div class="summary-item"><div class="k">${label}</div><div class="v">${value}</div></div>`;
}

function formatHourLabel(timeValue) {
  if (typeof timeValue !== "string" || timeValue.length < 16) {
    return String(timeValue || "-");
  }
  return timeValue.slice(11, 16);
}

function formatValue(value, digits = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return parsed.toFixed(digits);
}

function getObjectiveMode() {
  if (objectiveSelect && OBJECTIVE_META[objectiveSelect.value]) {
    return objectiveSelect.value;
  }
  return "energy";
}

function getObjectiveMeta(mode) {
  return OBJECTIVE_META[mode] || OBJECTIVE_META.energy;
}

function getBaseRowsForRanking(data) {
  // Rank against the full sweep whenever available.
  if (Array.isArray(data?.chartData) && data.chartData.length > 0) {
    return data.chartData;
  }

  if (
    Array.isArray(data?.pureRankingTopConfigurations) &&
    data.pureRankingTopConfigurations.length > 0
  ) {
    return data.pureRankingTopConfigurations;
  }

  if (Array.isArray(data?.topConfigurations) && data.topConfigurations.length > 0) {
    return data.topConfigurations;
  }

  if (data?.optimalConfiguration) {
    return [data.optimalConfiguration];
  }

  return [];
}

function getMinMax(rows, key) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const value = toNumber(row[key], NaN);
    if (!Number.isFinite(value)) {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, span: 1 };
  }

  return { min, span: Math.max(1e-9, max - min) };
}

function normalizeRow(row) {
  return {
    ...row,
    configurationId:
      row?.configurationId ||
      `H${toNumber(row?.heightCm)}_T${toNumber(row?.tiltDeg)}_A${toNumber(row?.albedo)}`,
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
    const energyNorm = getMinMax(normalized, "totalEnergyKWh");
    const rearNorm = getMinMax(normalized, "rearGainPercent");
    const peakNorm = getMinMax(normalized, "peakPowerKW");

    normalized.forEach((row) => {
      const e = (row.totalEnergyKWh - energyNorm.min) / energyNorm.span;
      const r = (row.rearGainPercent - rearNorm.min) / rearNorm.span;
      const p = (row.peakPowerKW - peakNorm.min) / peakNorm.span;
      const score = 0.5 * e + 0.3 * r + 0.2 * p;
      row.objectiveSortValue = score;
      row.balancedScore = score * 100;
      row.objectiveValue = row.balancedScore;
    });
  } else {
    const key = getObjectiveMeta(mode).metricKey;
    normalized.forEach((row) => {
      row.objectiveSortValue = toNumber(row[key], 0);
      row.objectiveValue = row.objectiveSortValue;
    });
  }

  normalized.sort((left, right) => {
    if (right.objectiveSortValue !== left.objectiveSortValue) {
      return right.objectiveSortValue - left.objectiveSortValue;
    }
    if (right.totalEnergyKWh !== left.totalEnergyKWh) {
      return right.totalEnergyKWh - left.totalEnergyKWh;
    }
    if (right.peakPowerKW !== left.peakPowerKW) {
      return right.peakPowerKW - left.peakPowerKW;
    }
    return right.rearGainPercent - left.rearGainPercent;
  });

  return normalized.map((row, index) => ({
    ...row,
    rank: index + 1
  }));
}

function renderIrradianceSummary(data) {
  const summary = data.summary || {};
  const location = data.location || {};
  const dateRange = data.dateRange || {};
  const source = data.source || {};

  irradianceSummary.innerHTML = [
    summaryItem("Location", location.name || "-"),
    summaryItem("Date Range", `${dateRange.startDate || "-"} to ${dateRange.endDate || "-"}`),
    summaryItem("Timezone", location.timezone || "-"),
    summaryItem("Hours", summary.hours ?? "-"),
    summaryItem("Source Unit", source.rawUnit || "-"),
    summaryItem("Normalized Hourly Unit", source.normalizedHourlyUnit || "Wh/m^2"),
    summaryItem("Total GHI (Wh/m2)", summary.totalGhiWhM2 ?? "-"),
    summaryItem(
      "Avg Irradiance Equiv. (W/m2)",
      summary.averageEquivalentGhiWm2 ?? summary.averageGhiWm2 ?? "-"
    ),
    summaryItem("Peak Hourly GHI (Wh/m2)", summary.peakGhiWhM2 ?? summary.peakGhiWm2 ?? "-")
  ].join("");

  if (data.source?.csvUrl) {
    csvLinkRow.innerHTML = `NASA CSV: <a href="${data.source.csvUrl}" target="_blank" rel="noreferrer">Open / Download</a>`;
  } else {
    csvLinkRow.textContent = "";
  }
}

function renderAnalysisSummary(data, mode, winnerRow) {
  const objective = getObjectiveMeta(mode);
  const winner = winnerRow || data?.optimalConfiguration || {};
  const strategy = data.rankingStrategy?.mode || "energy-rank";

  analysisSummary.innerHTML = [
    summaryItem("Engine", data.engine || data.source || "-"),
    summaryItem("Ranking Mode", strategy),
    summaryItem("Objective", objective.label),
    summaryItem("Combinations", data.combinationsTested ?? "-"),
    summaryItem("Height (cm)", winner.heightCm ?? "-"),
    summaryItem("Tilt (deg)", winner.tiltDeg ?? "-"),
    summaryItem("Albedo", winner.albedo ?? "-"),
    summaryItem("Energy (kWh)", winner.totalEnergyKWh ?? "-"),
    summaryItem("Peak (kW)", winner.peakPowerKW ?? "-"),
    summaryItem("Rear Gain (%)", winner.rearGainPercent ?? "-"),
    summaryItem("Config ID", winner.configurationId || "-")
  ].join("");
}

function renderTopTable(rows, mode) {
  const objective = getObjectiveMeta(mode);
  if (objectiveMetricHeader) {
    objectiveMetricHeader.textContent = objective.metricLabel;
  }

  topTableBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.rank}</td>
      <td>${row.heightCm}</td>
      <td>${row.tiltDeg}</td>
      <td>${row.albedo}</td>
      <td>${row.totalEnergyKWh}</td>
      <td>${row.peakPowerKW}</td>
      <td>${row.rearGainPercent}</td>
      <td>${Number.isFinite(row.frontSharePercent) ? row.frontSharePercent : "-"}</td>
      <td>${formatValue(row.objectiveValue, objective.digits)}</td>
    `;
    topTableBody.appendChild(tr);
  });
}

function renderIrradianceChart(hourly) {
  const labels = hourly.map((point) => formatHourLabel(point.time));
  const points = hourly.map((point) => point.ghiWhM2 ?? point.ghiWm2);

  if (irradianceChart) {
    irradianceChart.destroy();
  }

  irradianceChart = new Chart(document.getElementById("irradianceChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Hourly GHI (Wh/m2)",
          data: points,
          borderColor: "#1f6feb",
          backgroundColor: "rgba(31, 111, 235, 0.2)",
          tension: 0.2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxTicksLimit: 10 } },
        y: { beginAtZero: true }
      }
    }
  });
}

function renderRankingChart(rows, mode) {
  const objective = getObjectiveMeta(mode);
  const top = rows.slice(0, 10);
  const labels = top.map((row) => row.configurationId);
  const values = top.map((row) => toNumber(row.objectiveValue, 0));

  if (rankingChart) {
    rankingChart.destroy();
  }

  rankingChart = new Chart(document.getElementById("rankingChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: objective.metricLabel,
          data: values,
          backgroundColor: "#0ea5a5"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { maxRotation: 60, minRotation: 30 } },
        y: { beginAtZero: true }
      }
    }
  });
}

function getColor(index, alpha = 1) {
  const hex = CHART_COLORS[index % CHART_COLORS.length];
  if (alpha >= 1) {
    return hex;
  }

  const safeAlpha = Math.max(0, Math.min(1, alpha));
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${safeAlpha})`;
}

function getDashPattern(index) {
  const patterns = [[], [8, 4], [3, 3], [10, 3, 2, 3], [2, 3, 8, 3]];
  return patterns[index % patterns.length];
}

function renderIvPvCharts(curves) {
  if (ivChart) {
    ivChart.destroy();
    ivChart = null;
  }

  if (pvChart) {
    pvChart.destroy();
    pvChart = null;
  }

  const selectedCurves = [...(curves || [])]
    .sort((left, right) => (left.energyRank || 9999) - (right.energyRank || 9999))
    .slice(0, 5);
  if (selectedCurves.length === 0) {
    return;
  }

  function buildCurveLabel(curve) {
    const rankText = curve.legendLabel || `Rank ${curve.energyRank || "-"}`;
    const ratio = Number(curve.estimatedParameters?.energyRatioToBest);
    if (Number.isFinite(ratio)) {
      return `${rankText} (${Math.round(ratio * 100)}% of best)`;
    }
    return `${rankText} (${curve.configurationId})`;
  }

  const ivLineDatasets = selectedCurves.map((curve, index) => ({
    label: buildCurveLabel(curve),
    data: (curve.ivCurve || []).map((point) => ({ x: point.voltageV, y: point.currentA })),
    parsing: false,
    borderColor: getColor(index, 1),
    backgroundColor: getColor(index, 0.14),
    borderDash: getDashPattern(index),
    borderWidth: 2.2,
    tension: 0.2,
    pointRadius: 0
  }));

  const ivMppDatasets = selectedCurves.map((curve, index) => ({
    type: "scatter",
    label: `${buildCurveLabel(curve)} MPP`,
    data: [
      {
        x: curve.estimatedParameters?.vmppV ?? 0,
        y: curve.estimatedParameters?.imppA ?? 0
      }
    ],
    parsing: false,
    borderColor: getColor(index, 1),
    backgroundColor: getColor(index, 1),
    pointRadius: 4,
    pointHoverRadius: 5,
    showLine: false
  }));

  const pvLineDatasets = selectedCurves.map((curve, index) => ({
    label: buildCurveLabel(curve),
    data: (curve.pvCurve || []).map((point) => ({ x: point.voltageV, y: point.powerKW })),
    parsing: false,
    borderColor: getColor(index, 1),
    backgroundColor: getColor(index, 0.14),
    borderDash: getDashPattern(index),
    borderWidth: 2.2,
    tension: 0.2,
    pointRadius: 0
  }));

  const pvMppDatasets = selectedCurves.map((curve, index) => ({
    type: "scatter",
    label: `${buildCurveLabel(curve)} MPP`,
    data: [
      {
        x: curve.estimatedParameters?.vmppV ?? 0,
        y: curve.estimatedParameters?.pmppKW ?? 0
      }
    ],
    parsing: false,
    borderColor: getColor(index, 1),
    backgroundColor: getColor(index, 1),
    pointRadius: 4,
    pointHoverRadius: 5,
    showLine: false
  }));

  ivChart = new Chart(document.getElementById("ivChart"), {
    type: "line",
    data: { datasets: [...ivLineDatasets, ...ivMppDatasets] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: "linear", title: { display: true, text: "Voltage (V)" } },
        y: { beginAtZero: true, title: { display: true, text: "Current (A)" } }
      }
    }
  });

  pvChart = new Chart(document.getElementById("pvChart"), {
    type: "line",
    data: { datasets: [...pvLineDatasets, ...pvMppDatasets] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: "linear", title: { display: true, text: "Voltage (V)" } },
        y: { beginAtZero: true, title: { display: true, text: "Power (kW)" } }
      }
    }
  });
}

function applyObjectiveView() {
  if (!latestAnalysisData) {
    return;
  }

  const mode = getObjectiveMode();
  const baseRows = getBaseRowsForRanking(latestAnalysisData);
  const rankedRows = rankRowsByObjective(baseRows, mode);
  const winner = rankedRows[0] || latestAnalysisData.optimalConfiguration || null;

  renderAnalysisSummary(latestAnalysisData, mode, winner);
  renderRankingChart(rankedRows, mode);
  renderTopTable(rankedRows.slice(0, 10), mode);
}

function getBasePayload() {
  const selectedDay = startDateInput.value || endDateInput.value;
  endDateInput.value = selectedDay;

  return {
    location: locationInput.value.trim(),
    startDate: selectedDay,
    endDate: selectedDay,
    timezone: REQUEST_TIMEZONE
  };
}

function setVisible(element, isVisible) {
  if (!element) {
    return;
  }
  element.classList.toggle("is-hidden", !isVisible);
}

function getAlbedoMode() {
  return albedoModeSelect?.value === "sweep" ? "sweep" : "single";
}

function applyAlbedoPreset() {
  if (!albedoPresetSelect || !albedoSingleInput || getAlbedoMode() !== "single") {
    return;
  }

  const presetValue = albedoPresetSelect.value;
  if (presetValue === "custom") {
    albedoSingleInput.disabled = false;
    return;
  }

  const albedoValue = Number(presetValue);
  if (!Number.isFinite(albedoValue)) {
    albedoSingleInput.disabled = false;
    return;
  }

  albedoSingleInput.value = albedoValue.toFixed(2);
  albedoSingleInput.disabled = true;
}

function applyAlbedoMode() {
  const isSweep = getAlbedoMode() === "sweep";

  setVisible(albedoPresetLabel, !isSweep);
  setVisible(albedoSingleLabel, !isSweep);
  setVisible(albedoMinLabel, isSweep);
  setVisible(albedoMaxLabel, isSweep);
  setVisible(albedoStepLabel, isSweep);

  if (!isSweep) {
    applyAlbedoPreset();
  }
}

function getRangesPayload() {
  const albedoRange =
    getAlbedoMode() === "sweep"
      ? {
          min: Number(albedoMinInput.value),
          max: Number(albedoMaxInput.value),
          step: Number(albedoStepInput.value)
        }
      : (() => {
          const single = Number(albedoSingleInput.value);
          return {
            min: single,
            max: single,
            step: 0.01
          };
        })();

  return {
    heightCm: {
      min: Number(heightMinInput.value),
      max: Number(heightMaxInput.value),
      step: Number(heightStepInput.value)
    },
    tiltDeg: {
      min: Number(tiltMinInput.value),
      max: Number(tiltMaxInput.value),
      step: Number(tiltStepInput.value)
    },
    albedo: albedoRange
  };
}

async function postJson(url, body) {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || "Request failed");
  }

  return payload.data;
}

async function handleFetchIrradiance() {
  try {
    setBusy(true);
    setStatus("Fetching irradiance...");
    const payload = getBasePayload();
    const data = await postJson("/api/simulation/irradiance", payload);

    setSectionVisible(irradianceSection, true);
    setSectionVisible(irradianceContent, true);
    renderIrradianceSummary(data);
    renderIrradianceChart(data.hourly || []);
    setStatus("Irradiance loaded.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function handleRunAnalysis() {
  try {
    setBusy(true);
    setStatus("Running analysis...");
    const payload = {
      ...getBasePayload(),
      ranges: getRangesPayload(),
      useMatlab: useMatlabInput.checked,
      strictMatlab: strictMatlabInput.checked
    };

    const data = await postJson("/api/simulation/analyze", payload);
    latestAnalysisData = data;

    setSectionVisible(analysisSection, true);
    setSectionVisible(analysisContent, true);
    renderIvPvCharts(data.ivPvCurves || []);
    applyObjectiveView();
    setStatus(`Analysis completed using ${data.engine || data.source}.`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(false);
  }
}

fetchIrradianceBtn.addEventListener("click", handleFetchIrradiance);
runAnalysisBtn.addEventListener("click", handleRunAnalysis);
startDateInput.addEventListener("change", () => {
  endDateInput.value = startDateInput.value;
});

if (objectiveSelect) {
  objectiveSelect.addEventListener("change", () => {
    applyObjectiveView();
  });
}

if (albedoPresetSelect) {
  albedoPresetSelect.addEventListener("change", () => {
    applyAlbedoPreset();
  });
}

if (albedoModeSelect) {
  albedoModeSelect.addEventListener("change", () => {
    applyAlbedoMode();
  });
}

locationInput.value = "Greater Noida";
setInitialDates();
applyAlbedoMode();
applyAlbedoPreset();
setSectionVisible(irradianceSection, false);
setSectionVisible(analysisSection, false);
setSectionVisible(irradianceContent, false);
setSectionVisible(analysisContent, false);
