import { Decimal } from '@prisma/client/runtime/library';
import {
    PaymentProvider,
    PaymentStatus,
    SubscriptionStatus,
} from '@prisma/client';
import crypto from 'crypto';
import {
    subscriptionRepository,
    paymentRepository,
} from '../../../database/repositories/subscription.repo';
import stripeGateway from '../../../infrastructure/paymentGateways/stripe.gateway';
import razorpayGateway from '../../../infrastructure/paymentGateways/razorpay.gateway';
import { paymentEmailService } from '../../../infrastructure/email/payment-email.service';
import {
    getSubscriptionConfirmationTemplate,
    getPaymentSuccessTemplate,
    getPaymentFailedTemplate,
} from '../../../infrastructure/template/subscription.template';
import { prisma } from '../../../database';
import {
    InternalError,
    BadRequestError,
    NotFoundError,
} from '../../../core/api-error';
import logger from '../../../core/logger';
import {
    SubscriptionPlanDto,
    UserSubscriptionDto,
    CheckoutSessionDto,
    CreatePaymentResponseDto,
    SubscriptionStatusResponseDto,
} from '../dto/payment.dto';
import {
    InitiateCheckoutInput,
    VerifyPaymentInput,
    CancelSubscriptionInput,
    UpgradeSubscriptionInput,
    PauseSubscriptionInput,
    ResumeSubscriptionInput,
    PortalSessionInput,
} from '../schemas/payment.schema';

/**
 * Subscription Service - Handles subscription management logic
 */
class SubscriptionService {
    /**
     * Get all available subscription plans
     */
    async getAvailablePlans(): Promise<SubscriptionPlanDto[]> {
        try {
            const plans = await subscriptionRepository.getActivePlans();

            return plans.map((p) => ({
                id: p.id,
                name: p.name,
                priceUsd: Number(p.priceUsd),
                stripePriceId: p.stripePriceId || undefined,
                razorpayPlanId: p.razorpayPlanId || undefined,
                chatLimit: p.chatLimit || undefined,
                isActive: p.isActive,
                createdAt: p.createdAt,
            }));
        } catch (error) {
            logger.error('Failed to get available plans', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new InternalError('Failed to fetch subscription plans');
        }
    }

    /**
     * Initiate checkout session
     */
    async initiateCheckout(
        userId: number,
        input: InitiateCheckoutInput,
    ): Promise<CheckoutSessionDto> {
        try {
            // Get the plan
            const plan = await subscriptionRepository.getPlanById(input.planId);

            // Get or create Stripe/Razorpay customer
            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            if (!user || !user.email) {
                throw new BadRequestError('User not found or email not set');
            }

            if (input.provider === 'stripe') {
                return await this.initiateStripeCheckout(
                    userId,
                    user.email,
                    user.name || 'User',
                    plan,
                    input.redirectUrl,
                );
            } else if (input.provider === 'razorpay') {
                return await this.initiateRazorpayCheckout(
                    userId,
                    user.email,
                    user.name || 'User',
                    plan,
                    input.redirectUrl,
                );
            } else {
                throw new BadRequestError('Invalid payment provider');
            }
        } catch (error) {
            if (
                error instanceof BadRequestError ||
                error instanceof NotFoundError
            ) {
                throw error;
            }
            logger.error('Failed to initiate checkout', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
            });
            throw new InternalError('Failed to initiate checkout');
        }
    }

