// moments.js - Small discoveries along the way. Each shows its text, once, when you come
// near it (and, if it has one, when its `when(stage)` condition holds).

export class Moments {
    // storyText: the StoryText overlay; currentStage: () => name of the story's current stage
    // moments: [{ text, test(x, z) }] or [{ text, x, z, radius }], optionally with
    //   style ('letter'), duration (seconds) and when(stage)
    constructor(storyText, moments, currentStage = () => null) {
        this.storyText = storyText;
        this.currentStage = currentStage;
        this.pending = moments.map(moment => ({
            test: moment.test ?? ((x, z) => Math.hypot(x - moment.x, z - moment.z) < moment.radius),
            when: moment.when ?? (() => true),
            text: moment.text,
            style: moment.style,
            duration: moment.duration ?? 5
        }));
        this.timer = 0;
    }

    update(delta, x, z) {
        // A few checks a second is plenty
        this.timer += delta;
        if (this.timer < 0.25 || this.storyText.isShowing) return;
        this.timer = 0;

        const stage = this.currentStage();
        const found = this.pending.findIndex(moment => moment.when(stage) && moment.test(x, z));
        if (found < 0) return;
        const moment = this.pending[found];
        this.storyText.show(moment.text, moment.duration, moment.style);
        this.pending.splice(found, 1);
    }
}
