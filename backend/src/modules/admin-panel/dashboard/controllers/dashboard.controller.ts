import { Response } from 'express';
import { SuccessResponse } from '../../../../core/api-response';
import { ProtectedRequest } from '../../../../types/app-requests';
import DashboardService from '../services/dashboard.service';

export async function getOverview(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await DashboardService.getDashboardOverview(req.user);

    new SuccessResponse(
        'Dashboard overview retrieved successfully',
        result,
    ).send(res);
}

export default {
    getOverview,
};
