import { Request, Response } from "express";
import { pool } from "../db.js";
import { executeWorkflow } from "../workflow/executor.js";
import {
  canRunWorkflow,
  type OrgRole,
} from "../auth/permissions.js";

interface TriggerWorkflowRequest {
  input: {
    workflow_id: string;
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

export async function triggerWorkflowRun(
  req: Request,
  res: Response
) {
  const client = await pool.connect();

  try {
    const body = req.body as TriggerWorkflowRequest;

    const workflowId = body.input?.workflow_id;

    const userId =
      body.session_variables?.["x-hasura-user-id"];

    if (!workflowId) {
      return res.status(400).json({
        message: "workflow_id is required",
      });
    }

    if (!isValidUUID(workflowId)) {
      return res.status(400).json({
        message: "workflow_id must be a valid UUID",
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
        w.id AS workflow_id,
        w.org_id,
        o.quota_limit,
        o.quota_used,
        om.role
      FROM workflows w
      JOIN organizations o
        ON o.id = w.org_id
      JOIN org_members om
        ON om.org_id = w.org_id
      WHERE w.id = $1
        AND om.user_id = $2
      FOR UPDATE OF o
      `,
      [workflowId, userId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Workflow not found",
      });
    }

    const workflow = result.rows[0];

const role = workflow.role as OrgRole;


if (!canRunWorkflow(role)) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message:
          "You do not have permission to run this workflow",
      });
    }

    if (workflow.quota_used >= workflow.quota_limit) {
      await client.query("ROLLBACK");

      return res.status(429).json({
        message:
          "Organization workflow quota exhausted",
      });
    }

    const runResult = await client.query(
      `
      INSERT INTO workflow_runs (
        workflow_id,
        trigger_type,
        status,
        started_at
      )
      VALUES (
        $1,
        'manual',
        'running',
        NOW()
      )
      RETURNING
        id,
        workflow_id,
        status
      `,
      [workflow.workflow_id]
    );

    const run = runResult.rows[0];

    await client.query("COMMIT");

    const finalStatus = await executeWorkflow({
        id: run.id,
        workflow_id: run.workflow_id,
        organization_id: workflow.org_id,
    });

    return res.status(200).json({
        message:
            finalStatus === "paused"
                ? "Workflow paused awaiting approval"
                : finalStatus === "failed"
                    ? "Workflow failed"
                    : "Workflow completed",

        workflow_run_id: run.id,
        workflow_id: run.workflow_id,
        status: finalStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "triggerWorkflowRun error:",
      error
    );

    return res.status(500).json({
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
}