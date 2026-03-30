import { createAnthropic } from "@ai-sdk/anthropic";

const baseURL = process.env.ANTHROPIC_URL
  ? process.env.ANTHROPIC_URL.replace(/^http:\/\//, "https://").replace(/\/?$/, "/v1")
  : undefined;

export const anthropic = createAnthropic({
  baseURL,
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const DEFAULT_MODEL = "claude-opus-4-6";
