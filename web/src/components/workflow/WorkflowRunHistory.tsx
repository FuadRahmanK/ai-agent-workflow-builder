"use client";

import Link from "next/link";
import { createClient, type Client } from "graphql-ws";
import { generateServiceUrl } from "@nhost/nhost-js";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { graphqlRequest } from "@/src/lib/graphql";
import { GET_WORKFLOW_RUNS } from "@/src/graphql/workflowRuns";
import { nhost } from "@/src/lib/nhost";

interface WorkflowRunHistoryProps {
  workflowId: string;
}

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

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[];
}

interface WorkflowRunSubscriptionResponse {
  workflow_runs: Array<{
    id: string;
    workflow_id: string;
    trigger_type: string;
    status: string;
    error: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>;
}

const WORKFLOW_RUN_SUBSCRIPTION = `
  subscription WorkflowRuns(
    $workflowId: uuid!
  ) {
    workflow_runs(
      where: {
        workflow_id: {
          _eq: $workflowId
        }
      }
      order_by: {
        started_at: desc
      }
    ) {
      id
      workflow_id
      trigger_type
      status
      error
      started_at
      completed_at
    }
  }
`;

type RunFilter =
  | "all"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export default function WorkflowRunHistory({
  workflowId,
}: WorkflowRunHistoryProps) {
  const [runs, setRuns] =
    useState<WorkflowRun[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [runFilter, setRunFilter] =
    useState<RunFilter>("all");

  const loadRuns = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        setError(null);

        const data =
          await graphqlRequest<
            WorkflowRunsResponse,
            {
              workflowId: string;
            }
          >(
            GET_WORKFLOW_RUNS,
            {
              workflowId,
            }
          );

        setRuns(
          data.workflow_runs
        );
      } catch (err) {
        console.error(
          "Failed to load workflow runs:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load workflow runs."
        );
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [workflowId]
  );

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        void loadRuns(true);
      }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadRuns]);

  useEffect(() => {
    let disposed = false;

    let client: Client | null = null;

    let runSubscription:
      | (() => void)
      | null = null;

    async function startSubscriptions() {
      try {
        const session =
          await nhost.refreshSession(60);

        if (
          disposed ||
          !session?.accessToken
        ) {
          return;
        }

        const subdomain =
          process.env
            .NEXT_PUBLIC_NHOST_SUBDOMAIN;

        const region =
          process.env
            .NEXT_PUBLIC_NHOST_REGION;

        if (!subdomain || !region) {
          throw new Error(
            "Nhost environment variables are not configured"
          );
        }

        const graphqlUrl =
          generateServiceUrl(
            "graphql",
            subdomain,
            region
          );

        const wsUrl =
          graphqlUrl
            .replace(
              /^https:/,
              "wss:"
            )
            .replace(
              /^http:/,
              "ws:"
            );

        client = createClient({
          url: wsUrl,
          lazy: true,
          retryAttempts: 5,
          shouldRetry: () => true,

          connectionParams:
            async () => {
              const currentSession =
                await nhost.refreshSession(
                  60
                );

              return {
                headers: {
                  Authorization: `Bearer ${
                    currentSession?.accessToken ??
                    session.accessToken
                  }`,
                },
              };
            },
        });

        runSubscription =
          client.subscribe(
            {
              query:
                WORKFLOW_RUN_SUBSCRIPTION,

              variables: {
                workflowId,
              },
            },

            {
              next: (result) => {
                if (disposed) {
                  return;
                }

                const data =
                  result.data as
                    | WorkflowRunSubscriptionResponse
                    | undefined;

                if (
                  !data?.workflow_runs
                ) {
                  return;
                }

                void loadRuns(false);
              },

              error: (
                subscriptionError
              ) => {
                console.error(
                  "Workflow run subscription error:",
                  subscriptionError
                );
              },

              complete: () => {
                if (!disposed) {
                }
              },
            }
          );
      } catch (err) {
        if (disposed) {
          return;
        }

        console.error(
          "Failed to start GraphQL subscriptions:",
          err
        );
      }
    }

    void startSubscriptions();

    return () => {
      disposed = true;

      runSubscription?.();

      client?.dispose();
    };
  }, [
    workflowId,
    loadRuns,
  ]);

  const runCounts = {
    all: runs.length,

    running: runs.filter(
      (run) =>
        run.status === "running"
    ).length,

    paused: runs.filter(
      (run) =>
        run.status === "paused"
    ).length,

    completed: runs.filter(
      (run) =>
        run.status === "completed"
    ).length,

    failed: runs.filter(
      (run) =>
        run.status === "failed"
    ).length,
  };

  const filteredRuns =
    runFilter === "all"
      ? runs
      : runs.filter(
          (run) =>
            run.status ===
            runFilter
        );

  if (loading) {
    return (
      <section className="workflow-run-history workflow-run-history-v2">
        <div className="workflow-run-header workflow-run-header-v2">
          <div>
            <h2>
              Execution History
            </h2>

            <p>
              View previous workflow
              executions.
            </p>
          </div>
        </div>

        <div className="execution-empty">
          Loading workflow runs...
        </div>
      </section>
    );
  }

  return (
    <section className="workflow-run-history workflow-run-history-v2">
      <div className="workflow-run-header workflow-run-header-v2">
        <div>
          <h2>
            Execution History
          </h2>

          <p>
            View previous workflow
            executions and their step
            results.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadRuns(true);
          }}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {}
      <div className="execution-filters">
        {(
          [
            "all",
            "running",
            "paused",
            "completed",
            "failed",
          ] as RunFilter[]
        ).map((filter) => (
          <button
            key={filter}
            type="button"
            className={
              runFilter === filter
                ? "execution-filter execution-filter-active"
                : "execution-filter"
            }
            onClick={() =>
              setRunFilter(filter)
            }
          >
            <span>
              {formatFilterLabel(
                filter
              )}
            </span>

            <strong>
              {runCounts[filter]}
            </strong>
          </button>
        ))}
      </div>

      {}
      {runs.length > 0 && (
        <div className="execution-latest">
          <span>
            Latest Run
          </span>

          <strong>
            {formatStatus(
              runs[0].status
            )}
          </strong>

          <span>
            {formatTriggerType(
              runs[0].trigger_type
            )}
          </span>

          <span>
            {formatDate(
              runs[0].started_at
            )}
          </span>
        </div>
      )}

      {error && (
        <div className="execution-error">
          {error}
        </div>
      )}

      {runs.length === 0 ? (
        <div className="execution-empty">
          No workflow runs yet.
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="execution-empty">
          No{" "}
          {formatFilterLabel(
            runFilter
          ).toLowerCase()}{" "}
          workflow runs.
        </div>
      ) : (
        <div className="execution-run-list execution-run-list-full">
          {filteredRuns.map((run) => (
            <Link
              key={run.id}
              href={`/workflows/${workflowId}/runs/${run.id}`}
              className="execution-run-card execution-run-card-link"
            >
              <div className="execution-run-card-top">
                <strong>
                  {formatStatus(
                    run.status
                  )}
                </strong>

                <span>
                  {formatDate(
                    run.started_at
                  )}
                </span>
              </div>

              {}
              <div className="execution-run-trigger">
                <span className="execution-run-trigger-label">
                  Trigger
                </span>

                <span className="execution-run-trigger-value">
                  {formatTriggerType(
                    run.trigger_type
                  )}
                </span>
              </div>

              <div className="execution-run-card-meta">
                <span>
                  {run.step_runs.length}{" "}
                  {run.step_runs.length === 1
                    ? "step"
                    : "steps"}
                </span>

                {run.completed_at && (
                  <span>
                    Completed{" "}
                    {formatDate(
                      run.completed_at
                    )}
                  </span>
                )}

                {run.error && (
                  <span className="execution-run-card-error">
                    {run.error}
                  </span>
                )}
              </div>

              <span className="execution-run-card-action">
                View execution details →
              </span>
            </Link>
          ))}
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

    case "pending":
      return "Pending";

    case "skipped":
      return "Skipped";

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

function formatFilterLabel(
  filter: RunFilter
) {
  switch (filter) {
    case "all":
      return "All";

    case "running":
      return "Running";

    case "paused":
      return "Paused";

    case "completed":
      return "Completed";

    case "failed":
      return "Failed";
  }
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