import 'server-only';
import { getPrimaryGroqModel, getFallbackGroqModel, GROQ_API_URL } from '@/lib/groq/config';
import { buildTailorSystemPrompt, buildTailorUserPrompt, TailorPromptInputs } from './prompts';
import { extractAndParseJson, TailoredOutreach, TailoredOutreachSchema } from './schema';
import { validateOutreachCopy, ValidationResult, JobGroundingContext } from './validator';

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

  const jobContext: JobGroundingContext = {
    companyName: inputs.companyName,
    jobTitle: inputs.jobTitle,
    jobDescription: inputs.jobDescription,
  };

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

  // Attempt 1: Parse and validate
  let parsedJson: any;
  try {
    parsedJson = extractAndParseJson(rawContent);
  } catch {
    parsedJson = null;
  }

  let validation: ValidationResult | null = null;
  if (parsedJson) {
    const parsed = TailoredOutreachSchema.safeParse(parsedJson);
    if (parsed.success) {
      validation = validateOutreachCopy(
        parsed.data.cover_note,
        parsed.data.referral_message,
        inputs.resumeText,
        jobContext
      );
    }
  }

  // If Attempt 1 failed schema, validation, ungrounded company, or length bounds, retry ONCE with corrective feedback
  if (!parsedJson || !validation || !validation.isValid) {
    const issues: string[] = [];
    if (validation) {
      if (validation.clichesFound.length > 0) {
        issues.push(`Remove forbidden phrases: ${validation.clichesFound.join(', ')}`);
      }
      if (validation.fabricationWarnings.length > 0) {
        issues.push(`Ungrounded claims detected: ${validation.fabricationWarnings.join('; ')}`);
      }
      if (!validation.isLengthValid) {
        issues.push(`Length requirement: Cover Note MUST be 130-170 words (currently ${validation.coverNoteWordCount}); Referral DM MUST be under 90 words (currently ${validation.referralMessageWordCount}).`);
      }
    } else {
      issues.push('Output was not valid JSON with keys "cover_note" and "referral_message".');
    }

    try {
      const correctivePrompt = `Your previous generation had issues:\n- ${issues.join('\n- ')}\n\nRegenerate the Cover Note (130-170 words) and Referral DM (under 90 words, including "${inputs.jobTitle}" and "${inputs.jobUrl}"). Mention ONLY companies/tools present in the resume or JD. Do NOT mention gaps. Output ONLY valid JSON with keys "cover_note" and "referral_message".`;

      const retryRes = await callGroqTailorChat(
        activeModel,
        [
          { role: 'system', content: systemMessage },
          { role: 'user', content: userMessage },
          { role: 'assistant', content: rawContent },
          { role: 'user', content: correctivePrompt },
        ],
        apiKey
      );

      const secondParsed = extractAndParseJson(retryRes.content);
      const secondValidated = TailoredOutreachSchema.parse(secondParsed);
      const secondValidation = validateOutreachCopy(
        secondValidated.cover_note,
        secondValidated.referral_message,
        inputs.resumeText,
        jobContext
      );

      // If still ungrounded after retry, use sanitized text (with ungrounded sentences removed)
      return {
        data: {
          cover_note: secondValidation.sanitizedCoverNote,
          referral_message: secondValidation.sanitizedReferralMessage,
        },
        validation: secondValidation,
        modelUsed: activeModel,
      };
    } catch (secondErr: any) {
      // If retry errored but we had a partially usable attempt 1, sanitize and return
      if (validation && parsedJson) {
        return {
          data: {
            cover_note: validation.sanitizedCoverNote,
            referral_message: validation.sanitizedReferralMessage,
          },
          validation,
          modelUsed: activeModel,
        };
      }
      throw new Error(`Failed to generate outreach copy: ${secondErr.message}`);
    }
  }

  return {
    data: {
      cover_note: validation.sanitizedCoverNote,
      referral_message: validation.sanitizedReferralMessage,
    },
    validation,
    modelUsed: activeModel,
  };
}
