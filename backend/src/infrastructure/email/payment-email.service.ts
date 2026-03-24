import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { sesConfig } from '../../config';
import logger from '../../core/logger';

interface EmailOptions {
    to: string;
    subject: string;
    htmlContent: string;
    replyTo?: string;
}

/**
 * Payment Email Service - Handles all payment-related email communications via AWS SES
 */
class PaymentEmailService {
    private static instance: PaymentEmailService;
    private sesClient: SESClient | undefined;

    private constructor() {
        this.initializeSES();
    }

    /**
     * Singleton instance
     */
    public static getInstance(): PaymentEmailService {
        if (!PaymentEmailService.instance) {
            PaymentEmailService.instance = new PaymentEmailService();
        }
        return PaymentEmailService.instance;
    }

    /**
     * Initialize SES Client
     */
    private initializeSES(): void {
        try {
            this.sesClient = new SESClient({
                region: sesConfig.awsRegion,
                credentials: {
                    accessKeyId: sesConfig.awsAccessKeyId,
                    secretAccessKey: sesConfig.awsSecretAccessKey,
                },
            });
            logger.info('SES Mail Client initialized successfully');
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to initialize SES Mail Client', {
                error: message,
            });
        }
    }

    /**
     * Send email using SES
     */
    private async sendEmail(options: EmailOptions): Promise<void> {
        if (!this.sesClient) {
            logger.error('SES is not initialized, retrying...');
            this.initializeSES();

            if (!this.sesClient) {
                logger.error('SES initialization failed');
                throw new Error('SES service unavailable');
            }
        }

        try {
            const params: SendEmailCommandInput = {
                Source: `${sesConfig.fromName} <${sesConfig.fromEmail}>`,
                Destination: {
                    ToAddresses: [options.to],
                },
                Message: {
                    Subject: {
                        Data: options.subject,
                        Charset: 'UTF-8',
                    },
                    Body: {
                        Html: {
                            Data: options.htmlContent,
                            Charset: 'UTF-8',
                        },
                    },
                },
                ReplyToAddresses: options.replyTo
                    ? [options.replyTo]
                    : undefined,
            };

            const command = new SendEmailCommand(params);
            await this.sesClient.send(command);

            logger.info('Email sent successfully', {
                to: options.to,
                subject: options.subject,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to send email via SES', {
                error: message,
                to: options.to,
            });
            throw new Error('Failed to send email');
        }
    }

    /**
     * Send subscription confirmation email
     */
    async sendSubscriptionConfirmation(
        email: string,
        htmlContent: string,
    ): Promise<void> {
        await this.sendEmail({
            to: email,
            subject: 'Subscription Confirmed - Souli',
            htmlContent,
        });
    }

    /**
     * Send subscription renewal reminder email
     */
    async sendSubscriptionReminder(
        email: string,
        htmlContent: string,
    ): Promise<void> {
        await this.sendEmail({
            to: email,
            subject:
                'Your Souli Subscription is Expiring Soon - Action Required',
            htmlContent,
        });
    }

    /**
     * Send subscription cancellation email
     */
    async sendSubscriptionCancelled(
        email: string,
        htmlContent: string,
    ): Promise<void> {
        await this.sendEmail({
            to: email,
            subject: 'Subscription Cancelled - Souli',
            htmlContent,
        });
    }

    /**
     * Send payment success email (invoice)
     */
    async sendPaymentSuccess(
        email: string,
        htmlContent: string,
    ): Promise<void> {
        await this.sendEmail({
            to: email,
            subject: 'Payment Received - Souli Invoice',
            htmlContent,
        });
    }

    /**
     * Send payment failed email
     */
    async sendPaymentFailed(email: string, htmlContent: string): Promise<void> {
        await this.sendEmail({
            to: email,
            subject: 'Payment Failed - Action Required - Souli',
            htmlContent,
        });
    }

    /**
     * Send batch emails (for reminders, etc.)
     */
    async sendBatchEmails(
        emails: Array<{ to: string; subject: string; htmlContent: string }>,
    ): Promise<{ successful: number; failed: number }> {
        let successful = 0;
        let failed = 0;

        for (const emailConfig of emails) {
            try {
                await this.sendEmail({
                    to: emailConfig.to,
                    subject: emailConfig.subject,
                    htmlContent: emailConfig.htmlContent,
                });
                successful++;
            } catch (error) {
                logger.warn('Failed to send batch email', {
                    to: emailConfig.to,
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                });
                failed++;
            }
        }

        logger.info('Batch email sending completed', {
            successful,
            failed,
            total: emails.length,
        });

        return { successful, failed };
    }

    /**
     * Get SES client for custom operations
     */
    getClient(): SESClient | undefined {
        return this.sesClient;
    }
}

export const paymentEmailService = PaymentEmailService.getInstance();
