// messages.js - Leaving something for the next traveller, and finding what a friend left.
//
// On your walk: press N (or tap "Leave something" on a phone) to leave a few lines and, if you
// like, a picture, right where you stand. Up to three. When you stop (Esc, or at the end), "Share
// your walk" makes a link with your path and what you left (see sharing.js).
// Opening such a link: the same desert, with your friend's footprints across it and their notes
// and pictures under stones where they left them. You never meet; you only find what they left.
import { linkForWalk, walkFromLink, shrinkPicture, MAX_NOTES, MAX_TEXT } from './sharing.js';

export class Messages {
    // player, traces, storyText, moments: the game's; path: () => [[x, z], ...] your walk so far
    constructor({ player, traces, storyText, moments, path }) {
        this.player = player;
        this.traces = traces;
        this.storyText = storyText;
        this.moments = moments;
        this.path = path;
        this.notes = []; // What you have left: { x, z, text, picture }
        this.picture = null;
        this.friend = null; // The walk from a shared link, once read

        const $ = id => document.getElementById(id);
        this.panel = $('leave');
        this.text = $('leave-text');
        this.text.maxLength = MAX_TEXT;
        this.pictureInput = $('leave-picture');
        this.preview = $('leave-preview');
        this.shareButton = $('share-button');
        this.shareLink = $('share-link');

        document.addEventListener('keydown', event => {
            if (event.code === 'KeyN' && player.isLocked && !event.repeat) this.open();
        });
        $('leave-button').addEventListener('click', () => this.open());
        $('leave-cancel').addEventListener('click', () => this.close());
        $('leave-ok').addEventListener('click', () => this.leave());
        this.pictureInput.addEventListener('change', () => this.choosePicture());
        this.shareButton.addEventListener('click', () => this.share());
    }

    get isOpen() {
        return this.panel.classList.contains('visible');
    }

    open() {
        if (this.notes.length >= MAX_NOTES) {
            this.storyText.show('You have left all you can carry.', 4);
            return;
        }
        document.body.classList.add('leaving'); // Only the panel while you write
        this.player.pointerLock.unlock(); // To type, the mouse (or the walk) has to let go
        this.text.value = '';
        this.picture = null;
        this.preview.removeAttribute('src');
        this.preview.hidden = true;
        this.pictureInput.value = '';
        this.panel.classList.add('visible');
        setTimeout(() => this.text.focus(), 50);
    }

    close() {
        this.panel.classList.remove('visible');
        document.body.classList.remove('leaving');
        this.player.lock(); // Back to the walk (this is a click, so the browser allows it)
    }

    async choosePicture() {
        const file = this.pictureInput.files?.[0];
        if (!file) return;
        try {
            this.picture = await shrinkPicture(file);
            this.preview.src = this.picture;
            this.preview.hidden = false;
        } catch {
            this.picture = null;
            this.preview.hidden = true;
        }
    }

    leave() {
        const text = this.text.value.trim().slice(0, MAX_TEXT);
        if (!text && !this.picture) return;
        const { x, z } = this.player.eye;
        const note = { x, z, text, picture: this.picture };
        this.notes.push(note);
        this.traces.leaveMessage(note);
        this.close();
        this.storyText.show(this.notes.length < MAX_NOTES ? 'Left here, for whoever comes next.' : 'Left here. That is all you can carry.', 4);
    }

    // A link with your walk and what you left: shared from a phone, or copied
    async share() {
        const link = await linkForWalk(this.path(), this.notes);
        this.shareLink.value = link;
        this.shareLink.hidden = false;
        if (navigator.share && this.player.touch) {
            try {
                await navigator.share({ title: 'The Mirage of Light', text: 'I walked here. I left you something.', url: link });
                return;
            } catch {
                // Cancelled, or not allowed: the link is shown to copy instead
            }
        }
        try {
            await navigator.clipboard.writeText(link);
            this.shareButton.textContent = 'Link copied. Send it to someone.';
        } catch {
            this.shareLink.select();
            this.shareButton.textContent = 'Copy the link below and send it';
        }
    }

    // A walk from this page's link: lay out the friend's footprints and what they left.
    // onTheWay(): whether their footprints should be noticed now. Returns true if there was one.
    async receive(onTheWay) {
        const walk = await walkFromLink();
        if (!walk) return false;
        this.friend = walk;
        const trail = this.traces.layFriendWalk(walk.path);
        if (trail.length > 0) {
            this.moments.add({
                text: 'Footprints. Someone who walked here before you, not long ago.',
                test: (x, z) => onTheWay() && this.traces.distanceToTrail(trail, x, z) < 2
            });
        }
        for (const note of walk.notes) {
            this.traces.leaveMessage(note);
            this.moments.add({
                x: note.x, z: note.z, radius: 3,
                text: note.text || ' ', picture: note.picture, style: 'letter', duration: note.picture ? 14 : 10
            });
        }
        return true;
    }
}
