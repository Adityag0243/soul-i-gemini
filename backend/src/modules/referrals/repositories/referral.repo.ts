import { prisma } from '../../../database';
import crypto from 'node:crypto';

function generateCode(): string {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

export async function findByUser(userId: number) {
    return prisma.referral.findMany({
        where: { referrerUserId: userId },
        orderBy: { createdAt: 'desc' },
    });
}

export async function findByCode(code: string) {
    return prisma.referral.findUnique({ where: { code } });
}

export async function getOrCreateCode(userId: number): Promise<string> {
    const existing = await prisma.referral.findFirst({
        where: { referrerUserId: userId, referredUserId: null },
        select: { code: true },
    });
    if (existing) return existing.code;

    let code = generateCode();
    let attempts = 0;
    while (attempts < 5) {
        const conflict = await prisma.referral.findUnique({ where: { code } });
        if (!conflict) break;
        code = generateCode();
        attempts++;
    }

    const row = await prisma.referral.create({
        data: { referrerUserId: userId, code },
    });
    return row.code;
}

export async function applyReferral(code: string, referredUserId: number) {
    return prisma.referral.update({
        where: { code },
        data: { referredUserId },
    });
}

export async function countShared(userId: number): Promise<number> {
    return prisma.referral.count({
        where: { referrerUserId: userId },
    });
}

export async function countConverted(userId: number): Promise<number> {
    return prisma.referral.count({
        where: { referrerUserId: userId, referredUserId: { not: null } },
    });
}

export async function hasUsedReferral(userId: number): Promise<boolean> {
    const row = await prisma.referral.findFirst({
        where: { referredUserId: userId },
        select: { id: true },
    });
    return !!row;
}

export async function getLeaderboard(limit: number = 10) {
    const rows = await prisma.$queryRaw<
        { referrer_user_id: number; converted: bigint }[]
    >`
        SELECT referrer_user_id, COUNT(*) FILTER (WHERE referred_user_id IS NOT NULL) AS converted
        FROM referrals
        GROUP BY referrer_user_id
        HAVING COUNT(*) FILTER (WHERE referred_user_id IS NOT NULL) > 0
        ORDER BY converted DESC
        LIMIT ${limit}
    `;
    return rows.map((r) => ({
        userId: r.referrer_user_id,
        converted: Number(r.converted),
    }));
}
