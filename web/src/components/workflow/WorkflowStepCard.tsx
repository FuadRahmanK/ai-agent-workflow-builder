"use client";

import type {
  WorkflowStep,
} from "@/src/types/workflow";

interface WorkflowStepCardProps {
  step: WorkflowStep;
  selected: boolean;
  onSelect: () => void;
}

export default function WorkflowStepCard({
  step,
  selected,
  onSelect,
}: WorkflowStepCardProps) {
  return (
    <button
      type="button"
      className={`builder-step-card builder-step-card-v2 ${
        selected
          ? "builder-step-card-selected"
          : ""
      }`}
      onClick={onSelect}
    >
      <span className="builder-step-number">
        {step.position}
      </span>

      <span className="builder-step-content">
        <strong>{step.name}</strong>

        <small className="builder-step-type-badge">
          {formatStepType(step.type)}
        </small>
      </span>
    </button>
  );
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