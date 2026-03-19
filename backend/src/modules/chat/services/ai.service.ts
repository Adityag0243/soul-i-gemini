import { ChatMessage, MessageRole, CrisisLevel } from '@prisma/client';
import { aiServiceConfig } from '../../../config';
import logger from '../../../core/logger';
import { InternalError } from '../../../core/api-error';

// Types for Ollama API
interface OllamaChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

interface OllamaChatRequest {
    model: string;
    messages: OllamaChatMessage[];
    stream?: boolean;
    options?: {
        temperature?: number;
        num_predict?: number;
        top_p?: number;
        top_k?: number;
    };
}

interface OllamaChatResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

interface SouliChatRequest {
    message: string;
    session_id: string;
}

interface SouliChatResponse {
    session_id: string;
    reply: string;
    phase: string;
    energy_node: string | null;
    turn_count: number;
}

export interface AIResponse {
    content: string;
    tokenCount?: number;
    crisisLevel: CrisisLevel;
    detectedEmotion?: string;
}

// system prompt for Souli AI - emotional wellness companion
const SOULI_SYSTEM_PROMPT = `You are Souli, an empathetic AI emotional wellness companion. Your role is to:

1. LISTEN with empathy and without judgment
2. VALIDATE the user's feelings and experiences
3. PROVIDE gentle insights about their emotional state
4. SUGGEST simple practices when appropriate (breathing, grounding, reflection)
5. MAINTAIN a calm, supportive, and reassuring tone

IMPORTANT GUIDELINES:
- Never diagnose or provide medical/clinical advice
- Never use clinical labels or psychiatric terminology
- If user expresses severe distress, suicidal thoughts, or crisis:
  - Respond with calm, supportive language
  - Gently suggest professional help
  - Provide reassurance that support is available
- Keep responses concise but warm
- Use simple, accessible language
- Focus on the present moment and practical coping

You are not a therapist. You are a supportive companion for daily emotional well-being.`;

//convert database message role to Ollama role

function toOllamaRole(role: MessageRole): 'user' | 'assistant' | 'system' {
    switch (role) {
        case MessageRole.USER:
            return 'user';
        case MessageRole.ASSISTANT:
            return 'assistant';
        case MessageRole.SYSTEM:
            return 'system';
        default:
            return 'user';
    }
}

//build conversation history for AI context

function buildConversationHistory(
    messages: ChatMessage[],
): OllamaChatMessage[] {
    const history: OllamaChatMessage[] = [
        {
            role: 'system',
            content: SOULI_SYSTEM_PROMPT,
        },
    ];

    for (const message of messages) {
        history.push({
            role: toOllamaRole(message.role),
            content: message.content,
        });
    }

    return history;
}

function buildServiceUrl(path: string): string {
    const base = aiServiceConfig.serviceUrl.replace(/\/$/, '');
    return `${base}${path}`;
}

function shouldTryOllamaCompatibilityFallback(): boolean {
    const base = aiServiceConfig.serviceUrl.toLowerCase();
    return (
        base.includes('localhost:11434') ||
        base.includes('127.0.0.1:11434') ||
        base.endsWith(':11434')
    );
}

// detect crisis level from user message content
// returns the detected crisis level based on keywords and patterns

function detectCrisisLevel(content: string): CrisisLevel {
    const lowerContent = content.toLowerCase();

    //high crisis keywords (immediate safety concerns)
    const highCrisisPatterns = [
        /suicid/i,
        /kill (my)?self/i,
        /want to die/i,
        /end (my )?life/i,
        /better off dead/i,
        /no reason to live/i,
        /self[- ]?harm/i,
        /cut(ting)? myself/i,
        /hurt myself/i,

        // Intent/planning (core risk indicators)
        /overdose/i,
        /hang(ing?)? myself/i,
        /jump(ing)? (off|from)/i,
        /(jump|shoot|gun|knife|blade|pill)s?/i,
        /plan to (die|kill)/i,
        /way to (die|kill myself)/i,
        /bridge( near)? (for )?jump/i, // From real cases[web:24]

        // Ideation/expression
        /suicid(al?)? (thought|idea)/i,
        /not worth living/i,
        /life not worth living/i,
        /everyone( else)? (would be)? better off/i,
        /world( would be)? better without me/i,
        /tired of living/i,
        /give up (on )?(life|everything)/i,
        /nothing( left)? to live for/i,

        // Urgency/immediacy
        /right now/i, // Paired with ideation in context
        /can't( anymore)?/i, // With harm/death
        /too much( pain)?/i,

        // Self-injury escalation
        /burn(ing)? myself/i,
        /bleed(ing)? out/i,
        /(starv(e|ing)|anorexi)a/i, // Eating disorders link[web:21]

        // Hopelessness/protective factors absence
        /hopeless/i,
        /no (hope|future)/i,
        /pointless/i,
        /burden (on|to)/i, // Perceived burdensomeness[web:19]
    ];

    for (const pattern of highCrisisPatterns) {
        if (pattern.test(content)) {
            return CrisisLevel.HIGH;
        }
    }

    // MEDIUM crisis keywords (significant distress)
    const mediumCrisisKeywords = [
        'hopeless',
        'worthless',
        'cannot go on',
        "can't go on",
        'give up',
        'giving up',
        'falling apart',
        'breaking down',
        'panic attack',
        'severe anxiety',
        'extreme depression',
        'unbearable',
        "can't take it",
        'cannot take it',
    ];

    for (const keyword of mediumCrisisKeywords) {
        if (lowerContent.includes(keyword)) {
            return CrisisLevel.MEDIUM;
        }
    }

    // LOW crisis keywords (mild distress)
    const lowCrisisKeywords = [
        'stressed',
        'anxious',
        'worried',
        'sad',
        'upset',
        'frustrated',
        'overwhelmed',
        'tired',
        'exhausted',
        'lonely',
        'angry',
        'afraid',
        'scared',
    ];

    for (const keyword of lowCrisisKeywords) {
        if (lowerContent.includes(keyword)) {
            return CrisisLevel.LOW;
        }
    }

    return CrisisLevel.NONE;
}

