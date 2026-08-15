"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useOrganization } from "@/src/components/auth/OrganizationProvider";
import { graphqlRequest } from "@/src/lib/graphql";
import { GET_MY_WORKFLOWS } from "@/src/graphql/workflows";
import LogoutButton from "@/src/components/auth/LogoutButton";

import type { Workflow } from "@/src/types/workflow";

interface WorkflowsQueryResult {
  workflows: Workflow[];
}

export default function DashboardPage() {
  const {
    memberships,
    activeMembership,
    selectOrganization,
    loading: organizationLoading,
    error: organizationError,
  } = useOrganization();

  const router = useRouter();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!activeMembership) {
      return;
    }

    const organizationId = activeMembership.organization.id;

    async function loadWorkflows() {
      try {
        setLoading(true);
        setError(null);

        const data = await graphqlRequest<
          WorkflowsQueryResult,
          { orgId: string }
        >(GET_MY_WORKFLOWS, { orgId: organizationId });

        setWorkflows(data.workflows ?? []);
      } catch (err) {
        console.error("Failed to load workflows:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load workflows"
        );
      } finally {
        setLoading(false);
      }
    }

    void loadWorkflows();
  }, [activeMembership]);

  if (organizationLoading) {
    return (
      <main className="dashboard">
        <div className="page-state">Loading organization...</div>
      </main>
    );
  }

  if (organizationError) {
    return (
      <main className="dashboard">
        <div className="error-card">
          <h1>Unable to load organization</h1>
          <p>{organizationError}</p>
        </div>
      </main>
    );
  }

  if (!activeMembership) {
    return (
      <main className="dashboard">
        <div className="empty-card">
          <h1>No organization found</h1>
          <p>This user does not belong to an organization.</p>
        </div>
      </main>
    );
  }

  const organization = activeMembership.organization;
  const role = activeMembership.role;

  const usagePercentage =
    organization.quota_limit > 0
      ? Math.min(
          100,
          (organization.quota_used / organization.quota_limit) * 100
        )
      : 0;

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredWorkflows = workflows.filter((workflow) => {
    if (!normalizedSearchQuery) {
      return true;
    }

    return (
      workflow.name.toLowerCase().includes(normalizedSearchQuery) ||
      (workflow.description ?? "")
        .toLowerCase()
        .includes(normalizedSearchQuery)
    );
  });

  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-product-name">AI Workflow Builder</span>
          <h1>{organization.name}</h1>
          <p>Workflow automation</p>
        </div>

        <div className="user-info">
          {memberships.length > 0 && (
            <label className="organization-selector">
              <span className="sr-only">Select organization</span>
              <select
                value={activeMembership.organization.id}
                onChange={(event) => selectOrganization(event.target.value)}
                aria-label="Select organization"
              >
                {memberships.map((membership) => (
                  <option
                    key={membership.organization.id}
                    value={membership.organization.id}
                  >
                    {membership.organization.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <span className="role-badge">{role}</span>
          <LogoutButton />
        </div>
      </header>

      <section className="usage-card">
        <div className="usage-card-header">
          <div>
            <h2>Usage</h2>
            <p>
              {organization.quota_used} / {organization.quota_limit} workflow runs
            </p>
          </div>
          <span className="usage-percentage">{Math.round(usagePercentage)}%</span>
        </div>

        <div className="usage-bar" aria-label="Workflow run usage">
          <div
            className="usage-progress"
            style={{ width: `${usagePercentage}%` }}
          />
        </div>
      </section>

      <section className="workflows-section">
        <div className="section-header">
          <div>
            <h2>Workflows</h2>
            <p>Create, configure and run your workflows.</p>
          </div>

          {role !== "viewer" && (
            <button
              type="button"
              onClick={() => router.push("/workflows/new")}
            >
              + New Workflow
            </button>
          )}
        </div>

        <div className="workflow-filters">
          <div className="workflow-search">
            <label htmlFor="workflow-search">Search workflows</label>
            <input
              id="workflow-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search workflows..."
            />
          </div>
        </div>

        {loading && (
          <div className="empty-card">
            <p>Loading workflows...</p>
          </div>
        )}

        {error && (
          <div className="error-card">
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && workflows.length === 0 && (
          <div className="empty-card">
            <h3>No workflows yet</h3>
            <p>Create your first workflow to get started.</p>
          </div>
        )}

        {!loading && !error && workflows.length > 0 && filteredWorkflows.length === 0 && (
          <div className="empty-card">
            <h3>No matching workflows</h3>
            <p>Try a different search.</p>
          </div>
        )}

        {!loading && !error && filteredWorkflows.length > 0 && (
          <div className="workflow-grid">
            {filteredWorkflows.map((workflow) => {
              const latestRun = workflow.workflow_runs?.[0];

              return (
                <article key={workflow.id} className="workflow-card">
                  <div className="workflow-card-header">
                    <h3>{workflow.name}</h3>
                    {latestRun && (
                      <span className={`status status-${latestRun.status}`}>
                        {formatStatus(latestRun.status)}
                      </span>
                    )}
                  </div>

                  {workflow.description && <p>{workflow.description}</p>}

                  <div className="workflow-meta">
                    <span>{workflow.workflow_steps.length} steps</span>
                    <span>{workflow.workflow_triggers.length} triggers</span>
                    {latestRun && <span>{formatDate(latestRun.started_at)}</span>}
                  </div>

                  <div className="step-list">
                    {workflow.workflow_steps.map((step) => (
                      <div key={step.id} className="step-item">
                        <span>{step.position}.</span>
                        <span>{step.name}</span>
                        <small>{step.type}</small>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="open-workflow"
                    onClick={() => router.push(`/workflows/${workflow.id}`)}
                  >
                    Open Workflow
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function formatStatus(status: string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString();
}