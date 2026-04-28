import { MobileOtp, MobileOtpIntent } from '@prisma/client';
import { prisma } from '../../../database';

export interface CreateMobileOtpData {
    mobileNumber: string;
    tokenHash: string;
    intent: MobileOtpIntent;
    userId: number | null;
    expiresAt: Date;
}

async function create(data: CreateMobileOtpData): Promise<MobileOtp> {
    return prisma.mobileOtp.create({
        data: {
            mobileNumber: data.mobileNumber,
            tokenHash: data.tokenHash,
            intent: data.intent,
            userId: data.userId,
            expiresAt: data.expiresAt,
        },
    });
}

async function findById(id: string): Promise<MobileOtp | null> {
    return prisma.mobileOtp.findUnique({ where: { id } });
}

// Used for the 60-second resend cooldown.
async function findMostRecentByMobile(
    mobileNumber: string,
): Promise<MobileOtp | null> {
    return prisma.mobileOtp.findFirst({
        where: { mobileNumber },
        orderBy: { createdAt: 'desc' },
    });
}

// Used for the 5-per-hour rate limit. Counts every send including revoked
// (revocation happens on success, but the request still counted toward the
// limit). Phase 16.8 will swap for centralized middleware.
async function countByMobileSince(
    mobileNumber: string,
    since: Date,
): Promise<number> {
    return prisma.mobileOtp.count({
        where: {
            mobileNumber,
            createdAt: { gte: since },
        },
    });
}

async function incrementAttempt(id: string): Promise<MobileOtp> {
    return prisma.mobileOtp.update({
        where: { id },
        data: { attemptCount: { increment: 1 } },
    });
}

async function revoke(id: string): Promise<void> {
    await prisma.mobileOtp.update({
        where: { id },
        data: { revoked: true },
    });
}

export default {
    create,
    findById,
    findMostRecentByMobile,
    countByMobileSince,
    incrementAttempt,
    revoke,
};
