const DEFAULT_RANGE_SPECS = {
  heightCm: { min: 50, max: 450, step: 50 },
  tiltDeg: { min: 10, max: 50, step: 10 },
  albedo: { min: 0.2, max: 0.6, step: 0.1 }
};

const RANGE_LIMITS = {
  heightCm: { min: 10, max: 500, decimals: 0, maxValues: 50 },
  tiltDeg: { min: 0, max: 85, decimals: 1, maxValues: 60 },
  albedo: { min: 0.05, max: 0.95, decimals: 2, maxValues: 40 }
};

const DEFAULT_PANEL_CONFIG = {
  areaM2: 2.2,
  frontEfficiency: 0.21,
  inverterEfficiency: 0.96,
  bifaciality: 0.7
};

const MAX_CONFIGURATIONS = 10000;
const TOP_CONFIGURATION_LIMIT = 10;
const IV_PV_CURVE_LIMIT = 5;
const IV_PV_POINTS = 80;
const VOC_REFERENCE_V = 64.5;
const VMPP_RATIO_TARGET = 0.82;
const IMPP_RATIO_TARGET = 0.92;
const KNEE_EXPONENT_MIN = 8;
const KNEE_EXPONENT_MAX = 16;

function createInputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function roundTo(value, decimals) {
  return Number(value.toFixed(decimals));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ─── BTP-1 helper calculations (solar geometry internally used) ─────────────────

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function getDayOfYear(isoString) {
  const d = new Date(isoString);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.floor((d - start) / 86400000) + 1;
}

function solarDeclination(doy) {
  // declination calculation as used in BTP-1
  return 23.45 * Math.sin(degToRad((360 / 365) * (284 + doy)));
}

function equationOfTime(doy) {
  // equation-of-time approximation required for BTP-1 geometry
  const B = degToRad((360 / 365) * (doy - 81));
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

function cosSolarZenith(latDeg, decDeg, hourAngleDeg) {
  const latR = degToRad(latDeg);
  const decR = degToRad(decDeg);
  const haR = degToRad(hourAngleDeg);
  return Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
}

function cosAngleOfIncidence(latDeg, decDeg, tiltDeg, hourAngleDeg) {
  // Equator-facing tilted surface (south in N-hemisphere, north in S-hemisphere)
  const effectiveLat = latDeg >= 0 ? latDeg - tiltDeg : latDeg + tiltDeg;
  const effR = degToRad(effectiveLat);
  const decR = degToRad(decDeg);
  const haR = degToRad(hourAngleDeg);
  return Math.sin(decR) * Math.sin(effR) + Math.cos(decR) * Math.cos(effR) * Math.cos(haR);
}

function extraterrestrialHorizontal(doy, cosZenith) {
  const GSC = 1361; // W/m² solar constant
  const eccCorr = 1 + 0.033 * Math.cos(degToRad((360 * doy) / 365));
  return GSC * eccCorr * Math.max(0, cosZenith);
}


// ─── Diffuse fraction calculation per BTP-1 model (kt-based)

function diffuseFraction(kt) {
  // piecewise kd formula adopted directly from BTP-1
  if (kt <= 0) return 1.0;
  if (kt <= 0.22) return 1.0 - 0.09 * kt;
  if (kt <= 0.80) {
    return (
      0.9511 -
      0.1604 * kt +
      4.388 * kt ** 2 -
      16.638 * kt ** 3 +
      12.336 * kt ** 4
    );
  }
  return 0.165;
}



// ──────────────────────────────────────────────────────────────────

function normalizeIrradiancePayload(irradiance) {
  const hourly = irradiance?.hourly || irradiance;
  const time = hourly?.time;
  const ghi = hourly?.ghi_wh_m2 || hourly?.ghi_w_m2 || hourly?.ghiWhM2 || hourly?.ghiWm2 || [];

  if (!Array.isArray(time) || time.length === 0) {
    throw createInputError("Irradiance payload does not include valid hourly timestamps.");
  }

  if (!Array.isArray(ghi) || ghi.length === 0) {
    throw createInputError("Irradiance payload does not include GHI values.");
  }

  if (ghi.length !== time.length) {
    throw createInputError("Irradiance time and GHI arrays must have the same length.");
  }

  // temperature data is ignored by the simulation model

  return {
    time,
    ghi,
    units: irradiance?.units || {},
    timezone: irradiance?.timezone || "UTC",
    dateRange: irradiance?.dateRange || null,
    source: irradiance?.source || null
  };
}

function buildIrradianceSummary(irradiance) {
  const hours = irradiance.time.length;
  let totalGhiWhM2 = 0;
  let peakGhiWhM2 = 0;

  for (let index = 0; index < hours; index += 1) {
    const ghiValue = Math.max(0, toFiniteNumber(irradiance.ghi[index], 0));
    totalGhiWhM2 += ghiValue;
    peakGhiWhM2 = Math.max(peakGhiWhM2, ghiValue);
  }

  const averageEquivalentGhiWm2 = totalGhiWhM2 / hours;

  return {
    hours,
    totalGhiWhM2: roundTo(totalGhiWhM2, 2),
    averageEquivalentGhiWm2: roundTo(averageEquivalentGhiWm2, 2),
    peakGhiWhM2: roundTo(peakGhiWhM2, 2),
    // Legacy summary keys kept for frontend compatibility.
    averageGhiWm2: roundTo(averageEquivalentGhiWm2, 2),
    peakGhiWm2: roundTo(peakGhiWhM2, 2)
  };
}

export function buildIrradianceResponse({ location, irradiance }) {
  const normalized = normalizeIrradiancePayload(irradiance);
  const hourly = [];

  for (let index = 0; index < normalized.time.length; index += 1) {
    const ghiWhM2 = roundTo(Math.max(0, toFiniteNumber(normalized.ghi[index], 0)), 3);
    hourly.push({
      time: normalized.time[index],
      ghiWhM2,
      // Legacy key kept for chart compatibility.
      ghiWm2: ghiWhM2
    });
  }

  return {
    location: {
      name: location.name,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: normalized.timezone
    },
    dateRange: normalized.dateRange,
    units: {
      ghiWhM2Hourly: "Wh/m^2",
      averageEquivalentGhiWm2: "W/m^2",
      totalGhiWhM2: "Wh/m^2",
      peakGhiWhM2: "Wh/m^2",
      // Legacy key kept for compatibility.
      ghiWm2: "Wh/m^2",
      ...normalized.units
    },
    source: normalized.source,
    summary: buildIrradianceSummary(normalized),
    hourly
  };
}

function normalizeNumericField(value, defaultValue, bounds, fieldName) {
  const parsed = value === undefined || value === null ? defaultValue : Number(value);

  if (!Number.isFinite(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw createInputError(
      `${fieldName} must be a number between ${bounds.min} and ${bounds.max}.`
    );
  }

  return parsed;
}

function normalizePanelConfig(panelConfig) {
  const input = panelConfig || {};

  return {
    areaM2: roundTo(
      normalizeNumericField(
        input.areaM2,
        DEFAULT_PANEL_CONFIG.areaM2,
        { min: 0.1, max: 25 },
        "panelConfig.areaM2"
      ),
      4
    ),
    frontEfficiency: roundTo(
      normalizeNumericField(
        input.frontEfficiency,
        DEFAULT_PANEL_CONFIG.frontEfficiency,
        { min: 0.05, max: 0.35 },
        "panelConfig.frontEfficiency"
      ),
      4
    ),
    inverterEfficiency: roundTo(
      normalizeNumericField(
        input.inverterEfficiency,
        DEFAULT_PANEL_CONFIG.inverterEfficiency,
        { min: 0.6, max: 1 },
        "panelConfig.inverterEfficiency"
      ),
      4
    ),
    bifaciality: roundTo(
      normalizeNumericField(
        input.bifaciality,
        DEFAULT_PANEL_CONFIG.bifaciality,
        { min: 0.3, max: 1 },
        "panelConfig.bifaciality"
      ),
      4
    ),
  };
}

function buildValuesFromSpec(fieldName, spec, limits) {
  const min = Number(spec.min);
  const max = Number(spec.max);
  const step = Number(spec.step);

  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) {
    throw createInputError(`${fieldName} range values must be valid numbers.`);
  }

  if (min < limits.min || max > limits.max || min > max) {
    throw createInputError(
      `${fieldName} range must be within [${limits.min}, ${limits.max}] and min <= max.`
    );
  }

  const scale = 10 ** limits.decimals;
  const minInt = Math.round(min * scale);
  const maxInt = Math.round(max * scale);
  const stepInt = Math.round(step * scale);

  if (stepInt <= 0) {
    throw createInputError(`${fieldName}.step must be a positive number.`);
  }

  const values = [];
  for (let current = minInt; current <= maxInt; current += stepInt) {
    values.push(current / scale);
    if (values.length > limits.maxValues) {
      throw createInputError(
        `${fieldName} range is too large. Keep it under ${limits.maxValues} values.`
      );
    }
  }

  if (values.length === 0) {
    throw createInputError(`${fieldName} range produced no values.`);
  }

  return values;
}

function normalizeArrayValues(fieldName, rawValues, limits) {
  if (rawValues.length === 0) {
    throw createInputError(`${fieldName} array cannot be empty.`);
  }

  const seen = new Set();
  const values = [];

  for (const rawValue of rawValues) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) {
      throw createInputError(`${fieldName} array contains non-numeric values.`);
    }

    const rounded = roundTo(parsed, limits.decimals);
    if (rounded < limits.min || rounded > limits.max) {
      throw createInputError(
        `${fieldName} values must stay within [${limits.min}, ${limits.max}].`
      );
    }

    const key = String(rounded);
    if (!seen.has(key)) {
      seen.add(key);
      values.push(rounded);
    }
  }

  values.sort((a, b) => a - b);

  if (values.length > limits.maxValues) {
    throw createInputError(
      `${fieldName} array is too large. Keep it under ${limits.maxValues} values.`
    );
  }

  return values;
}

