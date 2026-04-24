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
    CheckoutSessionDto,
    CreatePaymentResponseDto,
    CouponRedemptionResponseDto,
    SubscriptionStatusResponseDto,
    UpgradePreviewResponseDto,
} from '../dto/payment.dto';
import {
    InitiateCheckoutInput,
    VerifyPaymentInput,
    CancelSubscriptionInput,
    RedeemCouponInput,
    UpgradeSubscriptionInput,
    PreviewUpgradeInput,
} from '../schemas/payment.schema';
import { paymentConfig } from '../../../config';

/**
 * Subscription Service - Handles subscription management logic
 */
class SubscriptionService {
    private readonly trialCouponPlanName = 'Launch Free Access Coupon Plan';
    private readonly inrPerUsd = paymentConfig.usdToInrExchangeRate;

    private usdToInrPaise(usdAmount: number): number {
        return Math.round(usdAmount * this.inrPerUsd * 100);
    }

    private getRazorpayProrationBreakdown(input: {
        oldPriceUsd: number;
        newPriceUsd: number;
        periodStart: Date;
        periodEnd: Date;
        now?: Date;
    }) {
        const now = input.now || new Date();
        const totalMs = Math.max(
            1,
            input.periodEnd.getTime() - input.periodStart.getTime(),
        );
        const remainingMs = Math.max(0, input.periodEnd.getTime() - now.getTime());
        const ratioRemaining = remainingMs / totalMs;

        const oldPlanCreditInrPaise = Math.round(
            this.usdToInrPaise(input.oldPriceUsd) * ratioRemaining,
        );
        const newPlanCostInrPaise = Math.round(
            this.usdToInrPaise(input.newPriceUsd) * ratioRemaining,
        );
        const finalChargeInrPaise = Math.max(
            0,
            newPlanCostInrPaise - oldPlanCreditInrPaise,
        );

        return {
            ratioRemaining,
            oldPlanCreditInrPaise,
            newPlanCostInrPaise,
            finalChargeInrPaise,
        };
    }

    private getPlanExpiryDate(planName: string, fromDate: Date = new Date()): Date {
        const expiryDate = new Date(fromDate);

        if (planName.toLowerCase().includes('month')) {
            expiryDate.setMonth(expiryDate.getMonth() + 1);
        } else if (planName.toLowerCase().includes('6')) {
            expiryDate.setMonth(expiryDate.getMonth() + 6);
        } else if (
            planName.toLowerCase().includes('year') ||
            planName.toLowerCase().includes('annual')
        ) {
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        } else {
            expiryDate.setDate(expiryDate.getDate() + 30);
        }

        return expiryDate;
    }

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
            const amountPaise = this.usdToInrPaise(Number(plan.priceUsd));

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
     * Preview subscription upgrade proration details
     */
    async previewUpgrade(
        userId: number,
        input: PreviewUpgradeInput,
    ): Promise<UpgradePreviewResponseDto> {
        const subscription = await subscriptionRepository.getSubscriptionById(
            input.subscriptionId,
        );

        if (subscription.userId !== userId) {
            throw new BadRequestError('Unauthorized');
        }

        if (subscription.status !== 'ACTIVE' && subscription.status !== 'FREE') {
            throw new BadRequestError('Only active subscriptions can be upgraded');
        }

        const newPlan = await subscriptionRepository.getPlanById(input.newPlanId);
        if (!newPlan.isActive) {
            throw new BadRequestError('Selected plan is not active');
        }

        const oldPrice = Number(subscription.plan.priceUsd);
        const newPrice = Number(newPlan.priceUsd);

        if (subscription.planId === newPlan.id) {
            throw new BadRequestError('You are already on this plan');
        }

        if (newPrice <= oldPrice) {
            throw new BadRequestError(
                'This endpoint only supports upgrade to a higher-priced plan',
            );
        }

        if (subscription.provider === 'STRIPE') {
            return {
                provider: 'stripe',
                currentPlanId: subscription.planId,
                currentPlanName: subscription.plan.name,
                newPlanId: newPlan.id,
                newPlanName: newPlan.name,
                currentPeriodEnd: subscription.currentPeriodEnd || undefined,
                proration: {
                    ratioRemaining: 0,
                    note: 'Stripe will automatically compute proration at invoice time.',
                },
            };
        }

        const periodEnd = subscription.currentPeriodEnd;
        if (!periodEnd) {
            throw new BadRequestError('Current subscription period is missing');
        }

        const periodStart = subscription.createdAt;
        const breakdown = this.getRazorpayProrationBreakdown({
            oldPriceUsd: oldPrice,
            newPriceUsd: newPrice,
            periodStart,
            periodEnd,
        });

        return {
            provider: 'razorpay',
            currentPlanId: subscription.planId,
            currentPlanName: subscription.plan.name,
            newPlanId: newPlan.id,
            newPlanName: newPlan.name,
            currentPeriodEnd: subscription.currentPeriodEnd || undefined,
            proration: {
                ratioRemaining: breakdown.ratioRemaining,
                oldPlanCreditInrPaise: breakdown.oldPlanCreditInrPaise,
                newPlanCostInrPaise: breakdown.newPlanCostInrPaise,
                finalChargeInrPaise: breakdown.finalChargeInrPaise,
                note: 'Razorpay proration is computed manually by Souli.',
            },
        };
    }

