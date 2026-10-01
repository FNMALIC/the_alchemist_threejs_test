// moments.js - Small discoveries along the way. Each shows one short line, once, when you come
// near it. None of them is needed; you only find them if you wander.

export class Moments {
    // storyText: the StoryText overlay
    // moments: [{ text, test(x, z) -> boolean }] or [{ text, x, z, radius }]
    constructor(storyText, moments) {
        this.storyText = storyText;
        this.pending = moments.map(moment => ({
            test: moment.test ?? ((x, z) => Math.hypot(x - moment.x, z - moment.z) < moment.radius),
            text: moment.text
        }));
        this.timer = 0;
    }

    update(delta, x, z) {
        // A few checks a second is plenty
        this.timer += delta;
        if (this.timer < 0.25 || this.storyText.isShowing) return;
        this.timer = 0;

        const found = this.pending.findIndex(moment => moment.test(x, z));
        if (found < 0) return;
        this.storyText.show(this.pending[found].text, 5);
        this.pending.splice(found, 1);
    }
}
