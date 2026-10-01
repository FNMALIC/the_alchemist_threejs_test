// wind.js - One wind for the whole desert: the dust, the music, the palms and grass, the ripples
// in the sand, the sand streaming off the crests, and how fast footprints fill in all follow it.
//
// Through the night it goes the way desert winds do: still in the cold hours, a breeze rising
// before dawn as the air begins to move, still again as the sun comes up, then a light warm
// breeze later in the morning. The sandstorm, when it comes, overrides all of it.
import * as THREE from 'three';

const smoothstep = THREE.MathUtils.smoothstep;

// Sand starts to move (saltation) only above this strength: calm air leaves the crests alone
export const SAND_MOVES_AT = 0.35;

export class Wind {
    constructor() {
        this.baseAngle = Math.atan2(0.6, 1.6); // Blowing toward +x, a little toward +z
        this.direction = new THREE.Vector2(1.6, 0.6).normalize(); // Where it blows to (x, z)
        this.strength = 0.15; // 0 still .. 1 a strong breeze (the storm goes beyond)
        this.calm = 0.15; // The same without gusts or storm, for things that change slowly
        this.gust = 1; // Around 1: the moment-to-moment swell
        this.erosion = 0; // Accumulated wind work: footprints fill in as it grows
        this.time = 0;
    }

    // sunAltitude: degrees; storm: 0 calm .. 1 sandstorm
    update(delta, sunAltitude, storm = 0) {
        this.time += delta;
        const t = this.time;

        // The night's shape (by the sun, so it follows the real dawn)
        const predawn = smoothstep(sunAltitude, -15, -7) * (1 - smoothstep(sunAltitude, -3, 1));
        const morning = smoothstep(sunAltitude, 6, 12);
        const target = 0.12 + 0.6 * predawn + 0.18 * morning;
        this.calm += (target - this.calm) * Math.min(1, delta / 8); // Changes over many seconds

        // Gusts: a slow swell with quicker flurries in it
        this.gust = 0.75 + 0.25 * Math.sin(t * 0.35) + 0.12 * Math.sin(t * 1.3 + 1) + 0.06 * Math.sin(t * 3.1 + 2);
        this.strength = this.calm * this.gust + storm * 1.6;

        // It veers slowly, a few degrees either way
        const angle = this.baseAngle + 0.18 * Math.sin(t * 0.021) + 0.06 * Math.sin(t * 0.13);
        this.direction.set(Math.cos(angle), Math.sin(angle));

        // Footprints fill faster the harder it blows; a storm erases a trail in moments
        this.erosion += delta * (0.05 + this.strength);
    }

    // How strongly sand is being blown along the ground (0 below the threshold)
    get transport() {
        return Math.max(0, this.strength - SAND_MOVES_AT);
    }
}
