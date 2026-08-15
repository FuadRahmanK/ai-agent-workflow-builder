import { pool } from "../db.js";
import {
  executeStep,
  type WorkflowStep,
} from "./stepExecutor.js";

interface WorkflowRun {
  id: string;
  workflow_id: string;
  organization_id: string;
}

interface ConditionalOutput {
  conditionMet: boolean;
  value: unknown;
}

export type WorkflowExecutionStatus =
  | "completed"
  | "paused"
  | "failed";

const RETRYABLE_STEP_TYPES = new Set([
  "llm_call",
  "http_request",
  "db_write",
]);

const DEFAULT_MAX_RETRIES = 0;

function getMaxRetries(step: WorkflowStep): number {
  if (!RETRYABLE_STEP_TYPES.has(step.type)) {
    return 0;
  }

  const configured =
    step.config?.max_retries;

  if (
    typeof configured !== "number" ||
    !Number.isFinite(configured)
  ) {
    return DEFAULT_MAX_RETRIES;
  }

  return Math.max(
    0,
    Math.min(
      Math.floor(configured),
      5
    )
  );
}

export async function executeWorkflow(
  run: WorkflowRun
): Promise<WorkflowExecutionStatus> {

  const stepsResult = await pool.query<WorkflowStep>(
    `
      SELECT
        id,
        workflow_id,
        position,
        name,
        type,
        config,
        branch
      FROM workflow_steps
      WHERE workflow_id = $1
      ORDER BY position ASC
    `,
    [run.workflow_id]
  );

  const steps = stepsResult.rows;

  if (steps.length === 0) {
    await markRunFailed(
      run.id,
      "Workflow contains no steps"
    );

    return "failed";
  }

  for (const step of steps) {
    await pool.query(
      `
        INSERT INTO step_runs (
          workflow_run_id,
          workflow_step_id,
          status
        )
        VALUES ($1, $2, 'pending')
        ON CONFLICT DO NOTHING
      `,
      [run.id, step.id]
    );
  }

  let previousOutput: unknown = null;

  const stepOutputs: Record<string, unknown> = {};

  let activeBranch:
    | "true"
    | "false"
    | null = null;

  for (const step of steps) {

    const stepRunResult = await pool.query(
      `
        SELECT
          id,
          status
        FROM step_runs
        WHERE workflow_run_id = $1
          AND workflow_step_id = $2
        LIMIT 1
      `,
      [run.id, step.id]
    );

    if (stepRunResult.rows.length === 0) {
      await markRunFailed(
        run.id,
        `Missing step_run for step ${step.id}`
      );

      return "failed";
    }

    const stepRunId =
      stepRunResult.rows[0].id;

    if (
      activeBranch !== null &&
      step.branch !== null
    ) {

      if (step.branch !== activeBranch) {
        await markStepSkipped(stepRunId);
        continue;
      }
    }

    if (
      activeBranch !== null &&
      step.branch === null &&
      step.type !== "conditional_branch"
    ) {
      activeBranch = null;
    }

    const maxRetries =
      getMaxRetries(step);

    let attempt = 0;
    let stepSucceeded = false;

    while (
      !stepSucceeded &&
      attempt <= maxRetries
    ) {
      attempt += 1;

      await pool.query(
        `
          UPDATE step_runs
          SET
            status = 'running',
            started_at =
              CASE
                WHEN started_at IS NULL
                  THEN NOW()
                ELSE started_at
              END,
            attempt_count = attempt_count + 1,
            input = $1,
            error = NULL
          WHERE id = $2
        `,
        [
          JSON.stringify({
            previous_output:
              previousOutput,
            attempt,
            max_retries: maxRetries,
          }),
          stepRunId,
        ]
      );

      try {

        const output =
          await executeStep(
            step,
            {
              previousOutput,
              stepOutputs,
              workflowRunId: run.id,
              organizationId:
                run.organization_id,
            }
          );

        if (
          step.type === "approval_gate"
        ) {
          await pool.query(
            `
              UPDATE step_runs
              SET
                status = 'paused',
                output = $1
              WHERE id = $2
            `,
            [
              JSON.stringify({
                paused: true,
                message:
                  "Workflow is awaiting approval",
              }),
              stepRunId,
            ]
          );

          await pool.query(
            `
              UPDATE workflow_runs
              SET
                status = 'paused'
              WHERE id = $1
            `,
            [run.id]
          );

          return "paused";
        }

        await pool.query(
          `
            UPDATE step_runs
            SET
              status = 'completed',
              output = $1,
              completed_at = NOW(),
              error = NULL
            WHERE id = $2
          `,
          [
            JSON.stringify(output),
            stepRunId,
          ]
        );

        if (
          step.type ===
          "conditional_branch"
        ) {
          const conditional =
            output as ConditionalOutput;

          activeBranch =
            conditional.conditionMet
              ? "true"
              : "false";
        }

        stepOutputs[step.id] =
          output;

        previousOutput = output;

        stepSucceeded = true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Step execution failed";

        console.error(
          `STEP ATTEMPT ${attempt} FAILED:`,
          {
            stepId: step.id,
            stepName: step.name,
            stepType: step.type,
            attempt,
            maxRetries,
            error: message,
          }
        );

        if (attempt <= maxRetries) {

          continue;
        }

        await pool.query(
          `
            UPDATE step_runs
            SET
              status = 'failed',
              error = $1,
              completed_at = NOW()
            WHERE id = $2
          `,
          [
            message,
            stepRunId,
          ]
        );

        await markRunFailed(
          run.id,
          message
        );

        return "failed";
      }
    }

    if (!stepSucceeded) {
      await markRunFailed(
        run.id,
        `Step "${step.name}" failed after ${
          maxRetries + 1
        } attempts`
      );

      return "failed";
    }
  }


  await pool.query(
    `
      UPDATE workflow_runs
      SET
        status = 'completed',
        completed_at = NOW()
      WHERE id = $1
    `,
    [run.id]
  );

  await pool.query(
    `
      UPDATE organizations
      SET
        quota_used = quota_used + 1
      WHERE id = $1
    `,
    [run.organization_id]
  );

  return "completed";
}

async function markStepSkipped(
  stepRunId: string
): Promise<void> {
  await pool.query(
    `
      UPDATE step_runs
      SET
        status = 'skipped',
        completed_at = NOW()
      WHERE id = $1
    `,
    [stepRunId]
  );
}

async function markRunFailed(
  runId: string,
  error: string
): Promise<void> {
  await pool.query(
    `
      UPDATE workflow_runs
      SET
        status = 'failed',
        error = $1,
        completed_at = NOW()
      WHERE id = $2
    `,
    [error, runId]
  );
}