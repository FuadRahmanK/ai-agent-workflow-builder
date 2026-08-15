"use client";

import { useState } from "react";

import type {
  WorkflowTrigger,
  WorkflowTriggerType,
} from "@/src/types/workflow";

interface TriggerEditorProps {
  trigger: WorkflowTrigger | null;
  canEdit: boolean;
  onChange: (
    updates: Partial<WorkflowTrigger>
  ) => void;
  onSave: () => void;
  onDelete: () => void;
}

const TRIGGER_TYPES: WorkflowTriggerType[] = [
  "manual",
  "webhook",
  "scheduled",
  "database_event",
];

const WEBHOOK_PATH =
  "/actions/trigger-workflow-webhook";

export default function TriggerEditor({
  trigger,
  canEdit,
  onChange,
  onSave,
  onDelete,
}: TriggerEditorProps) {
  const [showSecret, setShowSecret] =
    useState(false);
  const [copied, setCopied] = useState(false);

  if (!trigger) {
    return (
      <aside className="trigger-editor trigger-editor-v2">
        <div className="trigger-editor-empty">
          <h2>Trigger Configuration</h2>
          <p>
            Select a trigger to configure it.
          </p>
        </div>
      </aside>
    );
  }

  const currentTrigger = trigger;
  const config = currentTrigger.config ?? {};

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

  function toggleEnabled() {
    if (!canEdit) return;

    onChange({
      enabled: !currentTrigger.enabled,
    });
  }

  return (
    <aside className="trigger-editor trigger-editor-v2">
      <div className="trigger-editor-header trigger-editor-header-v2">
        <h2>Trigger Configuration</h2>
        <p>
          Configure how this workflow starts.
        </p>
      </div>

      <div className="editor-field">
        <label htmlFor="trigger-type">
          Trigger type
        </label>

        <select
          id="trigger-type"
          value={currentTrigger.type}
          disabled={!canEdit}
          onChange={(event) =>
            onChange({
              type:
                event.target
                  .value as WorkflowTriggerType,
            })
          }
        >
          {TRIGGER_TYPES.map((type) => (
            <option
              key={type}
              value={type}
            >
              {formatTriggerType(type)}
            </option>
          ))}
        </select>
      </div>

      <div className="trigger-status-row">
        <div>
          <span className="trigger-status-label">
            Status
          </span>
          <strong
            className={
              currentTrigger.enabled
                ? "trigger-status-enabled"
                : "trigger-status-disabled"
            }
          >
            <span
              className="trigger-status-dot"
              aria-hidden="true"
            />
            {currentTrigger.enabled
              ? "Enabled"
              : "Disabled"}
          </strong>
        </div>

        {canEdit && (
          <button
            type="button"
            className="trigger-secondary-button"
            onClick={toggleEnabled}
          >
            {currentTrigger.enabled
              ? "Disable"
              : "Enable"}
          </button>
        )}
      </div>

      {currentTrigger.type === "manual" && (
        <ManualTriggerEditor />
      )}

      {currentTrigger.type === "webhook" && (
        <WebhookTriggerEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
          showSecret={showSecret}
          setShowSecret={setShowSecret}
          copied={copied}
          setCopied={setCopied}
        />
      )}

      {currentTrigger.type === "scheduled" && (
        <ScheduledTriggerEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {currentTrigger.type === "database_event" && (
        <DatabaseEventTriggerEditor
          config={config}
          canEdit={canEdit}
          updateConfig={updateConfig}
        />
      )}

      {canEdit && (
        <div className="trigger-editor-actions trigger-editor-actions-v2">
          <button
            type="button"
            className="save-step-button"
            onClick={onSave}
          >
            Save Trigger
          </button>

          <button
            type="button"
            className="delete-step-button"
            onClick={onDelete}
          >
            Delete Trigger
          </button>
        </div>
      )}
    </aside>
  );
}

function ManualTriggerEditor() {
  return (
    <div className="trigger-info-box">
      <h3>Manual Trigger</h3>
      <p>
        This workflow can be started manually
        from the workflow builder.
      </p>
    </div>
  );
}

function WebhookTriggerEditor({
  config,
  canEdit,
  updateConfig,
  showSecret,
  setShowSecret,
  copied,
  setCopied,
}: {
  config: Record<string, unknown>;
  canEdit: boolean;
  updateConfig: (
    updates: Record<string, unknown>
  ) => void;
  showSecret: boolean;
  setShowSecret: (value: boolean) => void;
  copied: boolean;
  setCopied: (value: boolean) => void;
}) {
  const secret = getString(config.secret);

  const backendUrl =
    process.env
      .NEXT_PUBLIC_WORKFLOW_ENGINE_URL?.replace(
        /\/$/,
        ""
      ) ?? "";

  const webhookUrl = backendUrl
    ? `${backendUrl}${WEBHOOK_PATH}`
    : "";

  async function copyWebhookUrl() {
    if (!webhookUrl) return;

    try {
      await navigator.clipboard.writeText(
        webhookUrl
      );

      setCopied(true);

      window.setTimeout(
        () => setCopied(false),
        1500
      );
    } catch (error) {
      console.error(
        "Failed to copy webhook URL:",
        error
      );
    }
  }

  function generateSecret() {
    if (!canEdit) return;

    const generatedSecret =
      `wh_${crypto.randomUUID().replaceAll("-", "")}`;

    updateConfig({
      secret: generatedSecret,
    });

    setShowSecret(true);
  }

  return (
    <div className="trigger-config-section trigger-config-section-v2">
      <div className="trigger-info-box">
        <h3>Webhook Trigger</h3>
        <p>
          External systems can start this
          workflow by calling the webhook.
        </p>
      </div>

      <div className="editor-field">
        <label htmlFor="webhook-url">
          Webhook URL
        </label>

        <div className="trigger-input-action-row">
          <input
            id="webhook-url"
            type="text"
            value={webhookUrl}
            readOnly
            placeholder="Workflow engine URL is not configured"
          />

          <button
            type="button"
            className="trigger-secondary-button"
            onClick={copyWebhookUrl}
            disabled={!webhookUrl}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <small className="field-help">
          Send a POST request to this endpoint
          with the workflow ID, webhook secret,
          and optional payload.
        </small>
      </div>

      <div className="editor-field">
        <label htmlFor="webhook-secret">
          Webhook secret
        </label>

        <div className="trigger-input-action-row">
          <input
            id="webhook-secret"
            type={
              showSecret
                ? "text"
                : "password"
            }
            value={secret}
            disabled={!canEdit}
            onChange={(event) =>
              updateConfig({
                secret:
                  event.target.value,
              })
            }
            placeholder="wh_..."
            autoComplete="new-password"
          />

          <button
            type="button"
            className="trigger-secondary-button"
            disabled={!secret}
            onClick={() =>
              setShowSecret(!showSecret)
            }
          >
            {showSecret ? "Hide" : "Show"}
          </button>
        </div>

        <div className="trigger-secret-actions">
          <button
            type="button"
            className="trigger-secondary-button"
            disabled={!canEdit}
            onClick={generateSecret}
          >
            Generate Secret
          </button>
        </div>

        <small className="field-help">
          Keep this secret private. It is used
          to authenticate incoming webhook calls.
        </small>
      </div>

      {!backendUrl && (
        <div className="trigger-warning-box">
          NEXT_PUBLIC_WORKFLOW_ENGINE_URL is not
          configured. Add it to the frontend
          environment before using the webhook.
        </div>
      )}
    </div>
  );
}

function ScheduledTriggerEditor({
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
  const scheduleType = getString(
    config.schedule_type) ||
    "daily";

  const timezone = getString(
    config.timezone) ||
    getBrowserTimeZone();

  const intervalMinutes = getNumber(
    config.interval_minutes,
    15
  );

  const time = getString(
    config.time) ||
    "09:00";

  const dayOfWeek = getNumber(
    config.day_of_week,
    1
  );

  return (
    <div className="trigger-config-section trigger-config-section-v2">
      <div className="trigger-info-box">
        <h3>Scheduled Trigger</h3>
        <p>
          Start this workflow automatically on
          a recurring schedule.
        </p>
      </div>

      <div className="editor-field">
        <label htmlFor="schedule-type">
          Schedule
        </label>

        <select
          id="schedule-type"
          value={scheduleType}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              schedule_type:
                event.target.value,
            })
          }
        >
          <option value="interval">
            Every interval
          </option>
          <option value="daily">
            Every day
          </option>
          <option value="weekly">
            Every week
          </option>
        </select>
      </div>

      {scheduleType === "interval" && (
        <div className="editor-field">
          <label htmlFor="schedule-interval">
            Interval (minutes)
          </label>

          <input
            id="schedule-interval"
            type="number"
            min={1}
            max={10080}
            value={intervalMinutes}
            disabled={!canEdit}
            onChange={(event) =>
              updateConfig({
                interval_minutes:
                  Math.max(
                    1,
                    Number(
                      event.target.value
                    ) || 1
                  ),
              })
            }
          />
        </div>
      )}

      {scheduleType !== "interval" && (
        <div className="editor-field">
          <label htmlFor="schedule-time">
            Time
          </label>

          <input
            id="schedule-time"
            type="time"
            value={time}
            disabled={!canEdit}
            onChange={(event) =>
              updateConfig({
                time: event.target.value,
              })
            }
          />
        </div>
      )}

      {scheduleType === "weekly" && (
        <div className="editor-field">
          <label htmlFor="schedule-day">
            Day
          </label>

          <select
            id="schedule-day"
            value={dayOfWeek}
            disabled={!canEdit}
            onChange={(event) =>
              updateConfig({
                day_of_week:
                  Number(
                    event.target.value
                  ),
              })
            }
          >
            <option value={0}>
              Sunday
            </option>
            <option value={1}>
              Monday
            </option>
            <option value={2}>
              Tuesday
            </option>
            <option value={3}>
              Wednesday
            </option>
            <option value={4}>
              Thursday
            </option>
            <option value={5}>
              Friday
            </option>
            <option value={6}>
              Saturday
            </option>
          </select>
        </div>
      )}

      <div className="editor-field">
        <label htmlFor="schedule-timezone">
          Timezone
        </label>

        <input
          id="schedule-timezone"
          type="text"
          value={timezone}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              timezone:
                event.target.value,
            })
          }
          placeholder="Asia/Kolkata"
        />

        <small className="field-help">
          Use an IANA timezone such as
          Asia/Kolkata or America/New_York.
        </small>
      </div>

      <div className="trigger-info-box">
        <p>
          The backend scheduler checks enabled
          scheduled triggers automatically.
        </p>
      </div>
    </div>
  );
}

