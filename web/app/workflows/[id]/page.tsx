"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useOrganization } from "@/src/components/auth/OrganizationProvider";
import { graphqlRequest } from "@/src/lib/graphql";
import { GET_WORKFLOW } from "@/src/graphql/workflow";
import WorkflowBuilder from "@/src/components/workflow/WorkflowBuilder";

import type {
  Workflow,
} from "@/src/types/workflow";

interface WorkflowQueryResult {
  workflows: Workflow[];
}

export default function WorkflowPage() {
  const params = useParams();
  const router = useRouter();

  const {
    activeMembership,
    loading: organizationLoading,
  } = useOrganization();

  const workflowId = params.id as string;

  const [workflow, setWorkflow] =
    useState<Workflow | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!workflowId) {
      return;
    }

    let cancelled = false;

    if (workflowId === "new") {
      if (organizationLoading) {
        return;
      }

      const organizationId =
        activeMembership?.organization.id;

      const role =
        activeMembership?.role ?? "viewer";

      if (!organizationId) {
        return;
      }

      if (
        role !== "owner" &&
        role !== "editor"
      ) {
        return;
      }

      const draftWorkflow: Workflow = {
        id: `draft-${crypto.randomUUID()}`,
        name: "New Workflow",
        description:
          "New AI agent workflow",
        org_id: organizationId,
        workflow_steps: [],
        workflow_triggers: [],
        workflow_runs: [],
      };

      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        setWorkflow(
          draftWorkflow
        );

        setLoading(false);
      });

      return () => {
        cancelled = true;
      };
    }

    async function loadWorkflow() {
      try {
        setLoading(true);
        setError(null);

        const data =
          await graphqlRequest<
            WorkflowQueryResult,
            { id: string }
          >(
            GET_WORKFLOW,
            {
              id: workflowId,
            }
          );

        if (cancelled) {
          return;
        }

        if (
          !data.workflows ||
          data.workflows.length === 0
        ) {
          setError(
            "Workflow not found or you do not have access to it."
          );

          setLoading(false);
          return;
        }

        setWorkflow(
          data.workflows[0]
        );
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.error(
          "Failed to load workflow:",
          err
        );

        setError(
          err instanceof Error
            ? err.message
            : "Failed to load workflow."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWorkflow();

    return () => {
      cancelled = true;
    };
  }, [
    workflowId,
    activeMembership,
    organizationLoading,
  ]);

  if (loading) {
    return (
      <main className="workflow-page">
        <p>
          {workflowId === "new"
            ? "Creating workflow draft..."
            : "Loading workflow..."}
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="workflow-page">
        <button
          type="button"
          className="back-button"
          onClick={() =>
            router.push("/dashboard")
          }
        >
          ← Back to Workflows
        </button>

        <div className="error-card">
          <h1>
            Unable to load workflow
          </h1>

          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!workflow) {
    return (
      <main className="workflow-page">
        <div className="error-card">
          <h1>
            Unable to open workflow
          </h1>

          <p>
            Workflow could not be loaded.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="workflow-page">
      <header className="workflow-page-topbar">
        <button
          type="button"
          className="back-button"
          onClick={() => router.push("/dashboard")}
        >
          ← Workflows
        </button>

        <div className="workflow-page-brand">
          <strong>AI Workflow Builder</strong>
          {activeMembership?.organization.name && (
            <span>{activeMembership.organization.name}</span>
          )}
        </div>

        <span className="workflow-page-context">Workflow</span>
      </header>

      <WorkflowBuilder
        initialWorkflow={workflow}
        isNewWorkflow={
          workflowId === "new"
        }
      />
    </main>
  );
}