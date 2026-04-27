import { Router } from 'express';
import multer from 'multer';
import authMiddleware from '../../../../middlewares/auth.middleware';
import { asyncHandler } from '../../../../core/async-handler';
import { validator } from '../../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../../helpers/validator';
import ContentManagementController from '../controllers/content-management.controller';
import { createPracticeSchema } from '../schemas/content-management.schema';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024,
    },
});

router.use(authMiddleware);

router.get('/', asyncHandler(ContentManagementController.listPractices));

router.post(
    '/practices',
    upload.single('media'),
    validator(createPracticeSchema, ValidationSource.BODY),
    asyncHandler(ContentManagementController.createPractice),
);

router.post(
    '/practices/bulk-upload',
    upload.single('sheet'),
    asyncHandler(ContentManagementController.bulkUploadPractices),
);

router.delete(
    '/practices/:practiceId',
    asyncHandler(ContentManagementController.deletePractice),
);

export default router;
