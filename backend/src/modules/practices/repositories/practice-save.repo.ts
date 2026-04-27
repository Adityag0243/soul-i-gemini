import { prisma } from '../../../database';

export async function save(userId: number, practiceId: string) {
    return prisma.userPracticeSave.upsert({
        where: { userId_practiceId: { userId, practiceId } },
        create: { userId, practiceId },
        update: {},
    });
}

export async function remove(userId: number, practiceId: string) {
    return prisma.userPracticeSave.deleteMany({
        where: { userId, practiceId },
    });
}

export async function findAllByUser(userId: number) {
    return prisma.userPracticeSave.findMany({
        where: { userId },
        include: {
            practice: {
                include: {
                    energyNode: { select: { id: true, slug: true, title: true } },
                },
            },
        },
        orderBy: { savedAt: 'desc' },
    });
}
