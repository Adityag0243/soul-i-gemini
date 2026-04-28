import crypto from 'crypto';
import argon2 from 'argon2';
import { OAuth2Client } from 'google-auth-library';
import {
    AuthProvider,
    MobileOtpIntent,
    PaymentProvider,
    Prisma,
    RoleCode,
    SubscriptionStatus,
    User,
} from '@prisma/client';
import { prisma } from '../../../database';
import { googleConfig } from '../../../config';
import {
    BadRequestError,
    AuthFailureError,
    InternalError,
    NotFoundError,
    TooManyRequestsError,
} from '../../../core/api-error';
import { createTokens, validateTokenData } from '../../../core/auth-utils';
import JWT from '../../../core/jwt-utils';
import AuthIdentityRepo from '../repositories/auth-identity.repo';
import AuthTokenRepo from '../repositories/auth-token.repo';
import MobileOtpRepo from '../repositories/mobile-otp.repo';
import {
    verifyAppleIdentityToken,
    AppleUserPayload,
} from './apple-token.service';
import { subscriptionRepository } from '../../../database/repositories/subscription.repo';
import stripeGateway from '../../../infrastructure/paymentGateways/stripe.gateway';
import razorpayGateway from '../../../infrastructure/paymentGateways/razorpay.gateway';
import logger from '../../../core/logger';
import { passwordResetEmailService } from '../../../infrastructure/email/password-reset-email.service';
import { emailVerificationEmailService } from '../../../infrastructure/email/email-verification.service';
import { smsService } from '../../../infrastructure/sms/sms.service';
import {
    AuthResponseDto,
    AnonymousAuthResponseDto,
    GoogleUserPayload,
} from '../dto/auth.dto';
import { UserDto } from '../../users/dto/user.dto';
import {
    serializeUserForAuth,
    serializeUserById,
} from '../../users/serializers/user.serializer';
import {
    EmailRegisterInput,
    EmailLoginInput,
    GoogleLoginInput,
    AnonymousLoginInput,
    SouliKeyRestoreInput,
    ForgotPasswordRequestInput,
    ForgotPasswordVerifyInput,
    ForgotPasswordResetInput,
    EmailVerifyConfirmInput,
    MobileOtpSendInput,
    MobileOtpVerifyInput,
    AppleLoginInput,
    ResetJourneyInput,
    EraseAllDataInput,
} from '../schemas/auth.schema';
import { TokenType } from '@prisma/client';

// Google OAuth client
const googleClient = new OAuth2Client(googleConfig.clientId);

// Generate a random Souli Key (6 characters for anonymous access)
function generateSouliKey(): string {
    return crypto.randomBytes(24).toString('base64url').slice(0, 6);
}

// generate access and refresh token keys
function generateTokenKeys(): {
    accessTokenKey: string;
    refreshTokenKey: string;
} {
    return {
        accessTokenKey: crypto.randomBytes(64).toString('hex'),
        refreshTokenKey: crypto.randomBytes(64).toString('hex'),
    };
}

// hash password using Argon2
async function hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64MB
        timeCost: 3,
        parallelism: 4,
    });
}

// verify password using Argon2
async function verifyPassword(
    password: string,
    hash: string,
): Promise<boolean> {
    try {
        return await argon2.verify(hash, password);
    } catch {
        return false;
    }
}

const PASSWORD_RESET_OTP_EXPIRY_MINUTES = 10;
const PASSWORD_RESET_SESSION_EXPIRY_MINUTES = 15;
const PASSWORD_RESET_SECRET =
    process.env.PASSWORD_RESET_SECRET ||
    process.env.JWT_PRIVATE_KEY ||
    'souli-password-reset';

// Email verification constants. Rate limit is "3 per hour per userId" per
// BACKEND_API.md §20; counted via AuthToken rows of EMAIL_VERIFICATION type.
// Phase 16.8 will swap this for centralized rate-limit middleware.
const EMAIL_VERIFY_OTP_EXPIRY_MINUTES = 10;
const EMAIL_VERIFY_RATE_LIMIT_COUNT = 3;
const EMAIL_VERIFY_RATE_LIMIT_WINDOW_MINUTES = 60;
const EMAIL_VERIFY_SECRET =
    process.env.EMAIL_VERIFY_SECRET ||
    process.env.JWT_PRIVATE_KEY ||
    'souli-email-verify';

// Mobile OTP constants (BACKEND_API.md §4.21–4.22, §20).
// 5 minute OTP expiry per the doc's `expiresInSeconds: 300`.
// 60 second resend cooldown per `resendAvailableInSeconds: 60`.
// 5 sends/hr per mobileNumber. 5 wrong tries → OTP_TOO_MANY_ATTEMPTS.
const MOBILE_OTP_EXPIRY_MINUTES = 5;
const MOBILE_OTP_RESEND_COOLDOWN_SECONDS = 60;
const MOBILE_OTP_RATE_LIMIT_COUNT = 5;
const MOBILE_OTP_RATE_LIMIT_WINDOW_MINUTES = 60;
const MOBILE_OTP_MAX_ATTEMPTS = 5;
const MOBILE_OTP_SECRET =
    process.env.MOBILE_OTP_SECRET ||
    process.env.JWT_PRIVATE_KEY ||
    'souli-mobile-otp';

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function hashResetToken(value: string): string {
    return crypto
        .createHash('sha256')
        .update(`${PASSWORD_RESET_SECRET}:${value}`)
        .digest('hex');
}

