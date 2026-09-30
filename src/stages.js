// stages.js - The stages of the journey, from waking in the dark to becoming the light

const STORY_TEXT = {
    intro: "You find yourself in a strange, dark place. In the distance, a pulsing light beckons to you...",
    approaching: "As you draw closer, the light seems to respond to your presence. You hear faint whispers that you can't quite understand...",
    veryClose: "The light pulses faster now. The whispers grow clearer: \"Seeker... find... truth...\" The orb's energy surrounds you.",
    touch: "You reach out to touch the light. It responds to your touch, fracturing into countless shards of brilliant light!",
    transformation: "The fragments of light swirl around you, entering your body. You feel yourself becoming one with the light...",
    epilogue: "As your consciousness expands, you understand: you were the light all along, separated from yourself. You are whole again."
};

// Distances to the orb that move the story forward
const APPROACH_DISTANCE = 6;
const VERY_CLOSE_DISTANCE = 4;
const TOUCH_DISTANCE = 1.5;

// world: { orb, audio, effects, storyText, lights, ui, distanceToOrb }
export function createStages(world) {
    const { orb, audio, effects, storyText, lights, ui } = world;

    // Walking toward the orb: touching it always wins; otherwise the next
    // line of text waits until the current one has finished.
    const approachTo = (nextStage, distance) => () => {
        if (world.distanceToOrb < TOUCH_DISTANCE) return 'touch';
        if (!storyText.isShowing && world.distanceToOrb < distance) return nextStage;
    };

    return {
        intro: {
            enter: () => storyText.show(STORY_TEXT.intro),
            update: approachTo('approaching', APPROACH_DISTANCE)
        },

        approaching: {
            enter: () => storyText.show(STORY_TEXT.approaching),
            update: approachTo('veryClose', VERY_CLOSE_DISTANCE)
        },

        veryClose: {
            enter: () => storyText.show(STORY_TEXT.veryClose),
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

                // Dim the world for dramatic effect
                lights.ambient.intensity = 0.1;
                lights.orb.intensity = 0.2;

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