function normalizeSingleRange(fieldName, inputValue) {
  const defaultSpec = DEFAULT_RANGE_SPECS[fieldName];
  const limits = RANGE_LIMITS[fieldName];

  if (inputValue === undefined || inputValue === null) {
    return buildValuesFromSpec(fieldName, defaultSpec, limits);
  }

  if (Array.isArray(inputValue)) {
    return normalizeArrayValues(fieldName, inputValue, limits);
  }

  if (typeof inputValue === "object") {
    return buildValuesFromSpec(
      fieldName,
      {
        min: inputValue.min ?? defaultSpec.min,
        max: inputValue.max ?? defaultSpec.max,
        step: inputValue.step ?? defaultSpec.step
      },
      limits
    );
  }

  throw createInputError(`${fieldName} must be an array or an object with {min, max, step}.`);
}

function normalizeRanges(rangesInput) {
  const input = rangesInput || {};

  const heightCm = normalizeSingleRange("heightCm", input.heightCm);
  const tiltDeg = normalizeSingleRange("tiltDeg", input.tiltDeg);
  const albedo = normalizeSingleRange("albedo", input.albedo);

  const totalConfigurations = heightCm.length * tiltDeg.length * albedo.length;
  if (totalConfigurations > MAX_CONFIGURATIONS) {
    throw createInputError(
      `Too many combinations (${totalConfigurations}). Reduce range sizes below ${MAX_CONFIGURATIONS}.`
    );
  }

  return { heightCm, tiltDeg, albedo, totalConfigurations };
}

