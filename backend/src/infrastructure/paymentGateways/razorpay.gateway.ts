import Razorpay from 'razorpay';
import crypto from 'crypto';
import { paymentConfig } from '../../config';
import logger from '../../core/logger';
import { InternalError, BadRequestError } from '../../core/api-error';

interface RazorpayPlanParams {
    period: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'yearly';
    interval: number;
    period_count: number;
    customer_notify: 0 | 1;
    description?: string;
    notes?: Record<string, string>;
}

interface RazorpaySubscriptionParams {
    plan_id: string;
    customer_notify?: 0 | 1;
    quantity?: number;
    total_count?: number;
    description?: string;
    notes?: Record<string, string>;
    start_at?: number;
}

class RazorpayGateway {
    private static instance: RazorpayGateway;
    private razorpayClient: Razorpay | null = null;

    private constructor() {}

    /**
     * Singleton instance of RazorpayGateway
     */
    public static getInstance(): RazorpayGateway {
        if (!RazorpayGateway.instance) {
            RazorpayGateway.instance = new RazorpayGateway();
        }
        return RazorpayGateway.instance;
    }

    /**
     * Lazy initialize Razorpay client
     */
    private getRazorpayClient(): Razorpay {
        if (!this.razorpayClient) {
            if (
                !paymentConfig.razorpayKeyId ||
                !paymentConfig.razorpayKeySecret
            ) {
                throw new InternalError(
                    'Razorpay credentials are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.',
                );
            }
            this.razorpayClient = new Razorpay({
                key_id: paymentConfig.razorpayKeyId,
                key_secret: paymentConfig.razorpayKeySecret,
            });
        }
        return this.razorpayClient;
    }

    /**
     * Create a Razorpay order for payment
     */
    async createOrder(params: {
        amount: number; // in paise (0.01 USD = 1 paise in INR context)
        currency: string;
        receipt: string;
        description?: string;
        notes?: Record<string, string>;
    }): Promise<{ orderId: string; amount: number; currency: string }> {
        try {
            const order = (await (this.getRazorpayClient().orders.create({
                amount: params.amount,
                currency: params.currency,
                receipt: params.receipt,
                notes: params.notes || {},
            } as any) as unknown as Promise<any>)) as any;

            logger.info('Razorpay order created', {
                orderId: order.id,
                amount: params.amount,
            });

            return {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create Razorpay order', {
                error: message,
            });
            throw new InternalError('Failed to create payment order');
        }
    }

    /**
     * Create a subscription plan
     */
    async createPlan(params: {
        period: 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'yearly';
        interval: number;
        period_count: number;
        amount: number; // in paise
        currency: string;
        description?: string;
        notes?: Record<string, string>;
    }): Promise<string> {
        try {
            const planParams: any = {
                period: params.period,
                interval: params.interval,
                period_count: params.period_count,
                item: {
                    active: true,
                    description: params.description || 'Souli Subscription',
                },
                notes: params.notes || {},
                notify_at: [0], // Notify at plan start
            };

            const plan =
                await this.getRazorpayClient().plans.create(planParams);

            logger.info('Razorpay plan created', {
                planId: plan.id,
                period: params.period,
            });

            return plan.id;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create Razorpay plan', {
                error: message,
            });
            throw new InternalError('Failed to create subscription plan');
        }
    }

    /**
     * Create a subscription
     */
    async createSubscription(params: {
        customerId: string;
        planId: string;
        quantity?: number;
        total_count?: number;
        description?: string;
        notes?: Record<string, string>;
        start_at?: number;
    }): Promise<{
        subscriptionId: string;
        customerId: string;
        status: string;
    }> {
        try {
            const subscriptionParams: any = {
                customer_notify: 1,
                plan_id: params.planId,
                quantity: params.quantity || 1,
                total_count: params.total_count,
                description: params.description || 'Souli Subscription',
                notes: params.notes || {},
                start_at: params.start_at,
            };

            const subscription =
                await this.getRazorpayClient().subscriptions.create(
                    subscriptionParams,
                );

            logger.info('Razorpay subscription created', {
                subscriptionId: subscription.id,
                customerId: params.customerId,
                status: subscription.status,
            });

            return {
                subscriptionId: subscription.id,
                customerId: params.customerId,
                status: subscription.status,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create Razorpay subscription', {
                error: message,
                planId: params.planId,
            });
            throw new InternalError('Failed to create subscription');
        }
    }

    /**
     * Get a subscription
     */
    async getSubscription(subscriptionId: string): Promise<any> {
        try {
            const subscription =
                await this.getRazorpayClient().subscriptions.fetch(
                    subscriptionId,
                );
            return subscription;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to fetch Razorpay subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to fetch subscription');
        }
    }

    /**
     * Cancel a subscription
     */
    async cancelSubscription(
        subscriptionId: string,
        options?: { cancel_at_cycle_end?: boolean },
    ): Promise<void> {
        try {
            await this.getRazorpayClient().subscriptions.cancel(
                subscriptionId,
                options?.cancel_at_cycle_end || false,
            );

            logger.info('Razorpay subscription cancelled', {
                subscriptionId,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to cancel Razorpay subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to cancel subscription');
        }
    }

    /**
     * Pause a subscription
     */
    async pauseSubscription(subscriptionId: string): Promise<void> {
        try {
            await this.getRazorpayClient().subscriptions.pause(subscriptionId, {
                pause_at: 'now',
            });

            logger.info('Razorpay subscription paused', {
                subscriptionId,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to pause Razorpay subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to pause subscription');
        }
    }

    /**
     * Resume a subscription
     */
    async resumeSubscription(subscriptionId: string): Promise<void> {
        try {
            await this.getRazorpayClient().subscriptions.resume(
                subscriptionId,
                {
                    resume_at: 'now',
                },
            );

            logger.info('Razorpay subscription resumed', {
                subscriptionId,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to resume Razorpay subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to resume subscription');
        }
    }

    /**
     * Verify payment signature
     */
    verifyPaymentSignature(
        orderId: string,
        paymentId: string,
        signature: string,
    ): boolean {
        try {
            const text = `${orderId}|${paymentId}`;
            const generatedSignature = crypto
                .createHmac('sha256', paymentConfig.razorpayKeySecret)
                .update(text)
                .digest('hex');

            const isValid = generatedSignature === signature;

            if (!isValid) {
                logger.warn('Razorpay signature verification failed', {
                    orderId,
                    paymentId,
                });
            }

            return isValid;
        } catch (error) {
            logger.error('Error verifying Razorpay signature', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(body: string, signature: string): boolean {
        try {
            const generatedSignature = crypto
                .createHmac('sha256', paymentConfig.razorpayWebhookSecret)
                .update(body)
                .digest('hex');

            return generatedSignature === signature;
        } catch (error) {
            logger.error('Error verifying Razorpay webhook signature', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            return false;
        }
    }

    /**
     * Get the Razorpay client for advanced operations
     */
    getClient(): Razorpay {
        return this.getRazorpayClient();
    }
}

export default RazorpayGateway.getInstance();
