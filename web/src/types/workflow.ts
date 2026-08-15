export type WorkflowStepType =
  | "llm_call"
  | "http_request"
  | "db_write"
  | "notify"
  | "conditional_branch"
  | "approval_gate";

export type WorkflowTriggerType =
  | "manual"
  | "webhook"
  | "scheduled"
  | "database_event";

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  position: number;
  config: Record<string, unknown> | null;
  branch: "true" | "false" | null;
}

export interface WorkflowTrigger {
  id: string;
  type: WorkflowTriggerType;
  config: Record<string, unknown> | null;
  enabled: boolean;
}

export interface WorkflowRun {
  id: string;
  status: WorkflowRunStatus;
  trigger_type: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  org_id: string;
  workflow_steps: WorkflowStep[];
  workflow_triggers: WorkflowTrigger[];
  workflow_runs: WorkflowRun[];
}