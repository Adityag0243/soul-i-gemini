import { ApiKey, Permission } from '@prisma/client';
import { prisma } from '../index';

async function findByKey(key: string): Promise<ApiKey | null> {
    const apiKey = await prisma.apiKey.findFirst({
        where: {
            key,
            status: true,
        },
    });

    if (!apiKey) return null;

    return {
        id: apiKey.id,
        key: apiKey.key,
        version: apiKey.version,
        permissions: apiKey.permissions as Permission[],
        comments: apiKey.comments,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
    };
}

async function create(
    key: string,
    comments: string[],
    permissions: Permission[],
    version: number = 1,
): Promise<ApiKey> {
    const apiKey = await prisma.apiKey.create({
        data: {
            key,
            comments,
            permissions: permissions,
            version,
        },
    });

    return {
        id: apiKey.id,
        key: apiKey.key,
        version: apiKey.version,
        permissions: apiKey.permissions as Permission[],
        comments: apiKey.comments,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
        updatedAt: apiKey.updatedAt,
    };
}

export default {
    findByKey,
    create,
};
