import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { BadRequestError } from '../core/api-error';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

// Memory storage: avatars are small and we re-encode immediately, so writing
// to disk first would just be a wasted hop.
const avatarMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!AVATAR_ALLOWED_MIME.has(file.mimetype)) {
            cb(
                new BadRequestError(
                    'Avatar must be image/jpeg, image/png, or image/webp',
                ),
            );
            return;
        }
        cb(null, true);
    },
}).single('file');

// Wrap so multer's own errors (file size, unexpected field) come through as
// 400 BadRequestError instead of leaking generic 500s.
export function avatarUpload(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    avatarMulter(req, res, (err: unknown) => {
        if (!err) return next();
        if (err instanceof BadRequestError) return next(err);
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return next(
                    new BadRequestError('Avatar file exceeds 5 MB limit'),
                );
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return next(
                    new BadRequestError(
                        'Unexpected file field; use field name "file"',
                    ),
                );
            }
            return next(new BadRequestError(err.message));
        }
        return next(err);
    });
}