    /**
     * Execute subscription upgrade
     */
    async upgradeSubscription(userId: number, input: UpgradeSubscriptionInput) {
        const subscription = await subscriptionRepository.getSubscriptionById(
            input.subscriptionId,
        );

        if (subscription.userId !== userId) {
            throw new BadRequestError('Unauthorized');
        }

        if (subscription.status !== 'ACTIVE' && subscription.status !== 'FREE') {
            throw new BadRequestError('Only active subscriptions can be upgraded');
        }

        const newPlan = await subscriptionRepository.getPlanById(input.newPlanId);
        if (!newPlan.isActive) {
            throw new BadRequestError('Selected plan is not active');
        }

        const oldPrice = Number(subscription.plan.priceUsd);
        const newPrice = Number(newPlan.priceUsd);

        if (subscription.planId === newPlan.id) {
            throw new BadRequestError('You are already on this plan');
        }

        if (newPrice <= oldPrice) {
            throw new BadRequestError(
                'This endpoint only supports upgrade to a higher-priced plan',
            );
        }

        if (subscription.provider === 'STRIPE') {
            if (!subscription.providerSubscriptionId) {
                throw new BadRequestError('Stripe subscription ID missing');
            }

            if (!newPlan.stripePriceId) {
                throw new BadRequestError(
                    'Stripe price is not configured for selected plan',
                );
            }

            const stripeSubscription = await stripeGateway
                .getClient()
                .subscriptions.retrieve(subscription.providerSubscriptionId);
            const stripeItem = stripeSubscription.items.data[0];

            if (!stripeItem) {
                throw new InternalError('Stripe subscription item not found');
            }

            const updatedSubscription = await stripeGateway
                .getClient()
                .subscriptions.update(subscription.providerSubscriptionId, {
                    items: [
                        {
                            id: stripeItem.id,
                            price: newPlan.stripePriceId,
                        },
                    ],
                    proration_behavior: 'always_invoice',
                });

            await prisma.userSubscription.update({
                where: { id: subscription.id },
                data: {
                    planId: newPlan.id,
                    currentPeriodEnd: new Date(
                        (updatedSubscription.current_period_end || 0) * 1000,
                    ),
                    status: 'ACTIVE',
                },
            });

            logger.info('Stripe subscription upgraded with proration', {
                userId,
                subscriptionId: subscription.id,
                oldPlanId: subscription.planId,
                newPlanId: newPlan.id,
                idempotencyKey: input.idempotencyKey,
            });

            return {
                provider: 'stripe',
                mode: 'immediate',
                message: 'Plan upgraded. Stripe invoiced proration automatically.',
                subscriptionId: subscription.id,
                oldPlanId: subscription.planId,
                newPlanId: newPlan.id,
                nextBillingDate: new Date(
                    (updatedSubscription.current_period_end || 0) * 1000,
                ),
            };
        }

        if (subscription.provider !== 'RAZORPAY') {
            throw new BadRequestError('Unsupported subscription provider');
        }

        if (!newPlan.razorpayPlanId) {
            throw new BadRequestError(
                'Razorpay plan is not configured for selected plan',
            );
        }

        if (!subscription.currentPeriodEnd) {
            throw new BadRequestError('Current subscription period is missing');
        }

        const breakdown = this.getRazorpayProrationBreakdown({
            oldPriceUsd: oldPrice,
            newPriceUsd: newPrice,
            periodStart: subscription.createdAt,
            periodEnd: subscription.currentPeriodEnd,
        });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.email) {
            throw new BadRequestError('User not found or email not set');
        }

