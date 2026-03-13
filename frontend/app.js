// ─── DOM ELEMENTS ───
const locationInput = document.getElementById('locationInput');
const startDateInput = document.getElementById('startDateInput');
const endDateInput = document.getElementById('endDateInput');

// Parameters
const heightMin = document.getElementById('heightMin');
const heightMax = document.getElementById('heightMax');
const heightStep = document.getElementById('heightStep');
const tiltMin = document.getElementById('tiltMin');
const tiltMax = document.getElementById('tiltMax');
const tiltStep = document.getElementById('tiltStep');
const azimuthDegInput = document.getElementById('azimuthDegInput');

const albedoModeSelect = document.getElementById('albedoModeSelect');
const albedoTiles = document.querySelectorAll('.albedo-tile');
const albedoSingle = document.getElementById('albedoSingle');
const albedoMin = document.getElementById('albedoMin');
const albedoMax = document.getElementById('albedoMax');
const albedoStep = document.getElementById('albedoStep');
const albedoPresetSelect = document.getElementById('albedoPresetSelect'); 

const ALBEDO_PRESETS = [
    { val: 0.18, name: 'Urban environment' },
    { val: 0.20, name: 'Grass' },
    { val: 0.26, name: 'Fresh grass' },
    { val: 0.82, name: 'Fresh snow' },
    { val: 0.65, name: 'Wet snow' },
    { val: 0.12, name: 'Dry asphalt' },
    { val: 0.1801, name: 'Wet asphalt' },
    { val: 0.30, name: 'Concrete' },
    { val: 0.33, name: 'Red tiles' },
    { val: 0.85, name: 'Aluminum' },
    { val: 0.74, name: 'Copper' },
    { val: 0.35, name: 'New galvanized steel' },
    { val: 0.08, name: 'Very dirty galvanized' }
];

function getSurfaceName(value) {
    const val = Number(value);
    if (!Number.isFinite(val)) return '-';
    
    // Find closest match
    let closest = ALBEDO_PRESETS[0];
    let minDiff = Math.abs(val - closest.val);
    
    for (const p of ALBEDO_PRESETS) {
        const diff = Math.abs(val - p.val);
        // Prefer exact matches if multiple (e.g. 0.18 for Urban vs Wet Asphalt)
        if (diff < minDiff) {
            minDiff = diff;
            closest = p;
        } else if (diff === minDiff && val === p.val) {
            // If duplicate value, stick to the one we found first unless specific logic needed
            // Actually, let's just pick the first one found or keep as is.
        }
    }
    
    if (minDiff < 0.01) return closest.name;
    return `${closest.name} (~${val})`;
}

// Advanced View Factor toggle (Visual Feedback)
const advancedViewFactorToggle = document.getElementById('advancedViewFactorToggle');
const vfDynamicFormulas = document.getElementById('vfDynamicFormulas');

const useMatlabInput = document.getElementById('useMatlabInput');
const strictMatlabInput = document.getElementById('strictMatlabInput');

const fetchIrradianceBtn = document.getElementById('fetchIrradianceBtn');
const runAnalysisBtn = document.getElementById('runAnalysisBtn');
const statusText = document.getElementById('statusText');
const loadingOverlay = document.getElementById('loadingOverlay');

const irradianceSection = document.getElementById('irradianceSection');
const irradianceContent = document.getElementById('irradianceContent');
const irradianceSummary = document.getElementById('irradianceSummary');
const csvLinkRow = document.getElementById('csvLinkRow');

const analysisSection = document.getElementById('analysisSection');
const analysisContent = document.getElementById('analysisContent');
const analysisSummary = document.getElementById('analysisSummary');
const objectiveSelect = document.getElementById('objectiveSelect');
const topTableBody = document.querySelector('#topTable tbody');
const objectiveMetricHeader = document.getElementById('objectiveMetricHeader');
const optimalConfigBanner = document.getElementById('optimalConfigBanner');

let irradianceChartInstance = null;
let rankingChartInstance = null;
let ivChartInstance = null;
let pvChartInstance = null;

let analysisResultsGlobal = [];
let currentOptimalConfig = null;

// Apply Dark Mission Control Chart Defaults globally
Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.font.family = "'Space Mono', monospace";

/* ─── Config ─── */
const API_BASE_URL = (window.localStorage.getItem("pvApiBaseUrl") || "http://localhost:4000").replace(/\/$/, "");

// Setup default dates — NASA POWER hourly data lags ~7 days,
// so default to the same day one year ago (guaranteed available).
const tzIST = { timeZone: "Asia/Kolkata" };
function formatDateInput(d) {
    const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, "0"), day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}
