import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import * as ReferralController from '../controllers/referral.controller';
import { applyReferralSchema } from '../schemas/referral.schema';

const router = Router();

router.use(authMiddleware as unknown as RequestHandler);

// ============ GET /referrals/me ============

registry.registerPath({
    method: 'get',
    path: '/referrals/me',
    summary: 'Get My Referral Info',
    description:
        'Returns the authenticated user\'s referral code (auto-generated if none exists), shared count, converted count, and rewards earned.',
    tags: ['Referrals'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Referral info retrieved' },
        401: { description: 'Authentication required' },
    },
});

router.get('/me', asyncHandler(ReferralController.getMyReferral));

// ============ POST /referrals/apply ============

registry.registerPath({
    method: 'post',
    path: '/referrals/apply',
    summary: 'Apply a Referral Code',
    description:
        'Apply a referral code at signup. Each user can only use one referral code, and cannot use their own. The code must exist and not already be redeemed.',
    tags: ['Referrals'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: applyReferralSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Referral applied' },
        400: { description: 'Code already used, own code, or already redeemed a code' },
        401: { description: 'Authentication required' },
        404: { description: 'Referral code not found' },
    },
});

router.post(
    '/apply',
    validator(applyReferralSchema, ValidationSource.BODY),
    asyncHandler(ReferralController.applyReferral),
);

// ============ GET /referrals/leaderboard ============

registry.registerPath({
    method: 'get',
    path: '/referrals/leaderboard',
    summary: 'Referral Leaderboard',
    description:
        'Top referrers ranked by number of converted referrals. Optional ?limit=N (default 10, max 50).',
    tags: ['Referrals'],
    security: [{ apiKey: [], bearerAuth: [] }],
    parameters: [
        {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 10 },
            description: 'Number of entries (max 50)',
        },
    ],
    responses: {
        200: { description: 'Leaderboard retrieved' },
        401: { description: 'Authentication required' },
    },
});

router.get('/leaderboard', asyncHandler(ReferralController.getLeaderboard));

export default router;
