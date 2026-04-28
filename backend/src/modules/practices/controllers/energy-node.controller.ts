import { Response } from 'express';
import { ProtectedRequest } from '../../../types/app-requests';
import { SuccessResponse } from '../../../core/api-response';
import * as energyNodeService from '../services/energy-node.service';

export async function getAllNodes(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const nodes = await energyNodeService.getAllNodes();
    new SuccessResponse('Energy nodes retrieved', { nodes, count: nodes.length }).send(res);
}

export async function getNodeById(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const node = await energyNodeService.getNodeById(req.params.id);
    new SuccessResponse('Energy node retrieved', { node }).send(res);
}
