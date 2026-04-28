import { z } from 'zod';

export const createCheckinSchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format'),
    moodScore: z.number().int().min(1).max(10),
    energyWord: z.string().max(100).optional(),
    reflection: z.string().max(5000).optional(),
    voiceReflection: z.string().max(10000).optional(),
    audioUrl: z.string().max(500).optional(),
});

export type CreateCheckinInput = z.infer<typeof createCheckinSchema>;

export const listCheckinsSchema = z.object({
    range: z
        .string()
        .regex(/^\d+d$/, 'Range must be like 7d, 30d, 90d')
        .default('30d'),
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(20),
});

export type ListCheckinsInput = z.infer<typeof listCheckinsSchema>;

export const updateCheckinSchema = z.object({
    moodScore: z.number().int().min(1).max(10).optional(),
    energyWord: z.string().max(100).optional(),
    reflection: z.string().max(5000).optional(),
    voiceReflection: z.string().max(10000).optional(),
    audioUrl: z.string().max(500).optional(),
});

export type UpdateCheckinInput = z.infer<typeof updateCheckinSchema>;
