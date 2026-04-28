import { prisma } from '../../../database';

export async function findAll() {
    return prisma.energyNode.findMany({
        where: { isActive: true },
        orderBy: { title: 'asc' },
    });
}

export async function findById(id: string) {
    return prisma.energyNode.findUnique({
        where: { id },
        include: { practices: { where: { isActive: true }, orderBy: { title: 'asc' } } },
    });
}
