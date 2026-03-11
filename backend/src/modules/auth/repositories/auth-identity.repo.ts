import { AuthProvider, AuthIdentity } from '@prisma/client';
import { prisma } from '../../../database';

export interface CreateAuthIdentityData {
    userId: number;
    provider: AuthProvider;
    email?: string;
    passwordHash?: string;
    emailVerified?: boolean;
    providerAccountId?: string;
    souliKeyHash?: string;
}

/**
 * Find auth identity by provider and email (for EMAIL login)
 */
async function findByProviderAndEmail(
    provider: AuthProvider,
    email: string,
): Promise<AuthIdentity | null> {
    return prisma.authIdentity.findFirst({
        where: {
            provider,
            email: email.toLowerCase(),
        },
    });
}

/**
 * Find auth identity by provider and provider account ID (for OAuth)
 */
async function findByProviderAndAccountId(
    provider: AuthProvider,
    providerAccountId: string,
): Promise<AuthIdentity | null> {
    return prisma.authIdentity.findFirst({
        where: {
            provider,
            providerAccountId,
        },
    });
}

/**
 * Find auth identity by provider and souli key hash (for anonymous login)
 */
async function findByProviderAndSouliKeyHash(
    provider: AuthProvider,
    souliKeyHash: string,
): Promise<AuthIdentity | null> {
    return prisma.authIdentity.findFirst({
        where: {
            provider,
            souliKeyHash,
        },
    });
}

/**
 * Find all auth identities for a user
 */
async function findByUserId(userId: number): Promise<AuthIdentity[]> {
    return prisma.authIdentity.findMany({
        where: { userId },
    });
}

/**
 * Create a new auth identity
 */
async function create(data: CreateAuthIdentityData): Promise<AuthIdentity> {
    return prisma.authIdentity.create({
        data: {
            userId: data.userId,
            provider: data.provider,
            email: data.email?.toLowerCase(),
            passwordHash: data.passwordHash,
            emailVerified: data.emailVerified ?? false,
            providerAccountId: data.providerAccountId,
            souliKeyHash: data.souliKeyHash,
        },
    });
}

/**
 * Update email verified status
 */
async function updateEmailVerified(
    id: string,
    verified: boolean,
): Promise<AuthIdentity> {
    return prisma.authIdentity.update({
        where: { id },
        data: { emailVerified: verified },
    });
}

/**
 * Update password hash
 */
async function updatePasswordHash(
    id: string,
    passwordHash: string,
): Promise<AuthIdentity> {
    return prisma.authIdentity.update({
        where: { id },
        data: { passwordHash },
    });
}

/**
 * Delete auth identity by ID
 */
async function remove(id: string): Promise<void> {
    await prisma.authIdentity.delete({
        where: { id },
    });
}

/**
 * Check if user has a specific provider linked
 */
async function hasProvider(
    userId: number,
    provider: AuthProvider,
): Promise<boolean> {
    const identity = await prisma.authIdentity.findFirst({
        where: {
            userId,
            provider,
        },
    });
    return !!identity;
}

/**
 * Link a new provider to an existing user
 */
async function linkProvider(
    userId: number,
    data: Omit<CreateAuthIdentityData, 'userId'>,
): Promise<AuthIdentity> {
    return create({
        userId,
        ...data,
    });
}

export default {
    findByProviderAndEmail,
    findByProviderAndAccountId,
    findByProviderAndSouliKeyHash,
    findByUserId,
    create,
    updateEmailVerified,
    updatePasswordHash,
    remove,
    hasProvider,
    linkProvider,
};
