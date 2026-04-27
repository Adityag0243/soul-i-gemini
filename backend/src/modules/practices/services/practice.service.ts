import { FeedbackType } from '@prisma/client';
import { NotFoundError } from '../../../core/api-error';
import { prisma } from '../../../database';
import * as practiceRepo from '../repositories/practice.repo';
import * as feedbackRepo from '../repositories/feedback.repo';
import * as practiceSaveRepo from '../repositories/practice-save.repo';

export async function listPractices(filters: {
    energyNodeId?: string;
    type?: string;
    page: number;
    limit: number;
}) {
    const offset = (filters.page - 1) * filters.limit;
    const { items, total } = await practiceRepo.findMany({
        energyNodeId: filters.energyNodeId,
        type: filters.type,
        limit: filters.limit,
        offset,
    });

    return {
        practices: items.map((p) => ({
            id: p.id,
            title: p.title,
            type: p.type,
            description: p.description,
            durationMinutes: p.durationMinutes,
            energyNode: p.energyNode
                ? { id: p.energyNode.id, slug: p.energyNode.slug, title: p.energyNode.title }
                : null,
        })),
        total,
        page: filters.page,
        limit: filters.limit,
    };
}

export async function getRecommended(userId: number, limit: number = 10) {
    const recentState = await prisma.emotionalState.findFirst({
        where: { userId, energyNodeId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { energyNodeId: true },
    });

    const energyNodeId = recentState?.energyNodeId ?? null;

    const rows = await practiceRepo.findRecommended(energyNodeId, limit);

    return {
        energyNodeId,
        practices: rows.map((r) => ({
            id: r.id,
            title: r.title,
            type: r.type,
            description: r.description,
            durationMinutes: r.duration_minutes,
            score: Number(r.score),
            energyNode: r.node_slug
                ? { id: r.energy_node_id, slug: r.node_slug, title: r.node_title }
                : null,
        })),
    };
}

export async function getPracticeById(id: string) {
    const p = await practiceRepo.findById(id);
    if (!p || !p.isActive) throw new NotFoundError('Practice not found');
    return {
        id: p.id,
        title: p.title,
        type: p.type,
        description: p.description,
        durationMinutes: p.durationMinutes,
        textScript: p.textScript,
        audioUrl: p.audioUrl,
        videoUrl: p.videoUrl,
        energyNode: p.energyNode
            ? { id: p.energyNode.id, slug: p.energyNode.slug, title: p.energyNode.title, color: p.energyNode.color, icon: p.energyNode.icon }
            : null,
        createdAt: p.createdAt.toISOString(),
    };
}

export async function submitFeedback(
    userId: number,
    practiceId: string,
    feedback: FeedbackType,
    reflection?: string,
) {
    const practice = await practiceRepo.findById(practiceId);
    if (!practice || !practice.isActive) throw new NotFoundError('Practice not found');

    const entry = await feedbackRepo.createFeedback({
        userId,
        practiceId,
        feedback,
        reflection,
    });

    return {
        id: entry.id,
        feedback: entry.feedback,
        reflection: entry.reflection,
        createdAt: entry.createdAt.toISOString(),
    };
}

export async function getMyFeedback(userId: number, practiceId: string) {
    const entries = await feedbackRepo.findByUserAndPractice(userId, practiceId);
    return entries.map((e) => ({
        id: e.id,
        feedback: e.feedback,
        reflection: e.reflection,
        createdAt: e.createdAt.toISOString(),
    }));
}

export async function savePractice(userId: number, practiceId: string) {
    const practice = await practiceRepo.findById(practiceId);
    if (!practice || !practice.isActive) throw new NotFoundError('Practice not found');
    await practiceSaveRepo.save(userId, practiceId);
}

export async function unsavePractice(userId: number, practiceId: string) {
    await practiceSaveRepo.remove(userId, practiceId);
}

export async function getSavedPractices(userId: number) {
    const saves = await practiceSaveRepo.findAllByUser(userId);
    return saves.map((s) => ({
        id: s.practice.id,
        title: s.practice.title,
        type: s.practice.type,
        description: s.practice.description,
        durationMinutes: s.practice.durationMinutes,
        energyNode: s.practice.energyNode
            ? { id: s.practice.energyNode.id, slug: s.practice.energyNode.slug, title: s.practice.energyNode.title }
            : null,
        savedAt: s.savedAt.toISOString(),
    }));
}