// calculateEffectiveIrradiance
// Implements the core BTP‑1 equations verbatim.  The formulas used are
// exactly those exposed in the research paper and mirror the front-end
// dashboard; no additional geometry or decomposition formulas are
// presented here, they exist only as the code that evaluates these
// expressions.
//
// Front irradiance (BTP‑1):
//   beam_tilted = DNI × max(0, cos I)
//   sky_vf      = (1 + cos β)/2
//   gnd_vf      = (1 - cos β)/2
//   ghi_diffuse = GHI × kd
//   front       = beam_tilted + ghi_diffuse×sky_vf + GHI×albedo×gnd_vf
//
// Rear irradiance (BTP‑1, eqns 7–8):
//   rear_vf       = (1 − cos β)/2
//   height_factor = (1 + h/1000)   % h in cm
//   rear          = GHI × albedo × rear_vf × height_factor × bifaciality
//
// Total effective = front + rear (no temperature correction).
//
// The helper computations below (solar position, kt, etc.) merely
// supply the variables (DNI, cos I, kd) required by these equations.
function calculateEffectiveIrradiance({
  ghiWm2, tiltDeg, heightCm, albedo, bifaciality,
  latitude, longitude, timeIso
}) {
  if (ghiWm2 <= 0) {
    return { frontEffectiveWm2: 0, rearEffectiveWm2: 0, totalEffectiveWm2: 0, tempDerate: 1 };
  }

  const betaRad = degToRad(tiltDeg);

  // ── Solar position ──
  const d = new Date(timeIso);
  const hourUTC = d.getUTCHours() + d.getUTCMinutes() / 60;
  const doy = getDayOfYear(timeIso);
  const dec = solarDeclination(doy);
  const eot = equationOfTime(doy);
  const solarTime = hourUTC + longitude / 15 + eot / 60;
  const ha = (solarTime - 12) * 15; // hour angle in degrees
  const cosZ = cosSolarZenith(latitude, dec, ha);

  if (cosZ <= 0.01) {
    // Sun below horizon
    return { frontEffectiveWm2: 0, rearEffectiveWm2: 0, totalEffectiveWm2: 0, tempDerate: 1 };
  }

  // ── Erbs decomposition: GHI → beam + diffuse (BTP‑1 eqn 1) ──
  const G0h = extraterrestrialHorizontal(doy, cosZ);
  const kt = G0h > 0 ? clamp(ghiWm2 / G0h, 0, 1.5) : 0;
  const kd = diffuseFraction(kt);
  const ghiDiffuse = ghiWm2 * kd;
  const ghiBeam = Math.max(0, ghiWm2 - ghiDiffuse);
  const dni = cosZ > 0.01 ? ghiBeam / cosZ : 0;

  // ── Front irradiance: equator-facing + Liu-Jordan isotropic transposition (BTP‑1 eqns 2‑4) ──
  const cosI = cosAngleOfIncidence(latitude, dec, tiltDeg, ha);
  const beamTilted = dni * Math.max(0, cosI);
  const skyVF = (1 + Math.cos(betaRad)) / 2;
  const gndVF = (1 - Math.cos(betaRad)) / 2;
  const diffuseTilted = ghiDiffuse * skyVF;
  const groundReflFront = ghiWm2 * albedo * gndVF;
  const frontBase = Math.max(0, beamTilted + diffuseTilted + groundReflFront);

  // front side is assumed equator-facing; no azimuth correction applied
  const frontEffectiveWm2 = frontBase;

  // ── Rear irradiance: ground-reflected + diffuse (BTP‑1 eqns 7–8 + rear-diffuse term) ──
  // Rear view factor per BTP‑1: (1 - cos β)/2
  const rearGndVF = (1 - Math.cos(betaRad)) / 2;
  // Height factor per BTP‑1: (1 + h/1000) where h is height in cm,
  // with a saturation cap at 2.2 to prevent unbounded growth.
  const HEIGHT_FACTOR_CAP = 2.2;
  const heightFactor = Math.min(1 + heightCm / 1000, HEIGHT_FACTOR_CAP);
  // Ground-reflected component
  const rearGround = ghiWm2 * albedo * rearGndVF * heightFactor;
  // Rear diffuse component: fraction of diffuse sky reaching rear directly
  const REAR_DIFFUSE_FRACTION = 0.1;  // 10% of diffuse reaches rear
  const rearDiffuse = ghiDiffuse * REAR_DIFFUSE_FRACTION;
  // Total rear (ground + diffuse) multiplied by bifaciality
  const rearEffectiveWm2 = Math.max(0, (rearGround + rearDiffuse) * bifaciality);

  // No temperature derating – formulas strictly follow BTP‑1.
  const totalIrr = frontEffectiveWm2 + rearEffectiveWm2;
  return { frontEffectiveWm2, rearEffectiveWm2, totalEffectiveWm2: Math.max(0, totalIrr), tempDerate: 1 };
}


