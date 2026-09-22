import 'server-only';
import { getPrimaryGroqModel, getFallbackGroqModel, GROQ_API_URL } from '@/lib/groq/config';
import { buildAtsScanPrompt } from './prompts';
import { parseAtsScanLlmOutput } from './schema';
import { validateAndComputeAtsScan } from './validator';
import { computeResumeFingerprint } from './fingerprint';
import { AtsScanResult } from './types';

export interface ExecuteAtsScanParams {
  resumeText: string;
  jobTitle: string;
  companyName: string;
  jobDescription: string;
  overrideModel?: string;
}

async function callGroqAtsChat(
  model: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  apiKey: string
): Promise<{ content: string }> {
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

  if (response.status === 429) {
    const errorBody = await response.text();
    const retryAfter = response.headers.get('retry-after');
    const retrySec = retryAfter ? parseInt(retryAfter, 10) || 5 : 5;
    const error: any = new Error(`Groq rate limit exceeded (HTTP 429): ${errorBody}`);
    error.status = 429;
    error.retryAfterSeconds = retrySec;
    error.isDailyCap = errorBody.toLowerCase().includes('daily') || errorBody.toLowerCase().includes('tpd');
    throw error;
  }

  if (response.status === 404) {
    const errorBody = await response.text();
    const error: any = new Error(`Groq model not found (HTTP 404 for model ${model}): ${errorBody}`);
    error.status = 404;
    error.isModelNotFound = true;
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Groq API error (HTTP ${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || '';
  return { content };
}

/**
 * Runs the ATS Keyword Scanner against a job description and resume.
 */
export async function executeAtsScan(params: ExecuteAtsScanParams): Promise<AtsScanResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Missing GROQ_API_KEY environment variable. Please configure GROQ_API_KEY in Vercel or .env.local.');
  }

  const primaryModel = getPrimaryGroqModel();
  const fallbackModel = getFallbackGroqModel();
  let activeModel = params.overrideModel || primaryModel;

  const { systemMessage, userMessage } = buildAtsScanPrompt({
    resumeText: params.resumeText,
    jobTitle: params.jobTitle,
    companyName: params.companyName,
    jobDescription: params.jobDescription,
  });

  let rawContent = '';

  try {
    const res = await callGroqAtsChat(
      activeModel,
      [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      apiKey
    );
    rawContent = res.content;
  } catch (err: any) {
    if (params.overrideModel) {
      throw err;
    }

    // Attempt fallback if model not found or daily cap reached
    const shouldFallback =
      (err.status === 404 || err.isModelNotFound) ||
      (err.status === 429 && err.isDailyCap);

    if (shouldFallback && fallbackModel !== primaryModel) {
      console.warn(`[ATS Scanner Fallback] Primary model ${primaryModel} failed (${err.message}). Trying fallback model ${fallbackModel}...`);
      activeModel = fallbackModel;
      const fallbackRes = await callGroqAtsChat(
        activeModel,
        [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
        ],
        apiKey
      );
      rawContent = fallbackRes.content;
    } else {
      throw err;
    }
  }

  // Parse LLM JSON with single corrective retry
  let parsedLlmOutput;
  try {
    parsedLlmOutput = parseAtsScanLlmOutput(rawContent);
  } catch (firstParseErr: any) {
    console.warn('[ATS Scanner JSON Retry] Attempt 1 failed:', firstParseErr.message);
    const retryRes = await callGroqAtsChat(
      activeModel,
      [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: rawContent },
        {
          role: 'user',
          content: 'Your previous response was not valid JSON matching the schema. Return ONLY valid JSON with keys: matched_terms, missing_terms (with add_these_words and do_not_claim), and title_alignment.',
        },
      ],
      apiKey
    );
    parsedLlmOutput = parseAtsScanLlmOutput(retryRes.content);
  }

  // Fingerprint resume text
  const fingerprint = computeResumeFingerprint(params.resumeText);

  // Validate anti-fabrication & compute coverage
  const scanResult = validateAndComputeAtsScan(
    parsedLlmOutput,
    params.resumeText,
    fingerprint,
    activeModel
  );

  return scanResult;
}
