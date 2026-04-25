import { FeatureControl, FeatureKey, RoleCode } from '@prisma/client';
import { prisma } from '../../../../database';
import { AuthFailureError } from '../../../../core/api-error';
import { AuthUser } from '../../../../types/user';
import {
    FeatureControlItemDto,
    FeatureControlListResponseDto,
    FeatureControlSummaryDto,
} from '../dto/feature-control.dto';
import { FeatureToggleInput } from '../schemas/feature-control.schema';

const FEATURE_METADATA: Record<
    FeatureKey,
    { featureName: string; description: string; category: string }
> = {
    [FeatureKey.EXPERT_ESCALATION]: {
        featureName: 'Expert Escalation',
        description:
            'Allow AI to push expert support in chat when escalation is needed.',
        category: 'Support',
    },
    [FeatureKey.VOICE_INPUT]: {
        featureName: 'Voice Input',
        description:
            'Allow users to talk with microphone in mobile chat experiences.',
        category: 'Accessibility',
    },
};

const DEFAULT_FEATURE_FLAGS: Record<FeatureKey, boolean> = {
    [FeatureKey.EXPERT_ESCALATION]: true,
    [FeatureKey.VOICE_INPUT]: true,
};

function ensureAdminUser(user: AuthUser): void {
    const isAdmin = user.roles.some((role) => role.code === RoleCode.ADMIN);
    if (!isAdmin) {
        throw new AuthFailureError('Admin access required');
    }
}

function toFeatureItemDto(feature: FeatureControl): FeatureControlItemDto {
    const metadata = FEATURE_METADATA[feature.featureKey];

    return {
        featureKey: feature.featureKey,
        featureName: metadata.featureName,
        description: metadata.description,
        category: metadata.category,
        enabled: feature.enabled,
        updatedAt: feature.updatedAt,
    };
}

function toSummary(
    features: FeatureControlItemDto[],
): FeatureControlSummaryDto {
    const activeFeatures = features.filter((feature) => feature.enabled).length;

    return {
        totalFeatures: features.length,
        activeFeatures,
        disabledFeatures: features.length - activeFeatures,
    };
}

async function ensureDefaultFeatures(): Promise<void> {
    await Promise.all(
        Object.entries(DEFAULT_FEATURE_FLAGS).map(([featureKey, enabled]) =>
            prisma.featureControl.upsert({
                where: {
                    featureKey: featureKey as FeatureKey,
                },
                update: {},
                create: {
                    featureKey: featureKey as FeatureKey,
                    enabled,
                },
            }),
        ),
    );
}

export async function getFeatureControls(
    adminUser: AuthUser,
): Promise<FeatureControlListResponseDto> {
    ensureAdminUser(adminUser);
    await ensureDefaultFeatures();

    const features = await prisma.featureControl.findMany({
        orderBy: {
            featureKey: 'asc',
        },
    });

    const featureItems = features.map(toFeatureItemDto);

    return {
        summary: toSummary(featureItems),
        features: featureItems,
    };
}

export async function updateFeatureControl(
    adminUser: AuthUser,
    featureKey: FeatureKey,
    input: FeatureToggleInput,
): Promise<FeatureControlListResponseDto> {
    ensureAdminUser(adminUser);

    await prisma.featureControl.upsert({
        where: { featureKey },
        update: {
            enabled: input.enabled,
        },
        create: {
            featureKey,
            enabled: input.enabled,
        },
    });

    return getFeatureControls(adminUser);
}

export async function isFeatureEnabled(
    featureKey: FeatureKey,
): Promise<boolean> {
    const feature = await prisma.featureControl.findUnique({
        where: { featureKey },
        select: { enabled: true },
    });

    if (!feature) {
        return DEFAULT_FEATURE_FLAGS[featureKey];
    }

    return feature.enabled;
}

export default {
    getFeatureControls,
    updateFeatureControl,
    isFeatureEnabled,
};
