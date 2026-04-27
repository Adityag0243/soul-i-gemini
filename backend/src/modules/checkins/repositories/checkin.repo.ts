import { prisma } from '../../../database';

export async function findById(id: string) {
    return prisma.dailyCheckin.findUnique({ where: { id } });
}

export async function updateById(
    id: string,
    data: {
        moodScore?: number;
        energyWord?: string;
        reflection?: string;
        voiceReflection?: string;
        audioUrl?: string;
    },
) {
    return prisma.dailyCheckin.update({ where: { id }, data });
}

export async function deleteById(id: string) {
    return prisma.dailyCheckin.delete({ where: { id } });
}

export async function findByUserAndDate(userId: number, date: Date) {
    return prisma.dailyCheckin.findUnique({
        where: { userId_date: { userId, date } },
    });
}

export async function getRecentDates(userId: number, limit: number) {
    const rows = await prisma.dailyCheckin.findMany({
        where: { userId },
        select: { date: true },
        orderBy: { date: 'desc' },
        take: limit,
    });
    return rows.map((r) => r.date);
}

export async function listByUserInRange(
    userId: number,
    from: Date,
    limit: number,
    offset: number,
) {
    const [items, total] = await Promise.all([
        prisma.dailyCheckin.findMany({
            where: { userId, date: { gte: from } },
            orderBy: { date: 'desc' },
            take: limit,
            skip: offset,
        }),
        prisma.dailyCheckin.count({
            where: { userId, date: { gte: from } },
        }),
    ]);
    return { items, total };
}

export async function upsertCheckin(
    userId: number,
    date: Date,
    data: {
        moodScore: number;
        energyWord?: string;
        reflection?: string;
        voiceReflection?: string;
        audioUrl?: string;
    },
) {
    return prisma.dailyCheckin.upsert({
        where: {
            userId_date: { userId, date },
        },
        create: {
            userId,
            date,
            moodScore: data.moodScore,
            energyWord: data.energyWord,
            reflection: data.reflection,
            voiceReflection: data.voiceReflection,
            audioUrl: data.audioUrl,
        },
        update: {
            moodScore: data.moodScore,
            energyWord: data.energyWord,
            reflection: data.reflection,
            voiceReflection: data.voiceReflection,
            audioUrl: data.audioUrl,
        },
    });
}
