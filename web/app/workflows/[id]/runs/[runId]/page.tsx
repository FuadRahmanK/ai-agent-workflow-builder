"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { graphqlRequest } from "@/src/lib/graphql";
import { GET_WORKFLOW_RUN } from "@/src/graphql/workflowRun";
import { APPROVE_STEP } from "@/src/graphql/approval";
import Link from "next/link";

interface WorkflowStepRun {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;

  workflow_step: {
    id: string;
    name: string;
    type: string;
    position: number;
  } | null;
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  trigger_type: string;
  status: string;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  step_runs: WorkflowStepRun[];
}

interface WorkflowRunResponse {
  workflow_runs_by_pk: WorkflowRun | null;
}

interface WorkflowRunPageProps {
  params: Promise<{
    id: string;
    runId: string;
  }>;
}

export default function WorkflowRunPage({
  params,
}: WorkflowRunPageProps) {
  const [run, setRun] =
    useState<WorkflowRun | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [workflowId, setWorkflowId] =
    useState<string | null>(null);

  const [approvingStepId, setApprovingStepId] =
    useState<string | null>(null);

  const loadRun = useCallback(
    async (runId: string) => {
      try {
        setError(null);

        const data =
          await graphqlRequest<
            WorkflowRunResponse,
            {
              runId: string;
            }
          >(
            GET_WORKFLOW_RUN,
            {
              runId,
            }
          );

        if (
          !data.workflow_runs_by_pk
        ) {
          setError(
            "Workflow run not found."
          );

          return;
        }

        setRun(
          data.workflow_runs_by_pk
        );

        setWorkflowId(
          data.workflow_runs_by_pk
            .workflow_id
        );
      } catch (err) {
        console.error(
          "Failed to load workflow run:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load workflow run."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  async function approveStep(stepRunId: string) {
    if (approvingStepId) {
      return;
    }

    try {
      setApprovingStepId(stepRunId);
      setError(null);

      await graphqlRequest<
        {
          approveStep: {
            message: string;
            workflow_run_id: string;
            status: string;
          };
        },
        { stepRunId: string }
      >(APPROVE_STEP, {
        stepRunId,
      });

      const { runId } = await params;
      await loadRun(runId);
    } catch (err) {
      console.error("Failed to approve step:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Failed to approve step."
      );
    } finally {
      setApprovingStepId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void params.then(
      ({ runId }) => {
        if (!cancelled) {
          void loadRun(runId);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [params, loadRun]);

  useEffect(() => {
    if (
      !run ||
      (run.status !== "running" &&
        run.status !== "paused")
    ) {
      return;
    }

    const interval =
      window.setInterval(() => {
        void params.then(
          ({ runId }) =>
            loadRun(runId)
        );
      }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    run,
    params,
    loadRun,
  ]);

  if (loading) {
    return (
      <main className="run-details-page">
        <div className="execution-empty">
          Loading workflow run...
        </div>
      </main>
    );
  }

  if (error || !run) {
    return (
      <main className="run-details-page">
        <div className="execution-error">
          {error ??
            "Workflow run not found."}
        </div>
      </main>
    );
  }

  return (
    <main className="run-details-page">
      <header className="run-details-header">
        <div>
          <Link
            href={`/workflows/${workflowId}`}
            className="run-back-link"
          >
            ← Back to Workflow
        </Link>

          <h1>
            Workflow Run
          </h1>

          <p className="run-id">
            {run.id}
          </p>
        </div>

        <StatusBadge
          status={run.status}
        />
      </header>

      <section className="run-summary">
        <div>
          <span>Status</span>
          <strong>
            {formatStatus(
              run.status
            )}
          </strong>
        </div>

        <div>
          <span>Trigger</span>

          <strong className="run-trigger-value">
            {formatTriggerType(
              run.trigger_type
            )}
          </strong>
        </div>

        <div>
          <span>Started</span>
          <strong>
            {formatDate(
              run.started_at
            )}
          </strong>
        </div>

        <div>
          <span>Completed</span>
          <strong>
            {formatDate(
              run.completed_at
            )}
          </strong>
        </div>

        <div>
          <span>Steps</span>
          <strong>
            {run.step_runs.length}
          </strong>
        </div>
      </section>

      {run.error && (
        <section className="run-error">
          <strong>
            Workflow Error
          </strong>

          <p>
            {run.error}
          </p>
        </section>
      )}

      {run.status === "paused" && (
        <section className="execution-approval">
          <div className="run-approval-panel-content">
            <div className="run-approval-panel-badge">
              Approval required
            </div>

            <div>
              <h2>
                Workflow is waiting for approval
              </h2>

              <p>
                This run is paused at an approval gate.
                An owner or editor must approve it before
                the workflow can continue.
              </p>
            </div>
          </div>

          <div className="run-approval-panel-action">
            {run.step_runs
              .filter(
                (stepRun) =>
                  stepRun.status === "paused" &&
                  stepRun.workflow_step?.type ===
                    "approval_gate"
              )
              .map((stepRun) => (
                <button
                  key={stepRun.id}
                  type="button"
                  className="run-approve-button"
                  disabled={
                    approvingStepId === stepRun.id
                  }
                  onClick={() => {
                    void approveStep(stepRun.id);
                  }}
                >
                  {approvingStepId === stepRun.id
                    ? "Approving..."
                    : "Approve & Continue"}
                </button>
              ))}

            {!run.step_runs.some(
              (stepRun) =>
                stepRun.status === "paused" &&
                stepRun.workflow_step?.type ===
                  "approval_gate"
            ) && (
              <span className="run-approval-panel-note">
                Approval gate is not currently available.
              </span>
            )}
          </div>
        </section>
      )}

      <section className="run-timeline">
        <div className="run-section-header">
          <div>
            <h2>
              Execution Timeline
            </h2>

            <p>
              Detailed results for
              every workflow step.
            </p>
          </div>
        </div>

        <div className="run-step-list">
          {run.step_runs.map(
            (stepRun) => (
              <RunStep
                key={stepRun.id}
                stepRun={stepRun}
              />
            )
          )}

          {run.step_runs.length ===
            0 && (
            <div className="execution-empty">
              No step runs recorded.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function RunStep({
  stepRun,
}: {
  stepRun: WorkflowStepRun;
}) {
  const step =
    stepRun.workflow_step;

  return (
    <article className="run-step">
      <div className="run-step-marker">
        <span>
          {step?.position ?? "?"}
        </span>
      </div>

      <div className="run-step-content">
        <div className="run-step-header">
          <div>
            <h3>
              {step?.name ??
                "Unknown Step"}
            </h3>

            <p>
              {formatStepType(
                step?.type ??
                  "unknown"
              )}
            </p>
          </div>

          <StatusBadge
            status={stepRun.status}
          />
        </div>

        <div className="run-step-meta">
          <span>
            Attempts:{" "}
            {stepRun.attempt_count}
          </span>

          <span>
            Started:{" "}
            {formatDate(
              stepRun.started_at
            )}
          </span>

          <span>
            Completed:{" "}
            {formatDate(
              stepRun.completed_at
            )}
          </span>
        </div>

        {stepRun.status ===
          "paused" && (
          <div className="run-approval">
            Awaiting approval
            <span>
              Use the approval action above to continue
              this workflow.
            </span>
          </div>
        )}

        {stepRun.error && (
          <div className="run-step-error">
            <strong>
              Error
            </strong>

            <p>
              {stepRun.error}
            </p>
          </div>
        )}

        {stepRun.output !==
          null &&
          stepRun.output !==
            undefined && (
            <details>
              <summary>
                Output
              </summary>

              <pre>
                {formatJson(
                  stepRun.output
                )}
              </pre>
            </details>
          )}

        {stepRun.input !==
          null &&
          stepRun.input !==
            undefined && (
            <details>
              <summary>
                Input
              </summary>

              <pre>
                {formatJson(
                  stepRun.input
                )}
              </pre>
            </details>
          )}

        {stepRun.approved_at && (
          <div className="run-approval-info">
            ✓ Approved at{" "}
            {formatDate(
              stepRun.approved_at
            )}

            {stepRun.approved_by &&
              ` by ${stepRun.approved_by}`}
          </div>
        )}
      </div>
    </article>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  return (
    <span
      className={`execution-status-badge execution-status-${status}`}
    >
      {formatStatus(status)}
    </span>
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

    case "pending":
      return "Pending";

    default:
      return status;
  }
}

function formatTriggerType(
  triggerType: string
) {
  switch (triggerType) {
    case "manual":
      return "Manual";

    case "webhook":
      return "Webhook";

    case "database_event":
      return "Database Event";

    case "scheduled":
      return "Scheduled";

    default:
      return triggerType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) =>
          char.toUpperCase()
        );
  }
}

function formatStepType(
  type: string
) {
  return type
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return new Date(
    value
  ).toLocaleString();
}

function formatJson(
  value: unknown
) {
  if (
    typeof value ===
    "string"
  ) {
    return value;
  }

  try {
    return JSON.stringify(
      value,
      null,
      2
    );
  } catch {
    return String(value);
  }
}