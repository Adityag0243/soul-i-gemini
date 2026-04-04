import {
    SESClient,
    SendEmailCommand,
    SendEmailCommandInput,
} from '@aws-sdk/client-ses';
import { configS3 } from '../../config';
import logger from '../../core/logger';
import crypto from 'crypto';

class SESMailClient {
    private static instance: SESMailClient;
    private sesClient: SESClient | undefined;

    private constructor() {
        this.initialiseSes();
    }

    private initialiseSes() {
        try {
            this.sesClient = new SESClient({
                region: configS3.awsRegion,
                credentials: {
                    accessKeyId: configS3.awsAccessKeyId!,
                    secretAccessKey: configS3.awsSecretAccessKey!,
                },
            });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Some unknown error.';
            logger.error('Failed to intialise SES Mail Client, ', {
                error: message,
            });
        }
    }

    public static getInstance() {
        if (!this.instance) {
            this.instance = new SESMailClient();
        }
        return this.instance;
    }

    private async sendEmail(options: {
        to: string;
        subject: string;
        htmlContent: string;
        textContent?: string;
    }) {
        if (!this.sesClient) {
            logger.error('SES is not initialised, retrying..');
            this.initialiseSes();

            if (!this.sesClient) {
                logger.error(
                    'SES initialisation failed, check for the errors.',
                );
                return;
            }
        }

        try {
            const command = new SendEmailCommand({
                Source: `${process.env.FROM_NAME || 'Souli'} <${process.env.FROM_EMAIL || 'noreply@souli.com'}>`,
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
                        ...(options.textContent
                            ? {
                                  Text: {
                                      Data: options.textContent,
                                      Charset: 'UTF-8',
                                  },
                              }
                            : {}),
                    },
                },
            } as SendEmailCommandInput);
            await this.sesClient.send(command);
            logger.info('Email sent successfully', {
                to: options.to,
                subject: options.subject,
            });
        } catch (error) {
            logger.error('Error sending email', {
                error: error instanceof Error ? error.message : 'Unknown error',
                to: options.to,
            });
            throw new Error('Failed to send verification email');
        }
    }

    generateVerificationToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }
}

export const mailClient = SESMailClient.getInstance();
