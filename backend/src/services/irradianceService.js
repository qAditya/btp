const POWER_BASE_URL = "https://power.larc.nasa.gov/api/temporal/hourly/point";
const POWER_PARAM_GHI = "ALLSKY_SFC_SW_DWN";
const POWER_PARAMETERS = POWER_PARAM_GHI;  // temperature no longer requested
const SUPPORTED_TIMEZONES = {
  UTC: { offsetMinutes: 0, label: "UTC" },
  IST: { offsetMinutes: 330, label: "IST (UTC+05:30)" }
};
const DEFAULT_TIMEZONE_KEY = "IST";

function createIrradianceError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function formatDateCompact(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDateIso(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftUtcDateByDays(date, dayOffset) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + dayOffset);
  return shifted;
}

function parseInputDate(value, fieldName) {
  if (!value) {
    return null;
  }

  if (typeof value !== "string") {
    throw createIrradianceError(`${fieldName} must be a string in YYYY-MM-DD format.`, 400);
  }

  const trimmed = value.trim();
  const normalized = trimmed.replace(/-/g, "");

  if (!/^\d{8}$/.test(normalized)) {
    throw createIrradianceError(`${fieldName} must be in YYYY-MM-DD format.`, 400);
  }

  const year = Number(normalized.slice(0, 4));
  const month = Number(normalized.slice(4, 6));
  const day = Number(normalized.slice(6, 8));

  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day;

  if (!valid) {
    throw createIrradianceError(`${fieldName} is not a valid calendar date.`, 400);
  }

  return date;
}

function normalizeRequestedTimezone(rawTimezone) {
  if (rawTimezone === undefined || rawTimezone === null || rawTimezone === "") {
    return DEFAULT_TIMEZONE_KEY;
  }

  if (typeof rawTimezone !== "string") {
    throw createIrradianceError("timezone must be a string (supported: UTC, IST).", 400);
  }

  const timezoneKey = rawTimezone.trim().toUpperCase();
  if (!SUPPORTED_TIMEZONES[timezoneKey]) {
    throw createIrradianceError("Unsupported timezone. Use UTC or IST.", 400);
  }

  return timezoneKey;
}

function getTimezoneOffsetMinutes(timezoneKey) {
  return SUPPORTED_TIMEZONES[timezoneKey].offsetMinutes;
}

function getTodayInRequestedTimezone(timezoneKey) {
  const offsetMinutes = getTimezoneOffsetMinutes(timezoneKey);
  const shiftedNow = new Date(Date.now() + offsetMinutes * 60 * 1000);

  return new Date(
    Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate())
  );
}

