// spring.js - Critically damped spring, shared by the head and hands so their motion has weight
// and lag instead of following a perfect sine wave.
// (See Daniel Holden, "Spring-It-On: The Game Developer's Spring-Roll-Call")

const LN2 = Math.log(2);

// state: { x, v }; moves x toward target, reaching half the distance in about `halfLife` seconds
export function spring(state, target, halfLife, dt) {
    const y = (2 * LN2) / halfLife;
    const j0 = state.x - target;
    const j1 = state.v + j0 * y;
    const decay = Math.exp(-y * dt);
    state.x = decay * (j0 + j1 * dt) + target;
    state.v = decay * (state.v - j1 * y * dt);
}
