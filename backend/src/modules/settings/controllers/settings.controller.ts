import { Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { ProtectedRequest } from '../../../types/app-requests';
import SettingsService from '../services/settings.service';
import { NotificationToggleInput } from '../schemas/settings.schema';

// get notification preferences for current user
// GET /settings/notifications
export async function getNotificationPreferences(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await SettingsService.getNotificationPreferences(
        req.user.id,
    );

    new SuccessResponse('Notification preferences retrieved', result).send(res);
}

// update daily check-in notification preference
// PATCH /settings/notifications/daily-check-in
export async function updateDailyCheckInPreference(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as NotificationToggleInput;
    const result = await SettingsService.updateDailyCheckInPreference(
        req.user.id,
        input,
    );

    new SuccessResponse('Daily check-in preference updated', result).send(res);
}

// update reminders notification preference
// PATCH /settings/notifications/reminders
export async function updateRemindersPreference(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as NotificationToggleInput;
    const result = await SettingsService.updateRemindersPreference(
        req.user.id,
        input,
    );

    new SuccessResponse('Reminders preference updated', result).send(res);
}