        // Near the end of cycle the charge can be zero after credit.
        if (breakdown.finalChargeInrPaise <= 0) {
            await prisma.$transaction(async (tx) => {
                await tx.userSubscription.update({
                    where: { id: subscription.id },
                    data: { status: 'CANCELED' },
                });

                await tx.userSubscription.create({
                    data: {
                        userId,
                        planId: newPlan.id,
                        provider: 'RAZORPAY',
                        status: 'ACTIVE',
                        currentPeriodEnd: this.getPlanExpiryDate(newPlan.name),
                    },
                });
            });

            logger.info('Razorpay upgrade applied with zero prorated charge', {
                userId,
                subscriptionId: subscription.id,
                oldPlanId: subscription.planId,
                newPlanId: newPlan.id,
                idempotencyKey: input.idempotencyKey,
            });

            return {
                provider: 'razorpay',
                mode: 'immediate',
                message: 'Plan upgraded with zero prorated charge.',
                subscriptionId: subscription.id,
                oldPlanId: subscription.planId,
                newPlanId: newPlan.id,
                proration: breakdown,
            };
        }

        const order = await razorpayGateway.createOrder({
            amount: breakdown.finalChargeInrPaise,
            currency: 'INR',
            receipt: `souli_upgrade_${subscription.id}_${Date.now()}`,
            description: `Prorated upgrade ${subscription.plan.name} -> ${newPlan.name}`,
            notes: {
                action: 'subscription_upgrade',
                userId: userId.toString(),
                planId: newPlan.id,
                upgradeFromSubscriptionId: subscription.id,
                idempotencyKey: input.idempotencyKey || '',
                prorationAmountPaise: breakdown.finalChargeInrPaise.toString(),
                userEmail: user.email,
            },
        });

        logger.info('Razorpay prorated upgrade order created', {
            userId,
            orderId: order.orderId,
            fromSubscriptionId: subscription.id,
            oldPlanId: subscription.planId,
            newPlanId: newPlan.id,
            prorationAmountPaise: breakdown.finalChargeInrPaise,
            idempotencyKey: input.idempotencyKey,
        });

