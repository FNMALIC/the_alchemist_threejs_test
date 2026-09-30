// stages.js - The stages of the journey, from waking at the oasis to becoming the light

const STORY_TEXT = {
    intro: "You wake beneath an old tree at the edge of an oasis. Beyond the palms, the desert lies silver under the moon. Far away, a light is pulsing...",
    desert: "The sand is cold beneath your feet. Behind you the oasis grows small. Ahead, the light waits.",
    approaching: "The light seems to answer your steps. Faint whispers drift on the wind, just beyond understanding...",
    veryClose: "The light pulses faster now. The whispers grow clearer: \"Seeker... find... truth...\" The orb's energy surrounds you.",
    touch: "You reach out to touch the light. It responds to your touch, fracturing into countless shards of brilliant light!",
    transformation: "The fragments of light swirl around you, entering your body. You feel yourself becoming one with the light...",
    epilogue: "As your consciousness expands, you understand: you were the light all along, separated from yourself. You are whole again."
};

// Distances that move the story forward
const LEAVE_OASIS_DISTANCE = 20; // From the start point
const APPROACH_DISTANCE = 50; // From the orb
const VERY_CLOSE_DISTANCE = 15;
const TOUCH_DISTANCE = 2;

// state: { orb, audio, effects, storyText, lights, ui, sky, distanceToOrb, distanceFromStart }
export function createStages(state) {
    const { orb, audio, effects, storyText, lights, ui } = state;

    // Walking toward the orb: touching it always wins; otherwise the next
    // line of text waits until the current one has finished.
    const approachTo = (nextStage, distance) => () => {
        if (state.distanceToOrb < TOUCH_DISTANCE) return 'touch';
        if (!storyText.isShowing && state.distanceToOrb < distance) return nextStage;
    };

    return {
        intro: {
            enter: () => storyText.show(STORY_TEXT.intro, 7),
            update: () => {
                if (!storyText.isShowing && state.distanceFromStart > LEAVE_OASIS_DISTANCE) return 'desert';
            }
        },

        desert: {
            enter: () => storyText.show(STORY_TEXT.desert, 5),
            update: approachTo('approaching', APPROACH_DISTANCE)
        },

        approaching: {
            enter: () => storyText.show(STORY_TEXT.approaching, 5),
            update: approachTo('veryClose', VERY_CLOSE_DISTANCE)
        },

        veryClose: {
            enter: () => storyText.show(STORY_TEXT.veryClose, 5),
            update: approachTo(null, 0)
        },

        touch: {
            enter: () => {
                storyText.show(STORY_TEXT.touch, 3);
                effects.shatter(orb.position);
                orb.hide();
            },
            update: stageTime => (stageTime >= 3 ? 'transformation' : null)
        },

        transformation: {
            enter: () => {
                storyText.show(STORY_TEXT.transformation, 5);
                effects.transformation();

                // The orb's light goes out, and the sun rises
                lights.orb.intensity *= 0.2;
                state.sky.clock.hurry(8);

                audio.swellReverb();
                audio.playTransition();
            },
            update: stageTime => (stageTime >= 5 ? 'epilogue' : null)
        },

        epilogue: {
            enter: () => {
                storyText.show(STORY_TEXT.epilogue, 8);
                ui.fadeOverlay.classList.add('visible'); // Fade to white
            },
            update: stageTime => (stageTime >= 8 ? 'end' : null)
        },

        end: {
            enter: () => ui.restartButton.classList.add('visible')
        }
    };
}
