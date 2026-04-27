import crypto from 'crypto';
import path from 'path';
import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { PracticeMediaType, PracticeStatus } from '@prisma/client';
import xlsx from 'xlsx';
import { configS3 } from '../../../../config';
import {
    AuthFailureError,
    BadRequestError,
    NotFoundError,
} from '../../../../core/api-error';
import logger from '../../../../core/logger';
import { AuthUser } from '../../../../types/user';
import practiceRepo from '../repositories/practice.repo';
import {
    BulkPracticeImportResultDto,
    PracticeListResponseDto,
    PracticeSummaryDto,
    PracticeTaskDto,
} from '../dto/content-management.dto';
import {
    BulkPracticeSheetRowInput,
    CreatePracticeInput,
} from '../schemas/content-management.schema';

type UploadedFileLike = Express.Multer.File;

const s3Client = new S3Client({
    region: configS3.awsRegion,
    credentials: {
        accessKeyId: configS3.awsAccessKeyId,
        secretAccessKey: configS3.awsSecretAccessKey,
    },
});

function ensureAdminUser(user: AuthUser): void {
    const isAdmin = user.roles.some((role) => role.code === 'ADMIN');
    if (!isAdmin) {
        throw new AuthFailureError('Admin access required');
    }
}

function normalizeTags(tags: unknown): string[] {
    return parseTagsFromValue(tags);
}

function parseDurationMinutes(rawValue: unknown): number {
    if (
        typeof rawValue === 'number' &&
        Number.isInteger(rawValue) &&
        rawValue > 0
    ) {
        return rawValue;
    }

    if (typeof rawValue === 'string') {
        const match = rawValue.match(/(\d+)/);
        if (match) {
            const value = Number.parseInt(match[1], 10);
            if (Number.isInteger(value) && value > 0) {
                return value;
            }
        }
    }

    throw new BadRequestError(
        'Duration must contain a positive number of minutes',
    );
}

function parseTagsFromValue(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .flatMap((entry) => String(entry).split(','))
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    if (typeof value === 'string') {
        return value
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
    }

    return [];
}

function parseMediaType(value: unknown): PracticeMediaType {
    const normalizedValue = String(value ?? '')
        .trim()
        .toUpperCase();
    if (normalizedValue === PracticeMediaType.AUDIO) {
        return PracticeMediaType.AUDIO;
    }

    if (normalizedValue === PracticeMediaType.VIDEO) {
        return PracticeMediaType.VIDEO;
    }

    throw new BadRequestError('Media type must be AUDIO or VIDEO');
}

function formatDurationLabel(durationMinutes: number): string {
    return `${durationMinutes} min`;
}

function buildMediaKey(file: UploadedFileLike): string {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `practice-media/${crypto.randomUUID()}-${safeName}`;
}

async function uploadFileToS3(file: UploadedFileLike): Promise<{
    key: string;
    url: string;
}> {
    if (!configS3.bucketName) {
        throw new BadRequestError('AWS_S3_BUCKET is required for uploads');
    }

    const key = buildMediaKey(file);
    await s3Client.send(
        new PutObjectCommand({
            Bucket: configS3.bucketName,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
        }),
    );

    return {
        key,
        url: `s3://${configS3.bucketName}/${key}`,
    };
}

async function deleteFileFromS3(key: string | null | undefined): Promise<void> {
    if (!key || !configS3.bucketName) {
        return;
    }

    await s3Client.send(
        new DeleteObjectCommand({
            Bucket: configS3.bucketName,
            Key: key,
        }),
    );
}

function toPracticeTaskDto(practice: {
    id: string;
    title: string;
    description: string;
    durationMinutes: number;
    practiceType: string;
    mediaType: PracticeMediaType;
    mediaUrl: string | null;
    mediaKey: string | null;
    mediaBucket: string | null;
    mediaOriginalName: string | null;
    mediaMimeType: string | null;
    mediaSizeBytes: number | null;
    tags: string[];
    status: PracticeStatus;
    isActive: boolean;
    suggestToAi: boolean;
    sourceSheetName: string | null;
    createdByAdminId: number | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}): PracticeTaskDto {
    return {
        ...practice,
        durationLabel: formatDurationLabel(practice.durationMinutes),
    };
}

async function getSummary(): Promise<PracticeSummaryDto> {
    const [totalPractices, audioContent, videoContent] =
        await practiceRepo.countSummary();

    return {
        totalPractices,
        audioContent,
        videoContent,
    };
}

