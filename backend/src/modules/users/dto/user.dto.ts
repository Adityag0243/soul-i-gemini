import { RoleCode } from '@prisma/client';

// Canonical user shape returned by every endpoint that exposes a user (D3).
// `password` is never present here; `id` is stringified; dates are ISO strings.
export interface UserDto {
    id: string;
    email: string | null;
    name: string | null;
    callName: string | null;
    avatar: string | null;
    isAnonymous: boolean;
    verified: boolean;
    country: string | null;
    timezone: string | null;
    locale: string | null;
    dateOfBirth: string | null; // YYYY-MM-DD
    gender: string | null;
    preferredVoice: string | null;
    pushNotificationsEnabled: boolean;
    emailNotificationsEnabled: boolean;
    onboardingCompleted: boolean;
    freeSessionsCompleted: number; // stubbed 0 until Phase 6.1 adds the column
    couponPopupShown: boolean; // stubbed false until Phase 6.1
    lastActiveAt: string | null;
    createdAt: string;
    updatedAt: string;
    roles: { id: number; code: RoleCode }[];
}
