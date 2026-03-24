import cron from 'node-cron';
import { paymentConfig } from '../../config';
import { subscriptionRepository } from '../../database/repositories/subscription.repo';
import { paymentEmailService } from '../../infrastructure/email/payment-email.service';
import { getSubscriptionReminderTemplate } from '../../infrastructure/template/subscription.template';
import logger from '../../core/logger';

/**
 * Subscription Scheduler Service
 * Handles periodic tasks like sending subscription expiry reminders
 */
class SubscriptionScheduler {
    private static instance: SubscriptionScheduler;
    private jobs: cron.ScheduledTask[] = [];

    private constructor() {}

    /**
     * Singleton instance
     */
    public static getInstance(): SubscriptionScheduler {
        if (!SubscriptionScheduler.instance) {
            SubscriptionScheduler.instance = new SubscriptionScheduler();
        }
        return SubscriptionScheduler.instance;
    }

    /**
     * Start all scheduled tasks
     */
    public startAll(): void {
        try {
            this.startSubscriptionReminderJob();
            logger.info('Subscription scheduler started');
        } catch (error) {
            logger.error('Failed to start subscription scheduler', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Stop all scheduled tasks
     */
    public stopAll(): void {
        this.jobs.forEach((job) => job.stop());
        this.jobs = [];
        logger.info('Subscription scheduler stopped');
    }

    /**
     * Start subscription reminder job
     * Runs daily at 9 AM to send reminders for subscriptions expiring soon
     */
    private startSubscriptionReminderJob(): void {
        try {
            // Run every day at 9:00 AM
            const job = cron.schedule('0 9 * * *', async () => {
                await this.sendSubscriptionReminders();
            });

            this.jobs.push(job);
            logger.info('Subscription reminder job scheduled');

            // Also run on startup for testing
            // Comment this out in production
            // this.sendSubscriptionReminders().catch(err => {
            //     logger.error('Initial subscription reminder job failed', {
            //         error: err instanceof Error ? err.message : 'Unknown error'
            //     });
            // });
        } catch (error) {
            logger.error('Failed to schedule subscription reminder job', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Send subscription reminders for expiring subscriptions
     */
    private async sendSubscriptionReminders(): Promise<void> {
        try {
            logger.info('Starting subscription reminder task');

            const daysUntilExpiry = paymentConfig.subscriptionReminderDays;
            const expiringSubscriptions =
                await subscriptionRepository.getExpiringSubscriptions(
                    daysUntilExpiry,
                );

            if (expiringSubscriptions.length === 0) {
                logger.info('No expiring subscriptions to remind');
                return;
            }

            logger.info('Found expiring subscriptions', {
                count: expiringSubscriptions.length,
            });

            // Send emails
            const emailConfigs = expiringSubscriptions.map((sub) => {
                const daysRemaining = sub.currentPeriodEnd
                    ? Math.ceil(
                          (sub.currentPeriodEnd.getTime() -
                              new Date().getTime()) /
                              (1000 * 60 * 60 * 24),
                      )
                    : 0;

                const template = getSubscriptionReminderTemplate({
                    userName: sub.user.name || 'User',
                    planName: sub.plan.name,
                    amount: Number(sub.plan.priceUsd),
                    currency: 'USD',
                    expiryDate: sub.currentPeriodEnd
                        ? sub.currentPeriodEnd.toLocaleDateString()
                        : 'N/A',
                    daysRemaining,
                });

                return {
                    to: sub.user.email!,
                    subject: `Your Souli Subscription Expires in ${daysRemaining} Days!`,
                    htmlContent: template,
                };
            });

            const result =
                await paymentEmailService.sendBatchEmails(emailConfigs);

            logger.info('Subscription reminder emails sent', {
                successful: result.successful,
                failed: result.failed,
                total: expiringSubscriptions.length,
            });
        } catch (error) {
            logger.error('Subscription reminder task failed', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
}

// Export singleton instance
export const subscriptionScheduler = SubscriptionScheduler.getInstance();
