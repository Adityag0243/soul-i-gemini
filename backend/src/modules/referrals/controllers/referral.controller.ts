import { Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { ProtectedRequest } from '../../../types/app-requests';
import * as referralService from '../services/referral.service';
import { ApplyReferralInput } from '../schemas/referral.schema';

export async function getMyReferral(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await referralService.getMyReferral(req.user.id);
    new SuccessResponse('Referral info retrieved', result).send(res);
}

export async function applyReferral(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { code } = req.body as ApplyReferralInput;
    const result = await referralService.applyReferral(code, req.user.id);
    new SuccessResponse('Referral applied', result).send(res);
}

export async function getLeaderboard(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const result = await referralService.getLeaderboard(limit);
    new SuccessResponse('Leaderboard retrieved', result).send(res);
}
