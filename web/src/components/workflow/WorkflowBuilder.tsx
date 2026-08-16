"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useOrganization } from "@/src/components/auth/OrganizationProvider";
import { graphqlRequest } from "@/src/lib/graphql";

import {
  UPDATE_WORKFLOW,
  INSERT_WORKFLOW,
  DELETE_WORKFLOW,
  INSERT_WORKFLOW_STEP,
  UPDATE_WORKFLOW_STEP,
  DELETE_WORKFLOW_STEP,
} from "@/src/graphql/workflowMutations";

import {
  INSERT_WORKFLOW_TRIGGER,
  UPDATE_WORKFLOW_TRIGGER,
  DELETE_WORKFLOW_TRIGGER,
} from "@/src/graphql/triggerMutations";

import type {
  Workflow,
  WorkflowStep,
  WorkflowStepType,
  WorkflowTrigger,
} from "@/src/types/workflow";

import WorkflowStepCard from "./WorkflowStepCard";
import StepEditor from "./StepEditor";
import TriggerEditor from "./TriggerEditor";
import WorkflowExecution from "./WorkflowExecution";
import WorkflowRunHistory from "./WorkflowRunHistory";

interface WorkflowBuilderProps {
  initialWorkflow: Workflow;
  isNewWorkflow?: boolean;
}

interface MutationResult<T> {
  [key: string]: T;
}

