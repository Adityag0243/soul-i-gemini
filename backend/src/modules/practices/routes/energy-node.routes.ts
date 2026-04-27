import { Router } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import * as EnergyNodeController from '../controllers/energy-node.controller';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/energy-nodes',
    summary: 'List Energy Nodes',
    description: 'Retrieve all active energy nodes (energy states).',
    tags: ['Practices - Energy Nodes'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Energy nodes retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/',
    authMiddleware,
    asyncHandler(EnergyNodeController.getAllNodes),
);

registry.registerPath({
    method: 'get',
    path: '/energy-nodes/{id}',
    summary: 'Get Energy Node by ID',
    description: 'Retrieve a single energy node with its associated practices.',
    tags: ['Practices - Energy Nodes'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Energy node retrieved' },
        401: { description: 'Unauthorized' },
        404: { description: 'Energy node not found' },
    },
});

router.get(
    '/:id',
    authMiddleware,
    asyncHandler(EnergyNodeController.getNodeById),
);

export default router;
