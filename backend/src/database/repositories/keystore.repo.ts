import { Keystore } from '@prisma/client';
import { prisma } from '..';

async function create(
    clientId: number,
    primaryKey: string,
    secondaryKey: string,
): Promise<Keystore> {
    return prisma.keystore.create({
        data: {
            clientId,
            primaryKey,
            secondaryKey,
        },
    });
}

async function remove(id: number): Promise<void> {
    await prisma.keystore.delete({
        where: { id },
    });
}

async function removeByClientId(clientId: number): Promise<number> {
    const result = await prisma.keystore.deleteMany({
        where: { clientId },
    });
    return result.count;
}

async function findForKey(
    clientId: number,
    key: string,
): Promise<Keystore | null> {
    return prisma.keystore.findFirst({
        where: {
            clientId,
            primaryKey: key,
            status: true,
        },
    });
}

async function find(
    clientId: number,
    primaryKey: string,
    secondaryKey: string,
): Promise<Keystore | null> {
    return prisma.keystore.findFirst({
        where: {
            clientId,
            primaryKey,
            secondaryKey,
        },
    });
}

export default {
    create,
    remove,
    removeByClientId,
    findForKey,
    find,
};
