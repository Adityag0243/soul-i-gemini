import { RoleCode } from '@prisma/client';

export interface AdminAuthTokensDto {
    accessToken: string;
    refreshToken: string;
}

export interface AdminUserDataDto {
    id: number;
    name: string | null;
    email: string | null;
    verified: boolean;
    roles: {
        id: number;
        code: RoleCode;
    }[];
}

export interface AdminAuthResponseDto {
    user: AdminUserDataDto;
    tokens: AdminAuthTokensDto;
}
