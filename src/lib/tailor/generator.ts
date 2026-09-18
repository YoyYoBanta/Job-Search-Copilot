import 'server-only';
import { getPrimaryGroqModel, getFallbackGroqModel, GROQ_API_URL } from '@/lib/groq/config';
import { buildTailorSystemPrompt, buildTailorUserPrompt, TailorPromptInputs } from './prompts';
import { extractAndParseJson, TailoredOutreach, TailoredOutreachSchema } from './schema';
import { validateOutreachCopy, ValidationResult } from './validator';

export interface GenerateOutreachResult {
  data: TailoredOutreach;
  validation: ValidationResult;
  modelUsed: string;
}

async function callGroqTailorChat(
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
    console.error(`[Groq HTTP 429 Rate Limit in Tailor] Model: ${model}, Status: 429, Body:`, errorBody);
    const error: any = new Error(`Groq rate limit exceeded (HTTP 429): ${errorBody}`);
    error.status = 429;
    error.isDailyCap = errorBody.toLowerCase().includes('daily') || errorBody.toLowerCase().includes('tpd');
    throw error;
  }

  if (response.status === 404) {
    const errorBody = await response.text();
    console.error(`[Groq HTTP 404 in Tailor] Model: ${model}, Status: 404, Body:`, errorBody);
    const error: any = new Error(`Groq model not found (HTTP 404 for model ${model}): ${errorBody}`);
    error.status = 404;
    error.isModelNotFound = true;
    throw error;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Groq HTTP Error in Tailor] Model: ${model}, Status: ${response.status}, Body:`, errorBody);
    throw new Error(`Groq API error (HTTP ${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || '';
  return { content };
}

export async function generateTailoredOutreach(
  inputs: TailorPromptInputs
): Promise<GenerateOutreachResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Missing GROQ_API_KEY environment variable. Please configure GROQ_API_KEY in Vercel or .env.local.');
  }

  const primaryModel = getPrimaryGroqModel();
  const fallbackModel = getFallbackGroqModel();

  const systemMessage = buildTailorSystemPrompt();
  const userMessage = buildTailorUserPrompt(inputs);

  let activeModel = primaryModel;
  let rawContent: string;

  try {
    const res = await callGroqTailorChat(
      activeModel,
      [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      apiKey
    );
    rawContent = res.content;
  } catch (err: any) {
    const shouldFallback =
      (err.status === 404 || err.isModelNotFound) ||
      (err.status === 429 && err.isDailyCap);

    if (shouldFallback && fallbackModel !== primaryModel) {
      console.warn(`[Groq Tailor Fallback] Primary model ${primaryModel} failed (${err.message}). Trying fallback model ${fallbackModel}...`);
      activeModel = fallbackModel;
      try {
        const fallbackRes = await callGroqTailorChat(
          activeModel,
          [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userMessage },
          ],
          apiKey
        );
        rawContent = fallbackRes.content;
      } catch (fallbackErr: any) {
        throw new Error(`Primary model (${primaryModel}) failed with ${err.message}; Fallback model (${fallbackModel}) also failed with: ${fallbackErr.message}`);
      }
    } else {
      throw err;
    }
  }

  // Attempt 1: Parse and validate JSON
  try {
    const parsed = extractAndParseJson(rawContent);
    const validated = TailoredOutreachSchema.parse(parsed);
    const validation = validateOutreachCopy(
      validated.cover_note,
      validated.referral_message,
      inputs.resumeText
    );
    return { data: validated, validation, modelUsed: activeModel };
  } catch (firstParseError: any) {
    console.error('[Groq Tailor Parse Attempt 1 Failed]:', firstParseError.message, 'Raw:', rawContent);

    // Attempt 2: Corrective retry
    try {
      const retryRes = await callGroqTailorChat(
        activeModel,
        [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: rawContent },
          {
            role: 'user',
            content: 'Your previous response was not valid JSON matching the schema. Return ONLY valid JSON with keys "cover_note" (string ~150 words) and "referral_message" (string ~80 words).',
          },
        ],
        apiKey
      );

      const secondParsed = extractAndParseJson(retryRes.content);
      const secondValidated = TailoredOutreachSchema.parse(secondParsed);
      const validation = validateOutreachCopy(
        secondValidated.cover_note,
        secondValidated.referral_message,
        inputs.resumeText
      );
      return { data: secondValidated, validation, modelUsed: activeModel };
    } catch (secondParseError: any) {
      throw new Error(`Failed to generate outreach copy: ${secondParseError.message}.`);
    }
  }
}
