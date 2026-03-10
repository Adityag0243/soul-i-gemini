import { SuccessMsgResponse } from '../../core/api-response';
import { asyncHandler } from '../../core/async-handler';
import KeystoreRepo from '../../database/repositories/keystore.repo';
import { Router } from 'express';
import { ProtectedRequest } from '../../types/app-requests';
import { clearCookies } from '../../core/cookie-utils';
import authMiddleware from '../../middlewares/auth.middleware';
import { registry } from '../../docs/swagger';

registry.registerPath({
  method: 'delete',
  path: '/auth/signout',
  summary: 'User Signout',
  description: 'Logout and invalidate the current session. Requires API key and Bearer JWT.',
  tags: ['Auth'],
  security: [{ apiKey: [], bearerAuth: [] }],
  responses: {
    200: {
      description: 'Logout success',
    },
    401: {
      description: 'Invalid or missing access token',
    },
    403: {
      description: 'Missing or invalid API key',
    },
  },
});

const router = Router();

router.use(authMiddleware);

router.delete(
    '/',
    asyncHandler(async (req: ProtectedRequest, res) => {
        await KeystoreRepo.remove(req.keystore.id);
        // remove cookies
        clearCookies(res);
        new SuccessMsgResponse('Logout Success').send(res);
    }),
);

export default router;
