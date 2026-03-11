/**
 * Seed script — run once after a fresh migration to populate required lookup data.
 * Usage: node scripts/seed.cjs
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
    // ── Roles ──────────────────────────────────────────────────────────────
    for (const code of ['USER', 'ADMIN']) {
        const role = await prisma.role.upsert({
            where: { code },
            update: {},
            create: { code, status: true },
        });
        console.log(`Role seeded: ${role.code} (id=${role.id})`);
    }

    // ── API Key ────────────────────────────────────────────────────────────
    const apiKeyValue = process.env.API_KEY || 'souli-api-key';

    const apiKey = await prisma.apiKey.upsert({
        where: { key: apiKeyValue },
        update: { status: true },
        create: {
            key: apiKeyValue,
            version: 1,
            permissions: ['GENERAL'],
            comments: ['Default Souli dev API key'],
            status: true,
        },
    });

    console.log(`API key seeded: "${apiKey.key}" (id=${apiKey.id})`);
    console.log(
        '\nDone. You can now start the server and use x-api-key: ' +
            apiKeyValue,
    );
}

main()
    .catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
