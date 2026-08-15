import "dotenv/config";

import express from "express";
import cors from "cors";

import { pool } from "./db.js";
import { triggerWorkflowRun } from "./actions/triggerWorkflowRun.js";
import { approveStep } from "./actions/approveStep.js";
import {
  notificationEvent,
} from "./events/notificationEvent.js";
import {
  triggerWorkflowWebhook,
} from "./actions/triggerWorkflowWebhook.js";
import {
  databaseEvent,
} from "./events/databaseEvent.js";
import {
  startWorkflowScheduler,
} from "./scheduler.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      status: "ok",
      database: "connected",
      time: result.rows[0].now,
    });
  } catch (error) {
    console.error("Database connection failed:", error);

    res.status(500).json({
      status: "error",
      database: "disconnected",
    });
  }
});

app.post(
  "/actions/trigger-workflow-run",
  triggerWorkflowRun
);

app.post(
  "/actions/approve-step",
  approveStep
);

app.post(
  "/actions/trigger-workflow-webhook",
  triggerWorkflowWebhook
);

app.post(
  "/events/notification",
  notificationEvent
);

app.post(
  "/events/database",
  databaseEvent
);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(
    `Workflow engine running on port ${PORT}`
  );

  startWorkflowScheduler();
});