    /**
     * Initiate Stripe checkout
     */
    private async initiateStripeCheckout(
        userId: number,
        email: string,
        name: string,
        plan: any,
        redirectUrl?: string,
    ): Promise<CheckoutSessionDto> {
        try {
            // Create Stripe customer
            const customerId = await stripeGateway.createCustomer(email, name);

            if (!plan.stripePriceId) {
                throw new BadRequestError(
                    'Stripe price not configured for this plan',
                );
            }

            // Create checkout session
            const successUrl =
                redirectUrl || `${process.env.ORIGIN_URL}/payment/success`;
            const cancelUrl =
                redirectUrl || `${process.env.ORIGIN_URL}/payment/cancel`;

            const session = await stripeGateway.createCheckoutSession({
                customerId,
                priceId: plan.stripePriceId,
                successUrl,
                cancelUrl,
                clientReferenceId: userId.toString(),
            });

            return {
                sessionId: session.sessionId,
                url: session.url,
                provider: 'stripe',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            };
        } catch (error) {
            if (error instanceof BadRequestError) throw error;
            logger.error('Stripe checkout initiation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new InternalError('Failed to create Stripe checkout');
        }
    }

    /**
     * Initiate Razorpay checkout
     */
    private async initiateRazorpayCheckout(
        userId: number,
        email: string,
        name: string,
        plan: any,
        redirectUrl?: string,
    ): Promise<CheckoutSessionDto> {
        try {
            if (!plan.razorpayPlanId) {
                throw new BadRequestError(
                    'Razorpay plan not configured for this plan',
                );
            }

            // Create order
            const amountPaise = Math.round(Number(plan.priceUsd) * 100 * 75); // Convert USD to INR (1 USD = ~75 INR) in paise

            const order = await razorpayGateway.createOrder({
                amount: amountPaise,
                currency: 'INR',
                receipt: `souli_plan_${plan.id}_user_${userId}_${Date.now()}`,
                description: `${plan.name} subscription for ${email}`,
                notes: {
                    planId: plan.id,
                    userId: userId.toString(),
                    email,
                    name,
                },
            });

            logger.info('Razorpay order created for checkout', {
                orderId: order.orderId,
                planId: plan.id,
                userId,
            });

            return {
                sessionId: order.orderId,
                url:
                    redirectUrl || `${process.env.ORIGIN_URL}/payment/razorpay`,
                provider: 'razorpay',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            };
        } catch (error) {
            if (error instanceof BadRequestError) throw error;
            logger.error('Razorpay checkout initiation failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new InternalError('Failed to create Razorpay checkout');
        }
    }

    /**
     * Verify and process payment
     */
    async verifyPayment(
        userId: number,
        input: VerifyPaymentInput,
    ): Promise<CreatePaymentResponseDto> {
        try {
            if (input.provider === 'stripe') {
                return await this.verifyStripePayment(userId, input);
            } else if (input.provider === 'razorpay') {
                return await this.verifyRazorpayPayment(userId, input);
            } else {
                throw new BadRequestError('Invalid payment provider');
            }
        } catch (error) {
            if (error instanceof BadRequestError) throw error;
            logger.error('Payment verification failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
            });
            throw new InternalError('Payment verification failed');
        }
    }

    /**
     * Verify Stripe payment
     */
    private async verifyStripePayment(
        userId: number,
        input: VerifyPaymentInput,
    ): Promise<CreatePaymentResponseDto> {
        try {
            const session = await stripeGateway
                .getClient()
                .checkout.sessions.retrieve(input.orderId);

            if (session.payment_status !== 'paid') {
                throw new BadRequestError('Payment not completed');
            }

            if (!session.subscription) {
                throw new InternalError('Subscription not created');
            }

            // Get subscription details from Stripe
            const subscription = await stripeGateway
                .getClient()
                .subscriptions.retrieve(session.subscription as string);

            // Get plan from subscription
            const items = subscription.items.data;
            if (!items || items.length === 0) {
                throw new InternalError('No subscription items found');
            }

            const priceId = items[0].price.id;

            // Find the plan by Stripe price ID
            const plans = await subscriptionRepository.getActivePlans();
            const matchedPlan = plans.find((p) => p.stripePriceId === priceId);

            if (!matchedPlan) {
                throw new InternalError('Plan not found for this price');
            }

            // Create payment record
            const payment = await paymentRepository.createPayment({
                userId,
                provider: 'STRIPE',
                amount: Number(matchedPlan.priceUsd),
                currency: 'USD',
                status: 'SUCCESS',
                providerPaymentId: session.id,
                rawWebhook: session,
            });

            // Create subscription record
            const userSubscription =
                await subscriptionRepository.createSubscription({
                    userId,
                    planId: matchedPlan.id,
                    provider: 'STRIPE',
                    providerSubscriptionId: subscription.id,
                    status: 'ACTIVE',
                    currentPeriodEnd: new Date(
                        (subscription.current_period_end || 0) * 1000,
                    ),
                });

            // Send confirmation email
            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            if (user && user.email) {
                try {
                    const emailTemplate = getSubscriptionConfirmationTemplate({
                        userName: user.name || 'User',
                        planName: matchedPlan.name,
                        amount: Number(matchedPlan.priceUsd),
                        currency: 'USD',
                        startDate: new Date().toLocaleDateString(),
                        endDate: new Date(
                            (subscription.current_period_end || 0) * 1000,
                        ).toLocaleDateString(),
                        features:
                            matchedPlan.chatLimit !== null
                                ? [
                                      `Up to ${matchedPlan.chatLimit} chat messages`,
                                      '24/7 Support',
                                      'Advanced features',
                                  ]
                                : [
                                      'Unlimited chat',
                                      '24/7 Support',
                                      'All premium features',
                                  ],
                    });

                    await paymentEmailService.sendSubscriptionConfirmation(
                        user.email,
                        emailTemplate,
                    );
                } catch (emailError) {
                    logger.warn('Failed to send confirmation email', {
                        error:
                            emailError instanceof Error
                                ? emailError.message
                                : 'Unknown error',
                        userId,
                    });
                }
            }

            logger.info('Stripe payment verified successfully', {
                userId,
                paymentId: payment.id,
                subscriptionId: userSubscription.id,
            });

            return {
                success: true,
                message: 'Payment verified and subscription activated',
                data: {
                    paymentId: payment.id,
                    amount: Number(matchedPlan.priceUsd),
                    status: 'SUCCESS',
                    provider: 'stripe',
                },
            };
        } catch (error) {
            if (error instanceof BadRequestError) throw error;
            logger.error('Stripe payment verification failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new InternalError('Stripe payment verification failed');
        }
    }

    /**
     * Verify Razorpay payment
     */
    private async verifyRazorpayPayment(
        userId: number,
        input: VerifyPaymentInput,
    ): Promise<CreatePaymentResponseDto> {
        try {
            // Verify signature
            const isSignatureValid = razorpayGateway.verifyPaymentSignature(
                input.orderId,
                input.paymentId,
                input.signature,
            );

            if (!isSignatureValid) {
                throw new BadRequestError('Invalid payment signature');
            }

            // Get payment details from Razorpay
            const payment = await razorpayGateway
                .getClient()
                .payments.fetch(input.paymentId);

            if (payment.status !== 'captured') {
                throw new BadRequestError('Payment not captured');
            }

            // Get order details
            const order = await razorpayGateway
                .getClient()
                .orders.fetch(input.orderId);

            // Find the plan from order notes
            const planId =
                order.notes?.planId !== undefined
                    ? String(order.notes.planId)
                    : undefined;
            if (!planId) {
                throw new InternalError('Plan information not found in order');
            }

            const plan = await subscriptionRepository.getPlanById(planId);

            // Create payment record
            const paymentRecord = await paymentRepository.createPayment({
                userId,
                provider: 'RAZORPAY',
                amount: Number(plan.priceUsd),
                currency: 'USD',
                status: 'SUCCESS',
                providerPaymentId: input.paymentId,
                rawWebhook: payment,
            });

            // Calculate subscription period (30 days, 6 months, or 1 year based on plan name)
            const currentDate = new Date();
            let expiryDate = new Date();

            if (plan.name.toLowerCase().includes('month')) {
                expiryDate.setMonth(expiryDate.getMonth() + 1);
            } else if (plan.name.toLowerCase().includes('6')) {
                expiryDate.setMonth(expiryDate.getMonth() + 6);
            } else if (
                plan.name.toLowerCase().includes('year') ||
                plan.name.toLowerCase().includes('annual')
            ) {
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            } else {
                // Default to 30 days
                expiryDate.setDate(expiryDate.getDate() + 30);
            }

            // Create subscription record
            const userSubscription =
                await subscriptionRepository.createSubscription({
                    userId,
                    planId: plan.id,
                    provider: 'RAZORPAY',
                    providerSubscriptionId: input.paymentId,
                    status: 'ACTIVE',
                    currentPeriodEnd: expiryDate,
                });

            // Send confirmation email
            const user = await prisma.user.findUnique({
                where: { id: userId },
            });

            if (user && user.email) {
                try {
                    const emailTemplate = getSubscriptionConfirmationTemplate({
                        userName: user.name || 'User',
                        planName: plan.name,
                        amount: Number(plan.priceUsd),
                        currency: 'USD',
                        startDate: currentDate.toLocaleDateString(),
                        endDate: expiryDate.toLocaleDateString(),
                        features:
                            plan.chatLimit !== null
                                ? [
                                      `Up to ${plan.chatLimit} chat messages`,
                                      '24/7 Support',
                                      'Advanced features',
                                  ]
                                : [
                                      'Unlimited chat',
                                      '24/7 Support',
                                      'All premium features',
                                  ],
                    });

                    await paymentEmailService.sendSubscriptionConfirmation(
                        user.email,
                        emailTemplate,
                    );
                } catch (emailError) {
                    logger.warn('Failed to send confirmation email', {
                        error:
                            emailError instanceof Error
                                ? emailError.message
                                : 'Unknown error',
                        userId,
                    });
                }
            }

            logger.info('Razorpay payment verified successfully', {
                userId,
                paymentId: paymentRecord.id,
                subscriptionId: userSubscription.id,
            });

            return {
                success: true,
                message: 'Payment verified and subscription activated',
                data: {
                    paymentId: paymentRecord.id,
                    amount: Number(plan.priceUsd),
                    status: 'SUCCESS',
                    provider: 'razorpay',
                },
            };
        } catch (error) {
            if (error instanceof BadRequestError) throw error;
            logger.error('Razorpay payment verification failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new InternalError('Razorpay payment verification failed');
        }
    }

    /**
     * Get user's subscription status
     */
    async getSubscriptionStatus(
        userId: number,
    ): Promise<SubscriptionStatusResponseDto> {
        try {
            const subscription =
                await subscriptionRepository.getActiveSubscriptionByUserId(
                    userId,
                );

            if (!subscription) {
                return {
                    status: 'INACTIVE',
                    isActive: false,
                    remainingDays: 0,
                    willRenew: false,
                };
            }

            const now = new Date();
            const remainingDays = subscription.currentPeriodEnd
                ? Math.ceil(
                      (subscription.currentPeriodEnd.getTime() -
                          now.getTime()) /
                          (1000 * 60 * 60 * 24),
                  )
                : 0;

            return {
                status: subscription.status,
                isActive: subscription.status === 'ACTIVE',
                currentPeriodEnd: subscription.currentPeriodEnd || undefined,
                remainingDays: Math.max(0, remainingDays),
                willRenew: remainingDays > 0,
                plan: {
                    name: subscription.plan.name,
                    price: Number(subscription.plan.priceUsd),
                    chatLimit: subscription.plan.chatLimit || undefined,
                },
            };
        } catch (error) {
            logger.error('Failed to get subscription status', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
            });
            throw new InternalError('Failed to fetch subscription status');
        }
    }

    /**
     * Cancel a subscription
     */
    async cancelSubscription(
        userId: number,
        input: CancelSubscriptionInput,
    ): Promise<void> {
        try {
            const subscription =
                await subscriptionRepository.getSubscriptionById(
                    input.subscriptionId,
                );

            if (subscription.userId !== userId) {
                throw new BadRequestError('Unauthorized');
            }

            // Cancel in payment provider
            if (
                subscription.provider === 'STRIPE' &&
                subscription.providerSubscriptionId
            ) {
                await stripeGateway.cancelSubscription(
                    subscription.providerSubscriptionId,
                );
            } else if (
                subscription.provider === 'RAZORPAY' &&
                subscription.providerSubscriptionId
            ) {
                await razorpayGateway.cancelSubscription(
                    subscription.providerSubscriptionId,
                    { cancel_at_cycle_end: input.cancelAtPeriodEnd },
                );
            }

            // Update subscription status
            await subscriptionRepository.updateSubscriptionStatus(
                input.subscriptionId,
                'CANCELED',
            );

            logger.info('Subscription cancelled', {
                subscriptionId: input.subscriptionId,
                userId,
            });
        } catch (error) {
            if (error instanceof BadRequestError) throw error;
            logger.error('Failed to cancel subscription', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
            });
            throw new InternalError('Failed to cancel subscription');
        }
    }

    /**
     * Get subscription history
     */
    async getSubscriptionHistory(
        userId: number,
        page: number = 1,
        pageSize: number = 10,
    ) {
        try {
            const offset = (page - 1) * pageSize;
            const { subscriptions, total } =
                await subscriptionRepository.getSubscriptionHistory(userId, {
                    limit: pageSize,
                    offset,
                });

            return {
                subscriptions: subscriptions.map((s) => ({
                    id: s.id,
                    userId: s.userId,
                    planId: s.planId,
                    provider: s.provider,
                    providerSubscriptionId: s.providerSubscriptionId,
                    status: s.status,
                    currentPeriodEnd: s.currentPeriodEnd,
                    createdAt: s.createdAt,
                    plan: s.plan,
                })),
                total,
                currentPage: page,
                pageSize,
            };
        } catch (error) {
            logger.error('Failed to fetch subscription history', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
            });
            throw new InternalError('Failed to fetch subscription history');
        }
    }

