/**
 * Seed EnergyNode table with the 7 core energy states.
 * Usage: node scripts/seed-energy-nodes.cjs
 * Idempotent — uses upsert on slug.
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const NODES = [
    {
        slug: 'scattered',
        title: 'Scattered',
        description:
            'Your energy feels fragmented and pulled in many directions. Thoughts race, focus is difficult, and there is a sense of being overwhelmed by competing demands.',
        color: '#F59E0B',
        icon: 'wind',
    },
    {
        slug: 'blocked',
        title: 'Blocked',
        description:
            'Energy feels stuck or stagnant. There may be frustration, avoidance, or a sense that progress is impossible despite wanting to move forward.',
        color: '#EF4444',
        icon: 'shield',
    },
    {
        slug: 'depleted',
        title: 'Depleted',
        description:
            'Reserves are running low. Fatigue — physical, mental, or emotional — dominates, and even small tasks can feel disproportionately heavy.',
        color: '#6B7280',
        icon: 'battery-low',
    },
    {
        slug: 'outofcontrol',
        title: 'Out of Control',
        description:
            'Energy surges unpredictably. Emotions feel intense, reactions are strong, and there is a sense of being at the mercy of internal forces.',
        color: '#DC2626',
        icon: 'flame',
    },
    {
        slug: 'suppressed',
        title: 'Suppressed',
        description:
            'Emotions and energy are being held down or pushed away. There is numbness, disconnection, or a deliberate effort to not feel.',
        color: '#8B5CF6',
        icon: 'lock',
    },
    {
        slug: 'normal',
        title: 'Normal',
        description:
            'Energy is balanced and flowing. You feel present, reasonably calm, and able to engage with life without significant distress or numbness.',
        color: '#10B981',
        icon: 'sun',
    },
    {
        slug: 'grief',
        title: 'Grief',
        description:
            'A deep sense of loss pervades. Sadness, longing, or heaviness is present — whether from a recent event or something older surfacing again.',
        color: '#3B82F6',
        icon: 'cloud-rain',
    },
];

async function main() {
    for (const node of NODES) {
        const result = await prisma.energyNode.upsert({
            where: { slug: node.slug },
            update: {
                title: node.title,
                description: node.description,
                color: node.color,
                icon: node.icon,
            },
            create: {
                slug: node.slug,
                title: node.title,
                description: node.description,
                color: node.color,
                icon: node.icon,
            },
        });
        console.log(`EnergyNode seeded: ${result.slug} (id=${result.id})`);
    }
    console.log(`\nDone — ${NODES.length} energy nodes seeded.`);
}

main()
    .catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
