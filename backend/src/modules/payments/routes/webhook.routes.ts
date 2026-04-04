import { Request, Response } from 'express';
import stripeGateway from '../../../infrastructure/paymentGateways/stripe.gateway';
import razorpayGateway from '../../../infrastructure/paymentGateways/razorpay.gateway';
import {
    subscriptionRepository,
    paymentRepository,
} from '../../../database/repositories/subscription.repo';
import { paymentEmailService } from '../../../infrastructure/email/payment-email.service';
import {
    getPaymentFailedTemplate,
    getSubscriptionReminderTemplate,
} from '../../../infrastructure/template/subscription.template';
import { prisma } from '../../../database';
import logger from '../../../core/logger';

/**
 * Stripe Webhook Handler
 */
export async function handleStripeWebhook(
    req: Request,
    res: Response,
): Promise<void> {
    try {
        const sig = req.headers['stripe-signature'] as string;

        if (!sig) {
            res.status(400).json({ error: 'Missing stripe-signature header' });
            return;
        }

        // Verify webhook signature
        const event = stripeGateway.verifyWebhookSignature(req.body, sig);

        logger.info('Stripe webhook received', {
            eventType: event.type,
            eventId: event.id,
        });

        // Handle different event types
        switch (event.type) {
            case 'customer.subscription.updated':
                await handleStripeSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await handleStripeSubscriptionDeleted(event.data.object);
                break;
            case 'charge.failed':
                await handleStripeChargeFailed(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await handleStripePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await handleStripePaymentFailed(event.data.object);
                break;
            default:
                logger.info('Unhandled Stripe event type', {
                    type: event.type,
                });
        }

        res.json({ received: true });
    } catch (error) {
        logger.error('Stripe webhook processing error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(400).json({
            error: 'Webhook error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Stripe subscription update
 */
async function handleStripeSubscriptionUpdated(
    subscription: any,
): Promise<void> {
    try {
        const providerSubscriptionId = subscription.id;
        const userSubscription =
            await subscriptionRepository.getSubscriptionByProviderSubscriptionId(
                providerSubscriptionId,
            );

        if (!userSubscription) {
            logger.warn('Subscription not found', { providerSubscriptionId });
            return;
        }

        // Update subscription status
        const newStatus =
            subscription.status === 'active' ? 'ACTIVE' : 'PAST_DUE';
        await subscriptionRepository.updateSubscriptionStatus(
            userSubscription.id,
            newStatus as any,
            new Date((subscription.current_period_end || 0) * 1000),
        );

        logger.info('Stripe subscription updated', {
            subscriptionId: userSubscription.id,
            newStatus,
        });
    } catch (error) {
        logger.error('Failed to handle subscription update', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Stripe subscription deletion
 */
async function handleStripeSubscriptionDeleted(
    subscription: any,
): Promise<void> {
    try {
        const providerSubscriptionId = subscription.id;
        const userSubscription =
            await subscriptionRepository.getSubscriptionByProviderSubscriptionId(
                providerSubscriptionId,
            );

        if (!userSubscription) {
            logger.warn('Subscription not found for deletion', {
                providerSubscriptionId,
            });
            return;
        }

        // Update subscription status to cancelled
        await subscriptionRepository.updateSubscriptionStatus(
            userSubscription.id,
            'CANCELED',
        );

        logger.info('Stripe subscription deleted', {
            subscriptionId: userSubscription.id,
        });
    } catch (error) {
        logger.error('Failed to handle subscription deletion', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Stripe charge failed
 */
async function handleStripeChargeFailed(charge: any): Promise<void> {
    try {
        const customerId = charge.customer;
        logger.warn('Stripe charge failed', {
            chargeId: charge.id,
            customerId,
            reason: charge.failure_message,
        });
        // Find user and send notification
        // Implementation depends on how you store Stripe customer mapping
    } catch (error) {
        logger.error('Failed to handle charge failure', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Stripe payment succeeded
 */
async function handleStripePaymentSucceeded(invoice: any): Promise<void> {
    try {
        logger.info('Stripe payment succeeded', {
            invoiceId: invoice.id,
        });
        // Handle as needed
    } catch (error) {
        logger.error('Failed to handle payment success', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Stripe payment failed
 */
async function handleStripePaymentFailed(invoice: any): Promise<void> {
    try {
        logger.warn('Stripe payment failed', {
            invoiceId: invoice.id,
        });
        // Handle as needed
    } catch (error) {
        logger.error('Failed to handle payment failure', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Razorpay Webhook Handler
 */
export async function handleRazorpayWebhook(
    req: Request,
    res: Response,
): Promise<void> {
    try {
        const signature = req.headers['x-razorpay-signature'] as string;

        if (!signature) {
            res.status(400).json({
                error: 'Missing x-razorpay-signature header',
            });
            return;
        }

        const rawBody = Buffer.isBuffer(req.body)
            ? req.body.toString('utf8')
            : typeof req.body === 'string'
              ? req.body
              : JSON.stringify(req.body);

        // Verify webhook signature
        const isValid = razorpayGateway.verifyWebhookSignature(
            rawBody,
            signature,
        );

        if (!isValid) {
            logger.warn('Invalid Razorpay webhook signature');
            res.status(400).json({ error: 'Invalid signature' });
            return;
        }

        const parsedBody = Buffer.isBuffer(req.body)
            ? JSON.parse(req.body.toString('utf8'))
            : typeof req.body === 'string'
              ? JSON.parse(req.body)
              : req.body;

        const event = parsedBody.event;
        const payload = parsedBody.payload;

        logger.info('Razorpay webhook received', {
            eventType: event,
        });

        // Handle different event types
        switch (event) {
            case 'subscription.activated':
                await handleRazorpaySubscriptionActivated(payload.subscription);
                break;
            case 'subscription.paused':
                await handleRazorpaySubscriptionPaused(payload.subscription);
                break;
            case 'subscription.resumed':
                await handleRazorpaySubscriptionResumed(payload.subscription);
                break;
            case 'subscription.cancelled':
                await handleRazorpaySubscriptionCancelled(payload.subscription);
                break;
            case 'payment.failed':
                await handleRazorpayPaymentFailed(payload.payment);
                break;
            case 'payment.authorized':
                await handleRazorpayPaymentAuthorized(payload.payment);
                break;
            default:
                logger.info('Unhandled Razorpay event type', { type: event });
        }

        res.json({ success: true });
    } catch (error) {
        logger.error('Razorpay webhook processing error', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(400).json({
            error: 'Webhook error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Razorpay subscription activated
 */
async function handleRazorpaySubscriptionActivated(
    subscription: any,
): Promise<void> {
    try {
        const providerSubscriptionId = subscription.id;
        const userSubscription =
            await subscriptionRepository.getSubscriptionByProviderSubscriptionId(
                providerSubscriptionId,
            );

        if (!userSubscription) {
            logger.warn('Subscription not found', { providerSubscriptionId });
            return;
        }

        // Update subscription status
        await subscriptionRepository.updateSubscriptionStatus(
            userSubscription.id,
            'ACTIVE',
            new Date(subscription.expire_at * 1000),
        );

        logger.info('Razorpay subscription activated', {
            subscriptionId: userSubscription.id,
        });
    } catch (error) {
        logger.error('Failed to handle subscription activation', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Razorpay subscription paused
 */
async function handleRazorpaySubscriptionPaused(
    subscription: any,
): Promise<void> {
    try {
        const providerSubscriptionId = subscription.id;
        const userSubscription =
            await subscriptionRepository.getSubscriptionByProviderSubscriptionId(
                providerSubscriptionId,
            );

        if (!userSubscription) {
            logger.warn('Subscription not found', { providerSubscriptionId });
            return;
        }

        // Update subscription status
        await subscriptionRepository.updateSubscriptionStatus(
            userSubscription.id,
            'PAST_DUE',
        );

        logger.info('Razorpay subscription paused', {
            subscriptionId: userSubscription.id,
        });
    } catch (error) {
        logger.error('Failed to handle subscription pause', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Razorpay subscription resumed
 */
async function handleRazorpaySubscriptionResumed(
    subscription: any,
): Promise<void> {
    try {
        const providerSubscriptionId = subscription.id;
        const userSubscription =
            await subscriptionRepository.getSubscriptionByProviderSubscriptionId(
                providerSubscriptionId,
            );

        if (!userSubscription) {
            logger.warn('Subscription not found', { providerSubscriptionId });
            return;
        }

        // Update subscription status
        await subscriptionRepository.updateSubscriptionStatus(
            userSubscription.id,
            'ACTIVE',
            new Date(subscription.expire_at * 1000),
        );

        logger.info('Razorpay subscription resumed', {
            subscriptionId: userSubscription.id,
        });
    } catch (error) {
        logger.error('Failed to handle subscription resume', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Razorpay subscription cancelled
 */
async function handleRazorpaySubscriptionCancelled(
    subscription: any,
): Promise<void> {
    try {
        const providerSubscriptionId = subscription.id;
        const userSubscription =
            await subscriptionRepository.getSubscriptionByProviderSubscriptionId(
                providerSubscriptionId,
            );

        if (!userSubscription) {
            logger.warn('Subscription not found', { providerSubscriptionId });
            return;
        }

        // Update subscription status
        await subscriptionRepository.updateSubscriptionStatus(
            userSubscription.id,
            'CANCELED',
        );

        logger.info('Razorpay subscription cancelled', {
            subscriptionId: userSubscription.id,
        });
    } catch (error) {
        logger.error('Failed to handle subscription cancellation', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Razorpay payment failed
 */
async function handleRazorpayPaymentFailed(payment: any): Promise<void> {
    try {
        logger.warn('Razorpay payment failed', {
            paymentId: payment.id,
            error: payment.error_code,
        });
        // Send notification to user
    } catch (error) {
        logger.error('Failed to handle payment failure', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}

/**
 * Handle Razorpay payment authorized
 */
async function handleRazorpayPaymentAuthorized(payment: any): Promise<void> {
    try {
        logger.info('Razorpay payment authorized', {
            paymentId: payment.id,
        });
        // Handle as needed
    } catch (error) {
        logger.error('Failed to handle payment authorization', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
