// sharing.js - Your walk, in a link. Whoever opens it walks the same desert and finds your
// footprints and the few things you left on the way: some lines of writing, a picture.
//
// Everything travels in the link's #fragment (never sent to any server): the path, the notes,
// and small JPEG pictures, packed as JSON and compressed. Nothing is stored anywhere else.
// What comes back out of a link is checked strictly: only plain text, and only JPEG pictures.

export const MAX_NOTES = 3;
export const MAX_TEXT = 220; // Characters in a note
const MAX_PATH = 900; // Points
const PICTURE_SIDE = 200; // Pixels on the longer side
const PICTURE_QUALITY = 0.6;
const PREFIX = '#walk=';

// --- Bytes <-> base64url, and (de)compression where the browser can ---

function toBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

// --- Pictures ---

// Shrink a picture from the device to a small JPEG (a data URL), small enough for a link
export async function shrinkPicture(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PICTURE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', PICTURE_QUALITY);
}

// --- Walks <-> links ---

// path: [[x, z], ...]; notes: [{ x, z, text, picture (data URL or null) }]
export async function linkForWalk(path, notes) {
    const walk = {
        v: 1,
        // Half-metre steps, each point as the change from the last: compresses very well
        p: path.slice(0, MAX_PATH).flatMap(([x, z], i, all) => {
            const [px, pz] = i === 0 ? [0, 0] : all[i - 1];
            return [Math.round(x * 2) - Math.round(px * 2), Math.round(z * 2) - Math.round(pz * 2)];
        }),
        n: notes.slice(0, MAX_NOTES).map(({ x, z, text, picture }) => ({
            x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, t: text.slice(0, MAX_TEXT), i: picture || undefined
        }))
    };
    let bytes = new TextEncoder().encode(JSON.stringify(walk));
    let packing = 'j';
    if (typeof CompressionStream === 'function') {
        bytes = await pipe(bytes, new CompressionStream('deflate-raw'));
        packing = 'z';
    }
    const base = `${location.origin}${location.pathname}`;
    return `${base}${PREFIX}${packing}${toBase64Url(bytes)}`;
}

// The walk in this page's link, or null. Never trusts it: anything odd is dropped.
export async function walkFromLink(hash = location.hash) {
    if (!hash.startsWith(PREFIX)) return null;
    try {
        const packing = hash[PREFIX.length];
        let bytes = fromBase64Url(hash.slice(PREFIX.length + 1));
        if (packing === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
        else if (packing !== 'j') return null;
        const walk = JSON.parse(new TextDecoder().decode(bytes));
        if (walk?.v !== 1) return null;

        const path = [];
        const steps = Array.isArray(walk.p) ? walk.p.slice(0, MAX_PATH * 2) : [];
        let x = 0, z = 0;
        for (let i = 0; i + 1 < steps.length; i += 2) {
            if (!Number.isFinite(steps[i]) || !Number.isFinite(steps[i + 1])) return null;
            x += steps[i];
            z += steps[i + 1];
            path.push([x / 2, z / 2]);
        }
        const notes = (Array.isArray(walk.n) ? walk.n : []).slice(0, MAX_NOTES).flatMap(note => {
            if (!Number.isFinite(note?.x) || !Number.isFinite(note?.z) || typeof note.t !== 'string') return [];
            // Only small JPEG pictures, as made by shrinkPicture
            const picture = typeof note.i === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(note.i) && note.i.length < 60000
                ? note.i : null;
            return [{ x: note.x, z: note.z, text: note.t.slice(0, MAX_TEXT), picture }];
        });
        return { path, notes };
    } catch {
        return null;
    }
}
