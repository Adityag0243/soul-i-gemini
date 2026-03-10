import { Response } from 'express';
import { Tokens } from '../types/app-requests';
import { cookieOptions } from '../config';
import { CookieKeys } from '../helpers/validator';

export function setCookies(res: Response, tokens: Tokens) {
    res.cookie(CookieKeys.REFRESH_TOKEN, tokens.refreshToken, cookieOptions);
    res.cookie(CookieKeys.ACCESS_TOKEN, tokens.accessToken, cookieOptions);
}

export function clearCookies(res: Response) {
    res.clearCookie(CookieKeys.REFRESH_TOKEN, cookieOptions);
    res.clearCookie(CookieKeys.ACCESS_TOKEN, cookieOptions);
}
