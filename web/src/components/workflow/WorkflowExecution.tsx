"use client";

import { useState } from "react";

import { graphqlRequest } from "@/src/lib/graphql";
import { TRIGGER_WORKFLOW_RUN } from "@/src/graphql/workflowExecution";

interface WorkflowExecutionProps {
  workflowId: string;
  canRunWorkflow: boolean;
}

interface TriggerWorkflowRunResponse {
  triggerWorkflowRun: {
    message: string;
    workflow_run_id: string;
    workflow_id: string;
    status: string;
  };
}

export default function WorkflowExecution({
  workflowId,
  canRunWorkflow,
}: WorkflowExecutionProps) {
  const [running, setRunning] =
    useState(false);

  const [status, setStatus] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState<string | null>(null);

  async function runWorkflow() {
    if (running || !canRunWorkflow) {
      return;
    }

    try {
      setRunning(true);
      setStatus("running");
      setMessage(null);

      const data =
        await graphqlRequest<
          TriggerWorkflowRunResponse,
          {
            workflowId: string;
          }
        >(
          TRIGGER_WORKFLOW_RUN,
          {
            workflowId,
          }
        );

      const result =
        data.triggerWorkflowRun;

      setStatus(result.status);
      setMessage(result.message);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to run workflow.";

      setStatus("failed");
      setMessage(errorMessage);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="workflow-execution workflow-execution-v2">
      <div className="workflow-execution-header workflow-execution-header-v2">
        <div>
          <h2>Workflow Execution</h2>

          <p>
            Run this workflow and monitor
            its execution.
          </p>
        </div>

        <button
          type="button"
          className="run-workflow-button"
          disabled={
            running || !canRunWorkflow
          }
          onClick={runWorkflow}
        >
          {running
            ? "Running..."
            : canRunWorkflow
              ? "▶ Run Workflow"
              : "Viewer cannot run workflows"}
        </button>
      </div>

      {status && (
        <div
          className={`execution-status execution-status-${status}`}
        >
          <span className="execution-status-dot" />

          <strong>
            {formatStatus(status)}
          </strong>
        </div>
      )}

      {message && (
        <div className="execution-message">
          {message}
        </div>
      )}
    </section>
  );
}

function formatStatus(
  status: string
) {
  switch (status) {
    case "running":
      return "Running";

    case "completed":
      return "Completed";

    case "failed":
      return "Failed";

    case "paused":
      return "Awaiting Approval";

    default:
      return status;
  }
}