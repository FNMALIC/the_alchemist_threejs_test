// vegetation.js - The desert's own plants as reactive objects: dry shrubs that shiver and rustle
// as you pass and shed a few dry bits, flowers by the pool that lean away from your feet, sway
// back when you've gone and let go a little pollen. Their look is untouched; they only move.
import { createReactive } from './reactive.js';
import { Sway } from './responses.js';

// How each kind of plant answers the player (see reactive.js and responses.js for the fields)
const PLANTS = {
    // Stiff, dry, knee-high: small quick shivers, felt only when walking right past
    shrub: {
        reactionRadius: 0.8,
        stepRadius: 1.4,
        sway: { stiffness: 170, duration: 0.9, pushBend: 0.05, leanBend: 0.06, maxBend: 0.1 },
        sound: 'rustle',
        loudness: 0.8,
        particles: 'flakes',
        brushes: true
    },
    // Soft and light: leans away slowly, sways longer
    flower: {
        reactionRadius: 0.9,
        stepRadius: 1.5,
        sway: { stiffness: 45, duration: 2.2, pushBend: 0.12, leanBend: 0.2, maxBend: 0.32 },
        sound: 'rustle',
        loudness: 0.25,
        particles: 'motes',
        brushes: false,
        interactStrength: 0.9
    }
};

// The reactive fields for a plant of `kind` ('shrub' or 'flower'), with its own response, ready
// to pass to createReactive or to spread into an interactable
export function plantReaction(object, kind) {
    const { sway, ...plant } = PLANTS[kind];
    return { ...plant, response: new Sway(object, sway) };
}

// plants: [{ object, kind }] (see World.vegetation). Returns the reactives.
export function registerVegetation(environment, plants) {
    return plants.map(({ object, kind }, index) => environment.registerReactive(
        createReactive({ id: `${kind}-${index}`, object, ...plantReaction(object, kind) })
    ));
}