function hashResetOtp(userId: number, email: string, otp: string): string {
    return hashResetToken(`otp:${userId}:${normalizeEmail(email)}:${otp}`);
}

function hashResetSessionToken(resetToken: string): string {
    return hashResetToken(`session:${resetToken}`);
}

function generateResetOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
}

function hashEmailVerifyOtp(
    userId: number,
    email: string,
    otp: string,
): string {
    return crypto
        .createHash('sha256')
        .update(
            `${EMAIL_VERIFY_SECRET}:verify:${userId}:${normalizeEmail(email)}:${otp}`,
        )
        .digest('hex');
}

function normalizeMobile(mobileNumber: string): string {
    return mobileNumber.trim();
}

function hashMobileOtp(mobileNumber: string, otp: string): string {
    return crypto
        .createHash('sha256')
        .update(`${MOBILE_OTP_SECRET}:${normalizeMobile(mobileNumber)}:${otp}`)
        .digest('hex');
}

function generateResetSessionToken(): string {
    return crypto.randomBytes(32).toString('base64url');
}

type DeletedJourneyCounts = {
    chatMessages: number;
    chatSessions: number;
    emotionalStates: number;
    dailyCheckins: number;
    practiceFeedbacks: number;
    crisisEvents: number;
    analyticsEvents: number;
    referrals: number;
};

async function cancelActiveSubscription(userId: number): Promise<void> {
    const activeSubscription =
        await subscriptionRepository.getActiveSubscriptionByUserId(userId);

    if (
        !activeSubscription ||
        !activeSubscription.provider ||
        !activeSubscription.providerSubscriptionId
    ) {
        return;
    }

    if (activeSubscription.provider === PaymentProvider.STRIPE) {
        await stripeGateway.cancelSubscription(
            activeSubscription.providerSubscriptionId,
        );
    } else if (activeSubscription.provider === PaymentProvider.RAZORPAY) {
        await razorpayGateway.cancelSubscription(
            activeSubscription.providerSubscriptionId,
            { cancel_at_cycle_end: false },
        );
    }

    await subscriptionRepository.updateSubscriptionStatus(
        activeSubscription.id,
        SubscriptionStatus.CANCELED,
    );
}

async function deleteJourneyDataWithTx(
    tx: Prisma.TransactionClient,
    userId: number,
): Promise<DeletedJourneyCounts> {
    const sessions = await tx.chatSession.findMany({
        where: { userId },
        select: { id: true },
    });

    const sessionIds = sessions.map((session) => session.id);

    const [
        messagesDeleted,
        sessionsDeleted,
        emotionalStatesDeleted,
        dailyCheckinsDeleted,
        practiceFeedbacksDeleted,
        crisisEventsDeleted,
        analyticsEventsDeleted,
        referralsDeleted,
    ] = await Promise.all([
        sessionIds.length
            ? tx.chatMessage.deleteMany({
                  where: { sessionId: { in: sessionIds } },
              })
            : Promise.resolve({ count: 0 }),
        tx.chatSession.deleteMany({
            where: { userId },
        }),
        tx.emotionalState.deleteMany({
            where: { userId },
        }),
        tx.dailyCheckin.deleteMany({
            where: { userId },
        }),
        tx.practiceFeedback.deleteMany({
            where: { userId },
        }),
        tx.crisisEvent.deleteMany({
            where: { userId },
        }),
        tx.analyticsEvent.deleteMany({
            where: { userId },
        }),
        tx.referral.deleteMany({
            where: {
                OR: [{ referrerUserId: userId }, { referredUserId: userId }],
            },
        }),
    ]);

    return {
        chatMessages: messagesDeleted.count,
        chatSessions: sessionsDeleted.count,
        emotionalStates: emotionalStatesDeleted.count,
        dailyCheckins: dailyCheckinsDeleted.count,
        practiceFeedbacks: practiceFeedbacksDeleted.count,
        crisisEvents: crisisEventsDeleted.count,
        analyticsEvents: analyticsEventsDeleted.count,
        referrals: referralsDeleted.count,
    };
}

async function deleteJourneyData(
    userId: number,
): Promise<DeletedJourneyCounts> {
    return prisma.$transaction(async (tx) =>
        deleteJourneyDataWithTx(tx, userId),
    );
}

// verify google id token and extract user info
async function verifyGoogleToken(idToken: string): Promise<GoogleUserPayload> {
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: googleConfig.clientId,
        });
        const payload = ticket.getPayload();

        if (!payload || !payload.sub) {
            throw new AuthFailureError('Invalid Google token');
        }

        return {
            sub: payload.sub,
            email: payload.email,
            email_verified: payload.email_verified,
            name: payload.name,
            picture: payload.picture,
            given_name: payload.given_name,
            family_name: payload.family_name,
        };
    } catch (error) {
        logger.error('Google token verification failed:', error);
        throw new AuthFailureError('Invalid Google token');
    }
}

// User serialization is centralized in modules/users/serializers/user.serializer
// — call serializeUserForAuth(user) which loads identities and builds the
// canonical UserDto (D3) so every auth response shares one shape.

