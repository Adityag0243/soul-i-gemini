import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { sesConfig } from '../../config';
import logger from '../../core/logger';
import {
    getPasswordResetOtpTemplate,
    getPasswordResetOtpTextTemplate,
} from '../template/password-reset.template';

interface EmailOptions {
    to: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
}

class PasswordResetEmailService {
    private static instance: PasswordResetEmailService;
    private sesClient: SESClient | undefined;

    private constructor() {
        this.initializeSES();
    }

    public static getInstance(): PasswordResetEmailService {
        if (!PasswordResetEmailService.instance) {
            PasswordResetEmailService.instance =
                new PasswordResetEmailService();
        }
        return PasswordResetEmailService.instance;
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
            logger.info('Password reset SES client initialized successfully');
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to initialize password reset SES client', {
                error: message,
            });
        }
    }

    private async sendEmail(options: EmailOptions): Promise<void> {
        if (!this.sesClient) {
            logger.error('Password reset SES is not initialized, retrying...');
            this.initializeSES();

            if (!this.sesClient) {
                logger.error('Password reset SES initialization failed');
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

            logger.info('Password reset email sent successfully', {
                to: options.to,
                subject: options.subject,
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            logger.error('Failed to send password reset email via SES', {
                error: message,
                to: options.to,
            });
            throw new Error('Failed to send password reset email');
        }
    }

    async sendPasswordResetOtp(params: {
        email: string;
        name: string;
        otp: string;
        expiryMinutes: number;
    }): Promise<void> {
        await this.sendEmail({
            to: params.email,
            subject: 'Your password reset code',
            htmlContent: getPasswordResetOtpTemplate({
                name: params.name,
                otp: params.otp,
                expiryMinutes: params.expiryMinutes,
                brandName: sesConfig.fromName,
                supportEmail: sesConfig.fromEmail,
            }),
            textContent: getPasswordResetOtpTextTemplate({
                name: params.name,
                otp: params.otp,
                expiryMinutes: params.expiryMinutes,
                brandName: sesConfig.fromName,
                supportEmail: sesConfig.fromEmail,
            }),
        });
    }
}

export const passwordResetEmailService =
    PasswordResetEmailService.getInstance();
