import { Permission } from '@prisma/client';
import { prisma } from '../src/database';
import { createApiKey } from '../src/helpers/generate-api-key';

async function main() {
    console.log('Generating new API key...');

    try {
        await prisma.$connect();

        const comments = [
            'Mobile App Integration Key',
            `Generated on ${new Date().toISOString()}`,
        ];
        const permissions: Permission[] = [Permission.GENERAL];

        const key = await createApiKey(comments, permissions);

        console.log('\nAPI Key Generated Successfully!');
        console.log('==================================================');
        console.log(`x-api-key: ${key}`);
        console.log('==================================================');
        console.log(
            'Share this key securely with the mobile development team.',
        );
    } catch (error) {
        console.error('Failed to generate API key:', error);
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

main();
