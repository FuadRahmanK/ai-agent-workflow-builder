import { Request, Response } from "express";
import { pool } from "../db.js";
import { canRunWorkflow } from "../auth/permissions.js";
import { resumeWorkflow } from "../workflow/resumeWorkflow.js";

interface ApproveStepRequest {
  input: {
    step_run_id: string;
  };

  session_variables?: {
    "x-hasura-user-id"?: string;
    "x-hasura-role"?: string;
  };
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function approveStep(
  req: Request,
  res: Response
) {
  const client = await pool.connect();

  try {
    const body = req.body as ApproveStepRequest;

    const stepRunId = body.input?.step_run_id;

    const userId =
      body.session_variables?.["x-hasura-user-id"];

    if (!stepRunId) {
      return res.status(400).json({
        message: "step_run_id is required",
      });
    }

    if (!isValidUUID(stepRunId)) {
      return res.status(400).json({
        message:
          "step_run_id must be a valid UUID",
      });
    }

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `
      SELECT
        sr.id AS step_run_id,
        sr.status AS step_status,

        ws.id AS workflow_step_id,
        ws.type AS step_type,
        ws.position AS step_position,

        wr.id AS workflow_run_id,
        wr.status AS run_status,
        wr.workflow_id,

        w.org_id,

        om.role
      FROM step_runs sr

      JOIN workflow_steps ws
        ON ws.id = sr.workflow_step_id

      JOIN workflow_runs wr
        ON wr.id = sr.workflow_run_id

      JOIN workflows w
        ON w.id = wr.workflow_id

      JOIN org_members om
        ON om.org_id = w.org_id
       AND om.user_id = $2

      WHERE sr.id = $1

      FOR UPDATE OF sr, wr

      LIMIT 1
      `,
      [stepRunId, userId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Approval step not found",
      });
    }

    const step = result.rows[0];

    if (step.step_type !== "approval_gate") {
      await client.query("ROLLBACK");

      return res.status(400).json({
        message:
          "This step is not an approval gate",
      });
    }

    if (
      step.step_status !== "paused" ||
      step.run_status !== "paused"
    ) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        message:
          "This approval gate is not awaiting approval",
      });
    }

    if (!canRunWorkflow(step.role)) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message:
          "You do not have permission to approve this step",
      });
    }

    await client.query(
      `
      UPDATE step_runs
      SET
        approved_by = $1,
        approved_at = NOW(),
        status = 'completed',
        completed_at = NOW()
      WHERE id = $2
      `,
      [userId, stepRunId]
    );

    await client.query(
      `
      UPDATE workflow_runs
      SET
        status = 'running'
      WHERE id = $1
      `,
      [step.workflow_run_id]
    );

    await client.query("COMMIT");

    const finalStatus = await resumeWorkflow(
      step.workflow_run_id
    );

    let message = "Approval accepted";

    if (finalStatus === "completed") {
      message =
        "Approval accepted and workflow completed";
    } else if (finalStatus === "paused") {
      message =
        "Approval accepted and workflow paused again";
    } else if (finalStatus === "failed") {
      message =
        "Approval accepted but workflow failed";
    }

    return res.status(200).json({
      message,
      workflow_run_id:
        step.workflow_run_id,
      status: finalStatus,
    });
  } catch (error) {

    try {
      await client.query("ROLLBACK");
    } catch {
    }

    console.error(
      "approveStep error:",
      error
    );

    return res.status(500).json({
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
}