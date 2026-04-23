import { PracticeMediaType, PracticeStatus, Prisma } from '@prisma/client';
import { prisma } from '../../../../database';

export const practiceRepo = {
    create(data: Prisma.PracticeTaskCreateInput) {
        return prisma.practiceTask.create({ data });
    },

    findById(id: string) {
        return prisma.practiceTask.findUnique({ where: { id } });
    },

    listActive() {
        return prisma.practiceTask.findMany({
            where: {
                status: PracticeStatus.ACTIVE,
                isActive: true,
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        });
    },

    countSummary() {
        return prisma.$transaction([
            prisma.practiceTask.count({
                where: {
                    status: PracticeStatus.ACTIVE,
                    isActive: true,
                },
            }),
            prisma.practiceTask.count({
                where: {
                    status: PracticeStatus.ACTIVE,
                    isActive: true,
                    mediaType: PracticeMediaType.AUDIO,
                },
            }),
            prisma.practiceTask.count({
                where: {
                    status: PracticeStatus.ACTIVE,
                    isActive: true,
                    mediaType: PracticeMediaType.VIDEO,
                },
            }),
        ]);
    },

    updateSoftDelete(id: string) {
        return prisma.practiceTask.update({
            where: { id },
            data: {
                status: PracticeStatus.ARCHIVED,
                isActive: false,
                suggestToAi: false,
                deletedAt: new Date(),
            },
        });
    },
};

export default practiceRepo;