const nowUtc = new Date();
const defaultUtcDay = new Date(Date.UTC(nowUtc.getUTCFullYear() - 1, nowUtc.getUTCMonth(), nowUtc.getUTCDate()));
startDateInput.value = formatDateInput(defaultUtcDay);
endDateInput.value = startDateInput.value;

startDateInput.addEventListener("change", () => {
    endDateInput.value = startDateInput.value;
});

// Update display based on mode selection
if (albedoModeSelect) {
  albedoModeSelect.addEventListener('change', () => {
    const mode = albedoModeSelect.value;
    if (mode === 'single') {
        document.getElementById('albedoSingleLabel').classList.remove('is-hidden');
        document.getElementById('albedoPresetLabel').classList.remove('is-hidden');
        document.getElementById('albedoMinLabel').classList.add('is-hidden');
        document.getElementById('albedoMaxLabel').classList.add('is-hidden');
        document.getElementById('albedoStepLabel').classList.add('is-hidden');
    } else {
        document.getElementById('albedoSingleLabel').classList.add('is-hidden');
        document.getElementById('albedoPresetLabel').classList.add('is-hidden');
        document.getElementById('albedoMinLabel').classList.remove('is-hidden');
        document.getElementById('albedoMaxLabel').classList.remove('is-hidden');
        document.getElementById('albedoStepLabel').classList.remove('is-hidden');
    }
  });
}

// Albedo Visual Tiles logic
if (albedoTiles.length > 0) {
    albedoTiles.forEach(tile => {
        tile.addEventListener('click', () => {
            albedoTiles.forEach(t => t.classList.remove('active'));
            tile.classList.add('active');
            
            const val = tile.dataset.val;
            if (val !== 'custom') {
                if (albedoSingle) {
                    albedoSingle.value = val;
                    albedoSingle.disabled = false;
                }
                if (albedoPresetSelect) {
                    albedoPresetSelect.value = val;
                }
            } else {
                if (albedoSingle) {
                    albedoSingle.disabled = false;
                    albedoSingle.focus();
                }
            }
        });
    });

    if (albedoSingle) {
        albedoSingle.addEventListener('input', () => {
            albedoTiles.forEach(t => t.classList.remove('active'));
            const match = Array.from(albedoTiles).find(t => t.dataset.val === albedoSingle.value);
            if (match) {
                match.classList.add('active');
            } else {
                const customTile = document.querySelector('.albedo-tile[data-val="custom"]');
                if (customTile) customTile.classList.add('active');
            }
        });
    }
}


// View Factor UI feedback
if (advancedViewFactorToggle && vfDynamicFormulas) {
    advancedViewFactorToggle.addEventListener('change', () => {
        if (advancedViewFactorToggle.checked) {
            vfDynamicFormulas.classList.remove('is-hidden');
        } else {
            vfDynamicFormulas.classList.add('is-hidden');
        }
    });
}


// Show/Hide Overlay helper
function setLoading(isLoad) {
  if (loadingOverlay) {
      if(isLoad) {
          loadingOverlay.classList.remove('is-hidden');
      } else {
          loadingOverlay.classList.add('is-hidden');
      }
  }
}

function setStatus(msg, isError = false) {
    if (!statusText) return;
    statusText.textContent = msg;
    statusText.style.color = isError ? "var(--error)" : "var(--cyan)";
}


/* ─── Fetching Logic ─── */
function getBasePayload() {
    return {
        location: locationInput.value || "Greater Noida",
        startDate: startDateInput.value,
        endDate: endDateInput.value
    };
}

function getRangesPayload() {
    const albedo = (albedoModeSelect && albedoModeSelect.value === "sweep")
      ? { min: Number(albedoMin.value), max: Number(albedoMax.value), step: Number(albedoStep.value) }
      : (() => { const s = Number(albedoSingle.value); return { min: s, max: s, step: 0.01 }; })();
    return {
      heightCm: { min: Number(heightMin.value), max: Number(heightMax.value), step: Number(heightStep.value) },
      tiltDeg: { min: Number(tiltMin.value), max: Number(tiltMax.value), step: Number(tiltStep.value) },
      albedo
    };
}

function getPanelConfigPayload() {
    const azimuthDeg = Number(azimuthDegInput?.value);
    if (!Number.isFinite(azimuthDeg)) {
        return { azimuthDeg: 180 };
    }

    const normalized = ((azimuthDeg % 360) + 360) % 360;
    return { azimuthDeg: normalized };
}


async function postJson(url, body) {
    const fullUrl = `${API_BASE_URL}${url}`;
    const res = await fetch(fullUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || `Server fault: ${res.status}`);
    }
    const data = await res.json();
    if (data.status === "error" || data.success === false) throw new Error(data.message);
    return data ? data.data : null;
}
  

