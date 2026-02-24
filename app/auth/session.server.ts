import { createCookieSessionStorage } from 'react-router';

export const sessionStorage = createCookieSessionStorage({
    cookie: {
        name: '_bark_session',
        sameSite: 'lax',
        path: '/',
        httpOnly: true,
        secrets: ['s3cr3t_b4rk'],
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 24 * 30, // 30 days
    },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