function DatabaseEventTriggerEditor({
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
  const schema = getString(
    config.schema) ||
    "public";

  const table = getString(
    config.table
  );

  const operations = getStringArray(
    config.operations,
    ["INSERT"]
  );

  function toggleOperation(
    operation: DatabaseOperation
  ) {
    if (!canEdit) return;

    const next = operations.includes(operation)
      ? operations.filter(
          (item) => item !== operation
        )
      : [...operations, operation];

    updateConfig({
      operations: next,
    });
  }

  return (
    <div className="trigger-config-section trigger-config-section-v2">
      <div className="trigger-info-box">
        <h3>Database Event Trigger</h3>
        <p>
          Start this workflow when Hasura
          receives a database INSERT, UPDATE,
          or DELETE event for the configured
          table.
        </p>
      </div>

      <div className="editor-field">
        <label htmlFor="database-event-schema">
          Schema
        </label>

        <input
          id="database-event-schema"
          type="text"
          value={schema}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              schema:
                event.target.value.trim(),
            })
          }
          placeholder="public"
        />
      </div>

      <div className="editor-field">
        <label htmlFor="database-event-table">
          Table
        </label>

        <input
          id="database-event-table"
          type="text"
          value={table}
          disabled={!canEdit}
          onChange={(event) =>
            updateConfig({
              table:
                event.target.value.trim(),
            })
          }
          placeholder="orders"
        />

        <small className="field-help">
          The table must also have a Hasura
          Event Trigger configured to call the
          workflow engine database-event endpoint.
        </small>
      </div>

      <div className="editor-field">
        <label>Operations</label>

        <div className="database-event-operations">
          {(
            [
              "INSERT",
              "UPDATE",
              "DELETE",
            ] as DatabaseOperation[]
          ).map((operation) => (
            <label
              key={operation}
              className="checkbox-field"
            >
              <input
                type="checkbox"
                checked={operations.includes(
                  operation
                )}
                disabled={!canEdit}
                onChange={() =>
                  toggleOperation(operation)
                }
              />
              <span>{operation}</span>
            </label>
          ))}
        </div>

        {operations.length === 0 && (
          <small className="field-help">
            Select at least one operation.
          </small>
        )}
      </div>

      <div className="trigger-info-box">
        <p>
          Hasura Event Triggers provide reliable
          delivery for database changes and can
          invoke an HTTP webhook asynchronously.
        </p>
      </div>
    </div>
  );
}

type DatabaseOperation =
  | "INSERT"
  | "UPDATE"
  | "DELETE";

function getNumber(
  value: unknown,
  fallback: number
): number {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : fallback;
}

function getStringArray(
  value: unknown,
  fallback: string[]
): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string"
  );
}

function getBrowserTimeZone(): string {
  try {
    return (
      Intl.DateTimeFormat().resolvedOptions()
        .timeZone || "UTC"
    );
  } catch {
    return "UTC";
  }
}


function getString(
  value: unknown
): string {
  return typeof value === "string"
    ? value
    : "";
}

function formatTriggerType(
  type: WorkflowTriggerType
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