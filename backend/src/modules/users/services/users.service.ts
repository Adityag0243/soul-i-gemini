import { Prisma } from '@prisma/client';
import { prisma } from '../../../database';
import { BadRequestError, NotFoundError } from '../../../core/api-error';
import { UserDto } from '../dto/user.dto';
import { serializeUserById } from '../serializers/user.serializer';
import { UpdateMeInput } from '../schemas/users.schema';

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

export default {
    updateMe,
};
