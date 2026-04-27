import { Response } from 'express';
import { ProtectedRequest } from '../../../types/app-requests';
import { SuccessResponse } from '../../../core/api-response';
import { FeedbackType } from '@prisma/client';
import { ListPracticesInput, PracticeFeedbackInput } from '../schemas/practice.schema';
import * as practiceService from '../services/practice.service';

export async function listPractices(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const query = req.query as unknown as ListPracticesInput;
    const result = await practiceService.listPractices({
        energyNodeId: query.energyNodeId,
        type: query.type,
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 20,
    });
    new SuccessResponse('Practices retrieved', result).send(res);
}

export async function getRecommended(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const result = await practiceService.getRecommended(req.user!.id, limit);
    new SuccessResponse('Recommended practices retrieved', result).send(res);
}

export async function getPracticeById(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const practice = await practiceService.getPracticeById(req.params.id);
    new SuccessResponse('Practice retrieved', { practice }).send(res);
}

export async function submitFeedback(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as PracticeFeedbackInput;
    const result = await practiceService.submitFeedback(
        req.user!.id,
        req.params.id,
        body.feedback as FeedbackType,
        body.reflection,
    );
    new SuccessResponse('Feedback submitted', { feedback: result }).send(res);
}

export async function getMyFeedback(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const feedbacks = await practiceService.getMyFeedback(
        req.user!.id,
        req.params.id,
    );
    new SuccessResponse('Feedback retrieved', { feedbacks, count: feedbacks.length }).send(res);
}

export async function getSavedPractices(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const practices = await practiceService.getSavedPractices(req.user!.id);
    new SuccessResponse('Saved practices retrieved', { practices, count: practices.length }).send(res);
}

export async function savePractice(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    await practiceService.savePractice(req.user!.id, req.params.id);
    new SuccessResponse('Practice saved', {}).send(res);
}

export async function unsavePractice(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    await practiceService.unsavePractice(req.user!.id, req.params.id);
    new SuccessResponse('Practice unsaved', {}).send(res);
}