    async pauseSubscription(userId: number, input: PauseSubscriptionInput) {
        const subscription = await subscriptionRepository.getSubscriptionById(input.subscriptionId);
        if (subscription.userId !== userId) {
            throw new BadRequestError('Unauthorized');
        }
        if (subscription.status !== 'ACTIVE') {
            throw new BadRequestError('Only active subscriptions can be paused');
        }
        if (subscription.provider !== 'STRIPE' || !subscription.providerSubscriptionId) {
            throw new BadRequestError('Pause is only supported for Stripe subscriptions');
        }

        const pauseDays = input.pausePeriodDays ?? 30;
        const resumeAt = new Date(Date.now() + pauseDays * 24 * 60 * 60 * 1000);

        await stripeGateway.pauseSubscription(subscription.providerSubscriptionId, resumeAt);

        logger.info('Subscription paused', { subscriptionId: input.subscriptionId, userId, resumeAt });

        return {
            subscriptionId: input.subscriptionId,
            status: 'paused',
            resumeAt: resumeAt.toISOString(),
        };
    }

    async resumeSubscription(userId: number, input: { subscriptionId: string }) {
        const subscription = await subscriptionRepository.getSubscriptionById(input.subscriptionId);
        if (subscription.userId !== userId) {
            throw new BadRequestError('Unauthorized');
        }
        if (subscription.provider !== 'STRIPE' || !subscription.providerSubscriptionId) {
            throw new BadRequestError('Resume is only supported for Stripe subscriptions');
        }

        await stripeGateway.resumeSubscription(subscription.providerSubscriptionId);

        logger.info('Subscription resumed', { subscriptionId: input.subscriptionId, userId });

        return {
            subscriptionId: input.subscriptionId,
            status: 'active',
        };
    }

