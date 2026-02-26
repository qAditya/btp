import { getLocationCoordinates } from "../services/geocodeService.js";
import { getIrradianceData } from "../services/irradianceService.js";
import { runMatlabBifacialSweep, shouldUseMatlab } from "../services/matlabService.js";
import { buildIrradianceResponse, runBifacialConfigurationSweep } from "../services/simulationService.js";

function createBadRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function resolveStatusCode(error) {
  const statusCode = Number(error?.statusCode ?? 500);
  return Number.isInteger(statusCode) && statusCode >= 400 ? statusCode : 500;
}

function readLocation(body) {
  const location = body?.location;
  if (typeof location !== "string" || !location.trim()) {
    throw createBadRequestError("Please provide a valid location string.");
  }

  return location.trim();
}

function readDateRange(body) {
  return {
    startDate: body?.startDate,
    endDate: body?.endDate,
    timezone: body?.timezone
  };
}

function readMatlabOptions(body) {
  const useMatlab = body?.useMatlab === true;
  const strictMatlab = body?.strictMatlab === true;
  return { useMatlab, strictMatlab };
}

export async function getIrradianceByLocation(req, res) {
  try {
    const locationText = readLocation(req.body);
    const dateRange = readDateRange(req.body);

    const geo = await getLocationCoordinates(locationText);
    const irradiance = await getIrradianceData(geo.latitude, geo.longitude, dateRange);
    const data = buildIrradianceResponse({ location: geo, irradiance });

    return res.status(200).json({
      success: true,
      message: "Irradiance data fetched",
      data
    });
  } catch (error) {
    return res.status(resolveStatusCode(error)).json({
      success: false,
      message: error.message || "Failed to fetch irradiance data"
    });
  }
}

export async function analyzeSimulation(req, res) {
  try {
    const locationText = readLocation(req.body);
    const dateRange = readDateRange(req.body);
    const matlabOptions = readMatlabOptions(req.body);

    const geo = await getLocationCoordinates(locationText);
    const irradiance = await getIrradianceData(geo.latitude, geo.longitude, dateRange);

    // Always compute JS analysis for deterministic fallback and comparison.
    const jsData = runBifacialConfigurationSweep({
      location: geo,
      irradiance,
      ranges: req.body?.ranges,
      panelConfig: req.body?.panelConfig
    });

    const matlabRequested = shouldUseMatlab(matlabOptions);
    if (!matlabRequested) {
      return res.status(200).json({
        success: true,
        message: "Simulation analysis completed",
        data: {
          ...jsData,
          engine: "javascript"
        }
      });
    }

    try {
      const matlabData = await runMatlabBifacialSweep({
        location: jsData.location,
        irradiance,
        ranges: jsData.ranges,
        panelConfig: jsData.panelModel,
        dateRange: jsData.dateRange,
        irradianceSource: jsData.irradianceSource
      });

      return res.status(200).json({
        success: true,
        message: "Simulation analysis completed with MATLAB",
        data: {
          ...matlabData,
          topConfigurations: jsData.topConfigurations,
          topConfigurationProfiles: jsData.topConfigurationProfiles,
          pureRankingTopConfigurations:
            matlabData.topConfigurations || jsData.pureRankingTopConfigurations,
          rankingStrategy: matlabData.rankingStrategy || jsData.rankingStrategy,
          ivPvCurves: matlabData.ivPvCurves || jsData.ivPvCurves,
          engine: "matlab"
        }
      });
    } catch (matlabError) {
      if (matlabOptions.strictMatlab) {
        throw matlabError;
      }

      return res.status(200).json({
        success: true,
        message: "MATLAB failed; returned JavaScript fallback result",
        data: {
          ...jsData,
          engine: "javascript-fallback",
          matlabStatus: {
            requested: true,
            success: false,
            message: matlabError.message,
            details: matlabError.details || null
          }
        }
      });
    }
  } catch (error) {
    return res.status(resolveStatusCode(error)).json({
      success: false,
      message: error.message || "Simulation failed",
      details: error.details || null
    });
  }
}

export const runSimulation = analyzeSimulation;
