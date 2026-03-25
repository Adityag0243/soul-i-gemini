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
    getSubscriptionHistorySchema,
    getPaymentHistorySchema,
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

// ============ Webhooks ============

// Stripe webhook (handled separately in webhook routes)
// Razorpay webhook (handled separately in webhook routes)

export const paymentRoutes = router;
