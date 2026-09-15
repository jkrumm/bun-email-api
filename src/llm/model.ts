import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { env } from "../env";

let cachedModel: LanguageModel | null = null;

export function getLlmConfig(): {
  baseURL: string;
  apiKey: string;
  model: string;
} | null {
  const { BEA_LLM_BASE_URL, BEA_LLM_API_KEY, BEA_LLM_MODEL } = env;
  if (!BEA_LLM_BASE_URL || !BEA_LLM_API_KEY || !BEA_LLM_MODEL) return null;
  return {
    baseURL: BEA_LLM_BASE_URL,
    apiKey: BEA_LLM_API_KEY,
    model: BEA_LLM_MODEL,
  };
}

export function getModel(): LanguageModel {
  if (!cachedModel) {
    const config = getLlmConfig();
    if (!config) {
      throw new Error("LLM not configured");
    }
    const provider = createOpenAICompatible({
      name: "llm",
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      // Without this the provider only asks for json_object mode and never
      // sends the schema, so GPT-class models answer in their own shape.
      supportsStructuredOutputs: true,
    });
    cachedModel = provider(config.model);
  }
  return cachedModel;
}

export function getModelId(model: LanguageModel): string {
  return typeof model === "string" ? model : model.modelId;
}
