import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../database';
import { BadRequestError, NotFoundError } from '../../../core/api-error';
import logger from '../../../core/logger';
import { processAvatar } from '../../../infrastructure/images/avatar-processor';
import s3Gateway from '../../../infrastructure/storage/s3.gateway';
import { UserDto } from '../dto/user.dto';
import { serializeUserById } from '../serializers/user.serializer';
import { SetCallNameInput, UpdateMeInput } from '../schemas/users.schema';

const MIN_AGE_YEARS = 13;

// Reject DOBs that imply age < 13 (BACKEND_API.md §5.2 USER_UNDER_AGE).
// Anchor on UTC midnight so the boundary doesn't drift with server tz.
function parseDateOfBirth(raw: string): Date {
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestError('dateOfBirth is not a valid date');
    }
    const now = new Date();
    const minBirth = new Date(
        Date.UTC(
            now.getUTCFullYear() - MIN_AGE_YEARS,
            now.getUTCMonth(),
            now.getUTCDate(),
        ),
    );
    if (parsed > minBirth) {
        throw new BadRequestError(
            `User must be at least ${MIN_AGE_YEARS} years old`,
        );
    }
    return parsed;
}

export async function updateMe(
    userId: number,
    input: UpdateMeInput,
): Promise<UserDto> {
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.callName !== undefined) data.callName = input.callName;
    if (input.country !== undefined) data.country = input.country;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.locale !== undefined) data.locale = input.locale;
    if (input.dateOfBirth !== undefined) {
        data.dateOfBirth = parseDateOfBirth(input.dateOfBirth);
    }
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.preferredVoice !== undefined) {
        data.preferredVoice = input.preferredVoice;
    }
    if (input.pushNotificationsEnabled !== undefined) {
        data.pushNotificationsEnabled = input.pushNotificationsEnabled;
    }
    if (input.emailNotificationsEnabled !== undefined) {
        data.emailNotificationsEnabled = input.emailNotificationsEnabled;
    }
    if (input.onboardingCompleted !== undefined) {
        data.onboardingCompleted = input.onboardingCompleted;
    }

    await prisma.user.update({
        where: { id: userId },
        data,
    });

    const dto = await serializeUserById(userId);
    if (!dto) {
        // Update succeeded but reload didn't find the user — only happens if a
        // concurrent erase-all ran in between. Treat as not-found.
        throw new NotFoundError('User not found');
    }
    return dto;
}

// Onboarding-only setter — same effect as PATCH { callName, onboardingCompleted: true }
// but exists as its own endpoint so the mobile onboarding flow has a clear hit
// and analytics can attribute "completed onboarding" cleanly.
export async function setCallName(
    userId: number,
    input: SetCallNameInput,
): Promise<UserDto> {
    await prisma.user.update({
        where: { id: userId },
        data: {
            callName: input.callName,
            onboardingCompleted: true,
        },
    });

    const dto = await serializeUserById(userId);
    if (!dto) {
        throw new NotFoundError('User not found');
    }
    return dto;
}

export interface UploadAvatarResult {
    avatar: string;
    avatarThumb: string;
    user: UserDto;
}

// Resize the upload to 256×256 + 64×64 thumbnail (WebP), upload both to S3,
// update User.avatarUrl, and return both URLs + the freshly serialized user.
export async function uploadAvatar(
    userId: number,
    file: Express.Multer.File,
): Promise<UploadAvatarResult> {
    const { full, thumb, contentType } = await processAvatar(file.buffer);

    // Random suffix prevents browser/CDN caching the previous avatar at the
    // same URL after a re-upload, and avoids collisions if cleanup races.
    const slug = crypto.randomBytes(8).toString('hex');
    const fullKey = `avatars/${userId}/${slug}.webp`;
    const thumbKey = `avatars/${userId}/${slug}_thumb.webp`;

    const [avatarUrl, avatarThumbUrl] = await Promise.all([
        s3Gateway.putObject({
            key: fullKey,
            body: full,
            contentType,
        }),
        s3Gateway.putObject({
            key: thumbKey,
            body: thumb,
            contentType,
        }),
    ]);

    const previous = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
    });

    await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
    });

    // Best-effort cleanup of the previous full + thumb objects. Done after the
    // DB update so a delete failure can't orphan the new avatar.
    if (previous?.avatarUrl) {
        const previousThumb = previous.avatarUrl.replace(
            /\.webp$/,
            '_thumb.webp',
        );
        await Promise.all([
            s3Gateway.deleteByUrl(previous.avatarUrl),
            s3Gateway.deleteByUrl(previousThumb),
        ]).catch((error) =>
            logger.warn('Avatar cleanup partial failure', { userId, error }),
        );
    }

    const dto = await serializeUserById(userId);
    if (!dto) throw new NotFoundError('User not found');

    return { avatar: avatarUrl, avatarThumb: avatarThumbUrl, user: dto };
}

// Clear the user's avatar pointer. The S3 objects are intentionally retained
// (BACKEND_API.md §5.6) — a 30-day lifecycle rule sweeps them so accidental
// deletes can be audited / recovered in the meantime.
export async function deleteAvatar(userId: number): Promise<UserDto> {
    await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: null },
    });

    const dto = await serializeUserById(userId);
    if (!dto) throw new NotFoundError('User not found');
    return dto;
}

export default {
    updateMe,
    setCallName,
    uploadAvatar,
    deleteAvatar,
};