// create user with role and keystore in a transaction

async function createUserWithSession(
    userData: {
        name?: string;
        email?: string;
        password?: string;
        verified?: boolean;
    },
    roleCode: RoleCode = RoleCode.USER,
): Promise<{
    user: User & { roles: { role: { id: number; code: RoleCode } }[] };
    keystore: { primaryKey: string; secondaryKey: string };
}> {
    const { accessTokenKey, refreshTokenKey } = generateTokenKeys();

    const role = await prisma.role.findUnique({
        where: { code: roleCode },
    });

    if (!role) {
        throw new InternalError('Role must be defined');
    }

    const result = await prisma.$transaction(async (tx) => {
        // create user
        const user = await tx.user.create({
            data: {
                name: userData.name ?? null,
                email: userData.email?.toLowerCase() ?? null,
                password: userData.password ?? null,
                verified: userData.verified ?? false,
            },
        });

        // create user-role relation
        await tx.userRoleRelation.create({
            data: {
                userId: user.id,
                roleId: role.id,
            },
        });

        // create keystore
        await tx.keystore.create({
            data: {
                clientId: user.id,
                primaryKey: accessTokenKey,
                secondaryKey: refreshTokenKey,
            },
        });

        // get user with roles
        const userWithRoles = await tx.user.findUnique({
            where: { id: user.id },
            include: {
                roles: {
                    include: {
                        role: {
                            select: {
                                id: true,
                                code: true,
                            },
                        },
                    },
                },
            },
        });

        return {
            user: userWithRoles!,
            keystore: {
                primaryKey: accessTokenKey,
                secondaryKey: refreshTokenKey,
            },
        };
    });

    return result;
}

// create keystore session for existing user

async function createSession(
    userId: number,
): Promise<{ primaryKey: string; secondaryKey: string }> {
    const { accessTokenKey, refreshTokenKey } = generateTokenKeys();

    await prisma.keystore.create({
        data: {
            clientId: userId,
            primaryKey: accessTokenKey,
            secondaryKey: refreshTokenKey,
        },
    });

    return {
        primaryKey: accessTokenKey,
        secondaryKey: refreshTokenKey,
    };
}

// auth service with methods for registration, login, and session management

// register user with email and password

export async function registerWithEmail(
    input: EmailRegisterInput,
): Promise<AuthResponseDto> {
    const { name, email, password } = input;
    const normalizedEmail = normalizeEmail(email);

    const existingIdentity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        normalizedEmail,
    );
    if (existingIdentity) {
        throw new BadRequestError('User already registered with this email');
    }

    const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
    });

    if (existingUser) {
        throw new BadRequestError('User already registered with this email');
    }

    const passwordHash = await hashPassword(password);
    const { user, keystore } = await createUserWithSession({
        name,
        email,
        verified: false,
    });

    // create auth identity
    await AuthIdentityRepo.create({
        userId: user.id,
        provider: AuthProvider.EMAIL,
        email: normalizedEmail,
        passwordHash,
        emailVerified: false,
    });

    // generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: await serializeUserForAuth(user),
        tokens,
    };
}

// login with email and password

export async function loginWithEmail(
    input: EmailLoginInput,
): Promise<AuthResponseDto> {
    const { email, password } = input;
    const normalizedEmail = normalizeEmail(email);

    // find auth identity
    const identity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        normalizedEmail,
    );

    if (!identity || !identity.passwordHash) {
        throw new AuthFailureError('Invalid email or password');
    }

    // verify password
    const isValid = await verifyPassword(password, identity.passwordHash);
    if (!isValid) {
        throw new AuthFailureError('Invalid email or password');
    }

    // get user with roles
    const user = await prisma.user.findUnique({
        where: { id: identity.userId },
        include: {
            roles: {
                include: {
                    role: {
                        select: {
                            id: true,
                            code: true,
                        },
                    },
                },
            },
        },
    });

    if (!user || !user.status) {
        throw new AuthFailureError('User account is disabled');
    }

    // create new session
    const keystore = await createSession(user.id);

    // generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: await serializeUserForAuth(user),
        tokens,
    };
}

// login/register with Google

export async function loginWithGoogle(
    input: GoogleLoginInput,
): Promise<AuthResponseDto> {
    const { idToken } = input;

    const googleUser = await verifyGoogleToken(idToken);

    let identity = await AuthIdentityRepo.findByProviderAndAccountId(
        AuthProvider.GOOGLE,
        googleUser.sub,
    );

    let user: User & { roles: { role: { id: number; code: RoleCode } }[] };
    let keystore: { primaryKey: string; secondaryKey: string };

    if (identity) {
        const existingUser = await prisma.user.findUnique({
            where: { id: identity.userId },
            include: {
                roles: {
                    include: {
                        role: {
                            select: {
                                id: true,
                                code: true,
                            },
                        },
                    },
                },
            },
        });

        if (!existingUser || !existingUser.status) {
            throw new AuthFailureError('User account is disabled');
        }

        user = existingUser;
        keystore = await createSession(user.id);
    } else {
        // new user - register
        const result = await createUserWithSession({
            name: googleUser.name,
            email: googleUser.email,
            verified: googleUser.email_verified ?? false,
        });

        user = result.user;
        keystore = result.keystore;

        // create auth identity
        await AuthIdentityRepo.create({
            userId: user.id,
            provider: AuthProvider.GOOGLE,
            email: googleUser.email,
            emailVerified: googleUser.email_verified ?? false,
            providerAccountId: googleUser.sub,
        });
    }

    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: await serializeUserForAuth(user),
        tokens,
    };
}