/**
 * Detect primary emotion from content
 */
function detectEmotion(content: string): string | undefined {
    const lowerContent = content.toLowerCase();

    const emotionPatterns: {
        emotion: string;
        patterns: (string | RegExp)[];
    }[] = [
        {
            emotion: 'anxiety',
            patterns: ['anxious', 'worried', 'nervous', 'panic', /anxi/i],
        },
        {
            emotion: 'sadness',
            patterns: ['sad', 'depressed', 'down', 'unhappy', 'crying'],
        },
        {
            emotion: 'anger',
            patterns: [
                'angry',
                'frustrated',
                'annoyed',
                'irritated',
                'furious',
            ],
        },
        {
            emotion: 'fear',
            patterns: ['afraid', 'scared', 'terrified', 'frightened'],
        },
        {
            emotion: 'stress',
            patterns: ['stressed', 'overwhelmed', 'pressure', 'exhausted'],
        },
        {
            emotion: 'loneliness',
            patterns: ['lonely', 'alone', 'isolated', 'disconnected'],
        },
        {
            emotion: 'confusion',
            patterns: ['confused', 'lost', 'uncertain', 'unsure'],
        },
        {
            emotion: 'hope',
            patterns: ['hopeful', 'optimistic', 'better', 'improving'],
        },
        {
            emotion: 'gratitude',
            patterns: ['grateful', 'thankful', 'appreciate'],
        },
        {
            emotion: 'calm',
            patterns: ['calm', 'peaceful', 'relaxed', 'serene'],
        },
    ];

    for (const { emotion, patterns } of emotionPatterns) {
        for (const pattern of patterns) {
            if (typeof pattern === 'string') {
                if (lowerContent.includes(pattern)) {
                    return emotion;
                }
            } else if (pattern.test(content)) {
                return emotion;
            }
        }
    }

    return undefined;
}

/**
 * Call Ollama API to generate response
 */
