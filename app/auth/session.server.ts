import { createCookieSessionStorage } from 'react-router';
import { getSessionSecret } from './context-storage';

function getSessionStorage() {
    const secret = getSessionSecret();
    return createCookieSessionStorage({
        cookie: {
            name: '_bark_session',
            sameSite: 'lax',
            path: '/',
            httpOnly: true,
            secrets: [secret],
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 30, // 30 days
        },
    });
}

export const getSession = (cookieHeader: string | null) => 
    getSessionStorage().getSession(cookieHeader);

export const commitSession = (session: any, options?: any) => 
    getSessionStorage().commitSession(session, options);

export const destroySession = (session: any, options?: any) => 
    getSessionStorage().destroySession(session, options);
