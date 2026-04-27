/**
 * Seed script — run once after a fresh migration to populate required lookup data.
 * Usage: node scripts/seed.cjs
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
require('dotenv').config();

const prisma = new PrismaClient();

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

async function seedAdminUser() {
    const adminEmailRaw = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'Souli Admin';

    if (!adminEmailRaw || !adminPassword) {
        console.log(
            'Admin seed skipped: set ADMIN_EMAIL and ADMIN_PASSWORD to seed an admin account.',
        );
        return;
    }

    if (adminPassword.length < 8) {
        throw new Error('ADMIN_PASSWORD must be at least 8 characters long');
    }

    const adminEmail = normalizeEmail(adminEmailRaw);
    const passwordHash = await argon2.hash(adminPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
    });

    const adminRole = await prisma.role.findUnique({
        where: { code: 'ADMIN' },
    });

    if (!adminRole) {
        throw new Error(
            'ADMIN role not found. Seed roles before seeding admin user.',
        );
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: adminEmail },
    });

    const user = existingUser
        ? await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                  name: adminName,
                  password: passwordHash,
                  status: true,
                  verified: true,
              },
          })
        : await prisma.user.create({
              data: {
                  name: adminName,
                  email: adminEmail,
                  password: passwordHash,
                  status: true,
                  verified: true,
              },
          });

    await prisma.userRoleRelation.upsert({
        where: {
            userId_roleId: {
                userId: user.id,
                roleId: adminRole.id,
            },
        },
        update: {},
        create: {
            userId: user.id,
            roleId: adminRole.id,
        },
    });

    const existingIdentity = await prisma.authIdentity.findFirst({
        where: {
            userId: user.id,
            provider: 'EMAIL',
            email: adminEmail,
        },
    });

    if (existingIdentity) {
        await prisma.authIdentity.update({
            where: { id: existingIdentity.id },
            data: {
                passwordHash,
                emailVerified: true,
            },
        });
    } else {
        await prisma.authIdentity.create({
            data: {
                userId: user.id,
                provider: 'EMAIL',
                email: adminEmail,
                passwordHash,
                emailVerified: true,
            },
        });
    }

    console.log(`Admin seeded: ${adminEmail} (userId=${user.id})`);
}

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

    // ── Admin User (optional, env-driven) ─────────────────────────────────
    await seedAdminUser();

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
