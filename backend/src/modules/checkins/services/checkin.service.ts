import { DailyCheckin } from '@prisma/client';
import { NotFoundError, BadRequestError } from '../../../core/api-error';
import { CreateCheckinInput, UpdateCheckinInput } from '../schemas/checkin.schema';
import * as checkinRepo from '../repositories/checkin.repo';

export async function createOrUpdateCheckin(
    userId: number,
    input: CreateCheckinInput,
) {
    const date = new Date(input.date + 'T00:00:00.000Z');

    const checkin = await checkinRepo.upsertCheckin(userId, date, {
        moodScore: input.moodScore,
        energyWord: input.energyWord,
        reflection: input.reflection,
        voiceReflection: input.voiceReflection,
        audioUrl: input.audioUrl,
    });

    return formatCheckin(checkin);
}

export async function getTodayCheckin(userId: number) {
    const today = new Date();
    const dateOnly = new Date(
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    );
    const checkin = await checkinRepo.findByUserAndDate(userId, dateOnly);
    return checkin ? formatCheckin(checkin) : null;
}

export async function listCheckins(
    userId: number,
    range: string,
    page: number,
    pageSize: number,
) {
    const days = parseInt(range, 10);
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);
    from.setUTCHours(0, 0, 0, 0);

    const offset = (page - 1) * pageSize;
    const { items, total } = await checkinRepo.listByUserInRange(
        userId,
        from,
        pageSize,
        offset,
    );

    return {
        checkins: items.map(formatCheckin),
        total,
        page,
        pageSize,
    };
}

export async function getStreak(userId: number) {
    const dates = await checkinRepo.getRecentDates(userId, 365);
    if (dates.length === 0) {
        return { currentStreak: 0, longestStreak: 0 };
    }

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const dateStrs = dates.map(
        (d) => d.toISOString().slice(0, 10),
    );
    const dateSet = new Set(dateStrs);

    let currentStreak = 0;
    const cursor = new Date(todayStr + 'T00:00:00.000Z');
    if (!dateSet.has(todayStr)) {
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    while (dateSet.has(cursor.toISOString().slice(0, 10))) {
        currentStreak++;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    let longestStreak = 0;
    let streak = 1;
    const sorted = [...dateStrs].sort();
    for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1] + 'T00:00:00.000Z');
        const curr = new Date(sorted[i] + 'T00:00:00.000Z');
        const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays === 1) {
            streak++;
        } else {
            longestStreak = Math.max(longestStreak, streak);
            streak = 1;
        }
    }
    longestStreak = Math.max(longestStreak, streak);

    return { currentStreak, longestStreak };
}

export async function getCheckinById(userId: number, id: string) {
    const checkin = await checkinRepo.findById(id);
    if (!checkin || checkin.userId !== userId) {
        throw new NotFoundError('Check-in not found');
    }
    return formatCheckin(checkin);
}

export async function updateCheckin(
    userId: number,
    id: string,
    input: UpdateCheckinInput,
) {
    const existing = await checkinRepo.findById(id);
    if (!existing || existing.userId !== userId) {
        throw new NotFoundError('Check-in not found');
    }
    const updated = await checkinRepo.updateById(id, input);
    return formatCheckin(updated);
}

export async function deleteCheckin(userId: number, id: string) {
    const existing = await checkinRepo.findById(id);
    if (!existing || existing.userId !== userId) {
        throw new NotFoundError('Check-in not found');
    }
    await checkinRepo.deleteById(id);
}

function formatCheckin(c: DailyCheckin) {
    return {
        id: c.id,
        date: c.date.toISOString().slice(0, 10),
        moodScore: c.moodScore,
        energyWord: c.energyWord,
        reflection: c.reflection,
        voiceReflection: c.voiceReflection,
        audioUrl: c.audioUrl,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
    };
}