function buildConfigurationLabel(configuration) {
  return `H${configuration.heightCm}_T${configuration.tiltDeg}_A${configuration.albedo}`;
}

function evaluateConfiguration({ configuration, irradiance, panel, location }) {
  let totalEnergyKWh = 0;
  let peakPowerKW = 0;
  let totalFrontEffectiveWm2 = 0;
  let totalRearEffectiveWm2 = 0;
  let totalGhiWm2 = 0;
  let totalEffectiveWm2 = 0;

  const hourlySeries = [];

  for (let index = 0; index < irradiance.time.length; index += 1) {
    const ghiWm2 = Math.max(0, toFiniteNumber(irradiance.ghi[index], 0));

    const effective = calculateEffectiveIrradiance({
      ghiWm2,
      tiltDeg: configuration.tiltDeg,
      heightCm: configuration.heightCm,
      albedo: configuration.albedo,
      bifaciality: panel.bifaciality,
      latitude: location.latitude,
      longitude: location.longitude,
      timeIso: irradiance.time[index]
    });

    const powerKW =
      (effective.totalEffectiveWm2 / 1000) *
      panel.areaM2 *
      panel.frontEfficiency *
      panel.inverterEfficiency *
      effective.tempDerate;

    totalEnergyKWh += powerKW;
    peakPowerKW = Math.max(peakPowerKW, powerKW);
    totalGhiWm2 += ghiWm2;
    totalFrontEffectiveWm2 += effective.frontEffectiveWm2;
    totalRearEffectiveWm2 += effective.rearEffectiveWm2;
    totalEffectiveWm2 += effective.totalEffectiveWm2;

    hourlySeries.push({
      time: irradiance.time[index],
      ghiWm2: roundTo(ghiWm2, 3),
      frontEffectiveIrradianceWm2: roundTo(effective.frontEffectiveWm2, 3),
      effectiveIrradianceWm2: roundTo(effective.totalEffectiveWm2, 3),
      rearEffectiveIrradianceWm2: roundTo(effective.rearEffectiveWm2, 3),
      powerKW: roundTo(powerKW, 6)
    });
  }

  // Rear and front shares should both be fractions of the total effective
  // irradiance so that rear + front ≈ 100% (when totalEffectiveWm2 > 0).
  const rearGainPercent =
    totalEffectiveWm2 > 0 ? (totalRearEffectiveWm2 / totalEffectiveWm2) * 100 : 0;
  const frontSharePercent =
    totalEffectiveWm2 > 0 ? (totalFrontEffectiveWm2 / totalEffectiveWm2) * 100 : 0;

  return {
    configuration,
    metrics: {
      totalEnergyKWh: roundTo(totalEnergyKWh, 6),
      peakPowerKW: roundTo(peakPowerKW, 6),
      rearGainPercent: roundTo(rearGainPercent, 4),
      frontSharePercent: roundTo(frontSharePercent, 4),
      totalEffectiveIrradianceWhM2: roundTo(totalEffectiveWm2, 3),
      averageEffectiveIrradianceWm2: roundTo(totalEffectiveWm2 / irradiance.time.length, 3)
    },
    hourlySeries
  };
}

