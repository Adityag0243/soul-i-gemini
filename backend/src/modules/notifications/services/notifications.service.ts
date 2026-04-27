import {
    DevicePlatform,
    UserDeviceToken,
} from '@prisma/client';
import { prisma } from '../../../database';
import {
    DevicePlatformLowercase,
    DeviceTokenDto,
} from '../dto/device-token.dto';
import {
    RegisterDeviceTokenInput,
    UnregisterDeviceTokenInput,
} from '../schemas/notifications.schema';

const PLATFORM_TO_DB: Record<DevicePlatformLowercase, DevicePlatform> = {
    ios: DevicePlatform.IOS,
    android: DevicePlatform.ANDROID,
    web: DevicePlatform.WEB,
};

const PLATFORM_FROM_DB: Record<DevicePlatform, DevicePlatformLowercase> = {
    IOS: 'ios',
    ANDROID: 'android',
    WEB: 'web',
};

function toDto(row: UserDeviceToken): DeviceTokenDto {
    return {
        id: row.id,
        platform: PLATFORM_FROM_DB[row.platform],
        token: row.token,
        // The schema's deviceModel column doubles as user-facing deviceName —
        // the value is the device's user-set or model name (e.g. "iPhone 16 Pro").
        deviceName: row.deviceModel,
        appVersion: row.appVersion,
        isActive: row.isActive,
        lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
    };
}

// Upsert by token (token is globally unique per Phase 3.2 schema). If the
// device previously belonged to another user (handed-off device), this
// re-points the row at the current user instead of failing on the unique key.
export async function registerToken(
    userId: number,
    input: RegisterDeviceTokenInput,
): Promise<DeviceTokenDto> {
    const now = new Date();
    const row = await prisma.userDeviceToken.upsert({
        where: { token: input.token },
        create: {
            userId,
            token: input.token,
            platform: PLATFORM_TO_DB[input.platform],
            deviceModel: input.deviceName ?? null,
            appVersion: input.appVersion ?? null,
            isActive: true,
            lastSeenAt: now,
        },
        update: {
            userId,
            platform: PLATFORM_TO_DB[input.platform],
            deviceModel: input.deviceName ?? null,
            appVersion: input.appVersion ?? null,
            isActive: true,
            lastSeenAt: now,
        },
    });
    return toDto(row);
}

// Soft-deactivate. Idempotent: if the token isn't ours (or doesn't exist),
// silently treat as success — the client's intent is "this token shouldn't
// receive pushes anymore" and we shouldn't leak which tokens belong to whom.
export async function unregisterToken(
    userId: number,
    input: UnregisterDeviceTokenInput,
): Promise<void> {
    await prisma.userDeviceToken.updateMany({
        where: { token: input.token, userId },
        data: { isActive: false },
    });
}

export default {
    registerToken,
    unregisterToken,
};
