import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import * as dotenv from 'dotenv';
dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    apiVersion: '2023-10-16' as any,
});
const prisma = new PrismaClient();

async function setup() {
    console.log('��� Setting up Stripe products and prices...');

    const plans = await prisma.subscriptionPlan.findMany();

    for (const plan of plans) {
        if (Number(plan.priceUsd) > 0) {
            try {
                console.log(`Creating product for ${plan.name}...`);
                const product = await stripe.products.create({
                    name: plan.name,
                });

                console.log(
                    `Creating price for ${plan.name} ($${plan.priceUsd})...`,
                );
                const price = await stripe.prices.create({
                    product: product.id,
                    unit_amount: Math.round(Number(plan.priceUsd) * 100),
                    currency: 'usd',
                    recurring: { interval: 'month' },
                });

                await prisma.subscriptionPlan.update({
                    where: { id: plan.id },
                    data: { stripePriceId: price.id },
                });
                console.log(
                    `✅ Updated ${plan.name} with price ID: ${price.id}\n`,
                );
            } catch (e: any) {
                console.error(`❌ Failed for ${plan.name}:`, e.message);
            }
        }
    }
    console.log('��� Setup complete!');
}

setup()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
