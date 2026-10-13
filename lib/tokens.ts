import { randomBytes, randomUUID } from 'node:crypto';

/** Unguessable ticket token: 18 random bytes, base64url (24 chars). */
export const newToken = () => randomBytes(18).toString('base64url');
export const newId = () => randomUUID();

/** Shape check so we never hit the DB with junk. */
export const isTokenShaped = (t: string) => /^[A-Za-z0-9_-]{24}$/.test(t);
