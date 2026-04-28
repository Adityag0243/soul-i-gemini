export type DevicePlatformLowercase = 'ios' | 'android' | 'web';

export interface DeviceTokenDto {
    id: string;
    platform: DevicePlatformLowercase;
    token: string;
    deviceName: string | null;
    appVersion: string | null;
    isActive: boolean;
    lastSeenAt: string | null;
    createdAt: string;
}
