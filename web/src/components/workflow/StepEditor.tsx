"use client";

import type {
  WorkflowStep,
  WorkflowStepType,
} from "@/src/types/workflow";

interface StepEditorProps {
  step: WorkflowStep | null;

  canEdit: boolean;

  canManageRestrictedSteps: boolean;

  workflowSteps: WorkflowStep[];

  onChange: (
    updates: Partial<WorkflowStep>
  ) => void;

  onSave: () => void;

  onDelete: () => void;
}

const EDITOR_STEP_TYPES: WorkflowStepType[] = [
  "llm_call",
  "http_request",
  "conditional_branch",
  "approval_gate",
];

const OWNER_STEP_TYPES: WorkflowStepType[] = [
  ...EDITOR_STEP_TYPES,
  "db_write",
  "notify",
];

export default function StepEditor({
  step,
  canEdit,
  canManageRestrictedSteps,
  workflowSteps,
  onChange,
  onSave,
  onDelete,
}: StepEditorProps) {
  if (!step) {
    return (
      <aside className="step-editor step-editor-v2">
        <div className="step-editor-empty">
          <h2>Step Configuration</h2>

          <p>
            Select a step to configure it.
          </p>
        </div>
      </aside>
    );
  }

  const config = step.config ?? {};

  const availableStepTypes =
    canManageRestrictedSteps
      ? OWNER_STEP_TYPES
      : EDITOR_STEP_TYPES;

  function updateConfig(
    updates: Record<string, unknown>
  ) {
    onChange({
      config: {
        ...config,
        ...updates,
      },
    });
  }

  return (
    <aside className="step-editor step-editor-v2">
      <div className="step-editor-header step-editor-header-v2">
        <div>
          <h2>Step Configuration</h2>

          <p>
            Configure this workflow step.
          </p>
        </div>
      </div>

      {}

      <div className="editor-field">
        <label htmlFor="step-name">
          Step name
        </label>

        <input
          id="step-name"
          value={step.name}
          disabled={!canEdit}
          onChange={(event) =>
            onChange({
              name: event.target.value,
            })
          }
        />
      </div>

      <div className="editor-field">
        <label htmlFor="step-type">
          Step type
        </label>

        <select
          id="step-type"
          value={step.type}
          disabled={!canEdit}
          onChange={(event) => {
            const newType =
              event.target.value as WorkflowStepType;

            let newConfig = config;

            if (newType === "conditional_branch") {
              newConfig = {
                field:
                  typeof config.field === "string"
                    ? config.field
                    : "text",
                operator:
                  config.operator === "equals" ||
                  config.operator === "not_equals" ||
                  config.operator === "contains"
                    ? config.operator
                    : "contains",
                value:
                  typeof config.value === "string"
                    ? config.value
                    : "",
              };
            }

            onChange({
              type: newType,
              config: newConfig,
            });
          }}
        >
          {availableStepTypes.map(
            (type) => (
              <option
                key={type}
                value={type}
              >
                {formatStepType(type)}
              </option>
            )
          )}
        </select>
      </div>

      {}

      {step.type !== "conditional_branch" && (
        <div className="editor-field">
          <label htmlFor="step-branch">Branch</label>
          <select
            id="step-branch"
            value={step.branch ?? ""}
            disabled={!canEdit}
            onChange={(event) =>
              onChange({
                branch:
                  event.target.value === ""
                    ? null
                    : (event.target.value as "true" | "false"),
              })
            }
          >
            <option value="">None</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
          <small>
            Assign this step to the True or False branch
            of the most recent conditional step.
          </small>
        </div>
      )}

      {}

      {step.type === "llm_call" && (
        <LlmCallEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {step.type === "llm_call" && (
        <RetryConfigEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {step.type === "http_request" && (
        <HttpRequestEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {step.type === "http_request" && (
        <RetryConfigEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {step.type === "conditional_branch" && (
        <ConditionalBranchEditor
          config={config}
          canEdit={canEdit}
          workflowSteps={workflowSteps}
          currentStepId={step.id}
          updateConfig={updateConfig}
        />
      )}

      {step.type === "approval_gate" && (
        <ApprovalGateEditor />
      )}

      {step.type === "db_write" && (
        <DbWriteEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {step.type === "db_write" && (
        <RetryConfigEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {step.type === "notify" && (
        <NotifyEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {}

      {canEdit && (
        <div className="step-editor-actions step-editor-actions-v2">
          <button
            type="button"
            className="save-step-button"
            onClick={onSave}
          >
            Save Step
          </button>

          <button
            type="button"
            className="delete-step-button"
            onClick={onDelete}
          >
            Delete Step
          </button>
        </div>
      )}
    </aside>
  );
}

function LlmCallEditor({
  config,
  canEdit,
  updateConfig,
}: {
  config: Record<string, unknown>;

  canEdit: boolean;

  updateConfig: (
    updates: Record<string, unknown>
  ) => void;
}) {
  return (
    <div className="step-config-section step-config-section-v2">
      <div className="editor-field">
        <label htmlFor="llm-model">
          Model
        </label>

        <input
          id="llm-model"
          value={getString(
            config.model
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              model:
                event.target.value,
            })
          }
          placeholder="llama-3.1-8b-instant"
        />
      </div>

      <div className="editor-field">
        <label htmlFor="llm-temperature">
          Temperature
        </label>

        <input
          id="llm-temperature"
          type="number"
          min="0"
          max="2"
          step="0.1"
          value={getNumber(
            config.temperature,
            0.7
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              temperature:
                Number(
                  event.target.value
                ),
            })
          }
        />
      </div>

      <div className="editor-field">
        <label htmlFor="llm-prompt">
          Prompt
        </label>

        <textarea
          id="llm-prompt"
          rows={8}
          value={getString(
            config.prompt
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              prompt:
                event.target.value,
            })
          }
          placeholder="Enter the instruction for the LLM..."
        />
      </div>
    </div>
  );
}

function HttpRequestEditor({
  config,
  canEdit,
  updateConfig,
}: {
  config: Record<string, unknown>;

  canEdit: boolean;

  updateConfig: (
    updates: Record<string, unknown>
  ) => void;
}) {
  return (
    <div className="step-config-section step-config-section-v2">
      <div className="editor-field">
        <label htmlFor="http-method">
          Method
        </label>

        <select
          id="http-method"
          value={getString(
            config.method,
            "GET"
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              method:
                event.target.value,
            })
          }
        >
          <option value="GET">
            GET
          </option>

          <option value="POST">
            POST
          </option>

          <option value="PUT">
            PUT
          </option>

          <option value="PATCH">
            PATCH
          </option>

          <option value="DELETE">
            DELETE
          </option>
        </select>
      </div>

      <div className="editor-field">
        <label htmlFor="http-url">
          URL
        </label>

        <input
          id="http-url"
          type="url"
          value={getString(
            config.url
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              url:
                event.target.value,
            })
          }
          placeholder="https://api.example.com"
        />
      </div>

      <div className="editor-field">
        <label htmlFor="http-headers">
          Headers JSON
        </label>

        <textarea
          id="http-headers"
          rows={5}
          value={JSON.stringify(
            config.headers ?? {},
            null,
            2
          )}
          disabled={!canEdit}
          onChange={(event) => {
            const parsed =
              parseJson(
                event.target.value
              );

            if (
              parsed !== null &&
              typeof parsed ===
                "object"
            ) {
              updateConfig({
                headers: parsed,
              });
            }
          }}
          placeholder={`{
  "Content-Type": "application/json"
}`}
        />
      </div>

      <div className="editor-field">
        <label htmlFor="http-body">
          Body JSON
        </label>

        <textarea
          id="http-body"
          rows={6}
          value={JSON.stringify(
            config.body ?? {},
            null,
            2
          )}
          disabled={!canEdit}
          onChange={(event) => {
            const parsed =
              parseJson(
                event.target.value
              );

            if (
              parsed !== null
            ) {
              updateConfig({
                body: parsed,
              });
            }
          }}
          placeholder={`{
  "message": "Hello"
}`}
        />
      </div>
    </div>
  );
}

function RetryConfigEditor({
  config,
  canEdit,
  updateConfig,
}: {
  config: Record<string, unknown>;

  canEdit: boolean;

  updateConfig: (
    updates: Record<string, unknown>
  ) => void;
}) {
  const maxRetries = getNumber(
    config.max_retries,
    0
  );

  return (
    <div className="step-config-section step-config-section-v2">
      <div className="editor-info-box">
        Configure how many times this step should
        be retried after a failure. The maximum is
        5 retries.
      </div>

      <div className="editor-field">
        <label htmlFor="step-max-retries">
          Max Retries
        </label>

        <input
          id="step-max-retries"
          type="number"
          min="0"
          max="5"
          step="1"
          value={maxRetries}
          disabled={!canEdit}
          onChange={(event) => {
            const value = Number(
              event.target.value
            );

            if (!Number.isFinite(value)) {
              return;
            }

            updateConfig({
              max_retries: Math.max(
                0,
                Math.min(5, Math.floor(value))
              ),
            });
          }}
        />

        <small>
          0 = no retry. 2 = retry up to two
          times after the initial attempt.
        </small>
      </div>
    </div>
  );
}

function ConditionalBranchEditor({
  config,
  canEdit,
  workflowSteps,
  currentStepId,
  updateConfig,
}: {
  config: Record<string, unknown>;

  canEdit: boolean;

  workflowSteps: WorkflowStep[];

  currentStepId: string;

  updateConfig: (
    updates: Record<string, unknown>
  ) => void;
}) {
  const sourceStepId = getString(
    config.source_step_id
  );

  const orderedSteps = [...workflowSteps].sort(
    (a, b) => a.position - b.position
  );
  
  const sourceSteps = orderedSteps.filter(
    (candidate) => {
      const currentStep = orderedSteps.find(
        (item) => item.id === currentStepId
      );

      return currentStep
        ? candidate.position < currentStep.position
        : true;
    }
  );

  return (
    <div className="step-config-section step-config-section-v2">
      <div className="editor-info-box">
        Choose the exact earlier step whose output
        should be evaluated. This prevents an
        intermediate step from changing the value
        used by the condition.
      </div>

      <div className="editor-field">
        <label htmlFor="condition-source-step">
          Source Step
        </label>

        <select
          id="condition-source-step"
          value={sourceStepId}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              source_step_id:
                event.target.value || undefined,
            })
          }
        >
          <option value="">
            Previous step (legacy behavior)
          </option>

          {sourceSteps.map((candidate) => (
            <option
              key={candidate.id}
              value={candidate.id}
            >
              {candidate.position}. {candidate.name}
            </option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label htmlFor="condition-field">
          Field
        </label>

        <input
          id="condition-field"
          value={getString(config.field)}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              field: event.target.value,
            })
          }
          placeholder="text"
        />
      </div>

      <div className="editor-field">
        <label htmlFor="condition-operator">
          Operator
        </label>

        <select
          id="condition-operator"
          value={getString(
            config.operator,
            "contains"
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              operator: event.target.value,
            })
          }
        >
          <option value="equals">
            Equals
          </option>
          <option value="not_equals">
            Not Equals
          </option>
          <option value="contains">
            Contains
          </option>
        </select>
      </div>

      <div className="editor-field">
        <label htmlFor="condition-value">
          Value
        </label>

        <input
          id="condition-value"
          value={getString(config.value)}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              value: event.target.value,
            })
          }
          placeholder="approve"
        />
      </div>
    </div>
  );
}

function ApprovalGateEditor() {
  return (
    <div className="step-config-section step-config-section-v2">
      <div className="approval-info-box">
        <h3>
          Approval Required
        </h3>

        <p>
          This step pauses the workflow
          until an authorized organization
          member approves it.
        </p>

        <p>
          Approval authorization is enforced
          by the backend Action handler.
        </p>
      </div>
    </div>
  );
}

function DbWriteEditor({
  config,
  canEdit,
  updateConfig,
}: {
  config: Record<string, unknown>;

  canEdit: boolean;

  updateConfig: (
    updates: Record<string, unknown>
  ) => void;
}) {
  const includePreviousOutput =
    config.include_previous_output ===
    true;

  return (
    <div className="step-config-section step-config-section-v2">
      <div className="editor-info-box">
        Saves workflow output into your
        application database.
      </div>

      <div className="editor-field">
        <label htmlFor="db-result">
          Result
        </label>

        <textarea
          id="db-result"
          rows={6}
          value={JSON.stringify(
            config.result ?? {},
            null,
            2
          )}
          disabled={!canEdit}
          onChange={(event) => {
            const parsed =
              parseJson(
                event.target.value
              );

            if (
              parsed !== null
            ) {
              updateConfig({
                result: parsed,
              });
            }
          }}
          placeholder={`{
  "source": "workflow"
}`}
        />
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={
            includePreviousOutput
          }
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              include_previous_output:
                event.target.checked,
            })
          }
        />

        <span>
          Include previous step output
        </span>
      </label>
    </div>
  );
}

