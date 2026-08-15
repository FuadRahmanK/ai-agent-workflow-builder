import { pool } from "../db.js";
import {
  executeStep,
  type WorkflowStep,
} from "./stepExecutor.js";

export type WorkflowExecutionStatus =
  | "completed"
  | "paused"
  | "failed";

interface WorkflowRun {
  id: string;
  workflow_id: string;
  organization_id: string;
}

interface ConditionalOutput {
  conditionMet: boolean;
  value: unknown;
}

export async function resumeWorkflow(
  workflowRunId: string
): Promise<WorkflowExecutionStatus> {

  const runResult = await pool.query<WorkflowRun>(
    `
    SELECT
      wr.id,
      wr.workflow_id,
      w.org_id AS organization_id
    FROM workflow_runs wr
    JOIN workflows w
      ON w.id = wr.workflow_id
    WHERE wr.id = $1
    LIMIT 1
    `,
    [workflowRunId]
  );

  if (runResult.rows.length === 0) {
    throw new Error(
      "Workflow run not found"
    );
  }

  const run = runResult.rows[0];

  const approvalResult =
    await pool.query(
      `
      SELECT
        sr.id,
        sr.workflow_step_id,
        ws.position
      FROM step_runs sr

      JOIN workflow_steps ws
        ON ws.id = sr.workflow_step_id

      WHERE sr.workflow_run_id = $1
        AND ws.type = 'approval_gate'
        AND sr.approved_at IS NOT NULL

      ORDER BY ws.position DESC

      LIMIT 1
      `,
      [workflowRunId]
    );

  if (
    approvalResult.rows.length === 0
  ) {
    throw new Error(
      "Approved approval gate not found"
    );
  }

  const approvalStep =
    approvalResult.rows[0];

  const stepsResult =
    await pool.query<WorkflowStep>(
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
        AND position > $2
      ORDER BY position ASC
      `,
      [
        run.workflow_id,
        approvalStep.position,
      ]
    );

  const steps = stepsResult.rows;

  if (steps.length === 0) {
    await completeWorkflow(
      workflowRunId,
      run.organization_id
    );

    return "completed";
  }

  const previousResult =
    await pool.query(
      `
      SELECT
        sr.output
      FROM step_runs sr

      JOIN workflow_steps ws
        ON ws.id = sr.workflow_step_id

      WHERE sr.workflow_run_id = $1
        AND ws.position < $2
        AND sr.status = 'completed'

      ORDER BY ws.position DESC

      LIMIT 1
      `,
      [
        workflowRunId,
        approvalStep.position,
      ]
    );

  let previousOutput: unknown =
    previousResult.rows[0]?.output ?? null;

  let activeBranch:
    | "true"
    | "false"
    | null = null;

  for (const step of steps) {

    const stepRunResult =
      await pool.query(
        `
        SELECT
          id,
          status
        FROM step_runs
        WHERE workflow_run_id = $1
          AND workflow_step_id = $2
        LIMIT 1
        `,
        [workflowRunId, step.id]
      );

    if (
      stepRunResult.rows.length === 0
    ) {
      await pool.query(
        `
        INSERT INTO step_runs (
          workflow_run_id,
          workflow_step_id,
          status
        )
        VALUES ($1, $2, 'pending')
        `,
        [workflowRunId, step.id]
      );
    }

    const stepRun =
      await pool.query(
        `
        SELECT
          id,
          status
        FROM step_runs
        WHERE workflow_run_id = $1
          AND workflow_step_id = $2
        LIMIT 1
        `,
        [workflowRunId, step.id]
      );

    const stepRunId =
      stepRun.rows[0].id;

    if (
      activeBranch !== null &&
      step.branch !== null
    ) {

      if (
        step.branch !== activeBranch
      ) {
        await markStepSkipped(
          stepRunId
        );

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

    await pool.query(
      `
      UPDATE step_runs
      SET
        status = 'running',
        started_at = NOW(),
        attempt_count = attempt_count + 1,
        input = $1
      WHERE id = $2
      `,
      [
        JSON.stringify({
          previous_output:
            previousOutput,
        }),
        stepRunId,
      ]
    );

    try {

      const output = await executeStep(
  step,
  {
    previousOutput,
    workflowRunId: run.id,
    organizationId: run.organization_id,
    stepOutputs: {},
  }
);

      if (
        step.type ===
        "approval_gate"
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
          [workflowRunId]
        );

        return "paused";
      }

      await pool.query(
        `
        UPDATE step_runs
        SET
          status = 'completed',
          output = $1,
          completed_at = NOW()
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

      previousOutput = output;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Step execution failed";

      await pool.query(
        `
        UPDATE step_runs
        SET
          status = 'failed',
          error = $1,
          completed_at = NOW()
        WHERE id = $2
        `,
        [message, stepRunId]
      );

      await pool.query(
        `
        UPDATE workflow_runs
        SET
          status = 'failed',
          error = $1,
          completed_at = NOW()
        WHERE id = $2
        `,
        [message, workflowRunId]
      );

      return "failed";
    }
  }

  await completeWorkflow(
    workflowRunId,
    run.organization_id
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

async function completeWorkflow(
  workflowRunId: string,
  organizationId: string
): Promise<void> {
  await pool.query(
    `
    UPDATE workflow_runs
    SET
      status = 'completed',
      completed_at = NOW()
    WHERE id = $1
    `,
    [workflowRunId]
  );

  await pool.query(
    `
    UPDATE organizations
    SET
      quota_used = quota_used + 1
    WHERE id = $1
    `,
    [organizationId]
  );
}