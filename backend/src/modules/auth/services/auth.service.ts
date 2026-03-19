import crypto from 'crypto';
import argon2 from 'argon2';
import { OAuth2Client } from 'google-auth-library';
import { AuthProvider, RoleCode, User } from '@prisma/client';
import { prisma } from '../../../database';
import { googleConfig } from '../../../config';
import {
    BadRequestError,
    AuthFailureError,
    InternalError,
} from '../../../core/api-error';
import { createTokens } from '../../../core/auth-utils';
import AuthIdentityRepo from '../repositories/auth-identity.repo';
import logger from '../../../core/logger';
import {
    AuthResponseDto,
    AnonymousAuthResponseDto,
    GoogleUserPayload,
    UserDataDto,
} from '../dto/auth.dto';
import {
    EmailRegisterInput,
    EmailLoginInput,
    GoogleLoginInput,
    AnonymousLoginInput,
    SouliKeyRestoreInput,
} from '../schemas/auth.schema';

// Google OAuth client
const googleClient = new OAuth2Client(googleConfig.clientId);

// Generate a random Souli Key (16 characters for secure anonymous access)
function generateSouliKey(): string {
    return crypto.randomBytes(24).toString('base64url').slice(0, 24);
}

// Generate access and refresh token keys
function generateTokenKeys(): {
    accessTokenKey: string;
    refreshTokenKey: string;
} {
    return {
        accessTokenKey: crypto.randomBytes(64).toString('hex'),
        refreshTokenKey: crypto.randomBytes(64).toString('hex'),
    };
}

// hash password using Argon2
async function hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64MB
        timeCost: 3,
        parallelism: 4,
    });
}

// Verify password using Argon2
async function verifyPassword(
    password: string,
    hash: string,
): Promise<boolean> {
    try {
        return await argon2.verify(hash, password);
    } catch {
        return false;
    }
}

// verify google id token and extract user info
async function verifyGoogleToken(idToken: string): Promise<GoogleUserPayload> {
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: googleConfig.clientId,
        });
        const payload = ticket.getPayload();

        if (!payload || !payload.sub) {
            throw new AuthFailureError('Invalid Google token');
        }

        return {
            sub: payload.sub,
            email: payload.email,
            email_verified: payload.email_verified,
            name: payload.name,
            picture: payload.picture,
            given_name: payload.given_name,
            family_name: payload.family_name,
        };
    } catch (error) {
        logger.error('Google token verification failed:', error);
        throw new AuthFailureError('Invalid Google token');
    }
}

// transform user to UserDataDto

function toUserData(
    user: User & { roles?: { role: { id: number; code: RoleCode } }[] },
): UserDataDto {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        verified: user.verified,
        roles:
            user.roles?.map((ur) => ({
                id: ur.role.id,
                code: ur.role.code,
            })) || [],
    };
}

// Create user with role and keystore in a transaction