        return {
            provider: 'razorpay',
            mode: 'requires_payment_verification',
            message:
                'Complete Razorpay payment and call /payments/verify to finalize upgrade.',
            order: {
                orderId: order.orderId,
                amount: order.amount,
                currency: order.currency,
            },
            oldPlanId: subscription.planId,
            newPlanId: newPlan.id,
            proration: breakdown,
            verifyApi: {
                method: 'POST',
                path: '/payments/verify',
                body: {
                    provider: 'razorpay',
                    orderId: order.orderId,
                    paymentId: '<payment_id_from_client>',
                    signature: '<signature_from_client>',
                },
            },
        };
    }

    /**
     * Redeem static launch coupon and grant temporary FREE subscription access
     */
    async redeemCoupon(
        userId: number,
        input: RedeemCouponInput,
    ): Promise<CouponRedemptionResponseDto> {
        const submittedCode = input.code.trim().toUpperCase();
        const expectedCode = paymentConfig.trialCouponCode.trim().toUpperCase();

        if (!paymentConfig.trialCouponEnabled) {
            throw new BadRequestError(
                'Coupon redemption is currently disabled',
            );
        }

        if (submittedCode !== expectedCode) {
            throw new BadRequestError('Invalid coupon code');
        }

        const activeSubscription =
            await subscriptionRepository.getActiveSubscriptionByUserId(userId);

        if (activeSubscription && activeSubscription.status === 'ACTIVE') {
            return {
                success: true,
                message: 'Paid subscription already active',
                data: {
                    code: expectedCode,
                    subscriptionId: activeSubscription.id,
                    status: activeSubscription.status,
                    expiresAt: activeSubscription.currentPeriodEnd || undefined,
                    alreadyApplied: true,
                },
            };
        }

        if (activeSubscription && activeSubscription.status === 'FREE') {
            return {
                success: true,
                message: 'Coupon already applied',
                data: {
                    code: expectedCode,
                    subscriptionId: activeSubscription.id,
                    status: activeSubscription.status,
                    expiresAt: activeSubscription.currentPeriodEnd || undefined,
                    alreadyApplied: true,
                },
            };
        }

        const plan = await this.getOrCreateTrialCouponPlan();
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setDate(
            expiresAt.getDate() + paymentConfig.trialCouponValidityDays,
        );

        const createdSubscription =
            await subscriptionRepository.createSubscription({
                userId,
                planId: plan.id,
                status: 'FREE',
                currentPeriodEnd: expiresAt,
            });

        logger.info('Static coupon redeemed successfully', {
            userId,
            code: expectedCode,
            subscriptionId: createdSubscription.id,
            validDays: paymentConfig.trialCouponValidityDays,
        });

        return {
            success: true,
            message: 'Coupon applied successfully',
            data: {
                code: expectedCode,
                subscriptionId: createdSubscription.id,
                status: createdSubscription.status,
                expiresAt: createdSubscription.currentPeriodEnd || undefined,
                alreadyApplied: false,
            },
        };
    }

    private async getOrCreateTrialCouponPlan() {
        const existingPlan = await prisma.subscriptionPlan.findFirst({
            where: { name: this.trialCouponPlanName },
        });

        if (existingPlan) {
            return existingPlan;
        }

        return prisma.subscriptionPlan.create({
            data: {
                name: this.trialCouponPlanName,
                priceUsd: 0,
                // Keep this hidden from /payments/plans by marking inactive.
                isActive: false,
                chatLimit: null,
            },
        });
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
            const existingPayment =
                await paymentRepository.getPaymentByProviderPaymentId(
                    'RAZORPAY',
                    input.paymentId,
                );

            if (existingPayment) {
                return {
                    success: true,
                    message: 'Payment already verified',
                    data: {
                        paymentId: existingPayment.id,
                        amount: Number(existingPayment.amount),
                        status: existingPayment.status,
                        provider: 'razorpay',
                    },
                };
            }

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

            const upgradeFromSubscriptionId =
                order.notes?.upgradeFromSubscriptionId !== undefined
                    ? String(order.notes.upgradeFromSubscriptionId)
                    : undefined;

            if (upgradeFromSubscriptionId) {
                const oldSubscription =
                    await subscriptionRepository.getSubscriptionById(
                        upgradeFromSubscriptionId,
                    );

                if (oldSubscription.userId !== userId) {
                    throw new BadRequestError('Unauthorized upgrade payment');
                }

                if (
                    oldSubscription.status !== 'ACTIVE' &&
                    oldSubscription.status !== 'FREE'
                ) {
                    throw new BadRequestError(
                        'Original subscription is not active for upgrade',
                    );
                }

                await subscriptionRepository.updateSubscriptionStatus(
                    oldSubscription.id,
                    'CANCELED',
                );
            }

            // Create payment record
            const paymentRecord = await paymentRepository.createPayment({
                userId,
                provider: 'RAZORPAY',
                amount: Number(payment.amount) / 100,
                currency: payment.currency,
                status: 'SUCCESS',
                providerPaymentId: input.paymentId,
                rawWebhook: payment,
            });

            const currentDate = new Date();
            const expiryDate = this.getPlanExpiryDate(plan.name, currentDate);

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
                    amount: Number(payment.amount) / 100,
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
                    status: 'FREE',
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
                isActive:
                    subscription.status === 'ACTIVE' ||
                    subscription.status === 'FREE',
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
