import { BadRequestError, NotFoundError } from '../../../core/api-error';
import * as repo from '../repositories/referral.repo';

export async function getMyReferral(userId: number) {
    const code = await repo.getOrCreateCode(userId);
    const [sharedCount, convertedCount] = await Promise.all([
        repo.countShared(userId),
        repo.countConverted(userId),
    ]);

    return {
        code,
        sharedCount,
        convertedCount,
        rewardsEarned: convertedCount,
    };
}

export async function applyReferral(code: string, referredUserId: number) {
    const referral = await repo.findByCode(code);
    if (!referral) throw new NotFoundError('Referral code not found');
    if (referral.referredUserId !== null) throw new BadRequestError('Referral code already used');
    if (referral.referrerUserId === referredUserId) throw new BadRequestError('Cannot use your own referral code');

    const alreadyUsed = await repo.hasUsedReferral(referredUserId);
    if (alreadyUsed) throw new BadRequestError('You have already used a referral code');

    await repo.applyReferral(code, referredUserId);
    return { applied: true };
}

export async function getLeaderboard(limit: number = 10) {
    return repo.getLeaderboard(limit);
}
