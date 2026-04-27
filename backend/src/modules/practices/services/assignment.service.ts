import { NotFoundError } from '../../../core/api-error';
import * as assignmentRepo from '../repositories/assignment.repo';

function formatAssignment(a: any) {
    return {
        id: a.id,
        practiceId: a.practiceId,
        dueDate: a.dueDate.toISOString().slice(0, 10),
        completedAt: a.completedAt?.toISOString() ?? null,
        source: a.source,
        assignedAt: a.assignedAt.toISOString(),
        practice: {
            id: a.practice.id,
            title: a.practice.title,
            type: a.practice.type,
            description: a.practice.description,
            durationMinutes: a.practice.durationMinutes,
            energyNode: a.practice.energyNode
                ? { id: a.practice.energyNode.id, slug: a.practice.energyNode.slug, title: a.practice.energyNode.title }
                : null,
        },
    };
}

export async function getActive(userId: number) {
    const items = await assignmentRepo.findActive(userId);
    return items.map(formatAssignment);
}

export async function listInRange(userId: number, range: string, page: number, pageSize: number) {
    const days = parseInt(range, 10);
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const offset = (page - 1) * pageSize;
    const { items, total } = await assignmentRepo.findInRange(userId, from, pageSize, offset);

    return {
        assignments: items.map(formatAssignment),
        total,
        page,
        pageSize,
    };
}

export async function getById(userId: number, id: string) {
    const a = await assignmentRepo.findById(id);
    if (!a || a.userId !== userId) throw new NotFoundError('Assignment not found');
    return formatAssignment(a);
}

export async function complete(userId: number, id: string) {
    const a = await assignmentRepo.findById(id);
    if (!a || a.userId !== userId) throw new NotFoundError('Assignment not found');
    const updated = await assignmentRepo.markComplete(id);
    return formatAssignment(updated);
}

export async function remove(userId: number, id: string) {
    const a = await assignmentRepo.findById(id);
    if (!a || a.userId !== userId) throw new NotFoundError('Assignment not found');
    await assignmentRepo.deleteById(id);
}
