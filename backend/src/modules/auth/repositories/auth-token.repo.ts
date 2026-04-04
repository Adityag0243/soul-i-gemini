import { AuthToken, TokenType } from '@prisma/client';
import { prisma } from '../../../database';

export interface CreateAuthTokenData {
    userId: number;
    tokenHash: string;
    tokenType: TokenType;
    expiresAt: Date;
}

async function create(data: CreateAuthTokenData): Promise<AuthToken> {
    return prisma.authToken.create({
        data: {
            userId: data.userId,
            tokenHash: data.tokenHash,
            tokenType: data.tokenType,
            expiresAt: data.expiresAt,
        },
    });
}

async function findActiveByHash(
    tokenType: TokenType,
    tokenHash: string,
): Promise<AuthToken | null> {
    return prisma.authToken.findFirst({
        where: {
            tokenType,
            tokenHash,
            revoked: false,
            expiresAt: {
                gt: new Date(),
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

async function findActiveByUserAndType(
    userId: number,
    tokenType: TokenType,
): Promise<AuthToken | null> {
    return prisma.authToken.findFirst({
        where: {
            userId,
            tokenType,
            revoked: false,
            expiresAt: {
                gt: new Date(),
            },
        },
        orderBy: {
            createdAt: 'desc',
        },
    });
}

async function revokeByUserAndType(
    userId: number,
    tokenType: TokenType,
): Promise<void> {
    await prisma.authToken.updateMany({
        where: {
            userId,
            tokenType,
            revoked: false,
        },
        data: {
            revoked: true,
        },
    });
}

async function revokeByHash(tokenHash: string): Promise<void> {
    await prisma.authToken.updateMany({
        where: {
            tokenHash,
            revoked: false,
        },
        data: {
            revoked: true,
        },
    });
}

export default {
    create,
    findActiveByHash,
    findActiveByUserAndType,
    revokeByUserAndType,
    revokeByHash,
};
