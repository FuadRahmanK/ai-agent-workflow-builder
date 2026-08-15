import { Request, Response } from "express";
import { pool } from "../db.js";
import { executeWorkflow } from "../workflow/executor.js";

type DatabaseOperation =
  | "INSERT"
  | "UPDATE"
  | "DELETE"
  | "MANUAL";

interface HasuraEventPayload {
  id?: string;
  event?: {
    op?: DatabaseOperation;
    data?: {
      new?: unknown;
      old?: unknown;
    };
    session_variables?: Record<
      string,
      string
    >;
  };
  table?: {
    schema?: string;
    name?: string;
  };
  trigger?: {
    name?: string;
  };
}

interface DatabaseTriggerRow {
  trigger_id: string;
  workflow_id: string;
  org_id: string;
  config: Record<string, unknown>;
  quota_limit: number;
  quota_used: number;
}

export async function databaseEvent(
  req: Request,
  res: Response
) {

  const expectedSecret =
    process.env.WORKFLOW_DATABASE_EVENT_SECRET?.trim();

  if (expectedSecret) {
    const providedSecret =
      req.header("x-workflow-event-secret")?.trim();

    if (!providedSecret || providedSecret !== expectedSecret) {
      console.warn(
        "Database event rejected: invalid or missing secret."
      );

      return res.status(401).json({
        message: "Invalid database event secret",
      });
    }
  }

  const body =
    req.body as HasuraEventPayload;

  const schema =
    body.table?.schema;

  const table =
    body.table?.name;

  const operation =
    body.event?.op;

  const eventId =
    body.id;

  if (
    !schema ||
    !table ||
    !operation
  ) {
    return res.status(400).json({
      message:
        "Invalid Hasura database event payload",
    });
  }

  if (
    !["INSERT", "UPDATE", "DELETE", "MANUAL"]
      .includes(operation)
  ) {
    return res.status(400).json({
      message:
        "Unsupported database event operation",
    });
  }

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const result =
      await client.query<DatabaseTriggerRow>(
        `
        SELECT
          wt.id AS trigger_id,
          wt.workflow_id,
          wt.config,
          w.org_id,
          o.quota_limit,
          o.quota_used
        FROM workflow_triggers wt
        JOIN workflows w
          ON w.id = wt.workflow_id
        JOIN organizations o
          ON o.id = w.org_id
        WHERE wt.type = 'database_event'
          AND wt.enabled = TRUE
          AND COALESCE(
            wt.config->>'schema',
            'public'
          ) = $1
          AND wt.config->>'table' = $2
        FOR UPDATE OF o
        `,
        [schema, table]
      );

    const matchingTriggers =
      result.rows.filter(
        (trigger) => {
          const configuredOperations =
            getOperations(
              trigger.config
            );

          return configuredOperations.includes(
            operation
          );
        }
      );

    const createdRuns: Array<{
      workflow_run_id: string;
      workflow_id: string;
      status: string;
    }> = [];

    for (const trigger of matchingTriggers) {
      if (
        trigger.quota_used >=
        trigger.quota_limit
      ) {
        console.warn(
          `Database event skipped for workflow ${trigger.workflow_id}: quota exhausted.`
        );

        continue;
      }

      const runResult =
        await client.query<{
          id: string;
          workflow_id: string;
          status: string;
        }>(
          `
          INSERT INTO workflow_runs (
            workflow_id,
            trigger_type,
            status,
            started_at,
            source_event_id
          )
          VALUES (
            $1,
            'database_event',
            'running',
            NOW(),
            $2
          )
          ON CONFLICT (
            workflow_id,
            source_event_id
          )
          DO NOTHING
          RETURNING
            id,
            workflow_id,
            status
          `,
          [
            trigger.workflow_id,
            eventId ?? null,
          ]
        );

      if (
        runResult.rows.length === 0
      ) {
        continue;
      }

      const run =
        runResult.rows[0];

      createdRuns.push({
        workflow_run_id: run.id,
        workflow_id:
          run.workflow_id,
        status: run.status,
      });
    }

    await client.query("COMMIT");

    const results = [];

    for (const run of createdRuns) {
      const finalStatus =
        await executeWorkflow({
          id: run.workflow_run_id,
          workflow_id:
            run.workflow_id,
          organization_id:
            matchingTriggers.find(
              (trigger) =>
                trigger.workflow_id ===
                run.workflow_id
            )?.org_id ?? "",
        });

      results.push({
        workflow_run_id:
          run.workflow_run_id,
        workflow_id:
          run.workflow_id,
        status: finalStatus,
      });
    }

    return res.status(200).json({
      message:
        "Database event processed",
      event_id: eventId ?? null,
      schema,
      table,
      operation,
      runs: results,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
    }

    console.error(
      "databaseEvent error:",
      error
    );

    return res.status(500).json({
      message:
        "Internal server error",
    });
  } finally {
    client.release();
  }
}

function getOperations(
  config: Record<string, unknown>
): DatabaseOperation[] {
  if (!Array.isArray(config.operations)) {
    return ["INSERT"];
  }

  return config.operations.filter(
    (value): value is DatabaseOperation =>
      typeof value === "string" &&
      [
        "INSERT",
        "UPDATE",
        "DELETE",
        "MANUAL",
      ].includes(value)
  );
}