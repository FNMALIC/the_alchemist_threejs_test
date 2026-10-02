// sharing.js - Your walk, in a link. Whoever opens it walks the same desert and finds your
// footprints and the few things you left on the way: some lines of writing, a picture.
//
// The walk (the path, the notes, small pictures) is packed as JSON and compressed. If the site
// has its storage connected (api/walk.js), it is saved there for 30 days and the link is short:
// /#w=<id>. Otherwise everything travels in the link itself (/#walk=..., never sent to any
// server), which works anywhere but is long.
// Pictures are what make a link long, so they are kept small: faded, sepia photographs (as an
// old picture left in the sand would be), WebP where the browser can make it, JPEG otherwise,
// and a picture left twice is carried once.
// What comes back out of a link is checked strictly: only plain text, and only WebP or JPEG pictures.

export const MAX_NOTES = 3;
export const MAX_TEXT = 220; // Characters in a note
const MAX_PATH = 900; // Points
const PICTURE_SIDE = 128; // Pixels on the longer side
const PICTURE_QUALITY = 0.5;
const PICTURE_PATTERN = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const PREFIX = '#walk=';
const SHORT_PREFIX = '#w=';

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

// Shrink a picture from the device to a small, faded sepia photograph (a data URL), small
// enough for a link
export async function shrinkPicture(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, PICTURE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    // Sepia, a little faded: warm tones only (a fraction of the colour to store)
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    for (let i = 0; i < pixels.length; i += 4) {
        const grey = 0.3 * pixels[i] + 0.59 * pixels[i + 1] + 0.11 * pixels[i + 2];
        const faded = 28 + grey * 0.8;
        pixels[i] = Math.min(255, faded * 1.08 + 8);
        pixels[i + 1] = Math.min(255, faded * 0.95 + 4);
        pixels[i + 2] = Math.min(255, faded * 0.78);
    }
    context.putImageData(image, 0, 0);

    // WebP is smaller; browsers that cannot make it (Safari) fall back to JPEG
    const webp = canvas.toDataURL('image/webp', PICTURE_QUALITY);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', PICTURE_QUALITY);
}

// --- Walks <-> links ---

// path: [[x, z], ...]; notes: [{ x, z, text, picture (data URL or null) }]
// A short link if the walk can be saved online, else the long link with everything in it
export async function linkForWalk(path, notes) {
    const packed = await packWalk(path, notes);
    const base = `${location.origin}${location.pathname}`;
    try {
        const response = await fetch('/api/walk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walk: packed })
        });
        if (response.ok) {
            const { id } = await response.json();
            if (typeof id === 'string' && /^[A-Za-z0-9]{8}$/.test(id)) return `${base}${SHORT_PREFIX}${id}`;
        }
    } catch {
        // No storage here (or offline): the long link still works
    }
    return `${base}${PREFIX}${packed}`;
}

// The walk as text: a packing letter ('z' compressed, 'j' plain), then base64url
async function packWalk(path, notes) {
    const walk = {
        v: 1,
        // Half-metre steps, each point as the change from the last: compresses very well
        p: path.slice(0, MAX_PATH).flatMap(([x, z], i, all) => {
            const [px, pz] = i === 0 ? [0, 0] : all[i - 1];
            return [Math.round(x * 2) - Math.round(px * 2), Math.round(z * 2) - Math.round(pz * 2)];
        }),
        // A picture already carried for an earlier note is pointed to ("@0"), not carried again
        n: notes.slice(0, MAX_NOTES).map(({ x, z, text, picture }, index, all) => {
            const earlier = picture ? all.findIndex(note => note.picture === picture) : -1;
            return {
                x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, t: text.slice(0, MAX_TEXT),
                i: picture ? (earlier < index ? `@${earlier}` : picture) : undefined
            };
        })
    };
    let bytes = new TextEncoder().encode(JSON.stringify(walk));
    let packing = 'j';
    if (typeof CompressionStream === 'function') {
        bytes = await pipe(bytes, new CompressionStream('deflate-raw'));
        packing = 'z';
    }
    return `${packing}${toBase64Url(bytes)}`;
}

// The walk in this page's link (fetched first, for a short link), or null
export async function walkFromLink(hash = location.hash) {
    if (hash.startsWith(SHORT_PREFIX)) {
        const id = hash.slice(SHORT_PREFIX.length);
        if (!/^[A-Za-z0-9]{8}$/.test(id)) return null;
        try {
            const response = await fetch(`/api/walk?id=${id}`);
            if (!response.ok) return null;
            const { walk } = await response.json();
            return typeof walk === 'string' ? unpackWalk(walk) : null;
        } catch {
            return null;
        }
    }
    if (!hash.startsWith(PREFIX)) return null;
    return unpackWalk(hash.slice(PREFIX.length));
}

// A packed walk back into { path, notes }. Never trusts it: anything odd is dropped.
async function unpackWalk(packed) {
    try {
        const packing = packed[0];
        let bytes = fromBase64Url(packed.slice(1));
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
        const notes = [];
        for (const note of (Array.isArray(walk.n) ? walk.n : []).slice(0, MAX_NOTES)) {
            if (!Number.isFinite(note?.x) || !Number.isFinite(note?.z) || typeof note.t !== 'string') continue;
            // Only small WebP or JPEG pictures, as made by shrinkPicture, or a pointer to an earlier one
            let picture = null;
            if (typeof note.i === 'string' && /^@\d$/.test(note.i)) picture = notes[Number(note.i.slice(1))]?.picture ?? null;
            else if (typeof note.i === 'string' && note.i.length < 60000 && PICTURE_PATTERN.test(note.i)) picture = note.i;
            notes.push({ x: note.x, z: note.z, text: note.t.slice(0, MAX_TEXT), picture });
        }
        return { path, notes };
    } catch {
        return null;
    }
}