// ─── RENDERING ───

function formatHourLabel(iso) {
    if (!iso) return "";
    return iso.substring(11, 16);
}

function renderIrradianceChart(hourly) {
    if (!irradianceSection) return;
    const ctx = document.getElementById("irradianceChart").getContext("2d");
    if (irradianceChartInstance) irradianceChartInstance.destroy();
  
    const hours = hourly.map(p => formatHourLabel(p.time));
    const ghi = hourly.map(p => p.ghiWhM2 ?? p.ghiWm2);
  
    irradianceChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: hours,
        datasets: [
          { label: 'GHI', data: ghi, borderColor: '#f5a623', backgroundColor: 'rgba(245, 166, 35, 0.1)', borderWidth: 2, fill: true, tension: 0.1, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8 } },
        },
        scales: {
          x: { 
            title: { display: true, text: 'Hour of Day (IST)', color: '#94a3b8' }, 
            grid: { color: 'rgba(255,255,255,0.05)' } 
          },
          y: { 
            title: { display: true, text: 'Irradiance (W/m²)', color: '#94a3b8' }, 
            min: 0, 
            grid: { color: 'rgba(255,255,255,0.05)' } 
          }
        }
      }
    });
}
  
function renderIrradianceSummary(data) {
    if (!irradianceSummary) return;
    const s = data.summary || {};
    const totalKWh = ((s.totalGhiWhM2 || 0) / 1000).toFixed(2);
    irradianceSummary.innerHTML = `
      <div class="summary-item"><span class="k">Location</span><span class="v">${data.location?.name || "-"}</span></div>
      <div class="summary-item"><span class="k">Total GHI</span><span class="v">${totalKWh} kWh/m²</span></div>
      <div class="summary-item"><span class="k">Data Points</span><span class="v">${s.hours || "-"}</span></div>
      <div class="summary-item"><span class="k">Peak GHI</span><span class="v">${s.peakGhiWhM2 ?? "-"} Wh/m²</span></div>
    `;
    if (csvLinkRow) {
        csvLinkRow.innerHTML = data.source?.csvUrl 
            ? `NASA RAW DATA EXPORT: <a href="${data.source.csvUrl}" target="_blank" rel="noreferrer">DOWNLOAD CSV</a>` 
            : "";
    }
}
  
function renderRankingChart(top10, obj, metricLabel) {
    if (!document.getElementById("rankingChart")) return;
    const ctx = document.getElementById("rankingChart").getContext("2d");
    if (rankingChartInstance) rankingChartInstance.destroy();

    rankingChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: top10.map((r,i) => `Rank ${i+1}`),
        datasets: [{
          label: metricLabel,
          data: top10.map(r => {
            if (obj === 'energy') return r.totalEnergyKWh;
            if (obj === 'rearGain') return r.rearGainPercent;
            if (obj === 'peakPower') return r.peakPowerKW;
            return r.objectiveValue;
          }),
          backgroundColor: top10.map((_, i) => i === 0 ? '#f5a623' : '#00d4ff'),
          borderRadius: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { 
            title: { display: true, text: metricLabel, color: '#94a3b8' },
            grid: { color: 'rgba(255,255,255,0.05)' },
            beginAtZero: true
          },
          x: { grid: { display: false } }
        }
      }
    });
}

