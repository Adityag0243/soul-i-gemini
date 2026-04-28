import { NotFoundError } from '../../../core/api-error';
import * as energyNodeRepo from '../repositories/energy-node.repo';

export async function getAllNodes() {
    const nodes = await energyNodeRepo.findAll();
    return nodes.map((n) => ({
        id: n.id,
        slug: n.slug,
        title: n.title,
        description: n.description,
        color: n.color,
        icon: n.icon,
    }));
}

export async function getNodeById(id: string) {
    const node = await energyNodeRepo.findById(id);
    if (!node) throw new NotFoundError('Energy node not found');
    return {
        id: node.id,
        slug: node.slug,
        title: node.title,
        description: node.description,
        color: node.color,
        icon: node.icon,
        practices: node.practices.map((p) => ({
            id: p.id,
            title: p.title,
            type: p.type,
            description: p.description,
            durationMinutes: p.durationMinutes,
        })),
    };
}
