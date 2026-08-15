interface HttpStepConfig {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface StepExecutionResult {
  output: unknown;
}

export async function executeHttpStep(
  config: HttpStepConfig
): Promise<StepExecutionResult> {
  if (!config.url) {
    throw new Error("HTTP step requires a URL");
  }

  const method = (config.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {
    ...(config.headers ?? {}),
  };

  const requestOptions: RequestInit = {
    method,
    headers,
  };

  if (
    config.body !== undefined &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    headers["Content-Type"] =
      headers["Content-Type"] ?? "application/json";

    requestOptions.body =
      typeof config.body === "string"
        ? config.body
        : JSON.stringify(config.body);
  }

  const response = await fetch(
    config.url,
    requestOptions
  );

  const text = await response.text();

  let output: unknown;

  try {
    output = text ? JSON.parse(text) : null;
  } catch {
    output = text;
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text}`
    );
  }

  return {
    output: {
      status: response.status,
      data: output,
    },
  };
}