function renderIvPvCharts(curves) {
    if (ivChartInstance) { ivChartInstance.destroy(); ivChartInstance = null; }
    if (pvChartInstance) { pvChartInstance.destroy(); pvChartInstance = null; }
    
    if (!curves || curves.length === 0) return;
    
    // The backend provides curves in exactly the form needed.
    const sel = curves.slice(0, 5); // Take top 5
    const ivCtx = document.getElementById('ivChart')?.getContext('2d');
    const pvCtx = document.getElementById('pvChart')?.getContext('2d');
  
    const colors = ['#f5a623', '#00d4ff', '#8b5cf6', '#a78bfa', '#fcd34d'];
    const ivDatasets = [];
    const pvDatasets = [];
  
    sel.forEach((c, idx) => {
        const color = colors[idx % colors.length];
        
        // IV Line
        ivDatasets.push({
            label: `Rank ${c.energyRank}`,
            data: (c.ivCurve || []).map(p => ({ x: p.voltageV, y: p.currentA })),
            borderColor: color,
            backgroundColor: 'transparent',
            pointRadius: 0,
            tension: 0.1,
            borderWidth: 2
        });
        
        // IV MPP
        ivDatasets.push({
            label: `R${c.energyRank} MPP`,
            data: [{ x: c.estimatedParameters?.vmppV ?? 0, y: c.estimatedParameters?.imppA ?? 0 }],
            type: 'scatter',
            backgroundColor: '#fff',
            borderColor: color,
            pointBorderWidth: 2,
            pointStyle: 'circle',
            pointRadius: 6,
            showLine: false
        });

        // PV Line
        pvDatasets.push({
            label: `Rank ${c.energyRank}`,
            data: (c.pvCurve || []).map(p => ({ x: p.voltageV, y: p.powerKW })),
            borderColor: color,
            backgroundColor: idx === 0 ? 'rgba(245, 166, 35, 0.1)' : 'transparent',
            pointRadius: 0,
            tension: 0.1,
            borderWidth: 2,
            fill: idx === 0
        });

        // PV MPP
        pvDatasets.push({
            label: `R${c.energyRank} MPP`,
            data: [{ x: c.estimatedParameters?.vmppV ?? 0, y: c.estimatedParameters?.pmppKW ?? 0 }],
            type: 'scatter',
            backgroundColor: '#fff',
            borderColor: color,
            pointBorderWidth: 2,
            pointStyle: 'circle',
            pointRadius: 6,
            showLine: false
        });
    });
  
    if (ivCtx) {
        ivChartInstance = new Chart(ivCtx, {
            type: 'line',
            data: { datasets: ivDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8 } } },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Voltage (V)', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Current (A)', color: '#94a3b8' }, min: 0, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }

    if (pvCtx) {
        pvChartInstance = new Chart(pvCtx, {
            type: 'line',
            data: { datasets: pvDatasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, labels: { color: '#e2e8f0', usePointStyle: true, boxWidth: 8 } } },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'Voltage (V)', color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: { beginAtZero: true, title: { display: true, text: 'Power (kW)', color: '#94a3b8' }, min: 0, grid: { color: 'rgba(255,255,255,0.05)' } }
                }
            }
        });
    }
}


function getObjectiveMeta(mode) {
    if (mode === "energy") return { prop: "totalEnergyKWh", label: "Max Energy", metricLabel: "Energy (kWh)", desc: true, digits: 2 };
    if (mode === "rearGain") return { prop: "rearGainPercent", label: "Max Rear Gain", metricLabel: "Rear Gain (%)", desc: true, digits: 2 };
    if (mode === "peakPower") return { prop: "peakPowerKW", label: "Max Peak Power", metricLabel: "Peak Power (kW)", desc: true, digits: 2 };
    return { prop: "objectiveValue", label: "Balanced Score", metricLabel: "Balanced Score", desc: true, digits: 3 };
}

function getObjectiveMode() {
    return objectiveSelect ? objectiveSelect.value : "energy";
}

function rankRowsByObjective(rows, mode) {
    const list = [...rows];
    if (mode === "balanced") {
        list.forEach((r) => { r.objectiveValue = (r.totalEnergyKWh || 0) * (r.rearGainPercent || 0); });
        list.sort((a, b) => b.objectiveValue - a.objectiveValue);
    } else {
        const meta = getObjectiveMeta(mode);
        list.forEach((r) => { r.objectiveValue = r[meta.prop] || 0; });
        list.sort((a, b) => (meta.desc ? b.objectiveValue - a.objectiveValue : a.objectiveValue - b.objectiveValue));
    }
    list.forEach((r, idx) => { r.rank = idx + 1; });
    return list;
}

function getBaseRowsForRanking(data) {
    if (!data) return [];
    if (Array.isArray(data.chartData) && data.chartData.length > 0) return data.chartData;
    if (Array.isArray(data.topConfigurations) && data.topConfigurations.length > 0) return data.topConfigurations;
    if (Array.isArray(data.pureRankingTopConfigurations) && data.pureRankingTopConfigurations.length > 0) return data.pureRankingTopConfigurations;
    if (Array.isArray(data.results) && data.results.length > 0) return data.results;
    if (data.optimalConfiguration) return [data.optimalConfiguration];
    return [];
}
  

