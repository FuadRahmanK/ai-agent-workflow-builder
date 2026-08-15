import { executeHttpStep } from "./httpStep.js";
import { executeLlmStep } from "./llmStep.js";
import {
  executeConditionalStep,
} from "./conditionalStep.js";
import {
  executeDbWriteStep,
} from "./dbWriteStep.js";
import {
  executeNotifyStep,
} from "./notifyStep.js";

export interface ApprovalGateResult {
  paused: true;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  position: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
  branch: string | null;
}

export interface StepExecutionContext {
  previousOutput: unknown;
  stepOutputs: Record<string, unknown>;
  workflowRunId: string;
  organizationId: string;
}

export async function executeStep(
  step: WorkflowStep,
  context: StepExecutionContext
): Promise<unknown> {
  switch (step.type) {
    case "http_request": {
      const result = await executeHttpStep(
        step.config as {
          method?: string;
          url: string;
          headers?: Record<string, string>;
          body?: unknown;
        }
      );

      return result.output;
    }

    case "llm_call": {
      const result = await executeLlmStep(
        step.config as {
          prompt: string;
          model?: string;
          temperature?: number;
        },
        context.previousOutput
      );

      return result.output;
    }

    case "conditional_branch": {
      const config = step.config as {
        source_step_id?: string;
        field: string;
        operator:
          | "equals"
          | "not_equals"
          | "contains";
        value: string;
      };

      const sourceOutput = config.source_step_id
        ? context.stepOutputs[config.source_step_id]
        : context.previousOutput;

      if (
        config.source_step_id &&
        !Object.prototype.hasOwnProperty.call(
          context.stepOutputs,
          config.source_step_id
        )
      ) {
        throw new Error(
          `Conditional source step ${config.source_step_id} has not executed yet`
        );
      }

      return executeConditionalStep(
        config,
        sourceOutput
      );
    }

    case "approval_gate": {
      return {
        paused: true,
      } satisfies ApprovalGateResult;
    }

    case "db_write": {
      return executeDbWriteStep(
        context.workflowRunId,
        step.id,
        step.config as {
          result?: unknown;
          include_previous_output?: boolean;
        },
        context.previousOutput
      );
    }

    case "notify": {
      return executeNotifyStep(
        context.workflowRunId,
        step.id,
        context.organizationId,
        step.config as {
          channel?: "email" | "slack";
          recipient?: string;
          subject?: string;
          message: string;
          include_previous_output?: boolean;
        },
        context.previousOutput
      );
    }

    default:
      throw new Error(
        `Unsupported step type: ${step.type}`
      );
  }
}