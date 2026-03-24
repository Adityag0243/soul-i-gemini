import Stripe from 'stripe';
import { paymentConfig } from '../../config';
import logger from '../../core/logger';
import { InternalError, BadRequestError } from '../../core/api-error';

class StripeGateway {
    private static instance: StripeGateway;
    private stripeClient: Stripe | null = null;

    private constructor() {}

    /**
     * Singleton instance of StripeGateway
     */
    public static getInstance(): StripeGateway {
        if (!StripeGateway.instance) {
            StripeGateway.instance = new StripeGateway();
        }
        return StripeGateway.instance;
    }

    /**
     * Lazy initialize Stripe client
     */
    private getStripeClient(): Stripe {
        if (!this.stripeClient) {
            if (!paymentConfig.stripeSecretKey) {
                throw new InternalError(
                    'Stripe credentials are not configured. Please set STRIPE_SECRET_KEY environment variable.',
                );
            }
            this.stripeClient = new Stripe(paymentConfig.stripeSecretKey, {
                apiVersion: '2023-10-16',
                timeout: 30000,
            });
        }
        return this.stripeClient;
    }

    /**
     * Create a Stripe customer
     */
    async createCustomer(email: string, name: string): Promise<string> {
        try {
            const customer = await this.getStripeClient().customers.create({
                email,
                name,
                description: `Souli customer: ${name}`,
                metadata: {
                    app: 'souli',
                },
            });
            logger.info('Stripe customer created', {
                customerId: customer.id,
                email,
            });
            return customer.id;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create Stripe customer', {
                error: message,
                email,
            });
            throw new InternalError('Failed to create payment customer');
        }
    }

    /**
     * Create a checkout session for payment
     */
    async createCheckoutSession(params: {
        customerId: string;
        priceId: string;
        successUrl: string;
        cancelUrl: string;
        clientReferenceId: string;
    }): Promise<{ sessionId: string; url: string }> {
        try {
            const session =
                await this.getStripeClient().checkout.sessions.create({
                    customer: params.customerId,
                    payment_method_types: ['card'],
                    line_items: [
                        {
                            price: params.priceId,
                            quantity: 1,
                        },
                    ],
                    mode: 'subscription',
                    success_url: params.successUrl,
                    cancel_url: params.cancelUrl,
                    client_reference_id: params.clientReferenceId,
                    billing_address_collection: 'required',
                    customer_update: {
                        address: 'auto',
                    },
                });

            if (!session.url) {
                throw new Error('Checkout session URL not generated');
            }

            logger.info('Stripe checkout session created', {
                sessionId: session.id,
                customerId: params.customerId,
            });

            return {
                sessionId: session.id,
                url: session.url,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create checkout session', {
                error: message,
                customerId: params.customerId,
            });
            throw new InternalError('Failed to create checkout session');
        }
    }

    /**
     * Create a payment intent for one-time payments
     */
    async createPaymentIntent(params: {
        customerId: string;
        amount: number;
        currency: string;
        description: string;
        metadata?: Record<string, string>;
    }): Promise<{ clientSecret: string; paymentIntentId: string }> {
        try {
            const paymentIntent =
                await this.getStripeClient().paymentIntents.create({
                    customer: params.customerId,
                    amount: Math.round(params.amount * 100), // Convert to cents
                    currency: params.currency.toLowerCase(),
                    description: params.description,
                    metadata: params.metadata,
                });

            if (!paymentIntent.client_secret) {
                throw new Error('Client secret not generated');
            }

            logger.info('Stripe payment intent created', {
                paymentIntentId: paymentIntent.id,
                customerId: params.customerId,
                amount: params.amount,
            });

            return {
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to create payment intent', {
                error: message,
                customerId: params.customerId,
            });
            throw new InternalError('Failed to create payment intent');
        }
    }

    /**
     * Retrieve a subscription
     */
    async getSubscription(
        subscriptionId: string,
    ): Promise<Stripe.Subscription> {
        try {
            const subscription =
                await this.getStripeClient().subscriptions.retrieve(
                    subscriptionId,
                );
            return subscription;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to retrieve subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to retrieve subscription');
        }
    }

    /**
     * Cancel a subscription immediately
     */
    async cancelSubscription(subscriptionId: string): Promise<void> {
        try {
            await this.getStripeClient().subscriptions.cancel(subscriptionId);
            logger.info('Stripe subscription cancelled', {
                subscriptionId,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to cancel subscription', {
                error: message,
                subscriptionId,
            });
            throw new InternalError('Failed to cancel subscription');
        }
    }

    /**
     * Update a subscription
     */
    async updateSubscription(
        subscriptionId: string,
        params: {
            priceId?: string;
            metadata?: Record<string, string>;
        },
    ): Promise<void> {
        try {
            const updateData: Stripe.SubscriptionUpdateParams = {};

            if (params.priceId) {
                updateData.items = [
                    {
                        price: params.priceId,
                    },
                ];
            }

            if (params.metadata) {
                updateData.metadata = params.metadata;
            }

            await this.getStripeClient().subscriptions.update(
                subscriptionId,
                updateData,
            );

            logger.info('Stripe subscription updated', {
                subscriptionId,
            });
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
     * Retrieve a payment
     */
    async getPaymentIntent(
        paymentIntentId: string,
    ): Promise<Stripe.PaymentIntent> {
        try {
            const paymentIntent =
                await this.getStripeClient().paymentIntents.retrieve(
                    paymentIntentId,
                );
            return paymentIntent;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to retrieve payment intent', {
                error: message,
                paymentIntentId,
            });
            throw new InternalError('Failed to retrieve payment intent');
        }
    }

    /**
     * Verify webhook signature
     */
    verifyWebhookSignature(
        body: string | Buffer,
        signature: string,
    ): Stripe.Event {
        try {
            const event = this.getStripeClient().webhooks.constructEvent(
                body,
                signature,
                paymentConfig.stripeWebhookSecret,
            );
            return event;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Webhook signature verification failed', {
                error: message,
            });
            throw new BadRequestError('Invalid webhook signature');
        }
    }

    /**
     * Get the Stripe client for advanced operations
     */
    getClient(): Stripe {
        return this.getStripeClient();
    }
}

export default StripeGateway.getInstance();