function normalizeDateRange(options = {}) {
  const timezoneKey = normalizeRequestedTimezone(options.timezone);
  const today = getTodayInRequestedTimezone("UTC");
  const yesterday = shiftUtcDateByDays(today, -1);

  const startInput = parseInputDate(options.startDate, "startDate");
  const endInput = parseInputDate(options.endDate, "endDate");

  const startDate = startInput || endInput || yesterday;
  const endDate = endInput || startInput || yesterday;

  if (startDate > endDate) {
    throw createIrradianceError("startDate cannot be after endDate.", 400);
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const dayCount = Math.floor((endDate - startDate) / millisecondsPerDay) + 1;

  if (dayCount > 31) {
    throw createIrradianceError("Date range too large. Keep it to 31 days or less.", 400);
  }

  return {
    timezoneKey,
    timezoneLabel: SUPPORTED_TIMEZONES[timezoneKey].label,
    startDateIso: formatDateIso(startDate),
    endDateIso: formatDateIso(endDate),
    startDateCompact: formatDateCompact(startDate),
    endDateCompact: formatDateCompact(endDate),
    dayCount
  };
}

function buildPowerUrl({ latitude, longitude, startDateCompact, endDateCompact, format }) {
  const params = new URLSearchParams({
    parameters: POWER_PARAMETERS,
    community: "RE",
    latitude: String(latitude),
    longitude: String(longitude),
    start: startDateCompact,
    end: endDateCompact,
    "time-standard": "UTC",
    format
  });

  return `${POWER_BASE_URL}?${params.toString()}`;
}

function parseTimeStampToIso(hourKey) {
  if (!/^\d{10}$/.test(hourKey)) {
    return null;
  }

  const year = Number(hourKey.slice(0, 4));
  const month = Number(hourKey.slice(4, 6));
  const day = Number(hourKey.slice(6, 8));
  const hour = Number(hourKey.slice(8, 10));

  if (hour < 0 || hour > 23) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const valid =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour;

  return valid ? date.toISOString() : null;
}

function formatOffsetTime(utcDate, offsetMinutes) {
  const shifted = new Date(utcDate.getTime() + offsetMinutes * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  const second = String(shifted.getUTCSeconds()).padStart(2, "0");

  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absOffsetMinutes / 60)).padStart(2, "0");
  const offsetRemainderMinutes = String(absOffsetMinutes % 60).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${offsetHours}:${offsetRemainderMinutes}`;
}

function convertUtcIsoToTimezone(utcIso, timezoneKey) {
  if (timezoneKey === "UTC") {
    return {
      timeIso: utcIso,
      dateIso: utcIso.slice(0, 10)
    };
  }

  const offsetMinutes = getTimezoneOffsetMinutes(timezoneKey);
  const utcDate = new Date(utcIso);
  if (Number.isNaN(utcDate.getTime())) {
    return null;
  }

  const shiftedIso = formatOffsetTime(utcDate, offsetMinutes);
  return {
    timeIso: shiftedIso,
    dateIso: shiftedIso.slice(0, 10)
  };
}

function normalizePowerHourlyWhM2(rawValue, unitText) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    return null;
  }

  const normalizedUnit = String(unitText || "").toLowerCase();
  if (normalizedUnit.includes("kw-hr") || normalizedUnit.includes("kwh")) {
    return value * 1000;
  }

  return value;
}

export async function getIrradianceData(latitude, longitude, options = {}) {
  const range = normalizeDateRange(options);
  const jsonUrl = buildPowerUrl({
    latitude,
    longitude,
    startDateCompact: range.startDateCompact,
    endDateCompact: range.endDateCompact,
    format: "JSON"
  });
  const csvUrl = buildPowerUrl({
    latitude,
    longitude,
    startDateCompact: range.startDateCompact,
    endDateCompact: range.endDateCompact,
    format: "CSV"
  });

  const response = await fetch(jsonUrl, {
    headers: {
      "User-Agent": process.env.IRRADIANCE_USER_AGENT || "pv-bifacial-sim/1.0"
    }
  });

  if (!response.ok) {
    throw createIrradianceError("Unable to fetch irradiance data", 502);
  }

  const payload = await response.json();
  const ghiSeries = payload?.properties?.parameter?.[POWER_PARAM_GHI];

  if (!ghiSeries || typeof ghiSeries !== "object") {
    throw createIrradianceError("Irradiance data is incomplete for this location.", 502);
  }

  const fillValue = Number(payload?.properties?.fill_value ?? -999);
  const rawUnit =
    payload?.parameters?.[POWER_PARAM_GHI]?.units ||
    payload?.header?.[POWER_PARAM_GHI]?.units ||
    "kWh/m^2";

  const sortedEntries = Object.entries(ghiSeries).sort(([a], [b]) => a.localeCompare(b));
  const time = [];
  const ghiWhM2Hourly = [];

  for (const [hourKey, rawValue] of sortedEntries) {
    const numericRaw = Number(rawValue);
    if (!Number.isFinite(numericRaw) || numericRaw === fillValue || numericRaw < 0) {
      continue;
    }

    const isoTime = parseTimeStampToIso(hourKey);
    if (!isoTime) {
      continue;
    }

    const converted = normalizePowerHourlyWhM2(numericRaw, rawUnit);
    if (converted === null) {
      continue;
    }

    const zonedTime = convertUtcIsoToTimezone(isoTime, range.timezoneKey);
    if (!zonedTime) {
      continue;
    }

    time.push(zonedTime.timeIso);
    ghiWhM2Hourly.push(converted);

    // temperature omitted
  }

  if (time.length === 0) {
    throw createIrradianceError(
      `No valid irradiance records were returned for ${range.startDateIso} to ${range.endDateIso}. Try an older UTC date range.`,
      502
    );
  }

  return {
    hourly: {
      time,
      // Legacy key kept for compatibility with current simulation payload readers.
      ghi_w_m2: ghiWhM2Hourly,
      ghi_wh_m2: ghiWhM2Hourly,
      },
    units: {
      ghiWhM2Hourly: "Wh/m^2",
      totalGhiWhM2: "Wh/m^2",
      averageEquivalentGhiWm2: "W/m^2",
      peakHourlyGhiWhM2: "Wh/m^2",
      // Legacy unit key kept for compatibility.
      ghiWm2: "Wh/m^2"
    },
    timezone: range.timezoneLabel,
    dateRange: {
      startDate: range.startDateIso,
      endDate: range.endDateIso,
      dayCount: range.dayCount
    },
    source: {
      provider: "NASA POWER",
      parameters: POWER_PARAMETERS,
      parameter: POWER_PARAM_GHI,
      rawUnit,
      normalizedHourlyUnit: "Wh/m^2",
      queriedTimeStandard: "UTC",
      jsonUrl,
      csvUrl
    }
  };
}
