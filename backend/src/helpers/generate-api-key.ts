import crypto from 'crypto';
import ApiKeyRepo from '../database/repositories/api-key.repo';
import { connectDB } from '../database';
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

// auto run (tabhi jab test env)
if (process.env.NODE_ENV !== 'test') {
    connectDB()
        .then(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await createApiKey(['API Key for testing.'], ['GENERAL' as any]);
        })
        .catch(() => {});
}
