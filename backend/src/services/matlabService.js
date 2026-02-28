import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIMULINK_ROOT = path.resolve(__dirname, "../../simulink");
const MATLAB_FUNCTIONS_DIR = path.join(SIMULINK_ROOT, "functions");
const MATLAB_SCRIPTS_DIR = path.join(SIMULINK_ROOT, "scripts");
const MATLAB_RUNNER = "run_bifacial_sweep";

function createMatlabError(message, statusCode = 500, details = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) {
    error.details = details;
  }
  return error;
}

function escapeMatlabPath(inputPath) {
  return String(inputPath).replace(/\\/g, "/").replace(/'/g, "''");
}

function matlabEnabledByRequest(options = {}) {
  if (options.useMatlab === true) {
    return true;
  }

  return String(process.env.USE_MATLAB || "false").toLowerCase() === "true";
}

function buildMatlabBatchCommand(configPath, outputPath) {
  const functionsPath = escapeMatlabPath(MATLAB_FUNCTIONS_DIR);
  const scriptsPath = escapeMatlabPath(MATLAB_SCRIPTS_DIR);
  const safeConfigPath = escapeMatlabPath(configPath);
  const safeOutputPath = escapeMatlabPath(outputPath);

  return [
    `addpath('${functionsPath}')`,
    `addpath('${scriptsPath}')`,
    `${MATLAB_RUNNER}('${safeConfigPath}','${safeOutputPath}')`
  ].join("; ");
}

async function runMatlabCommand(command) {
  const executable = process.env.MATLAB_EXECUTABLE || "matlab";
  const args = ["-batch", command];

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: SIMULINK_ROOT,
      timeout: Number(process.env.MATLAB_TIMEOUT_MS || 300000),
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });

    return { stdout, stderr };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw createMatlabError(
        "MATLAB executable not found. Install MATLAB or set MATLAB_EXECUTABLE.",
        503
      );
    }

    throw createMatlabError("MATLAB execution failed.", 502, {
      code: error?.code || null,
      stdout: error?.stdout || "",
      stderr: error?.stderr || "",
      message: error?.message || ""
    });
  }
}

async function prepareTempFiles(payload) {
  const tempRoot = path.join(os.tmpdir(), "pv-bifacial-sim");
  await fs.mkdir(tempRoot, { recursive: true });

  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const configPath = path.join(tempRoot, `matlab-config-${token}.json`);
  const outputPath = path.join(tempRoot, `matlab-output-${token}.json`);

  await fs.writeFile(configPath, JSON.stringify(payload), "utf8");
  return { configPath, outputPath };
}

async function cleanupTempFiles(pathsToDelete) {
  await Promise.all(
    pathsToDelete.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch {
        // Best-effort cleanup.
      }
    })
  );
}

function validateSimulinkAssets() {
  return Promise.all([
    fs.access(path.join(MATLAB_FUNCTIONS_DIR, "calculate_irradiance.m")),
    fs.access(path.join(MATLAB_SCRIPTS_DIR, "run_bifacial_sweep.m"))
  ]).catch(() => {
    throw createMatlabError(
      "Required MATLAB files are missing in backend/simulink/functions or backend/simulink/scripts.",
      500
    );
  });
}

export function shouldUseMatlab(options = {}) {
  return matlabEnabledByRequest(options);
}

export async function runMatlabBifacialSweep({
  location,
  irradiance,
  ranges,
  panelConfig,
  dateRange,
  irradianceSource
}) {
  await validateSimulinkAssets();

  const payload = {
    location,
    dateRange,
    irradianceSource,
    irradiance: {
      time: irradiance?.hourly?.time || [],
      ghi: irradiance?.hourly?.ghi_w_m2 || []
    },
    ranges,
    panelConfig
  };

  const { configPath, outputPath } = await prepareTempFiles(payload);
  const command = buildMatlabBatchCommand(configPath, outputPath);

  try {
    const commandResult = await runMatlabCommand(command);
    const rawOutput = await fs.readFile(outputPath, "utf8");
    const parsed = JSON.parse(rawOutput);

    return {
      ...parsed,
      matlabRuntime: {
        used: true,
        executable: process.env.MATLAB_EXECUTABLE || "matlab",
        stderr: commandResult.stderr || "",
        stdout: commandResult.stdout || ""
      }
    };
  } finally {
    await cleanupTempFiles([configPath, outputPath]);
  }
}