    async getUpcomingCharge(userId: number) {
        const subscription = await subscriptionRepository.getActiveSubscriptionByUserId(userId);
        if (!subscription || subscription.provider !== 'STRIPE' || !subscription.providerSubscriptionId) {
            return { upcoming: null };
        }

        const stripeSub = await stripeGateway.getSubscription(subscription.providerSubscriptionId);
        const customerId = typeof stripeSub.customer === 'string'
            ? stripeSub.customer
            : stripeSub.customer.id;

        const invoice = await stripeGateway.getUpcomingInvoice(customerId);
        if (!invoice) {
            return { upcoming: null };
        }

        return {
            upcoming: {
                amountDue: invoice.amount_due / 100,
                currency: invoice.currency,
                nextPaymentDate: invoice.next_payment_attempt
                    ? new Date(invoice.next_payment_attempt * 1000).toISOString()
                    : null,
                periodStart: invoice.period_start
                    ? new Date(invoice.period_start * 1000).toISOString()
                    : null,
                periodEnd: invoice.period_end
                    ? new Date(invoice.period_end * 1000).toISOString()
                    : null,
            },
        };
    }

    async createPortalSession(userId: number, input: PortalSessionInput) {
        const subscription = await subscriptionRepository.getActiveSubscriptionByUserId(userId);
        if (!subscription || subscription.provider !== 'STRIPE' || !subscription.providerSubscriptionId) {
            throw new BadRequestError('No active Stripe subscription found');
        }

        const stripeSub = await stripeGateway.getSubscription(subscription.providerSubscriptionId);
        const customerId = typeof stripeSub.customer === 'string'
            ? stripeSub.customer
            : stripeSub.customer.id;

        const url = await stripeGateway.createBillingPortalSession(
            customerId,
            input.returnUrl,
        );

        return { url };
    }

