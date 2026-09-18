import { z } from 'zod';
import { extractAndParseJson } from '@/lib/groq/schema';

export const TailoredOutreachSchema = z.object({
  cover_note: z.string().min(20, 'Cover note must be at least 20 characters'),
  referral_message: z.string().min(10, 'Referral message must be at least 10 characters'),
});

export type TailoredOutreach = z.infer<typeof TailoredOutreachSchema>;

export { extractAndParseJson };