// Sign in with Apple. Verifies the identity token against Apple's JWKs, then
// either logs in an existing user (matched by Apple sub) or registers a new
// one. Apple only sends `email` on first authorization, so on existing logins
// the user is found by sub regardless of whether email is present. fullName
// also only arrives on first authorization — persisted to User on registration.
export async function loginWithApple(
    input: AppleLoginInput,
): Promise<AuthResponseDto> {
    const appleUser: AppleUserPayload = await verifyAppleIdentityToken(
        input.identityToken,
        { nonce: input.nonce },
    );

    let identity = await AuthIdentityRepo.findByProviderAndAccountId(
        AuthProvider.APPLE,
        appleUser.sub,
    );

    let user: User & { roles: { role: { id: number; code: RoleCode } }[] };
    let keystore: { primaryKey: string; secondaryKey: string };

    if (identity) {
        const existingUser = await prisma.user.findUnique({
            where: { id: identity.userId },
            include: {
                roles: {
                    include: {
                        role: { select: { id: true, code: true } },
                    },
                },
            },
        });
        if (!existingUser || !existingUser.status) {
            throw new AuthFailureError('User account is disabled');
        }
        user = existingUser;
        keystore = await createSession(user.id);
    } else {
        // First-time Apple login. Build a display name from fullName if Apple
        // sent it (only on this very first authorization for this app).
        const displayName = [
            input.fullName?.givenName,
            input.fullName?.familyName,
        ]
            .filter((p) => p && p.trim().length > 0)
            .join(' ')
            .trim();

        const result = await createUserWithSession({
            name: displayName.length > 0 ? displayName : undefined,
            email: appleUser.email,
            verified: appleUser.emailVerified,
        });
        user = result.user;
        keystore = result.keystore;

        await AuthIdentityRepo.create({
            userId: user.id,
            provider: AuthProvider.APPLE,
            email: appleUser.email,
            emailVerified: appleUser.emailVerified,
            providerAccountId: appleUser.sub,
        });
    }

    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: await serializeUserForAuth(user),
        tokens,
    };
}

// Anonymous login - creates a new anonymous user with a Souli Key

export async function loginAnonymous(
    input: AnonymousLoginInput,
): Promise<AnonymousAuthResponseDto> {
    const souliKey = generateSouliKey();
    const souliKeyHash = await hashPassword(souliKey);

    // create user with session
    const { user, keystore } = await createUserWithSession({
        name: input.name ?? undefined,
        verified: false,
    });

    // create auth identity
    await AuthIdentityRepo.create({
        userId: user.id,
        provider: AuthProvider.ANONYMOUS,
        souliKeyHash,
    });

    // generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: await serializeUserForAuth(user),
        tokens,
        souliKey, // Return only once - user must save this!
    };
}

export async function refreshTokenPair(
    accessToken: string,
    refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
    const accessTokenPayload = await JWT.decode(accessToken);
    validateTokenData(accessTokenPayload);

    const userId = parseInt(accessTokenPayload.sub, 10);
    if (isNaN(userId)) {
        throw new AuthFailureError('Invalid user ID in token');
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
    });

    if (!user || !user.status) {
        throw new AuthFailureError('User not registered');
    }

    const refreshTokenPayload = await JWT.validate(refreshToken);
    validateTokenData(refreshTokenPayload);

    if (accessTokenPayload.sub !== refreshTokenPayload.sub) {
        throw new AuthFailureError('Invalid access token');
    }

    const keystore = await prisma.keystore.findFirst({
        where: {
            clientId: user.id,
            primaryKey: accessTokenPayload.prm,
            secondaryKey: refreshTokenPayload.prm,
        },
    });

    if (!keystore) {
        throw new AuthFailureError('Invalid access token');
    }

    await prisma.keystore.delete({
        where: { id: keystore.id },
    });

    const newSession = await createSession(user.id);

    return createTokens(user, newSession.primaryKey, newSession.secondaryKey);
}

export async function requestPasswordResetOtp(
    input: ForgotPasswordRequestInput,
): Promise<{ message: string }> {
    const normalizedEmail = normalizeEmail(input.email);
    const identity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        normalizedEmail,
    );

    if (!identity || !identity.passwordHash) {
        logger.info(
            'Password reset requested for unknown or unsupported email',
            {
                email: normalizedEmail,
            },
        );

        return {
            message:
                'If the email exists in our system, a password reset OTP has been sent.',
        };
    }

    const user = await prisma.user.findUnique({
        where: { id: identity.userId },
    });

    if (!user) {
        return {
            message:
                'If the email exists in our system, a password reset OTP has been sent.',
        };
    }

    await AuthTokenRepo.revokeByUserAndType(user.id, TokenType.RESET_PASSWORD);

    const otp = generateResetOtp();
    const tokenHash = hashResetOtp(user.id, normalizedEmail, otp);
    const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_OTP_EXPIRY_MINUTES * 60 * 1000, // 10 minutes
    );

    await AuthTokenRepo.create({
        userId: user.id,
        tokenHash,
        tokenType: TokenType.RESET_PASSWORD,
        expiresAt,
    });

    await passwordResetEmailService.sendPasswordResetOtp({
        email: normalizedEmail,
        name: user.name || normalizedEmail,
        otp,
        expiryMinutes: PASSWORD_RESET_OTP_EXPIRY_MINUTES,
    });

    return {
        message:
            'If the email exists in our system, a password reset OTP has been sent.',
    };
}