    async getEntitlements(userId: number) {
        const subscription =
            await subscriptionRepository.getActiveSubscriptionByUserId(userId);

        const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
        });

        const isActive =
            !!subscription &&
            (subscription.status === 'ACTIVE' ||
                subscription.status === 'TRIALING') &&
            !!subscription.currentPeriodEnd &&
            subscription.currentPeriodEnd > new Date();

        const isTrialing =
            isActive && subscription?.status === 'TRIALING';

        const hasPaid = isActive;
        const blocked =
            user.freeSessionsCompleted >= 3 && !hasPaid;

        return {
            isActive,
            isTrialing,
            plan: subscription
                ? {
                      id: subscription.planId,
                      name: (subscription as any).plan?.name ?? null,
                      priceUsd: (subscription as any).plan?.priceUsd
                          ? Number((subscription as any).plan.priceUsd)
                          : null,
                  }
                : null,
            currentPeriodEnd:
                subscription?.currentPeriodEnd?.toISOString() ?? null,
            features: {
                unlimitedChats: isActive,
                voiceTranscription: isActive,
                voiceSynthesis: isActive,
                insightsExtended: isActive,
            },
            freeTier: {
                used: user.freeSessionsCompleted,
                total: 3,
                blocked,
                showCouponPopup:
                    user.freeSessionsCompleted >= 3 &&
                    !user.couponPopupShown,
            },
        };
    }
}