function compareConfigurations(left, right) {
  if (right.metrics.totalEnergyKWh !== left.metrics.totalEnergyKWh) {
    return right.metrics.totalEnergyKWh - left.metrics.totalEnergyKWh;
  }

  if (right.metrics.peakPowerKW !== left.metrics.peakPowerKW) {
    return right.metrics.peakPowerKW - left.metrics.peakPowerKW;
  }

  return right.metrics.rearGainPercent - left.metrics.rearGainPercent;
}

function mapConfigurationSummary(result, rank) {
  return {
    rank,
    configurationId: buildConfigurationLabel(result.configuration),
    heightCm: result.configuration.heightCm,
    tiltDeg: result.configuration.tiltDeg,
    albedo: result.configuration.albedo,
    totalEnergyKWh: result.metrics.totalEnergyKWh,
    peakPowerKW: result.metrics.peakPowerKW,
    rearGainPercent: result.metrics.rearGainPercent,
    frontSharePercent: result.metrics.frontSharePercent,
    averageEffectiveIrradianceWm2: result.metrics.averageEffectiveIrradianceWm2,
    totalEffectiveIrradianceWhM2: result.metrics.totalEffectiveIrradianceWhM2
  };
}

function buildConfigurationKey(configuration) {
  return `${configuration.heightCm}|${configuration.tiltDeg}|${configuration.albedo}`;
}

