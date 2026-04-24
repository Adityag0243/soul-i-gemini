import { z } from 'zod';

// ============ Subscription Schemas ============

export const subscriptionPlanSchema = z.object({
    name: z.string().min(1).max(100),
    priceUsd: z.number().min(0).max(999999),
    stripePriceId: z.string().optional(),
    razorpayPlanId: z.string().optional(),
    chatLimit: z.number().min(0).optional(),
    durationDays: z.number().min(1).max(365).optional(),
});

export type SubscriptionPlanInput = z.infer<typeof subscriptionPlanSchema>;

export const initiateCheckoutSchema = z.object({
    planId: z
        .string()
        .uuid('Invalid plan ID')
        .describe('UUID of the subscription plan'),
    provider: z
        .enum(['stripe', 'razorpay'])
        .describe('Payment gateway provider'),
    redirectUrl: z
        .string()
        .url('Invalid redirect URL')
        .optional()
        .describe('URL to redirect after payment (for Razorpay)'),
});

export type InitiateCheckoutInput = z.infer<typeof initiateCheckoutSchema>;

export const verifyPaymentSchema = z.object({
    provider: z.enum(['stripe', 'razorpay']),
    orderId: z.string().describe('Order/Session ID from payment gateway'),
    paymentId: z.string().describe('Payment ID from payment gateway'),
    signature: z
        .string()
        .describe('Signature for verification (Razorpay only)'),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const cancelSubscriptionSchema = z.object({
    subscriptionId: z.string().uuid('Invalid subscription ID'),
    reason: z.string().max(500).optional().describe('Reason for cancellation'),
    cancelAtPeriodEnd: z
        .boolean()
        .default(false)
        .describe('If true, cancel at end of current period'),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;

export const upgradeSubscriptionSchema = z.object({
    subscriptionId: z.string().uuid('Invalid subscription ID'),
    newPlanId: z.string().uuid('Invalid plan ID'),
});

export type UpgradeSubscriptionInput = z.infer<
    typeof upgradeSubscriptionSchema
>;

export const pauseSubscriptionSchema = z.object({
    subscriptionId: z.string().uuid('Invalid subscription ID'),
    pausePeriodDays: z.number().min(1).max(180).optional(),
});

export type PauseSubscriptionInput = z.infer<typeof pauseSubscriptionSchema>;

export const resumeSubscriptionSchema = z.object({
    subscriptionId: z.string().uuid('Invalid subscription ID'),
});

export type ResumeSubscriptionInput = z.infer<typeof resumeSubscriptionSchema>;

export const getSubscriptionHistorySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(10),
});

export type GetSubscriptionHistoryInput = z.infer<
    typeof getSubscriptionHistorySchema
>;

export const getPaymentHistorySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(100).default(10),
    status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']).optional(),
});

export type GetPaymentHistoryInput = z.infer<typeof getPaymentHistorySchema>;

export const redeemCouponSchema = z.object({
    code: z
        .string()
        .min(1, 'Coupon code is required')
        .max(64, 'Coupon code is too long'),
});

export type RedeemCouponInput = z.infer<typeof redeemCouponSchema>;

export const stripeWebhookSchema = z.object({
    id: z.string(),
    object: z.literal('event'),
    api_version: z.string().nullable(),
    created: z.number(),
    data: z.object({
        object: z.any(),
        previous_attributes: z.any().optional(),
    }),
    livemode: z.boolean(),
    pending_webhooks: z.number(),
    request: z
        .object({
            id: z.string().nullable(),
            idempotency_key: z.string().nullable(),
        })
        .nullable(),
    type: z.string(),
});

export type StripeWebhookInput = z.infer<typeof stripeWebhookSchema>;

export const razorpayWebhookSchema = z.object({
    event: z.string(),
    payload: z.object({
        subscription: z
            .object({
                id: z.string(),
                entity: z.any(),
            })
            .optional(),
        payment: z
            .object({
                id: z.string(),
                entity: z.any(),
            })
            .optional(),
    }),
});

export type RazorpayWebhookInput = z.infer<typeof razorpayWebhookSchema>;
