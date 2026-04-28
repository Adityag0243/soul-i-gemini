import { isProduction } from '../../config';
import { InternalError } from '../../core/api-error';
import logger from '../../core/logger';

// SMS provider stub.
//
// Q6 in plan.md is open — Twilio vs AWS SNS vs MessageBird is undecided. Until
// resolved, this stub:
//   - hard-fails in production (NODE_ENV=production) so we don't silently drop OTPs
//   - in non-prod, logs the OTP at warn level so devs can complete the verify
//     flow without a real provider wired up
//
// When Q6 is answered, replace the body of sendOtp() with the real send and
// remove the dev-only logging branch.
class SmsService {
    async sendOtp(mobileNumber: string, otp: string): Promise<void> {
        const provider = process.env.SMS_PROVIDER;

        if (!provider) {
            if (isProduction) {
                logger.error(
                    'SMS_PROVIDER is not set; refusing to send OTP in production',
                    { mobileNumber },
                );
                throw new InternalError('SMS provider not configured');
            }

            logger.warn(
                'SMS_PROVIDER not set — OTP not actually sent. Logging for local dev only.',
                { mobileNumber, otp },
            );
            return;
        }

        // TODO(Q6): wire actual provider once chosen.
        logger.error(
            `SMS_PROVIDER=${provider} is set but no implementation is wired yet`,
            { mobileNumber },
        );
        throw new InternalError(
            `SMS provider "${provider}" is not implemented yet`,
        );
    }
}

export const smsService = new SmsService();
