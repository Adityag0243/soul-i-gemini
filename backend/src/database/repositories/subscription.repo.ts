import { prisma } from '../../database';
import {
    SubscriptionStatus,
    PaymentStatus,
    PaymentProvider,
} from '@prisma/client';
import { InternalError, NotFoundError } from '../../core/api-error';
import logger from '../../core/logger';

/**
 * Subscription Repository - Handles all subscription-related database operations
 */
class SubscriptionRepository {
    /**
     * Create a subscription plan
     */
    async createPlan(data: {
        name: string;
        priceUsd: number;
        stripePriceId?: string;
        razorpayPlanId?: string;
        chatLimit?: number;
        durationDays?: number;
    }) {
        try {
            const plan = await prisma.subscriptionPlan.create({
                data: {
                    name: data.name,
                    priceUsd: data.priceUsd,
                    stripePriceId: data.stripePriceId,
                    razorpayPlanId: data.razorpayPlanId,
                    chatLimit: data.chatLimit,
                    isActive: true,
                },
            });
            return plan;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create subscription plan', {
                error: message,
            });
            throw new InternalError('Failed to create subscription plan');
        }
    }

    /**
     * Get all active subscription plans
     */
    async getActivePlans() {
        try {
            const plans = await prisma.subscriptionPlan.findMany({
                where: { isActive: true },
                orderBy: { priceUsd: 'asc' },
            });
            return plans;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch subscription plans', {
                error: message,
            });
            throw new InternalError('Failed to fetch subscription plans');
        }
    }

    /**
     * Get a subscription plan by ID
     */
    async getPlanById(planId: string) {
        try {
            const plan = await prisma.subscriptionPlan.findUnique({
                where: { id: planId },
            });
            if (!plan) {
                throw new NotFoundError('Subscription plan not found');
            }
            return plan;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch subscription plan', {
                error: message,
                planId,
            });
            throw new InternalError('Failed to fetch subscription plan');
        }
    }

    /**
     * Create a user subscription
     */
    async createSubscription(data: {
        userId: number;
        planId: string;
        provider?: PaymentProvider;
        providerSubscriptionId?: string;
        status: SubscriptionStatus;
        currentPeriodEnd?: Date;
    }) {
        try {
            const subscription = await prisma.userSubscription.create({
                data: {
                    userId: data.userId,
                    planId: data.planId,
                    provider: data.provider,
                    providerSubscriptionId: data.providerSubscriptionId,
                    status: data.status,
                    currentPeriodEnd: data.currentPeriodEnd,
                },
                include: {
                    plan: true,
                },
            });
            return subscription;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create user subscription', {
                error: message,
            });
            throw new InternalError('Failed to create subscription');
        }
    }

    /**
     * Get user's active subscription
     */
    async getActiveSubscriptionByUserId(userId: number) {
        try {
            const subscription = await prisma.userSubscription.findFirst({
                where: {
                    userId,
                    status: {
                        in: ['ACTIVE', 'FREE'],
                    },
                    currentPeriodEnd: {
                        gt: new Date(),
                    },
                },
                include: {
                    plan: true,
                },
                orderBy: { currentPeriodEnd: 'desc' },
            });
            return subscription;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch user subscription', {
                error: message,
                userId,
            });
            throw new InternalError('Failed to fetch subscription');
        }
    }

    /**
     * Get subscription by ID
     */
    async getSubscriptionById(subscriptionId: string) {
        try {
            const subscription = await prisma.userSubscription.findUnique({
                where: { id: subscriptionId },
                include: {
                    plan: true,
                },
            });
            if (!subscription) {
                throw new NotFoundError('Subscription not found');
            }
            return subscription;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to fetch subscription');
        }
    }

    /**
     * Get subscription by provider subscription ID
     */
    async getSubscriptionByProviderSubscriptionId(
        providerSubscriptionId: string,
    ) {
        try {
            const subscription = await prisma.userSubscription.findFirst({
                where: { providerSubscriptionId },
                include: {
                    plan: true,
                },
            });
            return subscription;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch subscription by provider ID', {
                error: message,
            });
            throw new InternalError('Failed to fetch subscription');
        }
    }

    /**
     * Update subscription status
     */
    async updateSubscriptionStatus(
        subscriptionId: string,
        status: SubscriptionStatus,
        currentPeriodEnd?: Date,
    ) {
        try {
            const updateData: any = { status };
            if (currentPeriodEnd) {
                updateData.currentPeriodEnd = currentPeriodEnd;
            }

            const subscription = await prisma.userSubscription.update({
                where: { id: subscriptionId },
                data: updateData,
                include: {
                    plan: true,
                },
            });
            return subscription;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to update subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to update subscription');
        }
    }

    /**
     * Get user's subscription history
     */
    async getSubscriptionHistory(
        userId: number,
        options?: {
            limit?: number;
            offset?: number;
        },
    ) {
        try {
            const [subscriptions, total] = await Promise.all([
                prisma.userSubscription.findMany({
                    where: { userId },
                    include: {
                        plan: true,
                    },
                    orderBy: { createdAt: 'desc' },
                    take: options?.limit || 10,
                    skip: options?.offset || 0,
                }),
                prisma.userSubscription.count({
                    where: { userId },
                }),
            ]);
            return { subscriptions, total };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch subscription history', {
                error: message,
                userId,
            });
            throw new InternalError('Failed to fetch subscription history');
        }
    }

    /**
     * Check if user has active paid subscription
     */
    async hasActivePaidSubscription(userId: number): Promise<boolean> {
        try {
            const subscription = await prisma.userSubscription.findFirst({
                where: {
                    userId,
                    status: 'ACTIVE',
                    currentPeriodEnd: {
                        gt: new Date(),
                    },
                },
            });
            return !!subscription;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to check active subscription', {
                error: message,
                userId,
            });
            return false;
        }
    }

    /**
     * Get subscriptions expiring soon
     */
    async getExpiringSubscriptions(daysUntilExpiry: number) {
        try {
            const now = new Date();
            const expiryDate = new Date(
                now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000,
            );

            const subscriptions = await prisma.userSubscription.findMany({
                where: {
                    status: 'ACTIVE',
                    currentPeriodEnd: {
                        lte: expiryDate,
                        gt: now,
                    },
                },
                include: {
                    plan: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            });
            return subscriptions;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch expiring subscriptions', {
                error: message,
            });
            return [];
        }
    }
}

