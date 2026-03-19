import { AccessToken } from 'livekit-server-sdk';
import { InternalError } from '../../../core/api-error';
import { voiceConfig } from '../../../config';
import ChatService from '../../chat/services/chat.service';
import {
    CreateVoiceTokenInput,
    CreateVoiceBootstrapInput,
} from '../schemas/voice.schema';

const LIVEKIT_TOKEN_VALIDITY_SECONDS = Math.max(
    60,
    Number(voiceConfig.tokenValiditySec || 900),
);

function ensureVoiceConfig(): void {
    if (!voiceConfig.url || !voiceConfig.apiKey || !voiceConfig.apiSecret) {
        throw new InternalError(
            'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
        );
    }
}

function resolveRoomName(userId: number, input: CreateVoiceTokenInput): string {
    if (input.roomName) return input.roomName;
    if (input.sessionId) return `souli-chat-${input.sessionId}`;
    return `${voiceConfig.defaultRoom}-u${userId}`;
}

function buildParticipantIdentity(userId: number): string {
    const entropy = Math.random().toString(36).slice(2, 10);
    return `souli-u${userId}-${entropy}`;
}

export interface VoiceTokenResponse {
    token: string;
    livekitUrl: string;
    roomName: string;
    participantIdentity: string;
    participantName: string;
    expiresAt: string;
}

export interface VoiceBootstrapResponse extends VoiceTokenResponse {
    chatSessionId: string;
    transcriptEndpoint: string;
    textMessageEndpoint: string;
}

export async function createVoiceToken(
    userId: number,
    input: CreateVoiceTokenInput,
): Promise<VoiceTokenResponse> {
    ensureVoiceConfig();

    const roomName = resolveRoomName(userId, input);
    const participantIdentity = buildParticipantIdentity(userId);
    const participantName = input.participantName || `Souli User ${userId}`;

    const accessToken = new AccessToken(
        voiceConfig.apiKey,
        voiceConfig.apiSecret,
        {
            identity: participantIdentity,
            name: participantName,
            ttl: `${LIVEKIT_TOKEN_VALIDITY_SECONDS}s`,
            metadata: JSON.stringify({
                userId,
                platform: input.platform || 'web',
                chatSessionId: input.sessionId || null,
                source: 'souli-mobile',
            }),
        },
    );

    accessToken.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });

    const token = await accessToken.toJwt();

    return {
        token,
        livekitUrl: voiceConfig.url,
        roomName,
        participantIdentity,
        participantName,
        expiresAt: new Date(
            Date.now() + LIVEKIT_TOKEN_VALIDITY_SECONDS * 1000,
        ).toISOString(),
    };
}

export async function createVoiceBootstrap(
    userId: number,
    input: CreateVoiceBootstrapInput,
): Promise<VoiceBootstrapResponse> {
    let chatSessionId = input.sessionId;

    if (chatSessionId) {
        await ChatService.getSession(chatSessionId, userId);
    } else {
        const created = await ChatService.createSession(userId, {
            title: 'Voice Chat',
        });
        chatSessionId = created.id;
    }

    const tokenResult = await createVoiceToken(userId, {
        roomName: input.roomName,
        sessionId: chatSessionId,
        participantName: input.participantName,
        platform: input.platform,
    });

    return {
        ...tokenResult,
        chatSessionId,
        transcriptEndpoint: '/chat/messages/voice-transcript',
        textMessageEndpoint: '/chat/messages',
    };
}

export default {
    createVoiceToken,
    createVoiceBootstrap,
};