export async function verifyPasswordResetOtp(
    input: ForgotPasswordVerifyInput,
): Promise<{ resetToken: string; expiresInSeconds: number }> {
    const normalizedEmail = normalizeEmail(input.email);
    const identity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        normalizedEmail,
    );

    if (!identity || !identity.passwordHash) {
        throw new AuthFailureError('Invalid or expired OTP');
    }

    const activeToken = await AuthTokenRepo.findActiveByUserAndType(
        identity.userId,
        TokenType.RESET_PASSWORD,
    );

    if (!activeToken) {
        throw new AuthFailureError('Invalid or expired OTP');
    }

    const expectedHash = hashResetOtp(
        identity.userId,
        normalizedEmail,
        input.otp,
    );

    if (activeToken.tokenHash !== expectedHash) {
        throw new AuthFailureError('Invalid or expired OTP');
    }

    await AuthTokenRepo.revokeByHash(activeToken.tokenHash);

    const resetToken = generateResetSessionToken();
    const resetTokenHash = hashResetSessionToken(resetToken);
    const expiresAt = new Date(
        Date.now() + PASSWORD_RESET_SESSION_EXPIRY_MINUTES * 60 * 1000,
    );

    await AuthTokenRepo.create({
        userId: identity.userId,
        tokenHash: resetTokenHash,
        tokenType: TokenType.RESET_PASSWORD,
        expiresAt,
    });

    return {
        resetToken,
        expiresInSeconds: PASSWORD_RESET_SESSION_EXPIRY_MINUTES * 60,
    };
}

export async function resetPassword(
    input: ForgotPasswordResetInput,
): Promise<{ message: string }> {
    const resetTokenHash = hashResetSessionToken(input.resetToken);
    const resetSession = await AuthTokenRepo.findActiveByHash(
        TokenType.RESET_PASSWORD,
        resetTokenHash,
    );

    if (!resetSession) {
        throw new AuthFailureError('Invalid or expired reset token');
    }

    const user = await prisma.user.findUnique({
        where: { id: resetSession.userId },
    });

    if (!user) {
        throw new AuthFailureError('Invalid or expired reset token');
    }

    const identity = await AuthIdentityRepo.findByProviderAndEmail(
        AuthProvider.EMAIL,
        normalizeEmail(user.email || ''),
    );

    if (!identity || !identity.passwordHash) {
        throw new AuthFailureError(
            'Password login not available for this account',
        );
    }

    const newPasswordHash = await hashPassword(input.newPassword);

    await prisma.$transaction(async (tx) => {
        await tx.authIdentity.update({
            where: { id: identity.id },
            data: { passwordHash: newPasswordHash },
        });

        await tx.user.update({
            where: { id: user.id },
            data: { password: newPasswordHash },
        });

        await tx.keystore.deleteMany({
            where: { clientId: user.id },
        });

        await tx.authToken.updateMany({
            where: {
                userId: user.id,
                tokenType: TokenType.RESET_PASSWORD,
            },
            data: {
                revoked: true,
            },
        });
    });

    return {
        message:
            'Password reset successfully. Please sign in with your new password.',
    };
}

// Email verification — request OTP. Caller is the authenticated user.
// Sends a 6-digit code to User.email. 3-per-hour rate limit per userId.
export async function requestEmailVerificationOtp(
    userId: number,
): Promise<{ message: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        throw new AuthFailureError('User not found');
    }

    if (!user.email) {
        throw new BadRequestError('No email on file for this account');
    }

    if (user.verified) {
        throw new BadRequestError('Email already verified');
    }

    const windowStart = new Date(
        Date.now() - EMAIL_VERIFY_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    );
    const recentSends = await AuthTokenRepo.countByUserAndTypeSince(
        userId,
        TokenType.EMAIL_VERIFICATION,
        windowStart,
    );
    if (recentSends >= EMAIL_VERIFY_RATE_LIMIT_COUNT) {
        throw new TooManyRequestsError(
            'Too many verification emails — please wait an hour',
            EMAIL_VERIFY_RATE_LIMIT_WINDOW_MINUTES * 60,
        );
    }

    await AuthTokenRepo.revokeByUserAndType(
        userId,
        TokenType.EMAIL_VERIFICATION,
    );

    const normalizedEmail = normalizeEmail(user.email);
    const otp = generateResetOtp();
    const tokenHash = hashEmailVerifyOtp(userId, normalizedEmail, otp);
    const expiresAt = new Date(
        Date.now() + EMAIL_VERIFY_OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    await AuthTokenRepo.create({
        userId,
        tokenHash,
        tokenType: TokenType.EMAIL_VERIFICATION,
        expiresAt,
    });

    await emailVerificationEmailService.sendVerificationOtp({
        email: normalizedEmail,
        name: user.name || normalizedEmail,
        otp,
        expiryMinutes: EMAIL_VERIFY_OTP_EXPIRY_MINUTES,
    });

    return { message: 'Verification email sent' };
}

