# The Mirage of Light — Roadmap

A short interactive parable inspired by *The Alchemist*: a seeker follows a distant
light across the desert and discovers that the walk itself was the treasure.

## The journey we're building

The journey matters more than the destination:

1. **Departure** — you wake before dawn beneath an old tree at the Al-Fayoum oasis. A distant light pulses on the horizon.
2. **The crossing** — the real night sky turns overhead and slowly gives way to dawn as you walk. The music grows with every stretch; small moments wait for those who wander.
3. **The light** — you reach it as the sun rises behind it, and it breaks apart.
4. **Looking back** — you turn around: your footprints glow all the way back to the oasis. The walk was the treasure.

---

## Phase 1 — Fix the foundation ✅
*Goal: everything the code already intends actually works.*

- [x] Terrain: displace the correct axis so hills actually appear
- [x] Grass: add grass groups to the scene so the grass renders
- [x] Audio: connect the reverb path (`analyser → wetGainNode`)
- [x] Audio: keep volume ≥ 0 and multiply by the slider value, so the proximity fade and slider both work
- [x] Volume slider can be used without grabbing the mouse pointer
- [x] Remove the duplicate `createVegetation()` call and the dark ground plane that covered the terrain
- [x] Mushroom spots: use a boolean flag and place spots on the cap surface
- [x] Rocks: merge vertices before deforming so they stay solid instead of cracking apart
- [x] Keep vegetation clear of the start point, the orb, and the path between them
- [x] Transformation particles: time them from when the effect starts, and remove and dispose them when finished
- [x] Scale animation by `delta` so speed is the same at 60Hz and 120Hz (delta clamped after tab switches)
- [x] Move `ambient.mp3` to `public/` so production builds include it
- [x] Add `.gitignore`

## Phase 2 — Clean structure ✅
*Goal: make the code easy to grow before adding features.*

- [x] Split `script.js` into modules under `src/`: `main.js` (setup + loop), `player.js`, `orb.js`, `audio.js`, `effects.js`, `story.js`, `stages.js`, `world/`
- [x] Replace the `setTimeout` chain with a story state machine: each stage has `enter()`, `update(stageTime, delta)` and `exit()`, and moves on based on where the player is or how long the stage has run
- [x] Move UI elements and styles into `index.html` / CSS
- [x] Repo cleanup: keep one lockfile (npm), drop `package.json` `main`, stop tracking `.idea/`, write a README (how to run it, the concept, structure)

## Phase 3 — Build the world (desert + oasis) ✅
*Goal: the space has to be big enough for a real journey.*

- [x] Larger terrain (600×600) with dunes from noise (Three.js `ImprovedNoise`, so the desert is the same every time)
- [x] **The oasis** (start point): the old tree, palms, a pool, grass and flowers
- [x] The orb placed far away (~150 units), visible on the horizon from the start; dunes stay low along the way
- [x] Fog; the orb's glow shines through it
- [x] Keep the player on the terrain surface and inside the world bounds
- [x] Drifting sand particles, dry shrubs, scattered stones and rock outcrops as landmarks
- [x] New story lines for the oasis and the desert crossing (walking time ≈ 50 s at 3 units/s)

## Phase 4 — The real sky & dawn ✅
*Goal: the sky becomes the clock of the journey.*

- [x] 5,070 real naked-eye stars (HYG database, magnitude ≤ 6) with true positions, brightness and colours, in one draw call
- [x] The real sky over the Al-Fayoum oasis for the morning you play (or `?date=YYYY-MM-DD`)
- [x] Moon in its true position and phase, and Venus, Jupiter, Mars and Saturn (via `astronomy-engine`)
- [x] Time moves from full night to sunrise **as you walk** (and only slowly while you stand still)
- [x] Twilight colours, fading stars, moonlight turning to warm sunlight, and mist lifting, all driven by the real sun's altitude
- [x] The sky is turned so the sun rises behind the light; the sun comes up as you become the light

## Phase 5 — Music of the journey
*Goal: the music tells the story of the walk.*

- [ ] Music layers driven by distance walked: wind alone → low drone → melody
- [ ] A change of key at first light
- [ ] Soft chimes near moments along the way (Phase 7)

## Phase 6 — Footprints & the look-back ending
*Goal: the final image is your own path, not the destination.*

- [ ] Footprints left in the sand as you walk
- [ ] At the end, the story asks you to turn around; your trail glows all the way back to the oasis
- [ ] Epilogue that reflects on *your* walk (distance, moments found), then the fade

## Phase 7 — Moments along the way
*Goal: reward wandering; nothing blocks the ending.*

- [ ] 4–5 optional discoveries off the straight path (a cold campfire, a camel skull, a half-buried jar, a lone flower, someone else's footprints), each with a short reflective line

## Phase 8 — Polish

- [ ] Bloom post-processing so lights actually glow
- [ ] Tone mapping + `setPixelRatio`
- [ ] Title screen, pause on `Esc`, subtitle/volume menu
- [ ] Performance pass: instanced grass and flowers, target 60fps on a laptop
- [ ] Mobile fallback: touch joystick, or a "best on desktop" notice
- [ ] Deploy (GitHub Pages / Netlify / Vercel)

---

## Decisions

1. **Setting:** the desert and the Al-Fayoum oasis (the "mirage" direction).
2. **The journey matters more than the destination:** the world, sky and music respond to how far you walk and what you notice, not only to how close you are to the light.
3. **Runs in any browser:** data is bundled with the app, nothing is downloaded while playing.
4. **Text:** original lines inspired by the book, not quotations.
