import { Request, Response } from 'express';
import { ProtectedRequest } from '../../../types/app-requests';
import {
    SuccessResponse,
    SuccessCreatedResponse,
} from '../../../core/api-response';
import {
    subscriptionService,
    paymentService,
} from '../services/payment.service';
import {
    InitiateCheckoutInput,
    VerifyPaymentInput,
    CancelSubscriptionInput,
    GetSubscriptionHistoryInput,
    GetPaymentHistoryInput,
} from '../schemas/payment.schema';

/**
 * Get available subscription plans
 * GET /payments/plans
 */
export async function getSubscriptionPlans(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const plans = await subscriptionService.getAvailablePlans();

    new SuccessResponse('Subscription plans retrieved', {
        plans,
        count: plans.length,
    }).send(res);
}

/**
 * Initiate checkout for a subscription plan
 * POST /payments/checkout/initiate
 */
export async function initiateCheckout(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as InitiateCheckoutInput;
    const checkout = await subscriptionService.initiateCheckout(
        req.user!.id,
        body,
    );

    new SuccessCreatedResponse('Checkout session initiated', {
        session: checkout,
    }).send(res);
}

/**
 * Verify payment and create subscription
 * POST /payments/verify
 */
export async function verifyPayment(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as VerifyPaymentInput;
    const result = await subscriptionService.verifyPayment(req.user!.id, body);

    new SuccessResponse('Payment verified successfully', result).send(res);
}

/**
 * Get user's current subscription status
 * GET /payments/subscription/status
 */
export async function getSubscriptionStatus(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const status = await subscriptionService.getSubscriptionStatus(
        req.user!.id,
    );

    new SuccessResponse('Subscription status retrieved', {
        subscription: status,
    }).send(res);
}

/**
 * Get subscription history
 * GET /payments/subscription/history
 */
export async function getSubscriptionHistory(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const query = req.query as unknown as GetSubscriptionHistoryInput;
    const page = query.page ? Number(query.page) : 1;
    const pageSize = query.pageSize ? Number(query.pageSize) : 10;

    const history = await subscriptionService.getSubscriptionHistory(
        req.user!.id,
        page,
        pageSize,
    );

    new SuccessResponse('Subscription history retrieved', history).send(res);
}

/**
 * Cancel subscription
 * POST /payments/subscription/cancel
 */
export async function cancelSubscription(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as CancelSubscriptionInput;
    await subscriptionService.cancelSubscription(req.user!.id, body);

    new SuccessResponse('Subscription cancelled successfully', {
        message: 'Your subscription has been cancelled',
    }).send(res);
}

/**
 * Get payment history
 * GET /payments/history
 */
export async function getPaymentHistory(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const query = req.query as unknown as GetPaymentHistoryInput;
    const page = query.page ? Number(query.page) : 1;
    const pageSize = query.pageSize ? Number(query.pageSize) : 10;
    const status = query.status;

    const history = await paymentService.getPaymentHistory(
        req.user!.id,
        page,
        pageSize,
        status,
    );

    new SuccessResponse('Payment history retrieved', history).send(res);
}

/**
 * Health check endpoint
 * GET /payments/health
 */
export async function healthCheck(req: Request, res: Response): Promise<void> {
    new SuccessResponse('Payment service is healthy', {
        status: 'running',
        timestamp: new Date(),
    }).send(res);
}