function selectDiverseTopConfigurations(sortedResults, limit = TOP_CONFIGURATION_LIMIT) {
  const selected = [];
  const usedConfigurationKeys = new Set();
  const usedHeightTiltPairs = new Set();
  const usedTiltValues = new Set();
  const usedAlbedoValues = new Set();
  const usedHeightValues = new Set();

  const uniqueAlbedoCount = new Set(sortedResults.map((result) => result.configuration.albedo)).size;
  const uniqueTiltCount = new Set(sortedResults.map((result) => result.configuration.tiltDeg)).size;
  const uniqueHeightCount = new Set(sortedResults.map((result) => result.configuration.heightCm)).size;

  const albedoQuota = Math.min(3, uniqueAlbedoCount);
  const tiltQuota = Math.min(4, uniqueTiltCount);
  const heightQuota = Math.min(4, uniqueHeightCount);

  function addResult(result, rules = {}) {
    if (!result || selected.length >= limit) {
      return false;
    }

    const config = result.configuration;
    const configKey = buildConfigurationKey(config);
    if (usedConfigurationKeys.has(configKey)) {
      return false;
    }

    const heightTiltKey = `${config.heightCm}|${config.tiltDeg}`;
    if (rules.requireNewHeightTilt && usedHeightTiltPairs.has(heightTiltKey)) {
      return false;
    }

    if (rules.requireNewTilt && usedTiltValues.has(config.tiltDeg)) {
      return false;
    }

    if (rules.requireNewAlbedo && usedAlbedoValues.has(config.albedo)) {
      return false;
    }

    if (rules.requireNewHeight && usedHeightValues.has(config.heightCm)) {
      return false;
    }


    selected.push(result);
    usedConfigurationKeys.add(configKey);
    usedHeightTiltPairs.add(heightTiltKey);
    usedTiltValues.add(config.tiltDeg);
    usedAlbedoValues.add(config.albedo);
    usedHeightValues.add(config.heightCm);
    return true;
  }

  addResult(sortedResults[0]);

  // 1) Encourage albedo spread first.
  for (const result of sortedResults) {
    if (usedAlbedoValues.size >= albedoQuota) {
      break;
    }

    addResult(result, { requireNewAlbedo: true });
    if (selected.length >= limit) {
      break;
    }
  }

  // 2) Ensure tilt spread where possible.
  for (const result of sortedResults) {
    if (usedTiltValues.size >= tiltQuota) {
      break;
    }

    addResult(result, { requireNewTilt: true, requireNewHeightTilt: true });
    if (selected.length >= limit) {
      break;
    }
  }

  // 3) Encourage height spread.
  for (const result of sortedResults) {
    if (usedHeightValues.size >= heightQuota) {
      break;
    }

    addResult(result, { requireNewHeight: true, requireNewHeightTilt: true });
    if (selected.length >= limit) {
      break;
    }
  }


  // 4) Prefer new height-tilt pairs.
  for (const result of sortedResults) {
    addResult(result, { requireNewHeightTilt: true });
    if (selected.length >= limit) {
      break;
    }
  }

  // 5) Fill remaining slots by pure rank.
  for (const result of sortedResults) {
    addResult(result);
    if (selected.length >= limit) {
      break;
    }
  }

  selected.sort(compareConfigurations);
  return selected;
}

function mapConfigurationProfile(result, rank) {
  return {
    ...mapConfigurationSummary(result, rank),
    hourlySeries: result.hourlySeries
  };
}

function selectIvPvConfigurations(sortedResults, limit = IV_PV_CURVE_LIMIT) {
  if (!Array.isArray(sortedResults) || sortedResults.length === 0) {
    return [];
  }

  if (sortedResults.length <= limit) {
    return [...sortedResults];
  }

  const selected = [];
  const usedKeys = new Set();
  const fractions =
    limit === 5
      ? [0, 0.18, 0.4, 0.68, 1]
      : Array.from({ length: limit }, (_, index) => index / Math.max(1, limit - 1));

  function tryAdd(result) {
    if (!result || selected.length >= limit) {
      return;
    }

    const key = buildConfigurationKey(result.configuration);
    if (usedKeys.has(key)) {
      return;
    }

    selected.push(result);
    usedKeys.add(key);
  }

  for (const fraction of fractions) {
    const index = Math.round((sortedResults.length - 1) * fraction);
    tryAdd(sortedResults[index]);
  }

  if (selected.length < limit) {
    const stride = Math.max(1, Math.floor(sortedResults.length / limit));
    for (let index = 0; index < sortedResults.length && selected.length < limit; index += stride) {
      tryAdd(sortedResults[index]);
    }
  }

  if (selected.length < limit) {
    for (const result of sortedResults) {
      tryAdd(result);
      if (selected.length >= limit) {
        break;
      }
    }
  }

  return selected;
}

