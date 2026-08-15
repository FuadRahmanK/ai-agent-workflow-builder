import { pool } from "../db.js";

export interface NotifyStepConfig {
  channel?: "email" | "slack";
  recipient?: string;
  subject?: string;
  message: string;
  include_previous_output?: boolean;
}

export async function executeNotifyStep(
  workflowRunId: string,
  workflowStepId: string,
  organizationId: string,
  config: NotifyStepConfig,
  previousOutput: unknown
): Promise<unknown> {
  if (!config.message) {
    throw new Error(
      "Notify step requires a message"
    );
  }

  let message = config.message;

  if (config.include_previous_output) {
    message += `\n\nPrevious step output:\n${JSON.stringify(
      previousOutput
    )}`;
  }

  const channel = config.channel ?? "email";

  const result = await pool.query(
    `
    INSERT INTO notifications (
      workflow_run_id,
      workflow_step_id,
      organization_id,
      channel,
      recipient,
      subject,
      message,
      status
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      'pending'
    )
    RETURNING
      id,
      workflow_run_id,
      workflow_step_id,
      organization_id,
      channel,
      recipient,
      subject,
      message,
      status,
      created_at
    `,
    [
      workflowRunId,
      workflowStepId,
      organizationId,
      channel,
      config.recipient ?? null,
      config.subject ?? null,
      message,
    ]
  );

  return result.rows[0];
}