// story.js - Story text overlay and a small state machine for the narrative
//
// Each stage is an object with optional hooks:
//   enter()                        called when the stage starts
//   update(stageTime, delta)       return the next stage's name to move on
//   exit()                         called when the stage ends

export class StoryDirector {
    constructor(stages, initialStage) {
        this.stages = stages;
        this.current = null;
        this.stageTime = 0;
        this.goTo(initialStage);
    }

    goTo(name) {
        const stage = this.stages[name];
        if (!stage) throw new Error(`Unknown story stage: ${name}`);

        this.stages[this.current]?.exit?.();
        this.current = name;
        this.stageTime = 0;
        stage.enter?.();
    }

    update(delta) {
        this.stageTime += delta;
        const next = this.stages[this.current].update?.(this.stageTime, delta);
        if (next) this.goTo(next);
    }
}

// How long the old line takes to fade out before a new one replaces it (matches the CSS)
const SWAP_SECONDS = 0.6;

// Shows one line of story text at a time, hiding it after a duration.
// The fading in and out is done by CSS (#story / #story.visible in index.html).
export class StoryText {
    constructor(element) {
        this.element = element;
        this.remaining = 0;
        this.pending = null; // { text, duration, style, picture } waiting for the previous line to fade out
        this.swapTimer = 0;
    }

    get isShowing() {
        return this.remaining > 0 || this.pending !== null;
    }

    // style: optional CSS class, e.g. 'letter' for the traveller's handwriting
    // picture: optional image (a URL) shown under the text, e.g. one a friend left
    show(text, duration = 3, style = null, picture = null) {
        if (this.element.classList.contains('visible')) {
            // Let the current line fade out first, then bring in the new one
            this.element.classList.remove('visible');
            this.pending = { text, duration, style, picture };
            this.swapTimer = SWAP_SECONDS;
            this.remaining = 0;
            return;
        }
        this.reveal(text, duration, style, picture);
    }

    reveal(text, duration, style, picture = null) {
        this.element.textContent = text;
        if (picture) {
            const image = document.createElement('img');
            image.src = picture;
            image.alt = '';
            this.element.appendChild(image);
        }
        this.element.classList.toggle('letter', style === 'letter');
        this.element.classList.add('visible');
        this.remaining = duration;
    }

    update(delta) {
        if (this.pending) {
            this.swapTimer -= delta;
            if (this.swapTimer <= 0) {
                const { text, duration, style, picture } = this.pending;
                this.pending = null;
                this.reveal(text, duration, style, picture);
            }
            return;
        }

        if (this.remaining <= 0) return;
        this.remaining -= delta;
        if (this.remaining <= 0) {
            this.element.classList.remove('visible');
        }
    }
}
