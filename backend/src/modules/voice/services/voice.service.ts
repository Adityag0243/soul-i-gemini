import {
    AccessToken,
    AgentDispatchClient,
    RoomServiceClient,
} from 'livekit-server-sdk';
import { InternalError } from '../../../core/api-error';
import logger from '../../../core/logger';
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
    agentName?: string;
    agentDispatchId?: string;
}

function toLiveKitHttpHost(url: string): string {
    if (url.startsWith('wss://'))
        return `https://${url.slice('wss://'.length)}`;
    if (url.startsWith('ws://')) return `http://${url.slice('ws://'.length)}`;
    return url;
}

async function ensureAgentDispatch(
    roomName: string,
    userId: number,
    chatSessionId: string,
): Promise<{ agentName: string; agentDispatchId?: string }> {
    const agentName = process.env.SOULI_AGENT_NAME || 'souli-voice';
    const host = toLiveKitHttpHost(voiceConfig.url);

    try {
        const client = new AgentDispatchClient(
            host,
            voiceConfig.apiKey,
            voiceConfig.apiSecret,
        );

        const existing = await client.listDispatch(roomName);
        const existingForAgent = existing.filter(
            (dispatch) => dispatch.agentName === agentName,
        );

        for (const dispatch of existingForAgent) {
            try {
                await client.deleteDispatch(dispatch.id, roomName);
            } catch (deleteError) {
                logger.warn('Could not delete stale voice agent dispatch', {
                    roomName,
                    agentName,
                    dispatchId: dispatch.id,
                    deleteError,
                });
            }
        }

        const created = await client.createDispatch(roomName, agentName, {
            metadata: JSON.stringify({
                source: 'voice-bootstrap',
                userId,
                chatSessionId,
            }),
        });

        logger.info('Created voice agent dispatch', {
            roomName,
            agentName,
            dispatchId: created.id,
            chatSessionId,
            userId,
        });

        return { agentName, agentDispatchId: created.id };
    } catch (error) {
        logger.warn('Failed to create voice agent dispatch', {
            roomName,
            agentName,
            chatSessionId,
            userId,
            error,
        });
        return { agentName };
    }
}

async function ensureRoomExists(roomName: string): Promise<void> {
    const host = toLiveKitHttpHost(voiceConfig.url);

    try {
        const roomClient = new RoomServiceClient(
            host,
            voiceConfig.apiKey,
            voiceConfig.apiSecret,
        );

        await roomClient.createRoom({
            name: roomName,
            emptyTimeout: 60,
            departureTimeout: 120,
        });

        logger.info('Ensured voice room exists', { roomName });
    } catch (error) {
        const err = error as { code?: string; message?: string };
        const msg = err?.message || '';

        // Room may already exist; that's fine for bootstrap.
        if (err?.code === 'already_exists' || /already exists/i.test(msg)) {
            return;
        }

        logger.warn('Could not ensure room existence before dispatch', {
            roomName,
            error,
        });
    }
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

    await ensureRoomExists(tokenResult.roomName);

    const dispatchResult = await ensureAgentDispatch(
        tokenResult.roomName,
        userId,
        chatSessionId,
    );

    return {
        ...tokenResult,
        chatSessionId,
        transcriptEndpoint: '/chat/messages/voice-transcript',
        textMessageEndpoint: '/chat/messages',
        ...dispatchResult,
    };
}

export default {
    createVoiceToken,
    createVoiceBootstrap,
};