function NotifyEditor({
  config,
  canEdit,
  updateConfig,
}: {
  config: Record<string, unknown>;

  canEdit: boolean;

  updateConfig: (
    updates: Record<string, unknown>
  ) => void;
}) {
  const includePreviousOutput =
    config.include_previous_output ===
    true;

  return (
    <div className="step-config-section step-config-section-v2">
      <div className="editor-field">
        <label htmlFor="notify-channel">
          Channel
        </label>

        <select
          id="notify-channel"
          value={getString(
            config.channel,
            "email"
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              channel:
                event.target.value,
            })
          }
        >
          <option value="email">
            Email
          </option>

          <option value="slack">
            Slack
          </option>
        </select>
      </div>

      <div className="editor-field">
        <label htmlFor="notify-recipient">
          Recipient
        </label>

        <input
          id="notify-recipient"
          value={getString(
            config.recipient
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              recipient:
                event.target.value,
            })
          }
          placeholder="user@example.com"
        />
      </div>

      <div className="editor-field">
        <label htmlFor="notify-subject">
          Subject
        </label>

        <input
          id="notify-subject"
          value={getString(
            config.subject
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              subject:
                event.target.value,
            })
          }
          placeholder="Workflow notification"
        />
      </div>

      <div className="editor-field">
        <label htmlFor="notify-message">
          Message
        </label>

        <textarea
          id="notify-message"
          rows={7}
          value={getString(
            config.message
          )}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              message:
                event.target.value,
            })
          }
          placeholder="Enter notification message..."
        />
      </div>

      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={
            includePreviousOutput
          }
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              include_previous_output:
                event.target.checked,
            })
          }
        />

        <span>
          Include previous step output
        </span>
      </label>
    </div>
  );
}

function getString(
  value: unknown,
  fallback = ""
): string {
  return typeof value === "string"
    ? value
    : fallback;
}

function getNumber(
  value: unknown,
  fallback: number
): number {
  return typeof value === "number"
    ? value
    : fallback;
}

function parseJson(
  value: string
): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatStepType(
  type: WorkflowStepType
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