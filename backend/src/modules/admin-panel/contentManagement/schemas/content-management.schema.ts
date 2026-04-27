import { z } from 'zod';

const mediaTypeSchema = z.preprocess(
    (value) => {
        if (typeof value !== 'string') return value;
        return value.trim().toUpperCase();
    },
    z.enum(['AUDIO', 'VIDEO']),
);

const tagsSchema = z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((value) => {
        if (Array.isArray(value)) {
            return value
                .flatMap((entry) => entry.split(','))
                .map((tag) => tag.trim())
                .filter(Boolean);
        }

        if (typeof value === 'string') {
            return value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean);
        }

        return [] as string[];
    });

const durationSchema = z
    .union([z.string(), z.number()])
    .transform((value) => {
        if (typeof value === 'number') {
            return value;
        }

        const parsedValue = Number.parseInt(value, 10);
        return parsedValue;
    })
    .refine((value) => Number.isInteger(value) && value > 0, {
        message: 'Duration must be a positive integer value in minutes.',
    });

export const createPracticeSchema = z.object({
    title: z.string().trim().min(1, 'Practice title is required'),
    description: z.string().trim().min(1, 'Description is required'),
    duration: durationSchema,
    practiceType: z.string().trim().min(1, 'Practice type is required'),
    mediaType: mediaTypeSchema,
    tags: tagsSchema,
});

export const bulkPracticeUploadSchema = z.object({});

export type CreatePracticeInput = z.infer<typeof createPracticeSchema>;

export type BulkPracticeSheetRowInput = {
    title: string;
    description: string;
    duration: number;
    practiceType: string;
    mediaType: 'AUDIO' | 'VIDEO';
    tags: string[];
    mediaUrl?: string | null;
};
