// Seeding script for creating initial subscription plans
// Save as: scripts/seed-subscriptions.ts or scripts/seed-subscriptions.cjs
// Run with: npx ts-node scripts/seed-subscriptions.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Starting subscription plans seed...');

    try {
        // Clear existing plans (optional)
        // await prisma.subscriptionPlan.deleteMany({});
        // console.log('✓ Cleared existing plans');

        // Define subscription plans
        const plans = [
            {
                name: '1-Month Plan',
                priceUsd: 9.99,
                stripePriceId: 'price_1K8X9Z2v3W4x5Y6z7A8b9C0',
                razorpayPlanId: 'plan_1234567890',
                chatLimit: 5000,
                isActive: true,
            },
            {
                name: '6-Month Plan',
                priceUsd: 49.99,
                stripePriceId: 'price_1K8X9A2v3W4x5Y6z7A8b9C1',
                razorpayPlanId: 'plan_9876543210',
                chatLimit: 30000,
                isActive: true,
            },
            {
                name: '1-Year Plan',
                priceUsd: 99.99,
                stripePriceId: 'price_1K8X9B2v3W4x5Y6z7A8b9C2',
                razorpayPlanId: 'plan_5555555555',
                chatLimit: null, // null = unlimited
                isActive: true,
            },
            {
                name: 'Free Plan',
                priceUsd: 0,
                stripePriceId: null,
                razorpayPlanId: null,
                chatLimit: 10,
                isActive: true,
            },
        ];

        // Upsert plans
        for (const plan of plans) {
            const existingPlan = await prisma.subscriptionPlan.findFirst({
                where: { name: plan.name },
            });

            let created;
            if (existingPlan) {
                created = await prisma.subscriptionPlan.update({
                    where: { id: existingPlan.id },
                    data: plan,
                });
            } else {
                created = await prisma.subscriptionPlan.create({
                    data: plan,
                });
            }

            console.log(
                `✓ Created/Updated plan: ${created.name} (${created.priceUsd} USD)`,
            );
        }

        console.log('\n✅ Seed completed successfully!\n');
        console.log('📋 Plans created:');
        plans.forEach((plan) => {
            console.log(
                `  • ${plan.name}: $${plan.priceUsd} - limit: ${plan.chatLimit || '∞'}`,
            );
        });

        console.log('\n⚠️  TODO: Before using with real payments:');
        console.log('  1. Create price IDs in Stripe dashboard');
        console.log('  2. Create plan IDs in Razorpay dashboard');
        console.log('  3. Update stripePriceId and razorpayPlanId above');
    } catch (error) {
        console.error('❌ Seed error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