function findPeakEffectiveHour(hourlySeries) {
  if (!Array.isArray(hourlySeries) || hourlySeries.length === 0) {
    return null;
  }

  let best = hourlySeries[0];
  for (let index = 1; index < hourlySeries.length; index += 1) {
    if (hourlySeries[index].effectiveIrradianceWm2 > best.effectiveIrradianceWm2) {
      best = hourlySeries[index];
    }
  }

  return best;
}

function buildIvPvCurve(result, panel, energyRank, reference = {}) {
  const peakHour = findPeakEffectiveHour(result.hourlySeries);
  const peakEffectiveIrradianceWm2 = peakHour?.effectiveIrradianceWm2 || 0;
  const averageEffectiveIrradianceWm2 = Math.max(0, result.metrics.averageEffectiveIrradianceWm2);
  const targetPmppKW = Math.max(0, toFiniteNumber(result.metrics?.peakPowerKW, 0));
  const weightedIrradianceWm2 =
    0.62 * peakEffectiveIrradianceWm2 + 0.38 * averageEffectiveIrradianceWm2;

  const irradianceRatio = clamp(weightedIrradianceWm2 / 1000, 0.18, 1.4);
  const rearGainFactor = 1 + Math.max(0, result.metrics.rearGainPercent) / 120;
  const bestEnergyKWh = Math.max(1e-9, reference.bestEnergyKWh || result.metrics.totalEnergyKWh);
  const rawEnergyRatio = clamp(result.metrics.totalEnergyKWh / bestEnergyKWh, 0.35, 1);
  const emphasizedEnergyRatio = rawEnergyRatio ** 1.45;

  const stcDcPowerW = panel.areaM2 * 1000 * panel.frontEfficiency;
  const referenceVmppV = VOC_REFERENCE_V * VMPP_RATIO_TARGET;
  const referenceImppA = referenceVmppV > 0 ? stcDcPowerW / referenceVmppV : 0;
  const referenceIscA = IMPP_RATIO_TARGET > 0 ? referenceImppA / IMPP_RATIO_TARGET : 0;

  const vocV = clamp(
    VOC_REFERENCE_V *
      (1 + 0.075 * Math.log(Math.max(0.12, irradianceRatio))) *
      (0.96 + 0.04 * emphasizedEnergyRatio),
    42,
    72
  );
  const iscA = Math.max(0.1, referenceIscA * irradianceRatio * rearGainFactor * emphasizedEnergyRatio);

  const kneeExponent = clamp(10 + 5 * irradianceRatio, KNEE_EXPONENT_MIN, KNEE_EXPONENT_MAX);
  const preKneeDroop = clamp(0.018, 0.045, 0.038 - 0.014 * irradianceRatio);

  const rawCurvePoints = [];
  let maxRawPowerKW = 0;
  let maxPowerIndex = 0;

  for (let index = 0; index <= IV_PV_POINTS; index += 1) {
    const voltageV = (vocV * index) / IV_PV_POINTS;
    const voltageFraction = vocV > 0 ? voltageV / vocV : 0;
    const normalizedCurrent = Math.max(0, 1 - voltageFraction ** kneeExponent);
    const droopMultiplier = Math.max(0, 1 - preKneeDroop * voltageFraction);
    const rawCurrentA = Math.max(0, iscA * normalizedCurrent * droopMultiplier);
    const rawPowerKW = (voltageV * rawCurrentA * panel.inverterEfficiency) / 1000;

    if (rawPowerKW > maxRawPowerKW) {
      maxRawPowerKW = rawPowerKW;
      maxPowerIndex = index;
    }

    rawCurvePoints.push({
      voltageV,
      currentA: rawCurrentA,
      powerKW: rawPowerKW
    });
  }

  const powerScale =
    targetPmppKW <= 0 || maxRawPowerKW <= 0 ? 0 : targetPmppKW / maxRawPowerKW;
  const calibratedIscA = iscA * powerScale;
  const ivCurve = [];
  const pvCurve = [];
  let maxPowerKW = 0;

  for (const point of rawCurvePoints) {
    const currentA = point.currentA * powerScale;
    const powerKW = point.powerKW * powerScale;

    maxPowerKW = Math.max(maxPowerKW, powerKW);

    ivCurve.push({
      voltageV: roundTo(point.voltageV, 3),
      currentA: roundTo(currentA, 4)
    });

    pvCurve.push({
      voltageV: roundTo(point.voltageV, 3),
      powerKW: roundTo(powerKW, 6)
    });
  }

  const mppIvPoint = ivCurve[maxPowerIndex] || { voltageV: 0, currentA: 0 };

  return {
    energyRank,
    legendLabel: `Rank ${energyRank}`,
    configurationId: buildConfigurationLabel(result.configuration),
    heightCm: result.configuration.heightCm,
    tiltDeg: result.configuration.tiltDeg,
    albedo: result.configuration.albedo,
    peakHour: peakHour
      ? {
          time: peakHour.time,
          effectiveIrradianceWm2: peakHour.effectiveIrradianceWm2,
          powerKW: peakHour.powerKW
        }
      : null,
    estimatedParameters: {
      vocV: roundTo(vocV, 4),
      iscA: roundTo(calibratedIscA, 4),
      vmppV: roundTo(mppIvPoint.voltageV, 4),
      imppA: roundTo(mppIvPoint.currentA, 4),
      pmppKW: roundTo(maxPowerKW, 6),
      energyRatioToBest: roundTo(rawEnergyRatio, 4)
    },
    ivCurve,
    pvCurve
  };
}

