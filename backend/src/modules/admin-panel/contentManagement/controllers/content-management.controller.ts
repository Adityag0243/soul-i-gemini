import { Request, Response } from 'express';
import {
    SuccessCreatedResponse,
    SuccessResponse,
} from '../../../../core/api-response';
import { BadRequestError } from '../../../../core/api-error';
import { ProtectedRequest } from '../../../../types/app-requests';
import ContentManagementService from '../services/content-management.service';
import { CreatePracticeInput } from '../schemas/content-management.schema';

type RequestWithFile = ProtectedRequest & { file?: Express.Multer.File };

export async function createPractice(
    req: Request,
    res: Response,
): Promise<void> {
    const request = req as RequestWithFile;
    const result = await ContentManagementService.createPractice(
        request.user,
        req.body as CreatePracticeInput,
        request.file,
    );

    new SuccessCreatedResponse('Practice created successfully', result).send(
        res,
    );
}

export async function bulkUploadPractices(
    req: Request,
    res: Response,
): Promise<void> {
    const request = req as RequestWithFile;
    if (!request.file) {
        throw new BadRequestError('Bulk upload file is required');
    }

    const result = await ContentManagementService.bulkUploadPractices(
        request.user,
        request.file,
    );

    new SuccessCreatedResponse(
        'Bulk practices uploaded successfully',
        result,
    ).send(res);
}

export async function listPractices(
    req: Request,
    res: Response,
): Promise<void> {
    const request = req as ProtectedRequest;
    const result = await ContentManagementService.listPractices(request.user);

    new SuccessResponse('Practices retrieved successfully', result).send(res);
}

export async function deletePractice(
    req: Request,
    res: Response,
): Promise<void> {
    const request = req as ProtectedRequest;
    const { practiceId } = req.params;
    const result = await ContentManagementService.deletePractice(
        request.user,
        practiceId,
    );

    new SuccessResponse('Practice deleted successfully', result).send(res);
}

export default {
    createPractice,
    bulkUploadPractices,
    listPractices,
    deletePractice,
};