function renderAnalysisData(data, mode) {
    if (!analysisSection) return;
    
    // Sort logic handled via applyObjectiveView -> rankRowsByObjective usually, 
    // but just in case we are straight rendering:
    const objMeta = getObjectiveMeta(mode);
    const ranked = rankRowsByObjective(getBaseRowsForRanking(data), mode);
    
    analysisSection.classList.remove('is-hidden');
    analysisContent.classList.remove('is-hidden');
    
    if (ranked.length === 0) {
      if(analysisSummary) analysisSummary.innerHTML = '<p class="error cyan-text">No results returned from engine.</p>';
      return;
    }
  
    const top10 = ranked.slice(0, 10);
    const best = top10[0];
    
    // Update Hero Banner directly
    if (optimalConfigBanner) {
        currentOptimalConfig = best;
        optimalConfigBanner.classList.remove('is-hidden');
        document.getElementById('optHeight').textContent = `${best.heightCm ?? "-"} cm`;
        document.getElementById('optTilt').textContent = `${best.tiltDeg ?? "-"}°`;
        document.getElementById('optAlbedo').textContent = getSurfaceName(best.albedo);
        document.getElementById('optMetricVal').textContent = `${Number(best.rearGainPercent || 0).toFixed(2)}%`;
        document.getElementById('optMetricLbl').textContent = "REAR GAIN"; // Keep static as hero focus
    }
  
    // Summary widgets below
    if (analysisSummary) {
        analysisSummary.innerHTML = `
        <div class="summary-item"><span class="k">Eval Configs</span><span class="v">${data.combinationsTested || 1}</span></div>
        <div class="summary-item"><span class="k">Peak Rear Gain</span><span class="v">${Number(best.rearGainPercent||0).toFixed(1)}%</span></div>
        <div class="summary-item"><span class="k">Peak Energy</span><span class="v">${Number(best.totalEnergyKWh||0).toFixed(1)} kWh</span></div>
        <div class="summary-item"><span class="k">Compute Engine</span><span class="v">${data.engine || data.source || '-'}</span></div>
        `;
    }

    renderRankingChart(top10, mode, objMeta.metricLabel);
    
    // Table
    if (topTableBody) {
        if(objectiveMetricHeader) objectiveMetricHeader.textContent = objMeta.metricLabel;
        topTableBody.innerHTML = '';
        top10.forEach((r, idx) => {
            const tr = document.createElement('tr');
            if (idx === 0) tr.classList.add('rank-1-row');
            
            tr.innerHTML = `
            <td>#${idx+1}</td>
            <td>${r.heightCm}</td>
            <td>${r.tiltDeg}</td>
            <td>${getSurfaceName(r.albedo)}</td>
            <td>${Number(r.totalEnergyKWh||0).toFixed(5)}</td>
            <td>${Number(r.peakPowerKW||0).toFixed(5)}</td>
            <td style="color:var(--amber); font-weight:bold;">${Number(r.rearGainPercent||0).toFixed(4)}%</td>
            <td>${Number(r.objectiveValue||0).toFixed(5)}</td>
            `;
            topTableBody.appendChild(tr);
        });
    }

    renderIvPvCharts(data.ivPvCurves || []);
}


function applyObjectiveView() {
    if (!analysisResultsGlobal) return;
    const mode = getObjectiveMode();
    renderAnalysisData(analysisResultsGlobal, mode);
}


if (objectiveSelect) {
    objectiveSelect.addEventListener("change", applyObjectiveView);
}

// ─── Button Actions ───
  
if (fetchIrradianceBtn) {
    fetchIrradianceBtn.addEventListener('click', async () => {
        setStatus('TELEMETRY: FETCHING NASA POWER...');
        setLoading(true);
        try {
            const data = await postJson("/api/simulation/irradiance", getBasePayload());
            if (irradianceSection) irradianceSection.classList.remove('is-hidden');
            if (irradianceContent) irradianceContent.classList.remove('is-hidden');
            renderIrradianceSummary(data); 
            renderIrradianceChart(data.hourly || []);
            setStatus("TELEMETRY: SUCCESS");
        } catch (err) {
            console.error(err);
            setStatus(`SYSTEM FAULT: ${err.message}`, true);
        } finally {
            setLoading(false);
        }
    });
}
  
if (runAnalysisBtn) {
    runAnalysisBtn.addEventListener('click', async () => {
        setStatus('ENGINE: RUNNING BIFACIAL OPTIMIZATION...');
        setLoading(true);
        if (optimalConfigBanner) optimalConfigBanner.classList.add("is-hidden"); // hide until ready

        try {
            const data = await postJson("/api/simulation/analyze", { 
                ...getBasePayload(), 
                ranges: getRangesPayload(), 
                panelConfig: getPanelConfigPayload(),
                useMatlab: useMatlabInput?.checked || false, 
                strictMatlab: strictMatlabInput?.checked || false 
            });
            analysisResultsGlobal = data; // Keep for sorting
            applyObjectiveView();
            setStatus(`ENGINE SUCCESS: OPTIMIZATION COMPLETE (${data.combinationsTested} passes).`);
        } catch (err) {
            console.error(err);
            setStatus(`SYSTEM FAULT: ${err.message}`, true);
        } finally {
            setLoading(false);
        }
    });
}


/* ─── Optimization Refinement ─── */

