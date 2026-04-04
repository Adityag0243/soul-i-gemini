import crypto from 'crypto';
import ApiKeyRepo from '../database/repositories/api-key.repo';
import type { Permission } from '@prisma/client';

export async function createApiKey(
    comments: string[],
    permissions: Permission[],
) {
    const key = crypto.randomBytes(32).toString('hex');

    const newKey = await ApiKeyRepo.create(key, comments, permissions, 1);

    if (!newKey) {
        throw Error('Failed to generate API Key.');
    }

    console.log('Your API key:', key);
    return key;
}
