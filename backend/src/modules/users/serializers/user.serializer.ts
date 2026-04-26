import {
    AuthIdentity,
    AuthProvider,
    RoleCode,
    User,
} from '@prisma/client';
import { prisma } from '../../../database';
import AuthIdentityRepo from '../../auth/repositories/auth-identity.repo';
import { UserDto } from '../dto/user.dto';

type UserWithRoles = User & {
    roles?: { role: { id: number; code: RoleCode } }[];
};

export function computeIsAnonymous(identities: AuthIdentity[]): boolean {
    if (identities.length === 0) return false;
    return identities.every((i) => i.provider === AuthProvider.ANONYMOUS);
}

// Postgres DATE comes back as a JS Date pinned to midnight UTC; truncate to date.
function formatDate(date: Date | null): string | null {
    if (!date) return null;
    return date.toISOString().slice(0, 10);
}

// Pure serializer. Caller supplies identities so isAnonymous is correct without
// hidden DB access. Use serializeUserById() when identities aren't already loaded.
export function toUserDto(
    user: UserWithRoles,
    identities: AuthIdentity[],
): UserDto {
    return {
        id: String(user.id),
        email: user.email,
        name: user.name,
        callName: user.callName,
        avatar: user.avatarUrl,
        isAnonymous: computeIsAnonymous(identities),
        verified: user.verified,
        country: user.country,
        timezone: user.timezone,
        locale: user.locale,
        dateOfBirth: formatDate(user.dateOfBirth),
        gender: user.gender,
        preferredVoice: user.preferredVoice,
        pushNotificationsEnabled: user.pushNotificationsEnabled,
        emailNotificationsEnabled: user.emailNotificationsEnabled,
        onboardingCompleted: user.onboardingCompleted,
        // Phase 6.1 schema fields not yet present — stubbed.
        freeSessionsCompleted: 0,
        couponPopupShown: false,
        lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        roles:
            user.roles?.map((ur) => ({
                id: ur.role.id,
                code: ur.role.code,
            })) ?? [],
    };
}

// Convenience for auth flows that already hold a user object: loads identities
// then serializes. Adds one query — fine for auth responses (low frequency).
export async function serializeUserForAuth(
    user: UserWithRoles,
): Promise<UserDto> {
    const identities = await AuthIdentityRepo.findByUserId(user.id);
    return toUserDto(user, identities);
}

// Convenience for endpoints that only have a userId (e.g. GET /users/me): load
// user with roles + identities in two queries, serialize.
export async function serializeUserById(userId: number): Promise<UserDto | null> {
    const [user, identities] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            include: {
                roles: {
                    include: {
                        role: {
                            select: { id: true, code: true },
                        },
                    },
                },
            },
        }),
        AuthIdentityRepo.findByUserId(userId),
    ]);
    if (!user) return null;
    return toUserDto(user, identities);
}
