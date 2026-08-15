import { pool } from "../db.js";

export interface DbWriteStepConfig {
  result?: unknown;
  include_previous_output?: boolean;
}

export async function executeDbWriteStep(
  workflowRunId: string,
  workflowStepId: string,
  config: DbWriteStepConfig,
  previousOutput: unknown
): Promise<unknown> {
  let result = config.result ?? null;

  if (config.include_previous_output) {
    result = {
      value: result,
      previous_output: previousOutput,
    };
  }

  const insertResult = await pool.query(
    `
    INSERT INTO workflow_results (
      workflow_run_id,
      workflow_step_id,
      result
    )
    VALUES ($1, $2, $3)
    RETURNING
      id,
      workflow_run_id,
      workflow_step_id,
      result,
      created_at
    `,
    [
      workflowRunId,
      workflowStepId,
      JSON.stringify(result),
    ]
  );

  return insertResult.rows[0];
}