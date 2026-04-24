import { prisma } from '../../../database';
import { NotificationPreferencesDto } from '../dto/settings.dto';
import { NotificationToggleInput } from '../schemas/settings.schema';

export async function getNotificationPreferences(
    userId: number,
): Promise<NotificationPreferencesDto> {
    const preferences = await prisma.userNotificationPreference.upsert({
        where: { userId },
        update: {},
        create: {
            userId,
            dailyCheckInEnabled: true,
            remindersEnabled: true,
        },
    });

    return {
        dailyCheckInEnabled: preferences.dailyCheckInEnabled,
        remindersEnabled: preferences.remindersEnabled,
        updatedAt: preferences.updatedAt,
    };
}

export async function updateDailyCheckInPreference(
    userId: number,
    input: NotificationToggleInput,
): Promise<NotificationPreferencesDto> {
    const preferences = await prisma.userNotificationPreference.upsert({
        where: { userId },
        update: {
            dailyCheckInEnabled: input.enabled,
        },
        create: {
            userId,
            dailyCheckInEnabled: input.enabled,
            remindersEnabled: true,
        },
    });

    return {
        dailyCheckInEnabled: preferences.dailyCheckInEnabled,
        remindersEnabled: preferences.remindersEnabled,
        updatedAt: preferences.updatedAt,
    };
}

export async function updateRemindersPreference(
    userId: number,
    input: NotificationToggleInput,
): Promise<NotificationPreferencesDto> {
    const preferences = await prisma.userNotificationPreference.upsert({
        where: { userId },
        update: {
            remindersEnabled: input.enabled,
        },
        create: {
            userId,
            dailyCheckInEnabled: true,
            remindersEnabled: input.enabled,
        },
    });

    return {
        dailyCheckInEnabled: preferences.dailyCheckInEnabled,
        remindersEnabled: preferences.remindersEnabled,
        updatedAt: preferences.updatedAt,
    };
}

export default {
    getNotificationPreferences,
    updateDailyCheckInPreference,
    updateRemindersPreference,
};