export default function WorkflowBuilder({
  initialWorkflow,
  isNewWorkflow = false,
}: WorkflowBuilderProps) {
  const router = useRouter();

  const {
    activeMembership,
  } = useOrganization();

  const role =
    activeMembership?.role ?? "viewer";

  const canEdit =
    role === "owner" ||
    role === "editor";

  const canManageRestrictedSteps =
    role === "owner";

  const [workflow, setWorkflow] =
    useState<Workflow>(
      initialWorkflow
    );

  const [selectedStepId, setSelectedStepId] =
    useState<string | null>(
      initialWorkflow
        .workflow_steps[0]
        ?.id ?? null
    );

  const [selectedTriggerId, setSelectedTriggerId] =
    useState<string | null>(
      initialWorkflow
        .workflow_triggers[0]
        ?.id ?? null
    );

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  const selectedStep =
    workflow.workflow_steps.find(
      (step) =>
        step.id === selectedStepId
    ) ?? null;

  const selectedTrigger =
    workflow.workflow_triggers.find(
      (trigger) =>
        trigger.id ===
        selectedTriggerId
    ) ?? null;

  function isDraftStep(
    step: WorkflowStep
  ) {
    return step.id.startsWith(
      "draft-step-"
    );
  }

  function isDraftTrigger(
    trigger: WorkflowTrigger
  ) {
    return trigger.id.startsWith(
      "draft-trigger-"
    );
  }

  async function saveWorkflow() {
    if (!canEdit || saving) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      if (isNewWorkflow) {
        const organizationId =
          activeMembership?.organization.id ??
          workflow.org_id;

        if (!organizationId) {
          throw new Error(
            "No organization is available."
          );
        }

        const workflowResult =
          await graphqlRequest<
            MutationResult<{
              id: string;
              name: string;
              description: string | null;
              org_id: string;
            }>,
            {
              name: string;
              description: string | null;
              orgId: string;
            }
          >(
            INSERT_WORKFLOW,
            {
              name:
                workflow.name.trim() ||
                "Untitled Workflow",

              description:
                workflow.description ??
                null,

              orgId:
                organizationId,
            }
          );

        const createdWorkflow =
          workflowResult
            .insert_workflows_one;

        if (
          !createdWorkflow?.id
        ) {
          throw new Error(
            "Workflow could not be created."
          );
        }

        const createdSteps: WorkflowStep[] = [];

        const stepIdMap = new Map<string, string>();

        for (
          const step of
            [...workflow.workflow_steps]
              .sort(
                (a, b) =>
                  a.position - b.position
              )
        ) {
          const originalConfig =
            step.config ?? {};

          const config: Record<
            string,
            unknown
          > = {
            ...originalConfig,
          };

          if (
            step.type ===
              "conditional_branch" &&
            typeof config.source_step_id ===
              "string"
          ) {
            const realSourceStepId =
              stepIdMap.get(
                config.source_step_id
              );

            if (realSourceStepId) {
              config.source_step_id =
                realSourceStepId;
            }
          }

          const stepResult =
            await graphqlRequest<
              MutationResult<WorkflowStep>,
              {
                workflowId: string;
                name: string;
                type: WorkflowStepType;
                position: number;
                config: Record<
                  string,
                  unknown
                >;
                branch:
                  | "true"
                  | "false"
                  | null;
              }
            >(
              INSERT_WORKFLOW_STEP,
              {
                workflowId:
                  createdWorkflow.id,

                name: step.name,

                type: step.type,

                position:
                  step.position,

                config,

                branch:
                  step.branch ?? null,
              }
            );

          const createdStep =
            stepResult
              .insert_workflow_steps_one;

          if (!createdStep?.id) {
            throw new Error(
              `Step "${step.name}" could not be created.`
            );
          }

          stepIdMap.set(
            step.id,
            createdStep.id
          );

          createdSteps.push(
            createdStep
          );
        }

        const createdTriggers: WorkflowTrigger[] =
          [];

        for (
          const trigger of
            workflow.workflow_triggers
        ) {
          const triggerResult =
            await graphqlRequest<
              MutationResult<WorkflowTrigger>,
              {
                workflowId: string;
                type: string;
                config: Record<string, unknown>;
                enabled: boolean;
              }
            >(
              INSERT_WORKFLOW_TRIGGER,
              {
                workflowId: createdWorkflow.id,
                type: trigger.type,
                config: trigger.config ?? {},
                enabled: trigger.enabled,
              }
            );

          const createdTrigger =
            triggerResult
              .insert_workflow_triggers_one;

          if (
            !createdTrigger?.id
          ) {
            throw new Error(
              "Trigger could not be created."
            );
          }

          createdTriggers.push(
            createdTrigger
          );
        }

        setWorkflow({
          ...workflow,
          id:
            createdWorkflow.id,
          name:
            createdWorkflow.name,
          description:
            createdWorkflow.description,
          org_id:
            createdWorkflow.org_id,
          workflow_steps:
            createdSteps,
          workflow_triggers:
            createdTriggers,
          workflow_runs: [],
        });

        setMessage(
          "Workflow created successfully."
        );

        router.replace(
          `/workflows/${createdWorkflow.id}`
        );

        return;
      }

      await graphqlRequest<
        MutationResult<{
          id: string;
          name: string;
          description:
            | string
            | null;
        }>,
        {
          id: string;
          name: string;
          description:
            | string
            | null;
        }
      >(
        UPDATE_WORKFLOW,
        {
          id:
            workflow.id,

          name:
            workflow.name,

          description:
            workflow.description,
        }
      );

      setMessage(
        "Workflow saved successfully."
      );
    } catch (error) {
      console.error(
        "Failed to save workflow:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save workflow."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteWorkflow() {
    if (
      role !== "owner" ||
      isNewWorkflow ||
      saving
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${workflow.name}"?\n\nThis action cannot be undone.`
      );

    if (!confirmed) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await graphqlRequest<
        MutationResult<{
          id: string;
        }>,
        {
          id: string;
        }
      >(
        DELETE_WORKFLOW,
        {
          id: workflow.id,
        }
      );

      router.replace(
        "/dashboard"
      );
    } catch (error) {
      console.error(
        "Failed to delete workflow:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to delete workflow."
      );
    } finally {
      setSaving(false);
    }
  }

  async function persistStepOrder(
    orderedSteps: WorkflowStep[]
  ) {

    if (isNewWorkflow) {
      return;
    }

    const temporaryBase =
      orderedSteps.length +
      1000;

    for (
      const [index, step] of
        orderedSteps.entries()
    ) {
      await graphqlRequest<
        MutationResult<WorkflowStep>,
        {
          id: string;
          name: string;
          type: string;
          position: number;
          config: Record<
            string,
            unknown
          >;
          branch:
            | "true"
            | "false"
            | null;
        }
      >(
        UPDATE_WORKFLOW_STEP,
        {
          id: step.id,
          name: step.name,
          type: step.type,
          position:
            temporaryBase +
            index,
          config:
            step.config ?? {},
          branch:
            step.branch ??
            null,
        }
      );
    }

    for (
      const [index, step] of
        orderedSteps.entries()
    ) {
      await graphqlRequest<
        MutationResult<WorkflowStep>,
        {
          id: string;
          name: string;
          type: string;
          position: number;
          config: Record<
            string,
            unknown
          >;
          branch:
            | "true"
            | "false"
            | null;
        }
      >(
        UPDATE_WORKFLOW_STEP,
        {
          id: step.id,
          name: step.name,
          type: step.type,
          position:
            index + 1,
          config:
            step.config ?? {},
          branch:
            step.branch ??
            null,
        }
      );
    }
  }

  async function moveStep(
    stepId: string,
    direction: "up" | "down"
  ) {
    if (
      !canEdit ||
      saving
    ) {
      return;
    }

    const currentSteps =
      [
        ...workflow.workflow_steps,
      ].sort(
        (a, b) =>
          a.position -
          b.position
      );

    const currentIndex =
      currentSteps.findIndex(
        (step) =>
          step.id === stepId
      );

    if (
      currentIndex === -1
    ) {
      return;
    }

    const targetIndex =
      direction === "up"
        ? currentIndex - 1
        : currentIndex + 1;

    if (
      targetIndex < 0 ||
      targetIndex >=
        currentSteps.length
    ) {
      return;
    }

    const reordered =
      [...currentSteps];

    const [
      movedStep,
    ] =
      reordered.splice(
        currentIndex,
        1
      );

    reordered.splice(
      targetIndex,
      0,
      movedStep
    );

    const normalized =
      reordered.map(
        (step, index) => ({
          ...step,
          position:
            index + 1,
        })
      );

    setWorkflow(
      (current) => ({
        ...current,
        workflow_steps:
          normalized,
      })
    );

    if (isNewWorkflow) {
      setMessage(
        "Step order updated."
      );
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await persistStepOrder(
        normalized
      );

      setMessage(
        "Step order updated successfully."
      );
    } catch (error) {
      console.error(
        "Failed to reorder steps:",
        error
      );

      setWorkflow(
        (current) => ({
          ...current,
          workflow_steps:
            currentSteps,
        })
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to reorder steps."
      );
    } finally {
      setSaving(false);
    }
  }

  async function addStep() {
    if (!canEdit) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      const position =
        workflow.workflow_steps
          .length + 1;

      if (isNewWorkflow) {
        const newStep: WorkflowStep = {
          id: `draft-step-${crypto.randomUUID()}`,

          name: `Step ${position}`,

          type: "llm_call",

          position,

          config: {
            prompt: "Enter your prompt here",
            model: "llama-3.1-8b-instant",
            temperature: 0.7,
          },

          branch: null,
        };

        setWorkflow(
          (current) => ({
            ...current,

            workflow_steps: [
              ...current.workflow_steps,
              newStep,
            ],
          })
        );

        setSelectedStepId(
          newStep.id
        );

        setMessage(
          "Step added to draft."
        );

        return;
      }

      const result =
        await graphqlRequest<
          MutationResult<WorkflowStep>,
          {
            workflowId: string;
            name: string;
            type: WorkflowStepType;
            position: number;
            config: Record<
              string,
              unknown
            >;
            branch:
              | "true"
              | "false"
              | null;
          }
        >(
          INSERT_WORKFLOW_STEP,
          {
            workflowId:
              workflow.id,

            name:
              `Step ${position}`,

            type:
              "llm_call",

            position,

            config: {
              prompt:
                "Enter your prompt here",

              model:
                "llama-3.1-8b-instant",

              temperature:
                0.7,
            },

            branch: null,
          }
        );

      const newStep =
        result
          .insert_workflow_steps_one;

      setWorkflow(
        (current) => ({
          ...current,

          workflow_steps: [
            ...current.workflow_steps,
            newStep,
          ],
        })
      );

      setSelectedStepId(
        newStep.id
      );

      setMessage(
        "Step added successfully."
      );
    } catch (error) {
      console.error(
        "Failed to add step:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to add step."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveStep() {
    if (
      !canEdit ||
      !selectedStep
    ) {
      return;
    }

    if (
      !canManageRestrictedSteps &&
      (
        selectedStep.type ===
          "db_write" ||
        selectedStep.type ===
          "notify"
      )
    ) {
      setMessage(
        "Only owners can modify this step type."
      );

      return;
    }

    if (
      isNewWorkflow ||
      isDraftStep(selectedStep)
    ) {
      setMessage(
        "Step changes saved to draft."
      );

      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await graphqlRequest<
        MutationResult<WorkflowStep>,
        {
          id: string;
          name: string;
          type: string;
          position: number;
          config: Record<
            string,
            unknown
          >;
          branch:
            | "true"
            | "false"
            | null;
        }
      >(
        UPDATE_WORKFLOW_STEP,
        {
          id:
            selectedStep.id,

          name:
            selectedStep.name,

          type:
            selectedStep.type,

          position:
            selectedStep.position,

          config:
            selectedStep.config ??
            {},

          branch:
            selectedStep.branch ??
            null,
        }
      );

      setMessage(
        "Step saved successfully."
      );
    } catch (error) {
      console.error(
        "Failed to save step:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save step."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteStep() {
    if (
      !canEdit ||
      !selectedStep
    ) {
      return;
    }

    if (
      !canManageRestrictedSteps &&
      (
        selectedStep.type ===
          "db_write" ||
        selectedStep.type ===
          "notify"
      )
    ) {
      setMessage(
        "Only owners can delete this step type."
      );

      return;
    }

    const confirmed =
      window.confirm(
        `Delete "${selectedStep.name}"?`
      );

    if (!confirmed) {
      return;
    }

    if (
      isNewWorkflow ||
      isDraftStep(selectedStep)
    ) {
      const remainingSteps =
        workflow.workflow_steps
          .filter(
            (step) =>
              step.id !==
              selectedStep.id
          )
          .map(
            (step, index) => ({
              ...step,
              position:
                index + 1,
            })
          );

      setWorkflow(
        (current) => ({
          ...current,
          workflow_steps:
            remainingSteps,
        })
      );

      setSelectedStepId(
        remainingSteps[0]?.id ??
          null
      );

      setMessage(
        "Step removed from draft."
      );

      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await graphqlRequest<
        MutationResult<WorkflowStep>,
        { id: string }
      >(
        DELETE_WORKFLOW_STEP,
        {
          id:
            selectedStep.id,
        }
      );

      const remainingSteps =
        workflow.workflow_steps
          .filter(
            (step) =>
              step.id !==
              selectedStep.id
          )
          .map(
            (step, index) => ({
              ...step,
              position:
                index + 1,
            })
          );

      setWorkflow(
        (current) => ({
          ...current,
          workflow_steps:
            remainingSteps,
        })
      );

      setSelectedStepId(
        remainingSteps[0]?.id ??
          null
      );

      setMessage(
        "Step deleted successfully."
      );
    } catch (error) {
      console.error(
        "Failed to delete step:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to delete step."
      );
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedStep(
    updates: Partial<WorkflowStep>
  ) {
    if (
      !selectedStepId ||
      !canEdit
    ) {
      return;
    }

    if (
      updates.type &&
      !canManageRestrictedSteps &&
      (
        updates.type ===
          "db_write" ||
        updates.type ===
          "notify"
      )
    ) {
      setMessage(
        "Only owners can use DB Write or Notify steps."
      );

      return;
    }

    setWorkflow(
      (current) => ({
        ...current,

        workflow_steps:
          current.workflow_steps.map(
            (step) =>
              step.id ===
              selectedStepId
                ? {
                    ...step,
                    ...updates,
                  }
                : step
          ),
      })
    );
  }

  async function addTrigger() {
    if (
      !canManageRestrictedSteps
    ) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      if (isNewWorkflow) {
        const newTrigger: WorkflowTrigger = {
          id: `draft-trigger-${crypto.randomUUID()}`,
          type: "manual",
          config: {},
          enabled: true,
        };
        setWorkflow(
          (current) => ({
            ...current,

            workflow_triggers: [
              ...current.workflow_triggers,
              newTrigger,
            ],
          })
        );

        setSelectedTriggerId(
          newTrigger.id
        );

        setMessage(
          "Trigger added to draft."
        );

        return;
      }

      const result =
        await graphqlRequest<
          MutationResult<WorkflowTrigger>,
          {
            workflowId: string;
            type: string;
            config: Record<string, unknown>;
            enabled: boolean;
          }
        >(
          INSERT_WORKFLOW_TRIGGER,
          {
            workflowId: workflow.id,
            type: "manual",
            config: {},
            enabled: true,
          }
        );

      const newTrigger =
        result
          .insert_workflow_triggers_one;

      setWorkflow(
        (current) => ({
          ...current,

          workflow_triggers: [
            ...current.workflow_triggers,
            newTrigger,
          ],
        })
      );

      setSelectedTriggerId(
        newTrigger.id
      );

      setMessage(
        "Trigger added successfully."
      );
    } catch (error) {
      console.error(
        "Failed to add trigger:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to add trigger."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveTrigger() {
  if (!canManageRestrictedSteps) {
    return;
  }

  const trigger = selectedTrigger;

  if (!trigger) {
    return;
  }

  if (
    isNewWorkflow ||
    isDraftTrigger(trigger)
  ) {
    setMessage("Trigger changes saved to draft.");
    return;
  }

  try {
    setSaving(true);
    setMessage(null);

    await graphqlRequest<
      MutationResult<WorkflowTrigger>,
      {
        id: string;
        type: string;
        config: Record<string, unknown>;
        enabled: boolean;
      }
    >(
      UPDATE_WORKFLOW_TRIGGER,
      {
        id: trigger.id,
        type: trigger.type,
        config: trigger.config ?? {},
        enabled: trigger.enabled,
      }
    );

    setMessage("Trigger saved successfully.");
  } catch (error) {
    console.error(
      "Failed to save trigger:",
      error
    );

    setMessage(
      error instanceof Error
        ? error.message
        : "Failed to save trigger."
    );
  } finally {
    setSaving(false);
  }
}

  async function deleteTrigger() {
    if (
      !canManageRestrictedSteps ||
      !selectedTrigger
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this trigger?"
      );

    if (!confirmed) {
      return;
    }

    if (
      isNewWorkflow ||
      isDraftTrigger(
        selectedTrigger
      )
    ) {
      const remainingTriggers =
        workflow.workflow_triggers.filter(
          (trigger) =>
            trigger.id !==
            selectedTrigger.id
        );

      setWorkflow(
        (current) => ({
          ...current,

          workflow_triggers:
            remainingTriggers,
        })
      );

      setSelectedTriggerId(
        remainingTriggers[0]?.id ??
          null
      );

      setMessage(
        "Trigger removed from draft."
      );

      return;
    }

    try {
      setSaving(true);
      setMessage(null);

      await graphqlRequest<
        MutationResult<WorkflowTrigger>,
        { id: string }
      >(
        DELETE_WORKFLOW_TRIGGER,
        {
          id:
            selectedTrigger.id,
        }
      );

      const remainingTriggers =
        workflow.workflow_triggers.filter(
          (trigger) =>
            trigger.id !==
            selectedTrigger.id
        );

      setWorkflow(
        (current) => ({
          ...current,

          workflow_triggers:
            remainingTriggers,
        })
      );

      setSelectedTriggerId(
        remainingTriggers[0]?.id ??
          null
      );

      setMessage(
        "Trigger deleted successfully."
      );
    } catch (error) {
      console.error(
        "Failed to delete trigger:",
        error
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to delete trigger."
      );
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedTrigger(
    updates: Partial<WorkflowTrigger>
  ) {
    if (
      !selectedTriggerId ||
      !canManageRestrictedSteps
    ) {
      return;
    }

    setWorkflow(
      (current) => ({
        ...current,

        workflow_triggers:
          current.workflow_triggers.map(
            (trigger) =>
              trigger.id ===
              selectedTriggerId
                ? {
                    ...trigger,
                    ...updates,
                  }
                : trigger
          ),
      })
    );
  }

  return (
    <div className="workflow-builder workflow-builder-v2">
      {}
      {}
      {}

      <div className="builder-toolbar builder-toolbar-v2">
        <div>
          <input
            className="workflow-name-input"
            value={workflow.name}
            disabled={!canEdit}
            onChange={(event) =>
              setWorkflow(
                (current) => ({
                  ...current,
                  name:
                    event.target.value,
                })
              )
            }
          />

          <textarea
            className="workflow-description-input"
            value={
              workflow.description ??
              ""
            }
            disabled={!canEdit}
            placeholder="Workflow description"
            onChange={(event) =>
              setWorkflow(
                (current) => ({
                  ...current,
                  description:
                    event.target.value,
                })
              )
            }
          />

          <div className="builder-role">
            Role:{" "}
            <strong>
              {role}
            </strong>

            {isNewWorkflow && (
              <span
                style={{
                  marginLeft: 8,
                }}
              >
                • Draft
              </span>
            )}
          </div>
        </div>

        {canEdit && (
          <div className="builder-toolbar-actions builder-toolbar-actions-v2">
            <button
              type="button"
              className="save-workflow-button"
              disabled={saving}
              onClick={saveWorkflow}
            >
              {saving
                ? "Saving..."
                : "Save Workflow"}
            </button>

            {!isNewWorkflow &&
              role === "owner" && (
                <button
                  type="button"
                  className="delete-workflow-button"
                  disabled={saving}
                  onClick={deleteWorkflow}
                >
                  Delete Workflow
                </button>
              )}
          </div>
        )}
      </div>

      {}
      {}
      {}

      {message && (
        <div className="builder-message">
          {message}
        </div>
      )}

      {}
      {}
      {}

      {!isNewWorkflow && (
        <>
          <WorkflowExecution
            workflowId={
              workflow.id
            }
            canRunWorkflow={
              role === "owner" ||
              role === "editor"
            }
          />

          <WorkflowRunHistory
            workflowId={
              workflow.id
            }
          />
        </>
      )}

      {}
      {}
      {}

      <div className="builder-layout builder-layout-v2">
        <section className="builder-steps-panel builder-section-card">
          <div className="builder-panel-header">
            <div>
              <h2>
                Steps
              </h2>

              <p>
                Execute in this order.
              </p>
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={addStep}
                disabled={saving}
              >
                + Add Step
              </button>
            )}
          </div>

          <div className="builder-step-list builder-step-list-v2">
            {[
              ...workflow.workflow_steps,
            ]
              .sort(
                (a, b) =>
                  a.position -
                  b.position
              )
              .map(
                (
                  step,
                  index,
                  steps
                ) => (
                  <div
                    key={step.id}
                    className="workflow-step-row"
                  >
                    <WorkflowStepCard
                      step={step}
                      selected={
                        step.id ===
                        selectedStepId
                      }
                      onSelect={() =>
                        setSelectedStepId(
                          step.id
                        )
                      }
                    />

                    {canEdit && (
                      <div className="workflow-step-reorder">
                        <button
                          type="button"
                          title="Move step up"
                          aria-label={`Move ${step.name} up`}
                          disabled={
                            saving ||
                            index === 0
                          }
                          onClick={() =>
                            moveStep(
                              step.id,
                              "up"
                            )
                          }
                        >
                          ↑
                        </button>

                        <span>
                          {
                            step.position
                          }
                        </span>

                        <button
                          type="button"
                          title="Move step down"
                          aria-label={`Move ${step.name} down`}
                          disabled={
                            saving ||
                            index ===
                              steps.length -
                                1
                          }
                          onClick={() =>
                            moveStep(
                              step.id,
                              "down"
                            )
                          }
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}

            {workflow
              .workflow_steps
              .length === 0 && (
              <div className="builder-empty">
                <p>
                  No steps yet.
                </p>

                {canEdit && (
                  <button
                    type="button"
                    onClick={
                      addStep
                    }
                  >
                    Add your first step
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        <StepEditor
          step={
            selectedStep
          }
          canEdit={
            canEdit
          }
          canManageRestrictedSteps={
            canManageRestrictedSteps
          }
          workflowSteps={
            workflow.workflow_steps
          }
          onChange={
            updateSelectedStep
          }
          onSave={
            saveStep
          }
          onDelete={
            deleteStep
          }
        />
      </div>

      {}
      {}
      {}

      <section className="builder-triggers-panel builder-section-card">
        <div className="builder-panel-header">
          <div>
            <h2>
              Triggers
            </h2>

            <p>
              Choose how this workflow
              starts.
            </p>
          </div>

          {canManageRestrictedSteps && (
            <button
              type="button"
              onClick={
                addTrigger
              }
              disabled={
                saving
              }
            >
              + Add Trigger
            </button>
          )}
        </div>

        <div className="trigger-list trigger-list-v2">
          {workflow
            .workflow_triggers
            .map(
              (trigger) => (
                <button
                  key={
                    trigger.id
                  }
                  type="button"
                  className={
                    trigger.id ===
                    selectedTriggerId
                      ? "trigger-card trigger-card-selected"
                      : "trigger-card"
                  }
                  onClick={() =>
                    setSelectedTriggerId(
                      trigger.id
                    )
                  }
                >
                  <strong>
                    {
                      formatTriggerType(
                        trigger.type
                      )
                    }
                  </strong>

                  <span>
                    Configured
                  </span>
                </button>
              )
            )}

          {workflow
            .workflow_triggers
            .length === 0 && (
            <div className="builder-empty">
              <p>
                No triggers configured.
              </p>

              {canManageRestrictedSteps && (
                <button
                  type="button"
                  onClick={
                    addTrigger
                  }
                >
                  Add Trigger
                </button>
              )}
            </div>
          )}
        </div>

        <TriggerEditor
          trigger={
            selectedTrigger
          }
          canEdit={
            canManageRestrictedSteps
          }
          onChange={
            updateSelectedTrigger
          }
          onSave={
            saveTrigger
          }
          onDelete={
            deleteTrigger
          }
        />
      </section>
    </div>
  );
}

function formatTriggerType(
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