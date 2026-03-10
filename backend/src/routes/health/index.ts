import { SuccessMsgResponse } from '../../core/api-response';
import { Router } from 'express';
import { registry } from '../../docs/swagger';

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Health check',
  description: 'Check if the server is running. No authentication required.',
  tags: ['Health'],
  security: [],
  responses: {
    200: {
      description: 'The server is healthy and running.',
    },
  },
});

const router = Router();

router.get('/', async (_req, res) => {
    new SuccessMsgResponse('The server is healthy and running.').send(res);
});

export default router;
