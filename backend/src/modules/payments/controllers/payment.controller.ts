import { Request, Response } from 'express';
import { ProtectedRequest } from '../../../types/app-requests';
import {
    SuccessResponse,
    SuccessCreatedResponse,
} from '../../../core/api-response';
import {
    subscriptionService,
    paymentService,
    validateCoupon,
    redeemCoupon,
} from '../services/payment.service';
import {
    InitiateCheckoutInput,
    VerifyPaymentInput,
    CancelSubscriptionInput,
    GetSubscriptionHistoryInput,
    GetPaymentHistoryInput,
    CouponRedeemInput,
    PauseSubscriptionInput,
    ResumeSubscriptionInput,
    PortalSessionInput,
    RedeemCouponInput,
    PreviewUpgradeInput,
    UpgradeSubscriptionInput,
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
 * Preview subscription upgrade and proration details
 * POST /payments/subscription/upgrade/preview
 */
export async function previewSubscriptionUpgrade(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as PreviewUpgradeInput;
    const preview = await subscriptionService.previewUpgrade(req.user!.id, body);

    new SuccessResponse('Subscription upgrade preview generated', {
        preview,
    }).send(res);
}

/**
 * Execute subscription upgrade
 * POST /payments/subscription/upgrade
 */
export async function upgradeSubscription(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as UpgradeSubscriptionInput;
    const result = await subscriptionService.upgradeSubscription(
        req.user!.id,
        body,
    );

    new SuccessResponse('Subscription upgrade initiated', {
        upgrade: result,
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
 * Get subscription entitlements (single source of truth)
 * GET /payments/subscription/entitlements
 */
export async function getEntitlements(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await subscriptionService.getEntitlements(req.user.id);
    new SuccessResponse('Entitlements retrieved', result).send(res);
}

/**
 * Validate a coupon code (pre-flight, no redemption)
 * GET /coupons/:code/validate
 */
export async function validateCouponCode(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const code = req.params.code;
    const result = await validateCoupon(code, req.user.id);
    new SuccessResponse('Coupon validation result', result).send(res);
}

/**
 * Redeem a coupon on the active subscription
 * POST /payments/coupon/redeem
 */
export async function redeemCouponCode(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { code } = req.body as CouponRedeemInput;
    const result = await redeemCoupon(code, req.user.id);
    new SuccessResponse('Coupon redeemed', result).send(res);
}

/**
 * Pause subscription
 * POST /payments/subscription/pause
 */
export async function pauseSubscription(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as PauseSubscriptionInput;
    const result = await subscriptionService.pauseSubscription(req.user!.id, body);
    new SuccessResponse('Subscription paused', result).send(res);
}

/**
 * Resume subscription
 * POST /payments/subscription/resume
 */
export async function resumeSubscription(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as ResumeSubscriptionInput;
    const result = await subscriptionService.resumeSubscription(req.user!.id, body);
    new SuccessResponse('Subscription resumed', result).send(res);
}

/**
 * Get upcoming charge
 * GET /payments/subscription/upcoming-charge
 */
export async function getUpcomingCharge(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await subscriptionService.getUpcomingCharge(req.user!.id);
    new SuccessResponse('Upcoming charge retrieved', result).send(res);
}

/**
 * Create billing portal session
 * POST /payments/checkout/portal
 */
export async function createPortalSession(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const body = req.body as PortalSessionInput;
    const result = await subscriptionService.createPortalSession(req.user!.id, body);
    new SuccessResponse('Portal session created', result).send(res);
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