async function createPractice(
    adminUser: AuthUser,
    input: CreatePracticeInput,
    mediaFile?: UploadedFileLike,
): Promise<PracticeTaskDto> {
    ensureAdminUser(adminUser);

    const parsedDuration = parseDurationMinutes(input.duration);
    const tags = normalizeTags(input.tags);

    let mediaUploadResult: { key: string; url: string } | null = null;
    if (mediaFile) {
        mediaUploadResult = await uploadFileToS3(mediaFile);
    }

    try {
        const created = await practiceRepo.create({
            title: input.title.trim(),
            description: input.description.trim(),
            durationMinutes: parsedDuration,
            practiceType: input.practiceType.trim(),
            mediaType: input.mediaType,
            mediaUrl: mediaUploadResult?.url ?? null,
            mediaKey: mediaUploadResult?.key ?? null,
            mediaBucket: mediaUploadResult ? configS3.bucketName : null,
            mediaOriginalName: mediaFile?.originalname ?? null,
            mediaMimeType: mediaFile?.mimetype ?? null,
            mediaSizeBytes: mediaFile?.size ?? null,
            tags,
            status: PracticeStatus.ACTIVE,
            isActive: true,
            suggestToAi: true,
            createdByAdminId: adminUser.id,
        });

        logger.info('Practice created', {
            practiceId: created.id,
            adminId: adminUser.id,
        });
        return toPracticeTaskDto(created);
    } catch (error) {
        if (mediaUploadResult?.key) {
            await deleteFileFromS3(mediaUploadResult.key);
        }
        throw error;
    }
}

async function parseSheetRows(
    file: UploadedFileLike,
): Promise<BulkPracticeSheetRowInput[]> {
    const extension = path.extname(file.originalname).toLowerCase();
    const workbook =
        extension === '.csv'
            ? xlsx.read(file.buffer.toString('utf8'), { type: 'string' })
            : xlsx.read(file.buffer, { type: 'buffer' });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        throw new BadRequestError('Bulk upload sheet is empty');
    }

    const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[firstSheetName],
        {
            defval: '',
            raw: false,
        },
    );

    if (rows.length === 0) {
        throw new BadRequestError(
            'Bulk upload sheet does not contain any rows',
        );
    }

    return rows.map((row, index) => {
        const title = String(
            row['Practice Title'] ?? row.title ?? row['title'] ?? '',
        ).trim();
        const description = String(
            row.Description ?? row.description ?? '',
        ).trim();
        const duration = parseDurationMinutes(
            row.Duration ?? row.duration ?? row['Duration (min)'] ?? '',
        );
        const practiceType = String(
            row['Practice Type'] ??
                row.practiceType ??
                row['practice type'] ??
                '',
        ).trim();
        const mediaType = parseMediaType(
            row['Media Type'] ?? row.mediaType ?? row['media type'] ?? '',
        );
        const tags = parseTagsFromValue(row.Tags ?? row.tags);
        const mediaUrlValue = String(
            row.mediaUrl ?? row['Media URL'] ?? '',
        ).trim();

        if (!title || !description || !practiceType) {
            throw new BadRequestError(
                `Row ${index + 2} is missing one or more required columns`,
            );
        }

        return {
            title,
            description,
            duration,
            practiceType,
            mediaType,
            tags,
            mediaUrl: mediaUrlValue || null,
        };
    });
}

async function bulkUploadPractices(
    adminUser: AuthUser,
    sheetFile: UploadedFileLike,
): Promise<BulkPracticeImportResultDto> {
    ensureAdminUser(adminUser);

    const rows = await parseSheetRows(sheetFile);
    const createdPractices = await Promise.all(
        rows.map((row) =>
            practiceRepo.create({
                title: row.title,
                description: row.description,
                durationMinutes: row.duration,
                practiceType: row.practiceType,
                mediaType: row.mediaType,
                mediaUrl: row.mediaUrl,
                mediaKey: null,
                mediaBucket: null,
                mediaOriginalName: sheetFile.originalname,
                mediaMimeType: sheetFile.mimetype,
                mediaSizeBytes: sheetFile.size,
                tags: row.tags,
                status: PracticeStatus.ACTIVE,
                isActive: true,
                suggestToAi: true,
                sourceSheetName: sheetFile.originalname,
                createdByAdminId: adminUser.id,
            }),
        ),
    );

    const summary = await getSummary();

    logger.info('Bulk practice upload completed', {
        adminId: adminUser.id,
        createdCount: createdPractices.length,
    });

    return {
        summary,
        createdCount: createdPractices.length,
        practices: createdPractices.map(toPracticeTaskDto),
    };
}

async function listPractices(
    adminUser: AuthUser,
): Promise<PracticeListResponseDto> {
    ensureAdminUser(adminUser);

    const [practices, summary] = await Promise.all([
        practiceRepo.listActive(),
        getSummary(),
    ]);

    return {
        summary,
        practices: practices.map(toPracticeTaskDto),
    };
}

async function deletePractice(
    adminUser: AuthUser,
    practiceId: string,
): Promise<PracticeTaskDto> {
    ensureAdminUser(adminUser);

    const existingPractice = await practiceRepo.findById(practiceId);
    if (!existingPractice) {
        throw new NotFoundError('Practice not found');
    }

    const deletedPractice = await practiceRepo.updateSoftDelete(practiceId);

    if (deletedPractice.mediaKey) {
        await deleteFileFromS3(deletedPractice.mediaKey);
    }

    logger.info('Practice deleted', {
        practiceId,
        adminId: adminUser.id,
    });

    return toPracticeTaskDto(deletedPractice);
}

export default {
    createPractice,
    bulkUploadPractices,
    listPractices,
    deletePractice,
};