async function createUserWithSession(
    userData: {
        name?: string;
        email?: string;
        password?: string;
        verified?: boolean;
    },
    roleCode: RoleCode = RoleCode.USER,
): Promise<{
    user: User & { roles: { role: { id: number; code: RoleCode } }[] };
    keystore: { primaryKey: string; secondaryKey: string };
}> {
    const { accessTokenKey, refreshTokenKey } = generateTokenKeys();

    const role = await prisma.role.findUnique({
        where: { code: roleCode },
    });

    if (!role) {
        throw new InternalError('Role must be defined');
    }

    const result = await prisma.$transaction(async (tx) => {
        // Create user
        const user = await tx.user.create({
            data: {
                name: userData.name ?? null,
                email: userData.email?.toLowerCase() ?? null,
                password: userData.password ?? null,
                verified: userData.verified ?? false,
            },
        });

        // Create user-role relation
        await tx.userRoleRelation.create({
            data: {
                userId: user.id,
                roleId: role.id,
            },
        });

        // Create keystore
        await tx.keystore.create({
            data: {
                clientId: user.id,
                primaryKey: accessTokenKey,
                secondaryKey: refreshTokenKey,
            },
        });

        // Get user with roles
        const userWithRoles = await tx.user.findUnique({
            where: { id: user.id },
            include: {
                roles: {
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

        return {
            user: userWithRoles!,
            keystore: {
                primaryKey: accessTokenKey,
                secondaryKey: refreshTokenKey,
            },
        };
    });

    return result;
}

// Create keystore session for existing user

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

// AUTH SERVICE METHODS

// register user with email and password

export async function registerWithEmail(
    input: EmailRegisterInput,
): Promise<AuthResponseDto> {
    const { name, email, password } = input;

    const existingIdentity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        email,
    );
    if (existingIdentity) {
        throw new BadRequestError('User already registered with this email');
    }
    // Hash password
    const passwordHash = await hashPassword(password);
    // Create user with session
    const { user, keystore } = await createUserWithSession({
        name,
        email,
        verified: false,
    });

    // Create auth identity
    await AuthIdentityRepo.create({
        userId: user.id,
        provider: AuthProvider.EMAIL,
        email,
        passwordHash,
        emailVerified: false,
    });

    // Generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: toUserData(user),
        tokens,
    };
}

// Login with email and password

export async function loginWithEmail(
    input: EmailLoginInput,
): Promise<AuthResponseDto> {
    const { email, password } = input;

    // find auth identity
    const identity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        email,
    );

    if (!identity || !identity.passwordHash) {
        throw new AuthFailureError('Invalid email or password');
    }

    // verify password
    const isValid = await verifyPassword(password, identity.passwordHash);
    if (!isValid) {
        throw new AuthFailureError('Invalid email or password');
    }

    // get user with roles
    const user = await prisma.user.findUnique({
        where: { id: identity.userId },
        include: {
            roles: {
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

    if (!user || !user.status) {
        throw new AuthFailureError('User account is disabled');
    }

    // create new session
    const keystore = await createSession(user.id);

    // generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: toUserData(user),
        tokens,
    };
}

// Login/Register with Google

export async function loginWithGoogle(
    input: GoogleLoginInput,
): Promise<AuthResponseDto> {
    const { idToken } = input;

    // verify Google token
    const googleUser = await verifyGoogleToken(idToken);

    // check if user exists with this Google account
    let identity = await AuthIdentityRepo.findByProviderAndAccountId(
        AuthProvider.GOOGLE,
        googleUser.sub,
    );

    let user: User & { roles: { role: { id: number; code: RoleCode } }[] };
    let keystore: { primaryKey: string; secondaryKey: string };

    if (identity) {
        // existing user - login
        const existingUser = await prisma.user.findUnique({
            where: { id: identity.userId },
            include: {
                roles: {
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

        if (!existingUser || !existingUser.status) {
            throw new AuthFailureError('User account is disabled');
        }

        user = existingUser;
        keystore = await createSession(user.id);
    } else {
        // new user - register
        const result = await createUserWithSession({
            name: googleUser.name,
            email: googleUser.email,
            verified: googleUser.email_verified ?? false,
        });

        user = result.user;
        keystore = result.keystore;

        // create auth identity
        await AuthIdentityRepo.create({
            userId: user.id,
            provider: AuthProvider.GOOGLE,
            email: googleUser.email,
            emailVerified: googleUser.email_verified ?? false,
            providerAccountId: googleUser.sub,
        });
    }

    // generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: toUserData(user),
        tokens,
    };
}

// Anonymous login - creates a new anonymous user with a Souli Key

export async function loginAnonymous(
    input: AnonymousLoginInput,
): Promise<AnonymousAuthResponseDto> {
    // Generate unique Souli Key
    const souliKey = generateSouliKey();
    const souliKeyHash = await hashPassword(souliKey);

    // Create user with session
    const { user, keystore } = await createUserWithSession({
        name: input.name ?? undefined,
        verified: false,
    });

    // Create auth identity
    await AuthIdentityRepo.create({
        userId: user.id,
        provider: AuthProvider.ANONYMOUS,
        souliKeyHash,
    });

    // generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: toUserData(user),
        tokens,
        souliKey, // Return only once - user must save this!
    };
}

/**
 * Restore anonymous session using Souli Key
 */
export async function restoreWithSouliKey(
    input: SouliKeyRestoreInput,
): Promise<AuthResponseDto> {
    const { souliKey } = input;

    // Find all anonymous identities and verify against each
    // This is necessary because we can't search by hash directly
    const identities = await prisma.authIdentity.findMany({
        where: {
            provider: AuthProvider.ANONYMOUS,
            souliKeyHash: { not: null },
        },
    });

    let matchedIdentity = null;
    for (const identity of identities) {
        if (identity.souliKeyHash) {
            const isMatch = await verifyPassword(
                souliKey,
                identity.souliKeyHash,
            );
            if (isMatch) {
                matchedIdentity = identity;
                break;
            }
        }
    }

    if (!matchedIdentity) {
        throw new AuthFailureError('Invalid Souli Key');
    }

    // Get user with roles
    const user = await prisma.user.findUnique({
        where: { id: matchedIdentity.userId },
        include: {
            roles: {
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

    if (!user || !user.status) {
        throw new AuthFailureError('User account is disabled');
    }

    // Create new session
    const keystore = await createSession(user.id);

    // Generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: toUserData(user),
        tokens,
    };
}

/**
 * Link Google account to existing user
 */
export async function linkGoogleAccount(
    userId: number,
    idToken: string,
): Promise<void> {
    // Verify Google token
    const googleUser = await verifyGoogleToken(idToken);

    // Check if this Google account is already linked to another user
    const existingIdentity = await AuthIdentityRepo.findByProviderAndAccountId(
        AuthProvider.GOOGLE,
        googleUser.sub,
    );

    if (existingIdentity) {
        if (existingIdentity.userId === userId) {
            throw new BadRequestError(
                'Google account is already linked to your account',
            );
        }
        throw new BadRequestError(
            'Google account is already linked to another user',
        );
    }

    // Check if user already has Google linked
    const hasGoogle = await AuthIdentityRepo.hasProvider(
        userId,
        AuthProvider.GOOGLE,
    );
    if (hasGoogle) {
        throw new BadRequestError('You already have a Google account linked');
    }

    // Link the provider
    await AuthIdentityRepo.linkProvider(userId, {
        provider: AuthProvider.GOOGLE,
        email: googleUser.email,
        emailVerified: googleUser.email_verified ?? false,
        providerAccountId: googleUser.sub,
    });
}

/**
 * Get linked providers for a user
 */
export async function getLinkedProviders(userId: number) {
    const identities = await AuthIdentityRepo.findByUserId(userId);

    return {
        userId,
        providers: identities.map((identity) => ({
            provider: identity.provider,
            email: identity.email,
            linkedAt: identity.createdAt,
        })),
    };
}

export default {
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    loginAnonymous,
    restoreWithSouliKey,
    linkGoogleAccount,
    getLinkedProviders,
};
