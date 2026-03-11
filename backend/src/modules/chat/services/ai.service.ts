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

export interface AIResponse {
    content: string;
    tokenCount?: number;
    crisisLevel: CrisisLevel;
    detectedEmotion?: string;
}

// System prompt for Souli AI - Emotional wellness companion
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

/**
 * Convert database message role to Ollama role
 */
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

/**
 * Build conversation history for AI context
 */
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

/**
 * Detect crisis level from user message content
 * Returns the detected crisis level based on keywords and patterns
 */
function detectCrisisLevel(content: string): CrisisLevel {
    const lowerContent = content.toLowerCase();

    // HIGH crisis keywords (immediate safety concerns)
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

/**
 * Generate AI response for a conversation
 */
export async function generateResponse(
    conversationHistory: ChatMessage[],
    userMessage: string,
): Promise<AIResponse> {
    // Detect crisis level and emotion from user message
    const crisisLevel = detectCrisisLevel(userMessage);
    const detectedEmotion = detectEmotion(userMessage);

    // Build conversation context
    const messages = buildConversationHistory(conversationHistory);

    // Add the new user message
    messages.push({
        role: 'user',
        content: userMessage,
    });

    // Add crisis-specific system guidance if needed
    if (crisisLevel === CrisisLevel.HIGH) {
        messages.push({
            role: 'system',
            content: `IMPORTANT: The user appears to be in significant distress. Respond with extra care, 
validate their feelings, and gently encourage them to reach out to a mental health professional 
or crisis helpline. Do not dismiss their feelings. Be compassionate and present.`,
        });
    }

    try {
        // Call AI service
        const response = await callOllamaAPI(messages);

        return {
            content: response.message.content,
            tokenCount: response.eval_count,
            crisisLevel,
            detectedEmotion,
        };
    } catch (error) {
        logger.error('AI response generation failed:', error);

        // Return a graceful fallback response
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
        const response = await fetch(`${aiServiceConfig.serviceUrl}/api/tags`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        return response.ok;
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
