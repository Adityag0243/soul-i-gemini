import { Response } from 'express';
import { FeatureKey } from '@prisma/client';
import { SuccessResponse } from '../../../../core/api-response';
import { ProtectedRequest } from '../../../../types/app-requests';
import FeatureControlService from '../services/feature-control.service';
import {
    FeatureKeyParam,
    FeatureToggleInput,
} from '../schemas/feature-control.schema';

export async function getFeatureControls(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await FeatureControlService.getFeatureControls(req.user);

    new SuccessResponse('Feature controls retrieved', result).send(res);
}

export async function updateFeatureControl(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const params = req.params as unknown as FeatureKeyParam;
    const input = req.body as FeatureToggleInput;

    const result = await FeatureControlService.updateFeatureControl(
        req.user,
        params.featureKey as FeatureKey,
        input,
    );

    new SuccessResponse('Feature control updated', result).send(res);
}

export default {
    getFeatureControls,
    updateFeatureControl,
};
