import { AuthProvider } from '@prisma/client';
import { UserDto } from '../../users/dto/user.dto';

export interface AuthTokensDto {
    accessToken: string;
    refreshToken: string;
}

export interface AuthResponseDto {
    user: UserDto;
    tokens: AuthTokensDto;
}

export interface AnonymousAuthResponseDto extends AuthResponseDto {
    souliKey: string; // Only returned once during anonymous registration
}

export interface GoogleUserPayload {
    sub: string; // Google user ID
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    given_name?: string;
    family_name?: string;
}

export interface LinkedProvidersDto {
    userId: number;
    providers: {
        provider: AuthProvider;
        email?: string | null;
        linkedAt: Date;
    }[];
}
