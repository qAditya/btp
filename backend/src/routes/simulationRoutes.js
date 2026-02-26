import { Router } from "express";
import {
  analyzeSimulation,
  getIrradianceByLocation,
  runSimulation
} from "../controllers/simulationController.js";

const router = Router();

// POST /api/simulation/irradiance
router.post("/irradiance", getIrradianceByLocation);

// POST /api/simulation/analyze
router.post("/analyze", analyzeSimulation);

// POST /api/simulation/run (backward-compatible alias)
router.post("/run", runSimulation);

export default router;
