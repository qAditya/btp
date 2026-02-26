import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import simulationRoutes from "./routes/simulationRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.resolve(__dirname, "../../frontend");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.json({ success: true, message: "PV simulation backend is running" });
});

// Simple visual frontend at /app
app.use("/app", express.static(frontendPath));

app.use("/api/simulation", simulationRoutes);

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
