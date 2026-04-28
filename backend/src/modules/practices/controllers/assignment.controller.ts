import { Response } from 'express';
import { ProtectedRequest } from '../../../types/app-requests';
import { SuccessResponse } from '../../../core/api-response';
import * as assignmentService from '../services/assignment.service';

export async function getActive(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const assignments = await assignmentService.getActive(req.user!.id);
    new SuccessResponse('Active assignments retrieved', { assignments, count: assignments.length }).send(res);
}

export async function listAssignments(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const range = (req.query.range as string) || '30d';
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
    const result = await assignmentService.listInRange(req.user!.id, range, page, pageSize);
    new SuccessResponse('Assignments retrieved', result).send(res);
}

export async function getById(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const assignment = await assignmentService.getById(req.user!.id, req.params.id);
    new SuccessResponse('Assignment retrieved', { assignment }).send(res);
}

export async function complete(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const assignment = await assignmentService.complete(req.user!.id, req.params.id);
    new SuccessResponse('Assignment completed', { assignment }).send(res);
}

export async function remove(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    await assignmentService.remove(req.user!.id, req.params.id);
    new SuccessResponse('Assignment deleted', {}).send(res);
}
