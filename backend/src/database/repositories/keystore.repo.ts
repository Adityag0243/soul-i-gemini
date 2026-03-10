import { Keystore } from '@prisma/client';
import { prisma } from '..';

async function create(
    clientId: number,
    primaryKey: string,
    secondaryKey: string,
): Promise<Keystore> {
    const keystore = await prisma.keystore.create({
        data: {
            clientId,
            primaryKey,
            secondaryKey,
        },
    });

    return {
        id: keystore.id,
        clientId: keystore.clientId,
        primaryKey: keystore.primaryKey,
        secondaryKey: keystore.secondaryKey,
        status: keystore.status,
        createdAt: keystore.createdAt,
        updatedAt: keystore.updatedAt,
    };
}

async function remove(id: number): Promise<void> {
    await prisma.keystore.delete({
        where: { id },
    });
}

async function findForKey(
    clientId: number,
    key: string,
): Promise<Keystore | null> {
    const keystore = await prisma.keystore.findFirst({
        where: {
            clientId,
            primaryKey: key,
            status: true,
        },
    });

    if (!keystore) return null;

    return {
        id: keystore.id,
        clientId: keystore.clientId,
        primaryKey: keystore.primaryKey,
        secondaryKey: keystore.secondaryKey,
        status: keystore.status,
        createdAt: keystore.createdAt,
        updatedAt: keystore.updatedAt,
    };
}

async function find(
    clientId: number,
    primaryKey: string,
    secondaryKey: string,
): Promise<Keystore | null> {
    const keystore = await prisma.keystore.findFirst({
        where: {
            clientId,
            primaryKey,
            secondaryKey,
        },
    });

    if (!keystore) return null;

    return {
        id: keystore.id,
        clientId: keystore.clientId,
        primaryKey: keystore.primaryKey,
        secondaryKey: keystore.secondaryKey,
        status: keystore.status,
        createdAt: keystore.createdAt,
        updatedAt: keystore.updatedAt,
    };
}

export default {
    create,
    remove,
    findForKey,
    find,
};
