import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { sesConfig } from '../../config';
import logger from '../../core/logger';
import {
    getEmailVerificationOtpTemplate,
    getEmailVerificationOtpTextTemplate,
} from '../template/email-verification.template';

interface EmailOptions {
    to: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
}

class EmailVerificationEmailService {
    private static instance: EmailVerificationEmailService;
    private sesClient: SESClient | undefined;

    private constructor() {
        this.initializeSES();
    }

    public static getInstance(): EmailVerificationEmailService {
        if (!EmailVerificationEmailService.instance) {
            EmailVerificationEmailService.instance =
                new EmailVerificationEmailService();
        }
        return EmailVerificationEmailService.instance;
    }

    private initializeSES(): void {
        try {
            this.sesClient = new SESClient({
                region: sesConfig.awsRegion,
                credentials: {
                    accessKeyId: sesConfig.awsAccessKeyId,
                    secretAccessKey: sesConfig.awsSecretAccessKey,
                },
            });
            logger.info(
                'Email verification SES client initialized successfully',
            );
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to initialize email verification SES client', {
                error: message,
            });
        }
    }

    private async sendEmail(options: EmailOptions): Promise<void> {
        if (!this.sesClient) {
            logger.error(
                'Email verification SES is not initialized, retrying...',
            );
            this.initializeSES();

            if (!this.sesClient) {
                logger.error('Email verification SES initialization failed');
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
                        Text: options.textContent
                            ? {
                                  Data: options.textContent,
                                  Charset: 'UTF-8',
                              }
                            : undefined,
                    },
                },
            };

            const command = new SendEmailCommand(params);
            await this.sesClient.send(command);

            logger.info('Email verification email sent successfully', {
                to: options.to,
                subject: options.subject,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to send email verification email via SES', {
                error: message,
                to: options.to,
            });
            throw new Error('Failed to send email verification email');
        }
    }

    async sendVerificationOtp(params: {
        email: string;
        name: string;
        otp: string;
        expiryMinutes: number;
    }): Promise<void> {
        await this.sendEmail({
            to: params.email,
            subject: 'Verify your email',
            htmlContent: getEmailVerificationOtpTemplate({
                name: params.name,
                otp: params.otp,
                expiryMinutes: params.expiryMinutes,
                brandName: sesConfig.fromName,
                supportEmail: sesConfig.fromEmail,
            }),
            textContent: getEmailVerificationOtpTextTemplate({
                name: params.name,
                otp: params.otp,
                expiryMinutes: params.expiryMinutes,
                brandName: sesConfig.fromName,
                supportEmail: sesConfig.fromEmail,
            }),
        });
    }
}

export const emailVerificationEmailService =
    EmailVerificationEmailService.getInstance();
