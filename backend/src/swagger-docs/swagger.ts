import { z } from 'zod';
import {
    extendZodWithOpenApi,
    OpenAPIRegistry,
    OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
// import { serverUrl } from '../config';

const serverUrl = 'http://localhost:8000';

// Required: add .openapi() to Zod schemas before using registry.register()
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Security schemes: API Key (required for all except /health) + Bearer JWT (for protected auth)
registry.registerComponent('securitySchemes', 'apiKey', {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
    description:
        'API key for access. Required for all routes except /health. Use the Authorize button above to set it.',
});

registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
        'JWT access token. Required for signout and token refresh. Use the Authorize button above to set it.',
});

export function generateOpenAPIDocument() {
    const generator = new OpenApiGeneratorV3(registry.definitions);

    const doc = generator.generateDocument({
        openapi: '3.0.0',
        info: {
            title: 'Your Backend API',
            version: '1.0.0',
        },
        servers: [
            {
                url: serverUrl,
                description: 'API server',
            },
        ],
        tags: [
            {
                name: 'Health',
                description: 'Health check. No authentication required.',
            },
            {
                name: 'Auth',
                description:
                    'Authentication: email/password, Google OAuth, anonymous login, token refresh.',
            },
            {
                name: 'Chat',
                description:
                    'Chat sessions and messages with AI emotional wellness companion.',
            },
            {
                name: 'Voice',
                description:
                    'Realtime voice handoff endpoints for LiveKit token generation.',
            },
            {
                name: 'Payments',
                description:
                    'Subscription management with Stripe and Razorpay integration, payment verification, and history.',
            },
        ],
        // Default: use API key so "Authorize" is visible and x-api-key is sent with requests
        security: [{ apiKey: [] }],
    });

    return doc;
}