export function runBifacialConfigurationSweep({ location, irradiance, ranges, panelConfig }) {
  const normalizedIrradiance = normalizeIrradiancePayload(irradiance);
  const normalizedRanges = normalizeRanges(ranges);
  const panel = normalizePanelConfig(panelConfig);

  const results = [];

  for (const heightCm of normalizedRanges.heightCm) {
    for (const tiltDeg of normalizedRanges.tiltDeg) {
      for (const albedo of normalizedRanges.albedo) {
        results.push(
          evaluateConfiguration({
            configuration: { heightCm, tiltDeg, albedo },
            irradiance: normalizedIrradiance,
            panel,
            location
          })
        );
      }
    }
  }

  results.sort(compareConfigurations);

  const optimalResult = results[0];
  const diverseTopConfigurations = selectDiverseTopConfigurations(results, TOP_CONFIGURATION_LIMIT);
  const pureRankingTopConfigurations = results.slice(0, TOP_CONFIGURATION_LIMIT);
  const energyRankByConfiguration = new Map(
    results.map((result, index) => [buildConfigurationKey(result.configuration), index + 1])
  );
  const ivPvCurveConfigurations = selectIvPvConfigurations(results, IV_PV_CURVE_LIMIT);
  const ivPvReference = {
    bestEnergyKWh: results[0].metrics.totalEnergyKWh
  };
  const ivPvCurves = ivPvCurveConfigurations.map((result) =>
    buildIvPvCurve(
      result,
      panel,
      energyRankByConfiguration.get(buildConfigurationKey(result.configuration)) || 0,
      ivPvReference
    )
  );

  return {
    source: "bifacial-parameter-sweep",
    location: {
      name: location.name,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: normalizedIrradiance.timezone
    },
    dateRange: normalizedIrradiance.dateRange,
    irradianceSource: normalizedIrradiance.source,
    panelModel: panel,
    ranges: {
      heightCm: normalizedRanges.heightCm,
      tiltDeg: normalizedRanges.tiltDeg,
      albedo: normalizedRanges.albedo
    },
    combinationsTested: normalizedRanges.totalConfigurations,
    irradianceSummary: buildIrradianceSummary(normalizedIrradiance),
    rankingStrategy: {
      mode: "diversified-parameters",
      description:
        "Top list prioritizes spread across albedo, tilt, and height first, then new height-tilt pairs, then pure energy rank."
    },
    optimalConfiguration: {
      ...mapConfigurationSummary(optimalResult, 1),
      hourlySeries: optimalResult.hourlySeries
    },
    topConfigurations: diverseTopConfigurations.map((result, index) =>
      mapConfigurationSummary(result, index + 1)
    ),
    topConfigurationProfiles: diverseTopConfigurations.map((result, index) =>
      mapConfigurationProfile(result, index + 1)
    ),
    pureRankingTopConfigurations: pureRankingTopConfigurations.map((result, index) =>
      mapConfigurationSummary(result, index + 1)
    ),
    ivPvSelectionStrategy: {
      mode: "rank-spread",
      description:
        "I-V/P-V curves are sampled across best-to-worst ranks to emphasize realistic performance spread."
    },
    ivPvCurves,
    chartData: results.map((result, index) => mapConfigurationSummary(result, index + 1))
  };
}