// Email verification — confirm OTP. On success flips User.verified and the
// EMAIL identity's emailVerified atomically, then returns the fresh user DTO.
export async function confirmEmailVerification(
    userId: number,
    input: EmailVerifyConfirmInput,
): Promise<{ user: UserDto }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.email) {
        throw new AuthFailureError('Invalid or expired OTP');
    }

    const activeToken = await AuthTokenRepo.findActiveByUserAndType(
        userId,
        TokenType.EMAIL_VERIFICATION,
    );
    if (!activeToken) {
        throw new AuthFailureError('Invalid or expired OTP');
    }

    const expectedHash = hashEmailVerifyOtp(userId, user.email, input.otp);
    if (activeToken.tokenHash !== expectedHash) {
        throw new AuthFailureError('Invalid or expired OTP');
    }

    const normalizedEmail = normalizeEmail(user.email);

    await prisma.$transaction(async (tx) => {
        await tx.authToken.update({
            where: { id: activeToken.id },
            data: { revoked: true },
        });

        await tx.user.update({
            where: { id: userId },
            data: { verified: true },
        });

        // Mirror onto the EMAIL identity if one exists. Anonymous-only or
        // OAuth-only accounts may not have an EMAIL identity row.
        await tx.authIdentity.updateMany({
            where: {
                userId,
                provider: AuthProvider.EMAIL,
                email: normalizedEmail,
            },
            data: { emailVerified: true },
        });
    });

    const dto = await serializeUserById(userId);
    if (!dto) {
        throw new InternalError('Failed to load user after verification');
    }
    return { user: dto };
}

// Mobile OTP — request. Issues a 6-digit code valid for 5 minutes.
// `linkUserId` is non-null iff intent === 'link' (controller resolves auth).
// Returns the OTP record id as `requestId` — the client passes it back to
// /verify, which looks up the record by id and validates the OTP hash.
export async function sendMobileOtp(
    input: MobileOtpSendInput,
    linkUserId: number | null,
): Promise<{
    requestId: string;
    expiresInSeconds: number;
    resendAvailableInSeconds: number;
}> {
    const mobileNumber = normalizeMobile(input.mobileNumber);

    if (input.intent === 'link' && linkUserId === null) {
        throw new AuthFailureError('Authorization required for link intent');
    }

    // Resend cooldown — independent of the rate-limit window. Stops a client
    // from spamming send within the 5/hour budget by hammering once a second.
    const lastSend = await MobileOtpRepo.findMostRecentByMobile(mobileNumber);
    if (lastSend) {
        const elapsed = (Date.now() - lastSend.createdAt.getTime()) / 1000;
        if (elapsed < MOBILE_OTP_RESEND_COOLDOWN_SECONDS) {
            const wait = Math.ceil(
                MOBILE_OTP_RESEND_COOLDOWN_SECONDS - elapsed,
            );
            throw new TooManyRequestsError(
                'Please wait before requesting another OTP',
                wait,
            );
        }
    }

    const windowStart = new Date(
        Date.now() - MOBILE_OTP_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    );
    const recentSends = await MobileOtpRepo.countByMobileSince(
        mobileNumber,
        windowStart,
    );
    if (recentSends >= MOBILE_OTP_RATE_LIMIT_COUNT) {
        throw new TooManyRequestsError(
            'Too many OTP requests — please try again later',
            MOBILE_OTP_RATE_LIMIT_WINDOW_MINUTES * 60,
        );
    }

    if (input.intent === 'link') {
        const existing = await AuthIdentityRepo.findByProviderAndMobile(
            AuthProvider.MOBILE,
            mobileNumber,
        );
        if (existing && existing.userId !== linkUserId) {
            throw new BadRequestError(
                'Mobile number is already linked to another account',
            );
        }
    }

    const otp = generateResetOtp();
    const tokenHash = hashMobileOtp(mobileNumber, otp);
    const expiresAt = new Date(
        Date.now() + MOBILE_OTP_EXPIRY_MINUTES * 60 * 1000,
    );

    const record = await MobileOtpRepo.create({
        mobileNumber,
        tokenHash,
        intent:
            input.intent === 'login'
                ? MobileOtpIntent.LOGIN
                : MobileOtpIntent.LINK,
        userId: linkUserId,
        expiresAt,
    });

    await smsService.sendOtp(mobileNumber, otp);

    return {
        requestId: record.id,
        expiresInSeconds: MOBILE_OTP_EXPIRY_MINUTES * 60,
        resendAvailableInSeconds: MOBILE_OTP_RESEND_COOLDOWN_SECONDS,
    };
}

export type VerifyMobileOtpResult =
    | { kind: 'login'; auth: AuthResponseDto }
    | { kind: 'link'; linked: true };