let sweepChartInstance = null;
const varyAlbedoBtn = document.getElementById('varyAlbedoBtn');
const varyHeightBtn = document.getElementById('varyHeightBtn');
const varyTiltBtn = document.getElementById('varyTiltBtn');
const scenarioFixedTiltInput = document.getElementById('scenarioFixedTilt');
const scenarioFixedHeightInput = document.getElementById('scenarioFixedHeight');
const scenarioFixedAlbedoInput = document.getElementById('scenarioFixedAlbedo');
const sweepModal = document.getElementById('sweepModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const sweepSummary = document.getElementById('sweepSummary');
const sweepMetricSelect = document.getElementById('sweepMetricSelect');
const sweepAssumptions = document.getElementById('sweepAssumptions');

let currentSweepPoints = [];
let currentSweepParameter = 'albedo';

if (closeModalBtn && sweepModal) {
    closeModalBtn.addEventListener('click', () => {
        sweepModal.close();
    });
}

function renderRefinementChart(points, parameter) {
    const ctx = document.getElementById('sweepChart');
    if (!ctx) return;
    
    if (sweepChartInstance) {
        sweepChartInstance.destroy();
        sweepChartInstance = null;
    }

    const labelMap = {
        'albedo': 'Surface Type',
        'height': 'Panel Height from Ground (cm)',
        'tilt': 'Panel Tilt Angle (°)'
    };

    const metricMode = sweepMetricSelect?.value === 'uplift' ? 'uplift' : 'rearShare';
    const metricTitle =
        metricMode === 'uplift'
            ? 'Bifacial Uplift vs Front-only (%)'
            : 'Rear Share of Effective Irradiance (%)';

    // Determine Y-axis metric based on mode (if user asked for rear gain bar graph explicitly before, we keep it, 
    // but clearly label it. Or we can switch to Energy if that's what controls Optimality).
    // User complaint: "max must come at 30 right". 
    // This implies they expect the metric that DRIVES optimality (Energy) to be shown, 
    // OR they mistakenly think Rear Gain drives optimality.
    
    // Let's SHOW ENERGY on the main bars, and maybe Rear Gain as a line or tooltip?
    // User PROMPT said: "a bar graph rear gain% vs albedo". 
    // So I strictly followed that. 
    // But now for tilt they are confused.
    // Solution: Show BOTH or switch primary to Energy if parameter is Tilt/Height?
    // Let's stick to the requested "bar graph rear gain%" but add a clearer explanation in the summary
    // explaining WHY the peak might differ from the "Optimal Config" (which is Energy-based).
    
    // BETTER: The user explicitly asked for "bar graph rear gain%". I must keep that.
    // I will add a note about the Energy ranking vs Rear Gain ranking.

    // Keep a copy sorted by X for the chart
    const chartPoints = [...points].sort((a,b) => a.x - b.x);

    const labels = chartPoints.map(p => {
        if (parameter === 'albedo') return getSurfaceName(p.x);
        return p.x;
    });
    
    const chartMetricValues = chartPoints.map(p =>
        metricMode === 'uplift' ? Number(p.uplift ?? 0) : Number(p.rearShare ?? 0)
    );
    const maxMetricVal = Math.max(...chartMetricValues);
    
    // Color logic for scenario charts.
    // Albedo: multi-colored bars.
    // Tilt/Height: uniform orange bars.
    let colors;
    if (parameter === 'albedo') {
         const palette = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#34495e', '#fed330', '#eb3b5a', '#fa8231', '#20bf6b', '#a55eea'];
         colors = chartPoints.map((_, i) => palette[i % palette.length]);
    } else {
         colors = '#f97316'; // Orange
    }

    if (sweepSummary) {
        // Find best Rear Gain point
        const bestPoint =
            chartPoints.find((p) =>
                (metricMode === 'uplift' ? Number(p.uplift ?? 0) : Number(p.rearShare ?? 0)) === maxMetricVal
            ) || chartPoints[0];
        const displayX = parameter === 'albedo' ? getSurfaceName(bestPoint.x) : bestPoint.x;

        let systemContextMsg = "";
        if (parameter === 'albedo') systemContextMsg = "Tilt Angle: 20°, Panel Height: 100cm";
        else if (parameter === 'tilt') systemContextMsg = "Surface: Urban (Albedo 0.18), Panel Height: 100cm";
        else if (parameter === 'height') systemContextMsg = "Surface: Urban (Albedo 0.18), Tilt Angle: 20°";

        sweepSummary.innerHTML = `
            <div style="font-size:0.9em; margin-top:12px; text-align: left; background: rgba(0,0,0,0.3); border: 1px solid rgba(245, 166, 35, 0.3); padding: 12px; border-radius: 6px;">
                <div style="margin-bottom: 8px;">
                    <span style="color:#f5a623; font-weight:bold;">SCENARIO PEAK:</span> 
                    <strong>${maxMetricVal.toFixed(2)}%</strong> at ${labelMap[parameter] || parameter} = <strong>${displayX}</strong>
                </div>
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.1);">
                   <span style="color: #00d4ff; font-weight:bold; font-size: 0.85em; letter-spacing: 1px;">SYSTEM CONFIGURATION DISCLAIMER:</span><br>
                   <span style="color: #e2e8f0; font-family: 'Space Mono', monospace; font-size: 0.85em; display:block; margin-top:4px;">
                       > BASELINE: Detailed simulation model<br>
                       > REAR STRUCTURE LOSS: 8% (mounting obstruction approximation)<br>
                       &nbsp;&nbsp;<i>*No arbitrary 50% correction is applied*</i><br>
                       > FIXED PARAMETERS for this variation:<br>
                       &nbsp;&nbsp;• ${systemContextMsg}
                   </span>
                </div>
            </div>
        `;
    }

    // Update Table (Top 5 by selected scenario metric)
    const tableBody = document.querySelector('#sweepTable tbody');
    const paramHeader = document.getElementById('sweepParamHeader');
    const metricHeader = document.getElementById('sweepMetricHeader');
    
    if (tableBody) {
        if(paramHeader) paramHeader.textContent = labelMap[parameter] || parameter;
        if(metricHeader) metricHeader.textContent = metricTitle;
        tableBody.innerHTML = '';
        
        const top5 = [...points]
            .sort((a, b) => {
                const left = metricMode === 'uplift' ? Number(a.uplift ?? 0) : Number(a.rearShare ?? 0);
                const right = metricMode === 'uplift' ? Number(b.uplift ?? 0) : Number(b.rearShare ?? 0);
                return right - left;
            })
            .slice(0, 5);
        
        top5.forEach((p, idx) => {
            const tr = document.createElement('tr');
            if (idx === 0) tr.style.color = 'var(--amber)';
            
            const displayVal = parameter === 'albedo' ? getSurfaceName(p.x) : p.x;
            
            tr.innerHTML = `
                <td>#${idx+1}</td>
                <td>${displayVal}</td>
                <td>${(metricMode === 'uplift' ? Number(p.uplift ?? 0) : Number(p.rearShare ?? 0)).toFixed(4)}%</td>
                <td>${Number(p.energy || 0).toFixed(4)}</td>
            `;
            tableBody.appendChild(tr);
        });
    }

    const isAlbedo = parameter === 'albedo';
    // Revert to standard vertical bar chart for scientific consistency unless requested otherwise.
    // The user emphasized "results" over "styling".
    const indexAxis = 'x'; 

    sweepChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Rear Surface Gain (%)',
                data: chartMetricValues,
                backgroundColor: colors,
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: indexAxis,
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { 
                    callbacks: { label: c => `${metricTitle}: ${c.raw.toFixed(2)}%` }
                },
                title: {
                    display: true,
                    text: isAlbedo 
                        ? `${metricTitle} vs Surface Type` 
                        : (parameter === 'tilt' ? `${metricTitle} vs Tilt Angle` : `${metricTitle} vs Panel Height`),
                    color: '#e2e8f0',
                    font: { size: 14, weight: 'normal' },
                    padding: { bottom: 20 }
                }
            },
            scales: {
                x: { 
                    title: { display: true, text: isAlbedo ? labelMap[parameter] : (parameter === 'tilt' ? 'Panel Tilt Angle (°)' : 'Panel Height from Ground (cm)'), color: '#94a3b8' }, 
                    grid: { display: false } 
                },
                y: { 
                    title: { display: true, text: metricTitle, color: '#94a3b8' }, 
                    grid: { color: 'rgba(255,255,255,0.05)' } 
                }
            }
        }
    });
}

