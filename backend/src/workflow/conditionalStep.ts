export interface ConditionalStepConfig {
  source_step_id?: string;
  field: string;
  operator: "equals" | "not_equals" | "contains";
  value: string;
}

export interface ConditionalResult {
  conditionMet: boolean;
  value: unknown;
}

export function executeConditionalStep(
  config: ConditionalStepConfig,
  previousOutput: unknown
): ConditionalResult {
  if (!config.field) {
    throw new Error(
      "Conditional step requires a field"
    );
  }

  if (!config.operator) {
    throw new Error(
      "Conditional step requires an operator"
    );
  }

  const actualValue = getNestedValue(
    previousOutput,
    config.field
  );

  if (actualValue === undefined) {
    return {
      conditionMet: false,
      value: undefined,
    };
  }

  const actualString = String(actualValue);
  const expectedString = String(config.value);

  let conditionMet = false;

  switch (config.operator) {
    case "equals":
      conditionMet =
        actualString === expectedString;
      break;

    case "not_equals":
      conditionMet =
        actualString !== expectedString;
      break;

    case "contains":
      conditionMet =
        actualString
          .toLowerCase()
          .includes(expectedString.toLowerCase());
      break;

    default:
      throw new Error(
        `Unsupported conditional operator: ${config.operator}`
      );
  }

  return {
    conditionMet,
    value: actualValue,
  };
}

function getNestedValue(
  object: unknown,
  path: string
): unknown {
  if (
    object === null ||
    object === undefined
  ) {
    return undefined;
  }

  return path
    .split(".")
    .reduce<unknown>((current, key) => {
      if (
        current !== null &&
        typeof current === "object" &&
        key in current
      ) {
        return (
          current as Record<string, unknown>
        )[key];
      }

      return undefined;
    }, object);
}