// Mobile OTP — verify. On wrong OTP increments attempt count; the 6th wrong try
// (or beyond) returns 429 OTP_TOO_MANY_ATTEMPTS. On the success path:
//   - LOGIN intent: load existing user by mobile, or create a fresh one + MOBILE
//     identity if first-time. Returns standard AuthResponseDto.
//   - LINK intent: requires authedUserId === record.userId. Upserts the MOBILE
//     identity onto the user. Returns { linked: true }.
export async function verifyMobileOtp(
    input: MobileOtpVerifyInput,
    authedUserId: number | null,
): Promise<VerifyMobileOtpResult> {
    const record = await MobileOtpRepo.findById(input.requestId);
    if (
        !record ||
        record.revoked ||
        record.expiresAt.getTime() <= Date.now()
    ) {
        throw new AuthFailureError('Invalid or expired OTP');
    }

    if (record.attemptCount >= MOBILE_OTP_MAX_ATTEMPTS) {
        throw new TooManyRequestsError(
            'Too many wrong attempts — request a new OTP',
        );
    }

    const expectedHash = hashMobileOtp(record.mobileNumber, input.otp);
    if (record.tokenHash !== expectedHash) {
        await MobileOtpRepo.incrementAttempt(record.id);
        throw new AuthFailureError('Invalid or expired OTP');
    }

    if (record.intent === MobileOtpIntent.LINK) {
        if (!authedUserId || authedUserId !== record.userId) {
            // Defense in depth — send refused if userIds didn't match, but if
            // we got here without an auth or with a different one, treat the
            // OTP as invalid rather than leak which case it was.
            throw new AuthFailureError('Invalid or expired OTP');
        }

        await prisma.$transaction(async (tx) => {
            await tx.mobileOtp.update({
                where: { id: record.id },
                data: { revoked: true },
            });

            const existing = await tx.authIdentity.findFirst({
                where: {
                    provider: AuthProvider.MOBILE,
                    mobileNumber: record.mobileNumber,
                },
            });
            if (!existing) {
                await tx.authIdentity.create({
                    data: {
                        userId: record.userId!,
                        provider: AuthProvider.MOBILE,
                        mobileNumber: record.mobileNumber,
                        mobileVerified: true,
                    },
                });
            } else if (existing.userId !== record.userId) {
                throw new BadRequestError(
                    'Mobile number is already linked to another account',
                );
            } else {
                await tx.authIdentity.update({
                    where: { id: existing.id },
                    data: { mobileVerified: true },
                });
            }
        });

        return { kind: 'link', linked: true };
    }

    // LOGIN intent.
    const existingIdentity = await AuthIdentityRepo.findByProviderAndMobile(
        AuthProvider.MOBILE,
        record.mobileNumber,
    );

    if (existingIdentity) {
        const user = await prisma.user.findUnique({
            where: { id: existingIdentity.userId },
            include: {
                roles: {
                    include: {
                        role: { select: { id: true, code: true } },
                    },
                },
            },
        });
        if (!user || !user.status) {
            throw new AuthFailureError('User account is disabled');
        }

        await MobileOtpRepo.revoke(record.id);

        const keystore = await createSession(user.id);
        const tokens = await createTokens(
            user,
            keystore.primaryKey,
            keystore.secondaryKey,
        );

        return {
            kind: 'login',
            auth: {
                user: await serializeUserForAuth(user),
                tokens,
            },
        };
    }

    // First-time login → create user + MOBILE identity.
    const { user, keystore } = await createUserWithSession({
        verified: false,
    });
    await AuthIdentityRepo.create({
        userId: user.id,
        provider: AuthProvider.MOBILE,
        mobileNumber: record.mobileNumber,
        mobileVerified: true,
    });
    await MobileOtpRepo.revoke(record.id);

    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        kind: 'login',
        auth: {
            user: await serializeUserForAuth(user),
            tokens,
        },
    };
}

// restore anonymous session using Souli Key

export async function restoreWithSouliKey(
    input: SouliKeyRestoreInput,
): Promise<AuthResponseDto> {
    const { souliKey } = input;

    // find all anonymous identities and verify against each
    // this is necessary because humlog directly hash se search nehi karsakte
    const identities = await prisma.authIdentity.findMany({
        where: {
            provider: AuthProvider.ANONYMOUS,
            souliKeyHash: { not: null },
        },
    });

    let matchedIdentity = null;
    for (const identity of identities) {
        if (identity.souliKeyHash) {
            const isMatch = await verifyPassword(
                souliKey,
                identity.souliKeyHash,
            );
            if (isMatch) {
                matchedIdentity = identity;
                break;
            }
        }
    }

    if (!matchedIdentity) {
        throw new AuthFailureError('Invalid Souli Key');
    }

    // get user with roles
    const user = await prisma.user.findUnique({
        where: { id: matchedIdentity.userId },
        include: {
            roles: {
                include: {
                    role: {
                        select: {
                            id: true,
                            code: true,
                        },
                    },
                },
            },
        },
    });

    if (!user || !user.status) {
        throw new AuthFailureError('User account is disabled');
    }

    // create new session
    const keystore = await createSession(user.id);

    // generate tokens
    const tokens = await createTokens(
        user,
        keystore.primaryKey,
        keystore.secondaryKey,
    );

    return {
        user: await serializeUserForAuth(user),
        tokens,
    };
}

// link Google account to existing user

