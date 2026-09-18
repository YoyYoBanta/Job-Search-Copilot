/**
 * Groq Model & Rate Limit Configurations
 * Reads from GROQ_MODEL_PRIMARY and GROQ_MODEL_FALLBACK env vars with defaults.
 */

export function getPrimaryGroqModel(): string {
  return process.env.GROQ_MODEL_PRIMARY || 'openai/gpt-oss-120b';
}

export function getFallbackGroqModel(): string {
  return process.env.GROQ_MODEL_FALLBACK || 'openai/gpt-oss-20b';
}

export function formatShortModelName(modelName: string | null | undefined): string {
  if (!modelName) return '';
  const parts = modelName.split('/');
  return parts[parts.length - 1];
}

export const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
