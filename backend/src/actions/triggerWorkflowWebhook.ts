import { Request, Response } from "express";
import { pool } from "../db.js";
import { executeWorkflow } from "../workflow/executor.js";

interface WebhookRequest {
  input?: {
    workflow_id?: string;
    secret?: string;
    payload?: unknown;
  };

  session_variables?: {
    "x-hasura-user-id"?: string;
  };
}

interface WebhookConfig {
  secret?: string;
}

function isValidUUID(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const uuid = value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    uuid
  );
}

export async function triggerWorkflowWebhook(
  req: Request,
  res: Response
) {
  const client = await pool.connect();

  try {
    const body = req.body as WebhookRequest;

    const workflowId =
      body.input?.workflow_id?.trim();

    const providedSecret =
      body.input?.secret;

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

    if (!providedSecret) {
      return res.status(401).json({
        message: "Webhook secret is required",
      });
    }

    await client.query("BEGIN");

    const result = await client.query(
      `
      SELECT
        wt.id AS trigger_id,
        wt.workflow_id,
        wt.type,
        wt.config,
        wt.enabled,

        w.org_id,

        o.quota_limit,
        o.quota_used

      FROM workflow_triggers wt

      JOIN workflows w
        ON w.id = wt.workflow_id

      JOIN organizations o
        ON o.id = w.org_id

      WHERE wt.workflow_id = $1
        AND wt.type = 'webhook'

      FOR UPDATE OF o

      LIMIT 1
      `,
      [workflowId]
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        message: "Webhook trigger not found",
      });
    }

    const webhook = result.rows[0];

    const config =
      webhook.config as WebhookConfig;

    if (
      !config.secret ||
      providedSecret !== config.secret
    ) {
      await client.query("ROLLBACK");

      return res.status(401).json({
        message: "Invalid webhook secret",
      });
    }

    if (!webhook.enabled) {
      await client.query("ROLLBACK");

      return res.status(403).json({
        message: "Webhook trigger is disabled",
      });
    }

    if (
      webhook.quota_used >=
      webhook.quota_limit
    ) {
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
        'webhook',
        'running',
        NOW()
      )
      RETURNING
        id,
        workflow_id,
        status
      `,
      [webhook.workflow_id]
    );

    const run = runResult.rows[0];

    await client.query("COMMIT");

    const finalStatus =
      await executeWorkflow({
        id: run.id,
        workflow_id: run.workflow_id,
        organization_id: webhook.org_id,
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
    try {
      await client.query("ROLLBACK");
    } catch {
    }

    console.error(
      "triggerWorkflowWebhook error:",
      error
    );

    return res.status(500).json({
      message: "Internal server error",
    });
  } finally {
    client.release();
  }
}