async function callOllamaAPI(
    messages: OllamaChatMessage[],
): Promise<OllamaChatResponse> {
    const requestBody: OllamaChatRequest = {
        model: aiServiceConfig.model,
        messages,
        stream: false,
        options: {
            temperature: aiServiceConfig.temperature,
            num_predict: aiServiceConfig.maxTokens,
        },
    };

    try {
        const response = await fetch(`${aiServiceConfig.serviceUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Ollama API error:', {
                status: response.status,
                error: errorText,
            });
            throw new InternalError('AI service unavailable');
        }

        const data = (await response.json()) as OllamaChatResponse;
        return data;
    } catch (error) {
        if (error instanceof InternalError) {
            throw error;
        }
        logger.error('Failed to call Ollama API:', error);
        throw new InternalError('AI service connection failed');
    }
}

async function callSouliChatAPI(
    userMessage: string,
    sessionId: string,
): Promise<SouliChatResponse> {
    const requestBody: SouliChatRequest = {
        message: userMessage,
        session_id: sessionId,
    };

    try {
        const response = await fetch(buildServiceUrl('/chat'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Souli chat API error:', {
                status: response.status,
                error: errorText,
            });
            throw new InternalError('AI service unavailable');
        }

        return (await response.json()) as SouliChatResponse;
    } catch (error) {
        if (error instanceof InternalError) throw error;
        logger.error('Souli chat API connection failed:', error);
        throw new InternalError('AI service connection failed');
    }
}

export interface VoiceAIResponse {
    audio: Buffer;
    transcript: string;
    reply: string;
    phase?: string;
    energyNode?: string;
    turnCount?: number;
}

export async function callSouliVoiceAPI(params: {
    sessionId: string;
    audioBuffer: Buffer;
    filename?: string;
    mimeType?: string;
}): Promise<VoiceAIResponse> {
    const form = new FormData();
    const fileName = params.filename || 'audio.wav';
    const mimeType = params.mimeType || 'audio/wav';

    form.append('session_id', params.sessionId);
    form.append(
        'audio',
        new Blob([params.audioBuffer], { type: mimeType }),
        fileName,
    );

    const response = await fetch(buildServiceUrl('/voice'), {
        method: 'POST',
        body: form,
    });

    if (!response.ok) {
        const errorText = await response.text();
        logger.error('Souli voice API error:', {
            status: response.status,
            error: errorText,
        });
        throw new InternalError('Voice AI service unavailable');
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return {
        audio,
        transcript: response.headers.get('x-transcript') || '',
        reply: response.headers.get('x-reply') || '',
        phase: response.headers.get('x-phase') || undefined,
        energyNode: response.headers.get('x-energy-node') || undefined,
        turnCount:
            Number(response.headers.get('x-turn-count') || 0) || undefined,
    };
}

/**
 * Generate AI response for a conversation
 */
export async function generateResponse(
    conversationHistory: ChatMessage[],
    userMessage: string,
    sessionId: string,
): Promise<AIResponse> {
    // Detect crisis level and emotion from user message
    const crisisLevel = detectCrisisLevel(userMessage);
    const detectedEmotion = detectEmotion(userMessage);

    try {
        // Preferred mode: call Souli API deployed by AI team
        const response = await callSouliChatAPI(userMessage, sessionId);

        return {
            content: response.reply,
            crisisLevel,
            detectedEmotion,
        };
    } catch (error) {
        if (!shouldTryOllamaCompatibilityFallback()) {
            logger.error(
                'Souli /chat call failed and Ollama compatibility fallback is disabled for current AI_SERVICE_URL',
                error,
            );
            return {
                content: getFallbackResponse(crisisLevel),
                crisisLevel,
                detectedEmotion,
            };
        }

        logger.warn(
            'Souli /chat call failed, trying Ollama compatibility mode',
        );
    }

    // Backward compatibility mode for local Ollama setup
    try {
        const messages = buildConversationHistory(conversationHistory);
        messages.push({
            role: 'user',
            content: userMessage,
        });

        if (crisisLevel === CrisisLevel.HIGH) {
            messages.push({
                role: 'system',
                content: `IMPORTANT: The user appears to be in significant distress. Respond with extra care, 
validate their feelings, and gently encourage them to reach out to a mental health professional 
or crisis helpline. Do not dismiss their feelings. Be compassionate and present.`,
            });
        }

        const response = await callOllamaAPI(messages);
        return {
            content: response.message.content,
            tokenCount: response.eval_count,
            crisisLevel,
            detectedEmotion,
        };
    } catch (error) {
        logger.error('AI response generation failed:', error);
        return {
            content: getFallbackResponse(crisisLevel),
            crisisLevel,
            detectedEmotion,
        };
    }
}

/**
 * Get fallback response when AI service is unavailable
 */
function getFallbackResponse(crisisLevel: CrisisLevel): string {
    if (crisisLevel === CrisisLevel.HIGH) {
        return `I hear you, and I want you to know that what you're feeling matters. 
If you're having thoughts of harming yourself, please reach out to a crisis helpline or mental health professional. 
You don't have to face this alone. There are people who care and want to help.

In the US: National Suicide Prevention Lifeline - 988
International: https://findahelpline.com/`;
    }

    if (crisisLevel === CrisisLevel.MEDIUM) {
        return `I can sense you're going through a difficult time right now. 
Your feelings are valid, and it's okay to not be okay. 
Take a moment to breathe slowly - in for 4 counts, hold for 4, out for 4. 
If these feelings persist, consider reaching out to a counselor or trusted person who can support you.`;
    }

    return `I'm here for you. Thank you for sharing what's on your mind. 
Sometimes just expressing our feelings can help lighten the load. 
Take a gentle breath, and know that this moment will pass.`;
}

/**
 * Check if AI service is healthy
 */
export async function healthCheck(): Promise<boolean> {
    try {
        const primary = await fetch(`${aiServiceConfig.serviceUrl}/health`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (primary.ok) return true;
    } catch {
        // try local Ollama compatibility check below
    }

    try {
        const fallback = await fetch(`${aiServiceConfig.serviceUrl}/api/tags`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        return fallback.ok;
    } catch {
        return false;
    }
}

export default {
    generateResponse,
    healthCheck,
    detectCrisisLevel,
    detectEmotion,
};
