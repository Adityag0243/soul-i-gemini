import { AuthUser } from './../types/user';
import objectManipulator from 'lodash';

export const enum Header {
    API_KEY = 'x-api-key',
    AUTHORIZATION = 'authorization',
}

export function getUserData(user: AuthUser) {
    const data = objectManipulator.pick(user, ['id', 'name', 'roles', 'email']);
    return data;
}
