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

// Shows one line of story text at a time, hiding it after a duration
export class StoryText {
    constructor(element) {
        this.element = element;
        this.remaining = 0;
    }

    get isShowing() {
        return this.remaining > 0;
    }

    show(text, duration = 3) {
        this.element.textContent = text;
        this.element.classList.add('visible');
        this.remaining = duration;
    }

    update(delta) {
        if (this.remaining <= 0) return;
        this.remaining -= delta;
        if (this.remaining <= 0) {
            this.element.classList.remove('visible');
        }
    }
}
