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
                name: '30-Day Plan',
                description: 'Perfect for trying out premium features',
                priceUsd: 9.99,
                priceInr: 799,
                stripePriceId: 'price_1K8X9Z2v3W4x5Y6z7A8b9C0', // TODO: Create in Stripe dashboard
                razorpayPlanId: 'plan_1234567890', // TODO: Create in Razorpay dashboard
                durationDays: 30,
                chatLimit: 5000,
                features: [
                    'Unlimited AI conversations',
                    'Chat history',
                    'Priority support',
                    'Premium responses',
                ],
                isActive: true,
            },
            {
                name: '6-Month Plan',
                description: 'Best value for serious learners',
                priceUsd: 49.99,
                priceInr: 3999,
                stripePriceId: 'price_1K8X9A2v3W4x5Y6z7A8b9C1',
                razorpayPlanId: 'plan_9876543210',
                durationDays: 180,
                chatLimit: 30000,
                features: [
                    'Unlimited AI conversations',
                    'Chat history with export',
                    'Priority 24/7 support',
                    'Premium + intelligent responses',
                    'Custom learning paths',
                    'Advanced analytics',
                ],
                isActive: true,
            },
            {
                name: '1-Year Plan',
                description: 'Maximum savings and year-round access',
                priceUsd: 99.99,
                priceInr: 7999,
                stripePriceId: 'price_1K8X9B2v3W4x5Y6z7A8b9C2',
                razorpayPlanId: 'plan_5555555555',
                durationDays: 365,
                chatLimit: null, // null = unlimited
                features: [
                    'Unlimited everything',
                    'Everything in 6-Month plan',
                    'Premium API access',
                    'Dedicated account manager',
                    'Custom integrations',
                    'Early access to new features',
                ],
                isActive: true,
            },
            {
                name: 'Free Plan',
                description: 'Get started with limited features',
                priceUsd: 0,
                priceInr: 0,
                stripePriceId: null, // No Stripe price for free
                razorpayPlanId: null,
                durationDays: 3, // 3 day free trial
                chatLimit: 10,
                features: [
                    '10 messages per day',
                    '3-day trial period',
                    'Basic responses',
                ],
                isActive: true,
            },
        ];

        // Upsert plans
        for (const plan of plans) {
            const created = await prisma.subscriptionPlan.upsert({
                where: { name: plan.name },
                update: { ...plan },
                create: { ...plan },
            });

            console.log(
                `✓ Created/Updated plan: ${created.name} (${created.priceUsd} USD)`,
            );
        }

        console.log('\n✅ Seed completed successfully!\n');
        console.log('📋 Plans created:');
        plans.forEach((plan) => {
            console.log(
                `  • ${plan.name}: $${plan.priceUsd}/month - ${plan.durationDays || '∞'} days`,
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
