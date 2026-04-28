/**
 * Seed Practice table with initial content linked to energy nodes.
 * Usage: node scripts/seed-practices.cjs
 * Prerequisite: run seed-energy-nodes.cjs first.
 * Idempotent — uses upsert on title (within energy node).
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const PRACTICES = [
    // ── Scattered ──
    {
        slug: 'scattered',
        practices: [
            {
                title: '5-4-3-2-1 Grounding',
                type: 'grounding',
                description: 'A sensory awareness exercise that anchors you in the present moment by noticing 5 things you see, 4 you touch, 3 you hear, 2 you smell, and 1 you taste.',
                durationMinutes: 5,
                textScript: 'Find a comfortable position. Take a slow breath in… and out.\n\nNow look around and name 5 things you can see. Say them quietly to yourself.\n\nNext, notice 4 things you can physically feel — the chair beneath you, fabric on your skin, air temperature, your feet on the floor.\n\nListen for 3 distinct sounds. Let them arrive without searching.\n\nNotice 2 things you can smell — or imagine 2 scents you love.\n\nFinally, notice 1 thing you can taste — even if it's just the inside of your mouth.\n\nTake one more deep breath. You are here. You are present.',
            },
            {
                title: 'Single-Point Focus Breathing',
                type: 'breathwork',
                description: 'A simple breath-counting exercise to gather scattered attention into a single calm stream.',
                durationMinutes: 7,
                textScript: 'Sit comfortably and close your eyes.\n\nBreathe in through your nose for a count of 4. Hold gently for 2. Exhale slowly for 6.\n\nOn each exhale, silently count: one… two… three… up to ten. If you lose count, simply start again at one — no judgement.\n\nThe goal is not perfection. The goal is returning. Each time you come back to the count, you are strengthening focus.\n\nContinue for 5 minutes, then let the counting go and sit in stillness for a moment before opening your eyes.',
            },
            {
                title: 'Brain Dump Journaling',
                type: 'journaling',
                description: 'Write everything on your mind without structure or editing — a mental declutter on paper.',
                durationMinutes: 10,
                textScript: 'Set a timer for 10 minutes. Open a blank page.\n\nWrite everything that is in your head. Do not organize, edit, or judge. Spelling doesn't matter. Grammar doesn't matter. Just get it out.\n\nIf you run out of things to write, write "I don't know what to write" until something comes.\n\nWhen the timer goes off, read through what you wrote. Circle the 1–2 things that feel most important right now.\n\nThose are your real priorities. The rest can wait.',
            },
        ],
    },
    // ── Blocked ──
    {
        slug: 'blocked',
        practices: [
            {
                title: 'Shake & Release',
                type: 'somatic',
                description: 'A body-based practice to physically release stuck energy through intentional shaking and movement.',
                durationMinutes: 5,
                textScript: 'Stand with feet hip-width apart. Let your arms hang loose.\n\nStart gently shaking your hands. Let it spread to your arms, your shoulders, your whole upper body.\n\nNow let the shaking move to your legs. Bounce lightly. Shake your whole body for 2 minutes — awkward is fine.\n\nSlowly let the shaking wind down. Stand still. Notice the tingling, the warmth, the aliveness.\n\nTake 3 deep breaths. Energy has shifted. You are no longer the same stuck you were 5 minutes ago.',
            },
            {
                title: 'Tiny Next Step',
                type: 'cognitive',
                description: 'Break through paralysis by identifying the smallest possible action — something so small it feels almost silly.',
                durationMinutes: 5,
                textScript: 'Think of the thing you feel blocked on.\n\nNow ask: what is the absolute tiniest step I could take? Not the whole task — just the very first micro-action.\n\nOpen the document. Write one sentence. Send one text. Put on your shoes.\n\nDo only that. Nothing more. Give yourself full credit for it.\n\nAfter you finish, ask again: what's the next tiny step? You may find momentum arrives on its own.',
            },
            {
                title: 'Opposite Action',
                type: 'cognitive',
                description: 'When avoidance keeps you stuck, deliberately do the opposite of what the block tells you to do — gently and briefly.',
                durationMinutes: 10,
                textScript: 'Name what you are avoiding. Say it out loud or write it down.\n\nNotice the feeling that comes with it — dread, fear, boredom, shame. Name that too.\n\nNow set a timer for just 5 minutes. Do the thing you are avoiding for only those 5 minutes. You have permission to stop after.\n\nWhen the timer ends, pause. How do you feel? Often the anticipation was worse than the action.\n\nYou can stop here, or continue if something has loosened.',
            },
        ],
    },
    // ── Depleted ──
    {
        slug: 'depleted',
        practices: [
            {
                title: 'Restorative Breathing',
                type: 'breathwork',
                description: 'A calming 4-7-8 breathing pattern designed to activate the parasympathetic nervous system and restore energy.',
                durationMinutes: 5,
                textScript: 'Lie down or recline comfortably. Close your eyes.\n\nInhale through your nose for 4 counts. Hold gently for 7 counts. Exhale slowly through your mouth for 8 counts.\n\nRepeat this cycle 4 times.\n\nThen breathe naturally for a minute, noticing how your body feels heavier, more settled.\n\nThis is not laziness. This is recovery. Your body is doing important work right now.',
            },
            {
                title: 'Nourishment Inventory',
                type: 'journaling',
                description: 'Identify what drains you and what fills you up — then make one small swap today.',
                durationMinutes: 10,
                textScript: 'Draw a line down the middle of a page. Label the left side "Drains" and the right side "Fills."\n\nList activities, people, habits, and environments under each column. Be honest — some things you "should" enjoy might actually drain you.\n\nLook at your day today. Is there one Drain you can reduce and one Fill you can add?\n\nEven swapping 15 minutes of scrolling for 15 minutes of something that fills you can shift your energy over a week.',
            },
            {
                title: 'Legs Up the Wall',
                type: 'somatic',
                description: 'A passive restorative posture that gently improves circulation and signals deep rest to the nervous system.',
                durationMinutes: 10,
                textScript: 'Find a clear wall space. Sit sideways with one hip touching the wall, then swing your legs up as you lie back.\n\nLet your arms rest by your sides, palms up. Close your eyes.\n\nYou don't need to do anything. Just be here. Let gravity do the work.\n\nStay for 10 minutes. If thoughts come, let them pass like clouds. Your only job is to receive rest.\n\nWhen ready, bend your knees, roll to one side, and slowly sit up.',
            },
        ],
    },
    // ── Out of Control ──
    {
        slug: 'outofcontrol',
        practices: [
            {
                title: 'Cold Water Reset',
                type: 'somatic',
                description: 'A quick physiological reset using cold water on the face or wrists to activate the dive reflex and calm the nervous system.',
                durationMinutes: 3,
                textScript: 'Go to the nearest sink.\n\nRun cold water over your wrists for 30 seconds. Feel the temperature. Focus on the sensation.\n\nThen splash cold water on your face — forehead, cheeks, the back of your neck.\n\nDry off slowly. Take 3 deep breaths.\n\nThe cold activates your dive reflex, which slows your heart rate and calms the fight-or-flight response. You may notice the intensity has dropped a notch or two.',
            },
            {
                title: 'Box Breathing',
                type: 'breathwork',
                description: 'A structured 4-4-4-4 breathing pattern used by first responders to regain composure under pressure.',
                durationMinutes: 5,
                textScript: 'Sit or stand with both feet on the floor.\n\nInhale for 4 counts. Hold for 4 counts. Exhale for 4 counts. Hold empty for 4 counts.\n\nVisualize tracing a square as you breathe — up, across, down, across.\n\nRepeat for 5 minutes. The rhythm itself is the medicine. It gives your mind a pattern to follow when everything else feels chaotic.\n\nWhen finished, let your breathing return to normal. Notice what has shifted.',
            },
            {
                title: 'Name It to Tame It',
                type: 'cognitive',
                description: 'Labelling emotions with precision reduces their intensity by engaging the prefrontal cortex.',
                durationMinutes: 5,
                textScript: 'Pause wherever you are. Place one hand on your chest.\n\nAsk yourself: what am I feeling right now? Go beyond "bad" or "stressed." Try to be specific — is it rage, panic, frustration, helplessness, fear?\n\nSay the word silently or aloud: "I am feeling _____."\n\nNow ask: where do I feel it in my body? Chest tight? Jaw clenched? Stomach churning?\n\nJust naming and locating the emotion begins to reduce its power. You are not the emotion. You are the one observing it.',
            },
        ],
    },
    // ── Suppressed ──
    {
        slug: 'suppressed',
        practices: [
            {
                title: 'Body Scan',
                type: 'somatic',
                description: 'A slow, gentle scan from head to toe to reconnect with sensations you may have been shutting out.',
                durationMinutes: 10,
                textScript: 'Lie down comfortably. Close your eyes.\n\nBring attention to the top of your head. Notice any sensation — tingling, warmth, tension, nothing. All are valid.\n\nSlowly move your attention down: forehead, eyes, jaw, neck, shoulders, arms, hands, chest, belly, hips, thighs, knees, calves, feet.\n\nSpend a few breaths at each area. If you find a place that feels numb or blank, that's information too. Stay there an extra breath.\n\nWhen you reach your feet, take a full breath and feel your whole body at once. You are reconnecting.',
            },
            {
                title: 'Unsent Letter',
                type: 'journaling',
                description: 'Write a letter you will never send — to a person, a situation, or a part of yourself — to let suppressed feelings surface safely.',
                durationMinutes: 15,
                textScript: 'Choose someone or something that holds unprocessed emotion for you.\n\nWrite a letter to them. Say everything you have held back — the anger, the sadness, the confusion, the love. Do not censor yourself. No one will read this.\n\nWhen you are done, read it once. Notice what you feel.\n\nThen decide: keep it, tear it up, or burn it. The release is in the writing, not the sending.',
            },
            {
                title: 'Permission Statement',
                type: 'cognitive',
                description: 'Create a simple statement giving yourself permission to feel what you feel — counteracting the habit of emotional suppression.',
                durationMinutes: 5,
                textScript: 'Complete these sentences, either written or spoken:\n\n"I give myself permission to feel _____."\n"It is safe to feel _____."\n"I do not need to be okay right now."\n"What I feel is valid, even if others wouldn't understand."\n\nRepeat the one that resonates most, slowly, three times.\n\nSuppression is a survival skill that has served you. But right now, in this moment, you can let the guard down a little.',
            },
        ],
    },
    // ── Normal ──
    {
        slug: 'normal',
        practices: [
            {
                title: 'Gratitude Micro-Practice',
                type: 'journaling',
                description: 'A brief daily practice of naming three specific things you are grateful for to strengthen your baseline wellbeing.',
                durationMinutes: 5,
                textScript: 'Write down 3 things you are grateful for today.\n\nThe key is specificity. Not "my family" but "the way my daughter laughed at breakfast." Not "my health" but "that I could walk to work in the sunshine."\n\nSpecificity makes the brain re-experience the moment, which deepens the positive effect.\n\nDo this daily for a week and notice what shifts in how you see your days.',
            },
            {
                title: 'Mindful Walk',
                type: 'somatic',
                description: 'A slow, intentional walk where you notice sensations, surroundings, and rhythm — maintaining and deepening your balanced state.',
                durationMinutes: 15,
                textScript: 'Step outside or walk through your space slowly.\n\nFeel each footstep — heel, ball, toes. Notice the rhythm.\n\nLook around as if seeing this place for the first time. What do you notice? Colors, textures, movement, light.\n\nListen. What sounds are present that you usually filter out?\n\nThis is not exercise. This is presence. A balanced state is not the absence of practice — it is the best time to deepen your connection to the present.',
            },
            {
                title: 'Values Check-In',
                type: 'cognitive',
                description: 'When energy is balanced, reflect on whether your current actions align with your deeper values — a compass check while the seas are calm.',
                durationMinutes: 10,
                textScript: 'Write your top 3 values — the things that matter most to how you want to live. Examples: connection, creativity, honesty, growth, kindness.\n\nNow look at how you spent the last week. Rate each value 1–10: how well did your actions reflect it?\n\nPick the lowest-scoring value. What is one small thing you could do this week to bring it closer to a 7?\n\nA calm moment is the best time to steer — don't wait for a storm.',
            },
        ],
    },
    // ── Grief ──
    {
        slug: 'grief',
        practices: [
            {
                title: 'Compassionate Hand',
                type: 'somatic',
                description: 'Place your hand on your heart and offer yourself the warmth and care you would give someone you love.',
                durationMinutes: 5,
                textScript: 'Place one or both hands over your heart. Feel the warmth of your palm against your chest.\n\nSay gently to yourself:\n"This is a moment of suffering."\n"Suffering is a part of being human."\n"May I be kind to myself in this moment."\n\nLet yourself feel whatever is here. You do not need to fix it or rush past it.\n\nStay with the warmth of your hand on your heart for as long as you need.',
            },
            {
                title: 'Memory Honouring',
                type: 'journaling',
                description: 'Write about a specific memory connected to your grief — not to analyze but to honour what was and what it meant to you.',
                durationMinutes: 15,
                textScript: 'Choose one specific memory connected to your loss. Something small and vivid — a conversation, a place, a gesture, a smell.\n\nWrite it down in as much detail as you can. What did you see? What did you hear? How did it feel?\n\nLet yourself smile if it was beautiful. Let yourself cry if it hurts. Both are grief. Both are love.\n\nWhen you are done, close the page gently. You have honoured something important.',
            },
            {
                title: 'Gentle Movement',
                type: 'somatic',
                description: 'Slow, intentional stretches and movement to process grief held in the body without forcing or pushing.',
                durationMinutes: 10,
                textScript: 'Stand or sit. Take a slow breath.\n\nRaise your arms slowly overhead. Stretch gently. Lower them.\n\nRoll your shoulders back, then forward. Slowly.\n\nTurn your head left, hold, breathe. Turn right, hold, breathe.\n\nPlace your hands on your belly. Breathe into them.\n\nGrief lives in the body — tight shoulders, heavy chest, clenched jaw. You are not trying to make it leave. You are giving it space to move.\n\nContinue with any gentle movement that feels right for 5 more minutes.',
            },
        ],
    },
];

async function main() {
    let count = 0;

    for (const group of PRACTICES) {
        const node = await prisma.energyNode.findUnique({
            where: { slug: group.slug },
        });

        if (!node) {
            console.warn(`EnergyNode "${group.slug}" not found — skipping. Run seed-energy-nodes.cjs first.`);
            continue;
        }

        for (const p of group.practices) {
            const existing = await prisma.practice.findFirst({
                where: { title: p.title, energyNodeId: node.id },
            });

            if (existing) {
                await prisma.practice.update({
                    where: { id: existing.id },
                    data: {
                        type: p.type,
                        description: p.description,
                        durationMinutes: p.durationMinutes,
                        textScript: p.textScript,
                    },
                });
                console.log(`  Updated: ${p.title}`);
            } else {
                await prisma.practice.create({
                    data: {
                        energyNodeId: node.id,
                        title: p.title,
                        type: p.type,
                        description: p.description,
                        durationMinutes: p.durationMinutes,
                        textScript: p.textScript,
                    },
                });
                console.log(`  Created: ${p.title}`);
            }
            count++;
        }
        console.log(`✓ ${group.slug}: ${group.practices.length} practices`);
    }

    console.log(`\nDone — ${count} practices seeded across ${PRACTICES.length} energy nodes.`);
}

main()
    .catch((err) => {
        console.error('Seed failed:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
