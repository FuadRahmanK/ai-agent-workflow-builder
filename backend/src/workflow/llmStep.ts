import Groq from "groq-sdk";

interface LlmStepConfig {
  prompt: string;
  model?: string;
  temperature?: number;
}

export interface LlmStepResult {
  output: {
    text: string;
    model: string;
  };
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function executeLlmStep(
  config: LlmStepConfig,
  previousOutput: unknown
): Promise<LlmStepResult> {
  if (!config.prompt) {
    throw new Error("LLM step requires a prompt");
  }

  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const prompt = buildPrompt(
    config.prompt,
    previousOutput
  );

  try {
    const response =
      await groq.chat.completions.create({
        model:
          config.model ??
          "llama-3.1-8b-instant",

        temperature:
          config.temperature ?? 0,

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

    const text =
      response.choices[0]?.message?.content;

    if (!text) {
      throw new Error(
        "LLM returned an empty response"
      );
    }

    return {
      output: {
        text,
        model:
          response.model ??
          config.model ??
          "llama-3.1-8b-instant",
      },
    };
  } catch (error) {
    console.error("LLM step attempt failed:", error);
    throw error instanceof Error
      ? error
      : new Error("LLM request failed");
  }
}

function buildPrompt(
  prompt: string,
  previousOutput: unknown
): string {
  if (previousOutput === null) {
    return prompt;
  }

  return `${prompt}

Previous step output:
${JSON.stringify(previousOutput)}
`;
}