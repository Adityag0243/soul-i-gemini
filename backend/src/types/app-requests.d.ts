import { Request } from 'express';
import { ApiKey, Keystore } from '@prisma/client';
import { AuthUser } from './user';

declare interface PublicRequest extends Request {
    apiKey: ApiKey;
}

declare interface RoleRequest extends PublicRequest {
    currentRoleCodes: string[];
}

declare interface ProtectedRequest extends RoleRequest {
    user: AuthUser;
    accessToken: string;
    keystore: Keystore;
}

declare interface Tokens {
    accessToken: string;
    refreshToken: string;
}
