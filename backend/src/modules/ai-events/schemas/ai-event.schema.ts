import { z } from 'zod';

const baseEvent = z.object({
    sessionId: z.string().uuid(),
    userId: z.number().int(),
    timestamp: z.string().datetime().optional(),
});

const phaseChangeEvent = baseEvent.extend({
    type: z.literal('phase_change'),
    data: z.object({
        fromPhase: z.string().nullable(),
        toPhase: z.string(),
        energyNode: z.string().nullable().optional(),
        secondaryNode: z.string().nullable().optional(),
    }),
});

const crisisDetectedEvent = baseEvent.extend({
    type: z.literal('crisis_detected'),
    data: z.object({
        level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        messageId: z.string().uuid().optional(),
    }),
});

const solutionCompleteEvent = baseEvent.extend({
    type: z.literal('solution_complete'),
    data: z.object({
        solutionStep: z.number().int().optional(),
        threeDayTask: z
            .object({
                title: z.string(),
                description: z.string().optional(),
                durationDays: z.number().int().default(3),
                practiceId: z.string().uuid().optional(),
            })
            .nullable()
            .optional(),
    }),
});

const threeDayTaskAssignedEvent = baseEvent.extend({
    type: z.literal('three_day_task_assigned'),
    data: z.object({
        practiceId: z.string().uuid(),
        title: z.string(),
        durationDays: z.number().int().default(3),
    }),
});

const nameExtractedEvent = baseEvent.extend({
    type: z.literal('name_extracted'),
    data: z.object({
        name: z.string().min(1).max(100),
    }),
});

export const aiEventSchema = z.discriminatedUnion('type', [
    phaseChangeEvent,
    crisisDetectedEvent,
    solutionCompleteEvent,
    threeDayTaskAssignedEvent,
    nameExtractedEvent,
]);

export type AiEvent = z.infer<typeof aiEventSchema>;
