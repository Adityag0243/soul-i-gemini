import logger from '../core/logger';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        log: ['query', 'error', 'warn'],
    });

if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

export async function connectDB() {
    try {
        // Test the connection
        await prisma.$connect();
        logger.info('Prisma connected to PostgreSQL database');
    } catch (err) {
        logger.error('Prisma connection error');
        logger.error(err);
        process.exit(1);
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        await prisma.$disconnect();
        logger.info('Prisma disconnected due to app termination');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await prisma.$disconnect();
        logger.info('Prisma disconnected due to app termination');
        process.exit(0);
    });
}