/**
 * Payment Repository - Handles all payment-related database operations
 */
class PaymentRepository {
    /**
     * Create a payment record
     */
    async createPayment(data: {
        userId: number;
        provider: PaymentProvider;
        amount: number;
        currency: string;
        status: PaymentStatus;
        providerPaymentId?: string;
        rawWebhook?: any;
    }) {
        try {
            const payment = await prisma.payment.create({
                data: {
                    userId: data.userId,
                    provider: data.provider,
                    providerPaymentId: data.providerPaymentId,
                    amount: data.amount,
                    currency: data.currency,
                    status: data.status,
                    rawWebhook: data.rawWebhook,
                },
            });
            return payment;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create payment record', {
                error: message,
            });
            throw new InternalError('Failed to create payment record');
        }
    }

    /**
     * Get payment by ID
     */
    async getPaymentById(paymentId: string) {
        try {
            const payment = await prisma.payment.findUnique({
                where: { id: paymentId },
            });
            if (!payment) {
                throw new NotFoundError('Payment not found');
            }
            return payment;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch payment', {
                error: message,
                paymentId,
            });
            throw new InternalError('Failed to fetch payment');
        }
    }

    /**
     * Get payment by provider payment ID
     */
    async getPaymentByProviderPaymentId(
        provider: PaymentProvider,
        providerPaymentId: string,
    ) {
        try {
            const payment = await prisma.payment.findFirst({
                where: {
                    provider,
                    providerPaymentId,
                },
            });
            return payment;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch payment by provider ID', {
                error: message,
            });
            throw new InternalError('Failed to fetch payment');
        }
    }

    /**
     * Update payment status
     */
    async updatePaymentStatus(paymentId: string, status: PaymentStatus) {
        try {
            const payment = await prisma.payment.update({
                where: { id: paymentId },
                data: { status },
            });
            return payment;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to update payment status', {
                error: message,
                paymentId,
            });
            throw new InternalError('Failed to update payment');
        }
    }

    /**
     * Get user's payment history
     */
    async getPaymentHistory(
        userId: number,
        options?: {
            limit?: number;
            offset?: number;
            status?: PaymentStatus;
        },
    ) {
        try {
            const [payments, total] = await Promise.all([
                prisma.payment.findMany({
                    where: {
                        userId,
                        ...(options?.status && { status: options.status }),
                    },
                    orderBy: { createdAt: 'desc' },
                    take: options?.limit || 10,
                    skip: options?.offset || 0,
                }),
                prisma.payment.count({
                    where: {
                        userId,
                        ...(options?.status && { status: options.status }),
                    },
                }),
            ]);
            return { payments, total };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch payment history', {
                error: message,
                userId,
            });
            throw new InternalError('Failed to fetch payment history');
        }
    }

    /**
     * Get total revenue in a date range
     */
    async getRevenueStats(startDate: Date, endDate: Date) {
        try {
            const stats = await prisma.payment.aggregate({
                where: {
                    status: 'SUCCESS',
                    createdAt: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                _sum: {
                    amount: true,
                },
                _count: true,
            });

            return {
                totalAmount: stats._sum.amount || 0,
                totalTransactions: stats._count,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch revenue stats', {
                error: message,
            });
            return { totalAmount: 0, totalTransactions: 0 };
        }
    }
}

export const subscriptionRepository = new SubscriptionRepository();
export const paymentRepository = new PaymentRepository();
