import { Router } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import {
    initiateCheckoutSchema,
    verifyPaymentSchema,
    cancelSubscriptionSchema,
    pauseSubscriptionSchema,
    resumeSubscriptionSchema,
    portalSessionSchema,
    getSubscriptionHistorySchema,
    getPaymentHistorySchema,
    couponRedeemSchema,
    redeemCouponSchema,
    previewUpgradeSchema,
    upgradeSubscriptionSchema,
} from '../schemas/payment.schema';
import * as PaymentController from '../controllers/payment.controller';

const router = Router();

// ============ Health Check ============

registry.registerPath({
    method: 'get',
    path: '/payments/health',
    summary: 'Payment Service Health Check',
    description: 'Check if the payment service is running',
    tags: ['Payments'],
    responses: {
        200: { description: 'Service is healthy' },
    },
});

router.get('/health', asyncHandler(PaymentController.healthCheck));

// ============ Subscription Plans ============

registry.registerPath({
    method: 'get',
    path: '/payments/plans',
    summary: 'Get Available Subscription Plans',
    description: 'Retrieve all active subscription plans with pricing details',
    tags: ['Payments - Plans'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: {
            description: 'Plans retrieved successfully',
        },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/plans',
    authMiddleware,
    asyncHandler(PaymentController.getSubscriptionPlans),
);

// ============ Checkout ============

registry.registerPath({
    method: 'post',
    path: '/payments/checkout/initiate',
    summary: 'Initiate Checkout Session',
    description:
        'Create a checkout session for a subscription plan with Stripe or Razorpay',
    tags: ['Payments - Checkout'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: initiateCheckoutSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'Checkout session created successfully' },
        400: { description: 'Validation error or invalid plan' },
        401: { description: 'Unauthorized' },
        500: { description: 'Failed to create checkout session' },
    },
});

router.post(
    '/checkout/initiate',
    authMiddleware,
    validator(initiateCheckoutSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.initiateCheckout),
);

// ============ Payment Verification ============

registry.registerPath({
    method: 'post',
    path: '/payments/verify',
    summary: 'Verify Payment and Create Subscription',
    description:
        'Verify payment signature and create user subscription after successful payment',
    tags: ['Payments - Verification'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: verifyPaymentSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Payment verified and subscription created',
        },
        400: { description: 'Invalid payment or signature' },
        401: { description: 'Unauthorized' },
        500: { description: 'Payment verification failed' },
    },
});

router.post(
    '/verify',
    authMiddleware,
    validator(verifyPaymentSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.verifyPayment),
);

// ============ Subscription Management ============

