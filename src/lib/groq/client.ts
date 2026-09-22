import 'server-only';
import { getPrimaryGroqModel, getFallbackGroqModel, GROQ_API_URL } from './config';
import { extractAndParseJson, FitScoreResponse, FitScoreResponseSchema } from './schema';

export interface GroqRateLimitInfo {
  remainingTokens?: number;
  resetTokensSeconds?: number;
  remainingRequests?: number;
  resetRequestsSeconds?: number;
  retryAfterSeconds?: number;
}

export interface GroqScoreResult {
  data: FitScoreResponse;
  modelUsed: string;
  rateLimitInfo: GroqRateLimitInfo;
}

function parseSeconds(val: string | null): number | undefined {
  if (!val) return undefined;
  // Handle formats like "7.66s", "2m30s", "500ms"
  const trimmed = val.trim();
  if (trimmed.endsWith('ms')) {
    return parseFloat(trimmed.replace('ms', '')) / 1000;
  }
  if (trimmed.endsWith('s')) {
    if (trimmed.includes('m')) {
      const parts = trimmed.split('m');
      const minutes = parseFloat(parts[0]) || 0;
      const seconds = parseFloat(parts[1].replace('s', '')) || 0;
      return minutes * 60 + seconds;
    }
    return parseFloat(trimmed.replace('s', ''));
  }
  const num = parseFloat(trimmed);
  return isNaN(num) ? undefined : num;
}

function extractRateLimitInfo(headers: Headers): GroqRateLimitInfo {
  const remainingTokensStr = headers.get('x-ratelimit-remaining-tokens');
  const resetTokensStr = headers.get('x-ratelimit-reset-tokens');
  const remainingRequestsStr = headers.get('x-ratelimit-remaining-requests');
  const resetRequestsStr = headers.get('x-ratelimit-reset-requests');
  const retryAfterStr = headers.get('retry-after');

  return {
    remainingTokens: remainingTokensStr ? parseInt(remainingTokensStr, 10) : undefined,
    resetTokensSeconds: parseSeconds(resetTokensStr),
    remainingRequests: remainingRequestsStr ? parseInt(remainingRequestsStr, 10) : undefined,
    resetRequestsSeconds: parseSeconds(resetRequestsStr),
    retryAfterSeconds: parseSeconds(retryAfterStr),
  };
}

async function callGroqChat(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  apiKey: string
): Promise<{ content: string; rateLimits: GroqRateLimitInfo }> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
    }),
  });

  const rateLimits = extractRateLimitInfo(response.headers);

  if (response.status === 429) {
    const errorBody = await response.text();
    console.error(`[Groq HTTP 429 Rate Limit] Model: ${model}, Status: 429, Body:`, errorBody);
    const retryDelay = rateLimits.retryAfterSeconds || rateLimits.resetTokensSeconds || 5;
    const error: any = new Error(`Groq rate limit exceeded (HTTP 429): ${errorBody}`);
    error.status = 429;
    error.retryAfterSeconds = Math.ceil(retryDelay);
    error.isDailyCap = errorBody.toLowerCase().includes('daily') || errorBody.toLowerCase().includes('tpd');
    throw error;
  }

  if (response.status === 404) {
    const errorBody = await response.text();
    console.error(`[Groq HTTP 404 Model Not Found] Model: ${model}, Status: 404, Body:`, errorBody);
    const error: any = new Error(`Groq model not found (HTTP 404 for model ${model}): ${errorBody}`);
    error.status = 404;
    error.isModelNotFound = true;
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Groq HTTP Error] Model: ${model}, Status: ${response.status}, Body:`, errorBody);
    throw new Error(`Groq API error (HTTP ${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || '';
  return { content, rateLimits };
}

export async function requestGroqFitScore(
  systemMessage: string,
  userMessage: string,
  overrideModel?: string
): Promise<GroqScoreResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.error('[Groq Config Error]: Missing GROQ_API_KEY environment variable in process.env');
    throw new Error('Missing GROQ_API_KEY environment variable. Please configure GROQ_API_KEY in Vercel or .env.local.');
  }

  const primaryModel = getPrimaryGroqModel();
  const fallbackModel = getFallbackGroqModel();

  let activeModel = overrideModel || primaryModel;
  let rawContent: string;
  let rateLimits: GroqRateLimitInfo;

  try {
    const res = await callGroqChat(
      activeModel,
      [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      apiKey
    );
    rawContent = res.content;
    rateLimits = res.rateLimits;
  } catch (err: any) {
    if (overrideModel) {
      // Caller explicitly manages models and fallbacks
      throw err;
    }

    // If primary model does not exist (404) or daily token cap was hit (429), fall back to fallback model
    const shouldFallback =
      (err.status === 404 || err.isModelNotFound) ||
      (err.status === 429 && err.isDailyCap);

    if (shouldFallback && fallbackModel !== primaryModel) {
      console.warn(`[Groq Model Fallback] Primary model ${primaryModel} failed (${err.message}). Trying fallback model ${fallbackModel}...`);
      activeModel = fallbackModel;
      try {
        const fallbackRes = await callGroqChat(
          activeModel,
          [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage },
          ],
          apiKey
        );
        rawContent = fallbackRes.content;
        rateLimits = fallbackRes.rateLimits;
      } catch (fallbackErr: any) {
        console.error(`[Groq Fallback Error] Fallback model ${fallbackModel} also failed:`, fallbackErr.message);
        throw new Error(`Primary model (${primaryModel}) failed with ${err.message}; Fallback model (${fallbackModel}) also failed with: ${fallbackErr.message}`);
      }
    } else {
      throw err;
    }
  }

  // Attempt 1 to parse and validate JSON
  try {
    const parsed = extractAndParseJson(rawContent);
    const validated = FitScoreResponseSchema.parse(parsed);
    return { data: validated, modelUsed: activeModel, rateLimitInfo: rateLimits };
  } catch (firstParseError: any) {
    console.error('[Groq JSON Parse/Validation Attempt 1 Failed]:', firstParseError.message, 'Raw LLM Content:', rawContent);

    // Attempt 2: Retry once with a corrective JSON prompt
    let correctiveRes: { content: string; rateLimits: GroqRateLimitInfo } | undefined;
    try {
      correctiveRes = await callGroqChat(
        activeModel,
        [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: rawContent },
          {
            role: 'user',
            content: 'Your previous response was not valid JSON matching the required schema. Return ONLY valid JSON with keys: fit_score (number 0-100), top_reasons (string[]), gaps (string[]), recommended_resume_bullets_to_lead_with (string[]), seniority_match ("under"|"fit"|"over").',
          },
        ],
        apiKey
      );

      const secondParsed = extractAndParseJson(correctiveRes.content);
      const secondValidated = FitScoreResponseSchema.parse(secondParsed);
      return { data: secondValidated, modelUsed: activeModel, rateLimitInfo: correctiveRes.rateLimits };
    } catch (secondParseError: any) {
      console.error('[Groq JSON Parse/Validation Attempt 2 Failed]:', secondParseError.message, 'Raw LLM Content on retry:', correctiveRes?.content || 'N/A');
      throw new Error(`Failed to parse/validate JSON from Groq: ${secondParseError.message}. Raw output: ${(correctiveRes?.content || rawContent).slice(0, 200)}`);
    }
  }
}
