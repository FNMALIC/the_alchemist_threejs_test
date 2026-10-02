// api/walk.js - Short links for shared walks (a Vercel serverless function).
//
// POST { walk }  saves a packed walk (the same text that would otherwise go in a long link, see
//                src/sharing.js) for 30 days and answers { id }: the link is then /#w=<id>
// GET ?id=<id>   answers { walk }, or 404 once it has expired
//
// Storage is the Redis database connected to the project (Vercel sets REDIS_URL). Nothing is
// listed anywhere: a walk can only be found by someone who has its link.
import { createClient } from 'redis';
import { randomBytes } from 'node:crypto';

const DAYS = 30;
const MAX_LENGTH = 64000; // Characters: a walk with three small pictures is far below this
const PACKED = /^[zj][A-Za-z0-9_-]+$/; // What sharing.js makes: a packing letter, then base64url
const ID = /^[A-Za-z0-9]{8}$/;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

let client = null;
async function redis() {
    if (!client) {
        client = createClient({ url: process.env.REDIS_URL });
        client.on('error', () => {}); // Reported per request below
        await client.connect();
    }
    return client;
}

function newId() {
    const bytes = randomBytes(8);
    return Array.from(bytes, byte => LETTERS[byte % LETTERS.length]).join('');
}

export default async function handler(request, response) {
    if (!process.env.REDIS_URL) {
        response.status(503).json({ error: 'No storage connected' });
        return;
    }
    try {
        const store = await redis();
        if (request.method === 'POST') {
            const walk = typeof request.body?.walk === 'string' ? request.body.walk : '';
            if (walk.length === 0 || walk.length > MAX_LENGTH || !PACKED.test(walk)) {
                response.status(400).json({ error: 'Not a walk' });
                return;
            }
            let id = newId();
            // Never overwrite someone else's walk
            while (!(await store.set(`walk:${id}`, walk, { NX: true, EX: DAYS * 86400 }))) id = newId();
            response.status(200).json({ id });
            return;
        }
        if (request.method === 'GET') {
            const id = String(request.query?.id ?? '');
            if (!ID.test(id)) {
                response.status(400).json({ error: 'Not a walk' });
                return;
            }
            const walk = await store.get(`walk:${id}`);
            if (!walk) {
                response.status(404).json({ error: 'Gone' });
                return;
            }
            response.setHeader('Cache-Control', 'public, max-age=3600');
            response.status(200).json({ walk });
            return;
        }
        response.status(405).json({ error: 'Method not allowed' });
    } catch {
        response.status(500).json({ error: 'Storage unavailable' });
    }
}