/**
 * Payment Service - Handles payment-related operations
 */
class PaymentService {
    /**
     * Get payment history
     */
    async getPaymentHistory(
        userId: number,
        page: number = 1,
        pageSize: number = 10,
        status?: PaymentStatus,
    ) {
        try {
            const offset = (page - 1) * pageSize;
            const { payments, total } =
                await paymentRepository.getPaymentHistory(userId, {
                    limit: pageSize,
                    offset,
                    status,
                });

            return {
                payments: payments.map((p) => ({
                    id: p.id,
                    userId: p.userId,
                    provider: p.provider,
                    providerPaymentId: p.providerPaymentId,
                    amount: Number(p.amount),
                    currency: p.currency,
                    status: p.status,
                    createdAt: p.createdAt,
                })),
                total,
                currentPage: page,
                pageSize,
            };
        } catch (error) {
            logger.error('Failed to fetch payment history', {
                error: error instanceof Error ? error.message : 'Unknown error',
                userId,
            });
            throw new InternalError('Failed to fetch payment history');
        }
    }

    /**
     * Get revenue statistics
     */
    async getRevenueStats(startDate: Date, endDate: Date) {
        try {
            return await paymentRepository.getRevenueStats(startDate, endDate);
        } catch (error) {
            logger.error('Failed to fetch revenue stats', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return { totalAmount: 0, totalTransactions: 0 };
        }
    }
}

export const subscriptionService = new SubscriptionService();
export const paymentService = new PaymentService();

// ============ Coupon Service ============

export async function validateCoupon(code: string, userId: number) {
    const coupon = await prisma.coupon.findUnique({
        where: { code: code.toUpperCase() },
    });

    if (!coupon || !coupon.isActive) {
        return { valid: false, reason: 'EXPIRED' };
    }

    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
        return { valid: false, reason: 'EXPIRED' };
    }