export async function linkGoogleAccount(
    userId: number,
    idToken: string,
): Promise<void> {
    const googleUser = await verifyGoogleToken(idToken);

    // Check if this Google account is already linked to another user
    const existingIdentity = await AuthIdentityRepo.findByProviderAndAccountId(
        AuthProvider.GOOGLE,
        googleUser.sub,
    );

    if (existingIdentity) {
        if (existingIdentity.userId === userId) {
            throw new BadRequestError(
                'Google account is already linked to your account',
            );
        }
        throw new BadRequestError(
            'Google account is already linked to another user',
        );
    }

    // check if user already has Google linked
    const hasGoogle = await AuthIdentityRepo.hasProvider(
        userId,
        AuthProvider.GOOGLE,
    );
    if (hasGoogle) {
        throw new BadRequestError('You already have a Google account linked');
    }

    // link the provider
    await AuthIdentityRepo.linkProvider(userId, {
        provider: AuthProvider.GOOGLE,
        email: googleUser.email,
        emailVerified: googleUser.email_verified ?? false,
        providerAccountId: googleUser.sub,
    });
}

// link Apple account to existing user. Mirrors linkGoogleAccount.
export async function linkAppleAccount(
    userId: number,
    input: AppleLoginInput,
): Promise<void> {
    const appleUser = await verifyAppleIdentityToken(input.identityToken, {
        nonce: input.nonce,
    });

    const existingIdentity = await AuthIdentityRepo.findByProviderAndAccountId(
        AuthProvider.APPLE,
        appleUser.sub,
    );

    if (existingIdentity) {
        if (existingIdentity.userId === userId) {
            throw new BadRequestError(
                'Apple account is already linked to your account',
            );
        }
        throw new BadRequestError(
            'Apple account is already linked to another user',
        );
    }

    const hasApple = await AuthIdentityRepo.hasProvider(
        userId,
        AuthProvider.APPLE,
    );
    if (hasApple) {
        throw new BadRequestError('You already have an Apple account linked');
    }

    await AuthIdentityRepo.linkProvider(userId, {
        provider: AuthProvider.APPLE,
        email: appleUser.email,
        emailVerified: appleUser.emailVerified,
        providerAccountId: appleUser.sub,
    });
}

// get linked providers for a user
export async function getLinkedProviders(userId: number) {
    const identities = await AuthIdentityRepo.findByUserId(userId);

    return {
        userId,
        providers: identities.map((identity) => ({
            provider: identity.provider,
            email: identity.email,
            linkedAt: identity.createdAt,
        })),
    };
}

export async function resetJourney(
    userId: number,
    _input: ResetJourneyInput,
): Promise<{ message: string; deletedCounts: DeletedJourneyCounts }> {
    const deletedCounts = await deleteJourneyData(userId);

    return {
        message: 'Journey reset successfully',
        deletedCounts,
    };
}

export async function eraseAllData(
    userId: number,
    _input: EraseAllDataInput,
): Promise<{ message: string; deletedCounts: DeletedJourneyCounts }> {
    await cancelActiveSubscription(userId);

    const deletedCounts = await prisma.$transaction(async (tx) => {
        const journeyCounts = await deleteJourneyDataWithTx(tx, userId);

        await tx.keystore.deleteMany({
            where: { clientId: userId },
        });

        await tx.authToken.deleteMany({
            where: { userId },
        });

        await tx.user.delete({
            where: { id: userId },
        });

        return journeyCounts;
    });

    return {
        message: 'Account and data erased successfully',
        deletedCounts,
    };
}

async function getSessions(userId: number, currentKeystoreId: number) {
    const keystores = await prisma.keystore.findMany({
        where: { clientId: userId, status: true },
        select: {
            id: true,
            deviceName: true,
            platform: true,
            appVersion: true,
            ipAddress: true,
            lastSeenAt: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
    });

    const items = keystores.map((k) => ({
        id: k.id,
        isCurrent: k.id === currentKeystoreId,
        deviceName: k.deviceName,
        platform: k.platform,
        appVersion: k.appVersion,
        ipAddress: k.ipAddress,
        lastSeenAt: k.lastSeenAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
    }));

    return { items, total: items.length };
}

async function revokeSession(
    userId: number,
    keystoreId: number,
    currentKeystoreId: number,
): Promise<void> {
    if (keystoreId === currentKeystoreId) {
        throw new BadRequestError('Cannot revoke current session — use /auth/logout instead');
    }

    const keystore = await prisma.keystore.findFirst({
        where: { id: keystoreId, clientId: userId, status: true },
    });

    if (!keystore) {
        throw new NotFoundError('Session not found');
    }

    await prisma.keystore.delete({ where: { id: keystoreId } });
}

async function logout(keystoreId: number): Promise<void> {
    await prisma.keystore.delete({ where: { id: keystoreId } });
}

async function logoutAll(userId: number): Promise<number> {
    const result = await prisma.keystore.deleteMany({
        where: { clientId: userId },
    });
    return result.count;
}

export default {
    registerWithEmail,
    loginWithEmail,
    loginWithGoogle,
    loginAnonymous,
    refreshTokenPair,
    requestPasswordResetOtp,
    verifyPasswordResetOtp,
    resetPassword,
    requestEmailVerificationOtp,
    confirmEmailVerification,
    sendMobileOtp,
    verifyMobileOtp,
    loginWithApple,
    restoreWithSouliKey,
    linkGoogleAccount,
    linkAppleAccount,
    getLinkedProviders,
    resetJourney,
    eraseAllData,
    logout,
    logoutAll,
    getSessions,
    revokeSession,
};
