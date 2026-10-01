// testInteractables.js - Development fixtures for the interaction and environment systems: a stone
// to examine and a desert flower to observe, a few steps from where you wake. They are not part
// of the story.
//
//   stone:  focus, E (it rocks in its bed, sand slips from around it, a soft knock), and E is
//           ignored until it has settled
//   flower: focus (it stirs), E (it sways and lets go a little pollen), and without E: it leans
//           away as you come near, rustles at your footsteps, and eases back when you leave
//
// Both declare how they respond; the interaction and environment systems do the rest. main.js
// loads this only in the dev server (never in a production build), and ?fixtures=off leaves them
// out. To remove them for good, delete this file and its lines in main.js.
import * as THREE from 'three';
import { createRock, createFlower } from '../world/props.js';
import { Tip } from '../environment/responses.js';
import { plantReaction } from '../environment/vegetation.js';

// world: World; interaction: Interaction; origin: where the player wakes; toward: what they face.
// Returns { interactables, dispose() }.
export function createTestInteractables({ world, interaction, origin, toward }) {
    const forward = new THREE.Vector2(toward.x - origin.x, toward.z - origin.z).normalize();
    const right = new THREE.Vector2(-forward.y, forward.x);
    const spot = (ahead, across) => ({
        x: origin.x + forward.x * ahead + right.x * across,
        z: origin.z + forward.y * ahead + right.y * across
    });

    // A stone, a little ahead and to the right
    const stoneSpot = spot(3, 1.5);
    const stoneMesh = world.add(createRock(stoneSpot.x, stoneSpot.z, 0.55, world.heightAt, 0x8a6e52));
    const stoneTip = new Tip(stoneMesh, { tipAngle: 0.07, lift: 0.012, shift: 0.018, duration: 1.1 });
    const stone = interaction.register({
        id: 'test-stone',
        object: stoneMesh,
        prompt: 'Examine',
        interactionType: 'examine',
        dynamic: true, // It rocks, and can be moved
        // How it responds (see src/environment/reactive.js): only to being touched
        response: stoneTip,
        reactionRadius: 0.6,
        stepStrength: 0, // Too heavy for footsteps to move
        landStrength: 0,
        interactStrength: 1,
        sand: 1,
        sound: 'stone',
        interact(context) {
            console.info(`[test-stone] examined from ${context.distance.toFixed(2)}m while ${context.movementState}`);
            return stoneTip.settled(); // Busy (E ignored) until it has settled
        }
    });

    // A flower, a little ahead and to the left
    const flowerSpot = spot(3.2, -1.4);
    const flowerGroup = world.add(createFlower(flowerSpot.x, flowerSpot.z, world.heightAt));
    const flowerReaction = plantReaction(flowerGroup, 'flower');
    const flower = interaction.register({
        id: 'test-plant',
        object: flowerGroup,
        prompt: 'Observe',
        interactionType: 'observe',
        dynamic: true,
        ...flowerReaction,
        onFocus(context) {
            flowerReaction.response.push(context.direction.x, context.direction.z, 0.12); // It stirs
        },
        onProximity(context) {
            console.debug(`[test-plant] the player came near (${context.distance.toFixed(2)}m)`);
        },
        onLeaveProximity() {
            console.debug('[test-plant] the player moved away');
        },
        onStepNearby(context) {
            console.debug(`[test-plant] a step ${context.distance.toFixed(2)}m away, strength ${context.strength.toFixed(2)}`);
        },
        interact(context) {
            console.info(`[test-plant] observed from ${context.distance.toFixed(2)}m while ${context.movementState}`);
        }
    });

    return {
        interactables: [stone, flower],

        dispose() {
            interaction.unregister(stone);
            interaction.unregister(flower);
            const colliderIndex = world.colliders.indexOf(stoneMesh.userData.collider);
            if (colliderIndex !== -1) world.colliders.splice(colliderIndex, 1);
            const solidIndex = world.solids.indexOf(stoneMesh);
            if (solidIndex !== -1) world.solids.splice(solidIndex, 1);
            [stoneMesh, flowerGroup].forEach(object => {
                object.removeFromParent();
                object.traverse(part => {
                    part.geometry?.dispose();
                    part.material?.dispose();
                });
            });
        }
    };
}