    if (coupon.maxRedemptions !== null && coupon.redemptionsCount >= coupon.maxRedemptions) {
        return { valid: false, reason: 'MAX_REDEMPTIONS_REACHED' };
    }

    const userRedemptions = await prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId },
    });
    if (userRedemptions >= coupon.perUserLimit) {
        return { valid: false, reason: 'ALREADY_REDEEMED' };
    }

    return {
        valid: true,
        coupon: {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: Number(coupon.discountValue),
            currency: coupon.currency,
            validFrom: coupon.validFrom.toISOString(),
            validUntil: coupon.validUntil.toISOString(),
            maxRedemptions: coupon.maxRedemptions,
            redemptionsCount: coupon.redemptionsCount,
            perUserLimit: coupon.perUserLimit,
            appliesToPlanIds: coupon.appliesToPlanIds,
            isActive: coupon.isActive,
        },
        discount: {
            type: coupon.discountType,
            amount: Number(coupon.discountValue),
            appliedTo: 'first_invoice',
        },
        appliesToCurrentUser: true,
    };
}

export async function redeemCoupon(code: string, userId: number) {
    const validation = await validateCoupon(code, userId);
    if (!validation.valid) {
        throw new BadRequestError(`Coupon invalid: ${validation.reason}`);
    }

    const subscription = await subscriptionRepository.getActiveSubscriptionByUserId(userId);
    if (!subscription) {
        throw new BadRequestError('No active subscription to apply coupon to');
    }

    const coupon = await prisma.coupon.findUniqueOrThrow({
        where: { code: code.toUpperCase() },
    });

    const redemption = await prisma.$transaction(async (tx) => {
        const r = await tx.couponRedemption.create({
            data: { couponId: coupon.id, userId },
        });

        await tx.coupon.update({
            where: { id: coupon.id },
            data: { redemptionsCount: { increment: 1 } },
        });

        if (coupon.discountType === 'extension_days' && subscription.currentPeriodEnd) {
            const newEnd = new Date(subscription.currentPeriodEnd);
            newEnd.setDate(newEnd.getDate() + Number(coupon.discountValue));
            await tx.userSubscription.update({
                where: { id: subscription.id },
                data: { currentPeriodEnd: newEnd },
            });
        }

        return r;
    });

    const updatedSub = await prisma.userSubscription.findUniqueOrThrow({
        where: { id: subscription.id },
        include: { plan: true },
    });

    return {
        redemption: {
            id: redemption.id,
            code: coupon.code,
            discount: {
                type: coupon.discountType,
                amount: Number(coupon.discountValue),
            },
            appliedAt: redemption.redeemedAt.toISOString(),
            newPeriodEnd: updatedSub.currentPeriodEnd?.toISOString() ?? null,
        },
        subscription: updatedSub,
    };
}
