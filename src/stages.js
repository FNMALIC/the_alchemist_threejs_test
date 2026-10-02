// stages.js - The journey. Very few words: the world, the sky and the music carry the rest.
//
//   night      you wake under the old tree. Far away, a light.
//   crossing   the desert. Someone else's traces wait for those who wander (see moments.js).
//   mirage     you reach the light as the sun rises behind it, and it fades away.
//   morning    their footprints turn back toward home. You may follow, or not.
//   rest       under the old tree, you sit. The music falls away, the light whitens, a bird.
// The traveller's letters (traces.js) and the storm (storm.js) run alongside these stages.

const LINES = {
    night: 'Far away, a light.',
    crossing: 'The sand is still cold.'
};

const LEAVE_OASIS_DISTANCE = 25; // From where you woke
const REACH_DISTANCE = 4.5; // From the light, along the ground
const SEAT_DISTANCE = 2.5; // From the place under the old tree where you can sit

// state: { orb, audio, music, storyText, sky, player, traces, ui, remember(), returnLine,
//          distanceToOrb (along the ground), distanceFromStart, distanceToSeat, wantsToSit }
export function createStages(state) {
    const { orb, audio, music, storyText, sky, player, traces, ui } = state;
    let birdSang = false;

    return {
        night: {
            update: stageTime => {
                if (stageTime > 2 && !state.nightLineShown) {
                    state.nightLineShown = true;
                    storyText.show(LINES.night, 6);
                }
                // Coming back: how the sky has changed since last time
                if (state.returnLine && stageTime > 9 && !storyText.isShowing) {
                    storyText.show(state.returnLine, 6);
                    state.returnLine = null;
                }
                if (state.distanceToOrb < REACH_DISTANCE) return 'mirage';
                if (state.distanceFromStart > LEAVE_OASIS_DISTANCE && !storyText.isShowing) return 'crossing';
            }
        },

        crossing: {
            enter: () => storyText.show(LINES.crossing, 5),
            update: () => (state.distanceToOrb < REACH_DISTANCE ? 'mirage' : null)
        },

        mirage: {
            enter: () => {
                // The sun comes up behind the light, and the light fades into it
                sky.clock.hurry(10);
                orb.fadeAway(9);
            },
            update: stageTime => (stageTime > 11 ? 'morning' : null)
        },

        morning: {
            enter: () => traces.morningTracks(), // The desert was busy in the night
            update: () => {
                const nearSeat = state.distanceToSeat < SEAT_DISTANCE;
                ui.hint.classList.toggle('visible', nearSeat);
                if (nearSeat && state.wantsToSit) return 'rest';
                state.wantsToSit = false;
            }
        },

        rest: {
            enter: () => {
                ui.hint.classList.remove('visible');
                player.sit(traces.seat.x, traces.seat.z, traces.lookFromSeat.x, traces.lookFromSeat.z);
                audio.fadeMusicOut(10);
                state.remember(); // The desert keeps this walk, and one more pebble by the stones
            },
            update: stageTime => {
                if (stageTime > 9) ui.fadeOverlay.classList.add('visible');
                if (stageTime > 18 && !birdSang) {
                    birdSang = true;
                    music.birdsong();
                }
                if (stageTime > 22) ui.restartButton.classList.add('visible');
            }
        }
    };
}