function getScenarioFixedPanelConfig() {
    return {
        areaM2: 2.2,
        widthM: 1.134,
        frontEfficiency: 0.21,
        inverterEfficiency: 0.96,
        bifaciality: 0.7,
        azimuthDeg: 180,
        rearStructureLossFraction: 0.08,
        noctC: 45,
        temperatureCoeffPerC: -0.004
    };
}

function renderScenarioAssumptions(parameter, payload) {
    if (!sweepAssumptions) return;

    const panel = payload.panelConfig || {};
    const varied = parameter === 'albedo' ? 'Albedo' : parameter === 'tilt' ? 'Tilt' : 'Height';
    sweepAssumptions.textContent =
        `Model: Detailed JS | Varied: ${varied} | Fixed: Azimuth ${panel.azimuthDeg}°, ` +
        `Bifaciality ${panel.bifaciality}, Rear Loss ${(panel.rearStructureLossFraction * 100).toFixed(0)}%, ` +
        `NOCT ${panel.noctC}°C, Temp Coeff ${panel.temperatureCoeffPerC}/°C`;
}

function readScenarioFixedInputs() {
    const tiltDeg = Number(scenarioFixedTiltInput?.value);
    const heightCm = Number(scenarioFixedHeightInput?.value);
    const albedo = Number(scenarioFixedAlbedoInput?.value);

    if (!Number.isFinite(tiltDeg) || tiltDeg < 0 || tiltDeg > 85) {
        throw new Error('Fixed tilt must be between 0 and 85 degrees.');
    }

    if (!Number.isFinite(heightCm) || heightCm < 10 || heightCm > 500) {
        throw new Error('Fixed height must be between 10 and 500 cm.');
    }

    if (!Number.isFinite(albedo) || albedo < 0.05 || albedo > 0.95) {
        throw new Error('Fixed albedo must be between 0.05 and 0.95.');
    }

    return {
        tiltDeg,
        heightCm,
        albedo
    };
}


