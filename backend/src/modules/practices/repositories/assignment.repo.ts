import { prisma } from '../../../database';

const practiceInclude = {
    practice: {
        include: { energyNode: { select: { id: true, slug: true, title: true } } },
    },
};

export async function findActive(userId: number) {
    return prisma.practiceAssignment.findMany({
        where: { userId, completedAt: null },
        include: practiceInclude,
        orderBy: { dueDate: 'asc' },
    });
}

export async function findInRange(userId: number, from: Date, limit: number, offset: number) {
    const where = { userId, assignedAt: { gte: from } };
    const [items, total] = await Promise.all([
        prisma.practiceAssignment.findMany({
            where,
            include: practiceInclude,
            orderBy: { assignedAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        prisma.practiceAssignment.count({ where }),
    ]);
    return { items, total };
}

export async function findById(id: string) {
    return prisma.practiceAssignment.findUnique({
        where: { id },
        include: practiceInclude,
    });
}

export async function markComplete(id: string) {
    return prisma.practiceAssignment.update({
        where: { id },
        data: { completedAt: new Date() },
        include: practiceInclude,
    });
}

export async function deleteById(id: string) {
    return prisma.practiceAssignment.delete({ where: { id } });
}
