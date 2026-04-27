import { z } from 'zod';

export const listPracticesSchema = z.object({
    energyNodeId: z.string().uuid().optional(),
    type: z.string().max(50).optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});

export type ListPracticesInput = z.infer<typeof listPracticesSchema>;

export const practiceFeedbackSchema = z.object({
    feedback: z.enum(['BETTER', 'SAME', 'WORSE']),
    reflection: z.string().max(2000).optional(),
});

export type PracticeFeedbackInput = z.infer<typeof practiceFeedbackSchema>;