async function runRefinement(parameter) {
    // Check if we have basic location/date data (we don't strictly need optimal config anymore)
    if (!startDateInput.value || !endDateInput.value) {
        setStatus("SETUP REQUIRED: Please fetch Irradiance/Set Dates first.", true);
        return;
    }

    setLoading(true);
    setStatus(`SCENARIO ANALYSIS: VARYING ${parameter.toUpperCase()}...`);
    
    // Construct payload
    const basePayload = getBasePayload();
    const ranges = {};
    const fixedInputs = readScenarioFixedInputs();

    function fixed(v) { return { min: Number(v), max: Number(v), step: 1 }; }

    // Define sweep ranges for fixed-scenario analysis.
    if (parameter === 'albedo') {
        ranges.heightCm = fixed(fixedInputs.heightCm);
        ranges.tiltDeg = fixed(fixedInputs.tiltDeg);
        ranges.albedo = ALBEDO_PRESETS.map(p => p.val);
    } 
    else if (parameter === 'height') {
        ranges.albedo = fixed(fixedInputs.albedo);
        ranges.tiltDeg = fixed(fixedInputs.tiltDeg);
        ranges.heightCm = { min: 40, max: 100, step: 20 }; 
    } 
    else if (parameter === 'tilt') {
        ranges.albedo = fixed(fixedInputs.albedo);
        ranges.heightCm = fixed(fixedInputs.heightCm);
        ranges.tiltDeg = { min: 10, max: 50, step: 5 };
    }

    try {
        const payload = { 
            ...basePayload, 
            ranges, 
            panelConfig: getScenarioFixedPanelConfig(),
            useMatlab: false,
            strictMatlab: false
        };

        const response = await postJson("/api/simulation/analyze", payload);
        
        // Gather results
        let results = response.chartData || response.results || [];
        
        // If still empty but we have a single optimalConfig (edge case of 1 iteration)
        if (results.length === 0 && response.optimalConfiguration) {
            results = [response.optimalConfiguration];
        }

        let points = results.map(r => ({
            x: Number(r[parameter === 'height' ? 'heightCm' : parameter === 'tilt' ? 'tiltDeg' : 'albedo']),
            rearShare: Number(r.rearGainPercent || 0),
            uplift:
                Number(r.frontSharePercent || 0) > 0
                    ? (Number(r.rearGainPercent || 0) / Number(r.frontSharePercent || 0)) * 100
                    : 0,
            energy: r.totalEnergyKWh // keep for table
        }));

        if (points.length === 0) throw new Error("No data generated.");

        currentSweepPoints = points;
        currentSweepParameter = parameter;

        if (sweepModal) sweepModal.showModal();
        renderScenarioAssumptions(parameter, payload);
        renderRefinementChart(points, parameter);
        
        setStatus(`REFINEMENT COMPLETE.`);

    } catch (err) {
        console.error(err);
        setStatus(`REFINEMENT ERROR: ${err.message}`, true);
    } finally {
        setLoading(false);
    }
}

if (varyAlbedoBtn) varyAlbedoBtn.addEventListener('click', () => runRefinement('albedo'));
if (varyHeightBtn) varyHeightBtn.addEventListener('click', () => runRefinement('height'));
if (varyTiltBtn) varyTiltBtn.addEventListener('click', () => runRefinement('tilt'));

if (sweepMetricSelect) {
    sweepMetricSelect.addEventListener('change', () => {
        if (!currentSweepPoints || currentSweepPoints.length === 0) {
            return;
        }
        renderRefinementChart(currentSweepPoints, currentSweepParameter);
    });
}

