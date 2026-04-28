import { z } from 'zod';

export const applyReferralSchema = z.object({
    code: z.string().min(1).max(50),
});

export type ApplyReferralInput = z.infer<typeof applyReferralSchema>;
