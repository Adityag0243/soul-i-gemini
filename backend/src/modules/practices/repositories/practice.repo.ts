import { Prisma } from '@prisma/client';
import { prisma } from '../../../database';

export async function findMany(filters: {
    energyNodeId?: string;
    type?: string;
    limit: number;
    offset: number;
}) {
    const where: any = { isActive: true };
    if (filters.energyNodeId) where.energyNodeId = filters.energyNodeId;
    if (filters.type) where.type = filters.type;

    const [items, total] = await Promise.all([
        prisma.practice.findMany({
            where,
            include: { energyNode: { select: { id: true, slug: true, title: true } } },
            orderBy: { title: 'asc' },
            take: filters.limit,
            skip: filters.offset,
        }),
        prisma.practice.count({ where }),
    ]);
    return { items, total };
}

export async function findRecommended(energyNodeId: string | null, limit: number) {
    const rows = await prisma.$queryRaw<
        Array<{
            id: string;
            title: string;
            type: string | null;
            description: string | null;
            duration_minutes: number | null;
            energy_node_id: string | null;
            node_slug: string | null;
            node_title: string | null;
            score: bigint;
        }>
    >(Prisma.sql`
        SELECT
            p.id,
            p.title,
            p.type,
            p.description,
            p.duration_minutes,
            p.energy_node_id,
            en.slug AS node_slug,
            en.title AS node_title,
            COALESCE(SUM(CASE pf.feedback
                WHEN 'BETTER' THEN 1
                WHEN 'SAME'   THEN 0
                WHEN 'WORSE'  THEN -1
            END), 0) AS score
        FROM practices p
        LEFT JOIN practice_feedbacks pf ON pf.practice_id = p.id
        LEFT JOIN energy_nodes en ON en.id = p.energy_node_id
        WHERE p.is_active = true
          AND (${energyNodeId}::uuid IS NULL OR p.energy_node_id = ${energyNodeId}::uuid)
        GROUP BY p.id, en.slug, en.title
        ORDER BY score DESC, p.title ASC
        LIMIT ${limit}
    `);
    return rows;
}

export async function findById(id: string) {
    return prisma.practice.findUnique({
        where: { id },
        include: { energyNode: { select: { id: true, slug: true, title: true, color: true, icon: true } } },
    });
}
