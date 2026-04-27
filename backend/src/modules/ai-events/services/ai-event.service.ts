import { prisma } from '../../../database';
import { CrisisLevel } from '@prisma/client';
import { AiEvent } from '../schemas/ai-event.schema';

export async function handleEvent(event: AiEvent): Promise<void> {
    switch (event.type) {
        case 'phase_change':
            return handlePhaseChange(event);
        case 'crisis_detected':
            return handleCrisisDetected(event);
        case 'solution_complete':
            return handleSolutionComplete(event);
        case 'three_day_task_assigned':
            return handleThreeDayTaskAssigned(event);
        case 'name_extracted':
            return handleNameExtracted(event);
    }
}

async function handlePhaseChange(
    event: Extract<AiEvent, { type: 'phase_change' }>,
) {
    await prisma.chatSession.update({
        where: { id: event.sessionId },
        data: {
            phase: event.data.toPhase,
            ...(event.data.energyNode !== undefined && {
                energyNode: event.data.energyNode,
            }),
            ...(event.data.secondaryNode !== undefined && {
                secondaryNode: event.data.secondaryNode,
            }),
            lastActivityAt: new Date(),
        },
    });
}

async function handleCrisisDetected(
    event: Extract<AiEvent, { type: 'crisis_detected' }>,
) {
    await prisma.crisisEvent.create({
        data: {
            userId: event.userId,
            sessionId: event.sessionId,
            level: event.data.level as CrisisLevel,
            ...(event.data.messageId && {
                triggerMessageId: event.data.messageId,
            }),
        },
    });
}

async function handleSolutionComplete(
    event: Extract<AiEvent, { type: 'solution_complete' }>,
) {
    await prisma.chatSession.update({
        where: { id: event.sessionId },
        data: {
            solutionComplete: true,
            ...(event.data.solutionStep !== undefined && {
                solutionStep: event.data.solutionStep,
            }),
            ...(event.data.threeDayTask && {
                threeDayTask: event.data.threeDayTask,
                threeDayTaskAssignedAt: new Date(),
            }),
            lastActivityAt: new Date(),
        },
    });
}

async function handleThreeDayTaskAssigned(
    event: Extract<AiEvent, { type: 'three_day_task_assigned' }>,
) {
    const dueDate = new Date();
    dueDate.setUTCDate(
        dueDate.getUTCDate() + (event.data.durationDays ?? 3),
    );

    await prisma.practiceAssignment.create({
        data: {
            userId: event.userId,
            practiceId: event.data.practiceId,
            dueDate,
            source: 'ai_webhook',
        },
    });
}

async function handleNameExtracted(
    event: Extract<AiEvent, { type: 'name_extracted' }>,
) {
    await prisma.user.update({
        where: { id: event.userId },
        data: { callName: event.data.name },
    });
}
