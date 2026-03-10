import { RoleCode, User } from '@prisma/client';

export interface AuthUser extends User {
    roles: {
        id: number;
        code: RoleCode;
        status: boolean;
    }[];
}