registry.registerPath({
    method: 'get',
    path: '/payments/subscription/status',
    summary: 'Get Current Subscription Status',
    description: "Retrieve user's current subscription status and details",
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Subscription status retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/subscription/status',
    authMiddleware,
    asyncHandler(PaymentController.getSubscriptionStatus),
);

registry.registerPath({
    method: 'get',
    path: '/payments/subscription/entitlements',
    summary: 'Get subscription entitlements',
    description:
        'Single source of truth for what this user can do right now. Mobile reads on cold start and after payment events.',
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Entitlements retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/subscription/entitlements',
    authMiddleware,
    asyncHandler(PaymentController.getEntitlements),
);

registry.registerPath({
    method: 'get',
    path: '/payments/subscription/history',
    summary: 'Get Subscription History',
    description: "Retrieve user's subscription history with pagination",
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    parameters: [
        {
            name: 'page',
            in: 'query',
            schema: { type: 'number', default: 1 },
            description: 'Page number (1-indexed)',
        },
        {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'number', default: 10 },
            description: 'Number of items per page (max 100)',
        },
    ],
    responses: {
        200: { description: 'Subscription history retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/subscription/history',
    authMiddleware,
    validator(getSubscriptionHistorySchema, ValidationSource.QUERY),
    asyncHandler(PaymentController.getSubscriptionHistory),
);

registry.registerPath({
    method: 'post',
    path: '/payments/subscription/cancel',
    summary: 'Cancel Subscription',
    description: 'Cancel a subscription immediately or at period end',
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: cancelSubscriptionSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Subscription cancelled successfully' },
        400: { description: 'Invalid subscription or unauthorized' },
        401: { description: 'Unauthorized' },
        404: { description: 'Subscription not found' },
    },
});

router.post(
    '/subscription/cancel',
    authMiddleware,
    validator(cancelSubscriptionSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.cancelSubscription),
);

// ============ Subscription Pause / Resume ============

registry.registerPath({
    method: 'post',
    path: '/payments/subscription/pause',
    summary: 'Pause Subscription',
    description:
        'Pause an active Stripe subscription. Collection is voided and resumes after the pause period.',
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: pauseSubscriptionSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Subscription paused' },
        400: { description: 'Invalid subscription or not eligible for pause' },
        401: { description: 'Unauthorized' },
    },
});

router.post(
    '/subscription/pause',
    authMiddleware,
    validator(pauseSubscriptionSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.pauseSubscription),
);

registry.registerPath({
    method: 'post',
    path: '/payments/subscription/resume',
    summary: 'Resume Subscription',
    description: 'Resume a paused Stripe subscription immediately.',
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: resumeSubscriptionSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Subscription resumed' },
        400: { description: 'Invalid subscription or not paused' },
        401: { description: 'Unauthorized' },
    },
});

router.post(
    '/subscription/resume',
    authMiddleware,
    validator(resumeSubscriptionSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.resumeSubscription),
);

// ============ Upcoming Charge ============

registry.registerPath({
    method: 'get',
    path: '/payments/subscription/upcoming-charge',
    summary: 'Get Upcoming Charge',
    description:
        "Preview the next invoice amount and date for the user's active Stripe subscription.",
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Upcoming charge retrieved (null if none)' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/subscription/upcoming-charge',
    authMiddleware,
    asyncHandler(PaymentController.getUpcomingCharge),
);

// ============ Billing Portal ============

registry.registerPath({
    method: 'post',
    path: '/payments/checkout/portal',
    summary: 'Create Billing Portal Session',
    description:
        'Generate a Stripe billing portal URL where the user can manage payment methods, view invoices, and cancel.',
    tags: ['Payments - Checkout'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: portalSessionSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Portal session URL returned' },
        400: { description: 'No Stripe subscription found' },
        401: { description: 'Unauthorized' },
    },
});

router.post(
    '/checkout/portal',
    authMiddleware,
    validator(portalSessionSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.createPortalSession),
);

// ============ Subscription Upgrade ============

registry.registerPath({
    method: 'post',
    path: '/payments/subscription/upgrade/preview',
    summary: 'Preview Subscription Upgrade Proration',
    description:
        'Preview provider-specific proration details before upgrading a subscription.',
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: previewUpgradeSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Upgrade preview generated successfully' },
        400: { description: 'Invalid upgrade request' },
        401: { description: 'Unauthorized' },
    },
});

router.post(
    '/subscription/upgrade/preview',
    authMiddleware,
    validator(previewUpgradeSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.previewSubscriptionUpgrade),
);

registry.registerPath({
    method: 'post',
    path: '/payments/subscription/upgrade',
    summary: 'Upgrade Subscription Plan',
    description:
        'Upgrade subscription with Stripe automatic proration or Razorpay manual proration flow.',
    tags: ['Payments - Subscription'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: upgradeSubscriptionSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Upgrade request accepted' },
        400: { description: 'Invalid upgrade request' },
        401: { description: 'Unauthorized' },
    },
});

router.post(
    '/subscription/upgrade',
    authMiddleware,
    validator(upgradeSubscriptionSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.upgradeSubscription),
);

// ============ Payment History ============

registry.registerPath({
    method: 'get',
    path: '/payments/history',
    summary: 'Get Payment History',
    description: "Retrieve user's payment history with optional filtering",
    tags: ['Payments - History'],
    security: [{ bearerAuth: [] }],
    parameters: [
        {
            name: 'page',
            in: 'query',
            schema: { type: 'number', default: 1 },
            description: 'Page number (1-indexed)',
        },
        {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'number', default: 10 },
            description: 'Number of items per page (max 100)',
        },
        {
            name: 'status',
            in: 'query',
            schema: {
                type: 'string',
                enum: ['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED'],
            },
            description: 'Filter by payment status',
        },
    ],
    responses: {
        200: { description: 'Payment history retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/history',
    authMiddleware,
    validator(getPaymentHistorySchema, ValidationSource.QUERY),
    asyncHandler(PaymentController.getPaymentHistory),
);

// ============ Coupon Redeem ============

registry.registerPath({
    method: 'post',
    path: '/payments/coupon/redeem',
    summary: 'Redeem a coupon',
    description:
        'Redeem a coupon on the active subscription. For extension_days coupons, extends currentPeriodEnd.',
    tags: ['Payments - Coupons'],
    security: [{ bearerAuth: [], apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: couponRedeemSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Coupon redeemed' },
        400: { description: 'Invalid coupon or no active subscription' },
        401: { description: 'Authentication required' },
    },
});

router.post(
    '/coupon/redeem',
    authMiddleware,
    validator(couponRedeemSchema, ValidationSource.BODY),
    asyncHandler(PaymentController.redeemCouponCode),
);

// ============ Webhooks ============

// Stripe webhook (handled separately in webhook routes)
// Razorpay webhook (handled separately in webhook routes)

export const paymentRoutes = router;

// ============ Coupon Routes (mounted at /coupons) ============

const couponRouter = Router();

registry.registerPath({
    method: 'get',
    path: '/coupons/{code}/validate',
    summary: 'Validate a coupon code',
    description:
        'Pre-flight validation — does not redeem. Always returns 200; check `valid` field.',
    tags: ['Payments - Coupons'],
    security: [{ bearerAuth: [], apiKey: [] }],
    responses: {
        200: { description: 'Validation result' },
        401: { description: 'Authentication required' },
    },
});

couponRouter.get(
    '/:code/validate',
    authMiddleware,
    asyncHandler(PaymentController.validateCouponCode),
);

export const couponRoutes = couponRouter;
