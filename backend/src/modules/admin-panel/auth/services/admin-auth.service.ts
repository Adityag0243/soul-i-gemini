import crypto from 'crypto';
import argon2 from 'argon2';
import { AuthProvider, RoleCode, User } from '@prisma/client';
import { prisma } from '../../../../database';
import { AuthFailureError } from '../../../../core/api-error';
import { createTokens, validateTokenData } from '../../../../core/auth-utils';
import JWT from '../../../../core/jwt-utils';
import AuthIdentityRepo from '../../../auth/repositories/auth-identity.repo';
import { AdminAuthResponseDto, AdminUserDataDto } from '../dto/admin-auth.dto';
import { AdminEmailLoginInput } from '../schemas/admin-auth.schema';

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function hasAdminRole(
    user: User & { roles?: { role: { id: number; code: RoleCode } }[] },
): boolean {
    return (
        user.roles?.some((userRole) => userRole.role.code === RoleCode.ADMIN) ??
        false
    );
}

function toAdminUserData(
    user: User & { roles?: { role: { id: number; code: RoleCode } }[] },
): AdminUserDataDto {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        verified: user.verified,
        roles:
            user.roles?.map((userRole) => ({
                id: userRole.role.id,
                code: userRole.role.code,
            })) ?? [],
    };
}

function generateTokenKeys(): {
    accessTokenKey: string;
    refreshTokenKey: string;
} {
    return {
        accessTokenKey: crypto.randomBytes(64).toString('hex'),
        refreshTokenKey: crypto.randomBytes(64).toString('hex'),
    };
}

async function createSession(
    userId: number,
): Promise<{ primaryKey: string; secondaryKey: string }> {
    const { accessTokenKey, refreshTokenKey } = generateTokenKeys();

    await prisma.keystore.create({
        data: {
            clientId: userId,
            primaryKey: accessTokenKey,
            secondaryKey: refreshTokenKey,
        },
    });

    return {
        primaryKey: accessTokenKey,
        secondaryKey: refreshTokenKey,
    };
}

async function getAdminUser(userId: number) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            roles: {
                where: {
                    role: {
                        status: true,
                    },
                },
                include: {
                    role: {
                        select: {
                            id: true,
                            code: true,
                        },
                    },
                },
            },
        },
    });

    if (!user || !user.status || !hasAdminRole(user)) {
        throw new AuthFailureError('Invalid admin email or password');
    }

    return user;
}

export async function loginWithEmail(
    input: AdminEmailLoginInput,
): Promise<AdminAuthResponseDto> {
    const normalizedEmail = normalizeEmail(input.email);

    const identity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        normalizedEmail,
    );

    if (!identity || !identity.passwordHash) {
        throw new AuthFailureError('Invalid admin email or password');
    }

    const isPasswordValid = await argon2.verify(
        identity.passwordHash,
        input.password,
    );
    if (!isPasswordValid) {
        throw new AuthFailureError('Invalid admin email or password');
    }

    const adminUser = await getAdminUser(identity.userId);
    const keystore = await createSession(adminUser.id);

    const tokens = await createTokens(
        adminUser,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: toAdminUserData(adminUser),
        tokens,
    };
}

export async function refreshTokenPair(
    accessToken: string,
    refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPayload = await JWT.decode(accessToken);
    validateTokenData(accessPayload);

    const userId = parseInt(accessPayload.sub, 10);
    if (isNaN(userId)) {
        throw new AuthFailureError('Invalid user ID in token');
    }

    const adminUser = await getAdminUser(userId);

    const refreshPayload = await JWT.validate(refreshToken);
    validateTokenData(refreshPayload);

    if (accessPayload.sub !== refreshPayload.sub) {
        throw new AuthFailureError('Invalid access token');
    }

    const keystore = await prisma.keystore.findFirst({
        where: {
            clientId: adminUser.id,
            primaryKey: accessPayload.prm,
            secondaryKey: refreshPayload.prm,
        },
    });

    if (!keystore) {
        throw new AuthFailureError('Invalid access token');
    }

    await prisma.keystore.delete({
        where: { id: keystore.id },
    });

    const newSession = await createSession(adminUser.id);
    return createTokens(
        adminUser,
        newSession.primaryKey,
        newSession.secondaryKey,
    );
}

export default {
    loginWithEmail,
    refreshTokenPair,
};
