import { Response } from 'express';
import { ProtectedRequest } from '../../../types/app-requests';
import {
    SuccessResponse,
    SuccessCreatedResponse,
} from '../../../core/api-response';
import { CreateCheckinInput, ListCheckinsInput, UpdateCheckinInput } from '../schemas/checkin.schema';
import * as checkinService from '../services/checkin.service';

export async function createCheckin(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as CreateCheckinInput;
    const checkin = await checkinService.createOrUpdateCheckin(
        req.user!.id,
        body,
    );
    new SuccessCreatedResponse('Check-in saved', { checkin }).send(res);
}

export async function getTodayCheckin(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const checkin = await checkinService.getTodayCheckin(req.user!.id);
    new SuccessResponse('Today check-in retrieved', { checkin }).send(res);
}

export async function listCheckins(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const query = req.query as unknown as ListCheckinsInput;
    const range = query.range || '30d';
    const page = query.page ? Number(query.page) : 1;
    const pageSize = query.pageSize ? Number(query.pageSize) : 20;
    const result = await checkinService.listCheckins(
        req.user!.id,
        range,
        page,
        pageSize,
    );
    new SuccessResponse('Check-ins retrieved', result).send(res);
}

export async function getStreak(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await checkinService.getStreak(req.user!.id);
    new SuccessResponse('Streak retrieved', result).send(res);
}

export async function getCheckinById(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const checkin = await checkinService.getCheckinById(
        req.user!.id,
        req.params.id,
    );
    new SuccessResponse('Check-in retrieved', { checkin }).send(res);
}

export async function updateCheckin(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as UpdateCheckinInput;
    const checkin = await checkinService.updateCheckin(
        req.user!.id,
        req.params.id,
        body,
    );
    new SuccessResponse('Check-in updated', { checkin }).send(res);
}

export async function deleteCheckin(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    await checkinService.deleteCheckin(req.user!.id, req.params.id);
    new SuccessResponse('Check-in deleted', {}).send(res);
}
