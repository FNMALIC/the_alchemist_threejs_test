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

## Graphics & physics pass ✅
*Goal: the same journey, but it looks and feels more real.*

- [x] ACES tone mapping, bloom (half resolution) on the light, sun and moon, capped pixel ratio
- [x] Reflections of the sky (environment map re-rendered as dawn progresses): the pool mirrors the sky
- [x] Sand: wind-ripple normal map, pale crests and deeper hollows, damp sand around the pool
- [x] Soft shadows from the moon, then the sun, in an area that follows the player; dunes and palms cast long shadows at dawn
- [x] Wind gusts: palm crowns sway; grass is instanced (one draw call per patch) and bends in the wind
- [x] Player physics: collisions with trunks and rocks (sliding along them), slower uphill / faster downhill, wading in the pool, jumping with gravity, head bob and landing dip
- [x] Shatter sparks bounce on the sand; the light hovers gently
- [x] `?quality=low` turns off bloom and shadows for weaker devices

## Walking & sand physics ✅
*Goal: walking feels human and the sand feels like sand (researched: human gait, sand biomechanics, Journey, Farnell's procedural footsteps).*

- [x] Real walking pace (1.8 m/s, ~2 steps/s) and Shift to hurry (3.1 m/s, quicker steps)
- [x] Head motion from human gait: lowest after heel strike, highest mid-step, drifting over the supporting foot with a hint of roll; driven through critically damped springs, every step slightly different
- [x] Sand friction: undisturbed sand holds to 34° (angle of repose); feet dig in climbing (30°), loosen it going down (22°): steep faces slide, and running down a dune becomes surfing
- [x] Climbing sand is slow and heavy near the angle of repose; feet sink a little into soft sand, not the packed sand around the pool
- [x] Footprints left and right in the sand, on the real ground surface; grains kicked up by steps, landings and slides
- [x] Journey-style glitter: grains flash in the moonlight and sunlight
- [x] Footstep sound in three phases (heel, roll, toe-off), heavier uphill, skidding downhill, a hiss while sliding

## First-person presence ✅
*Goal: not a camera moving through the desert, but standing inside it.*

- [x] Player split into modules under `src/player/`: pointer lock, mouse look, movement, movement state, breathing, head motion, hands
- [x] Mouse turns the body (yaw) and tilts the head (pitch, clamped to +85° / −80°); Esc releases the mouse, a click takes it back, held keys are let go
- [x] One movement state for everything to react to: idle, walking, sprinting, sliding, jumping, falling, landing
- [x] Two low-poly hands in linen sleeves at the bottom of the view, drawn in their own pass so they never sink into palms or rocks
- [x] Hands breathe when still, swing gently with the steps (more when hurrying), trail behind quick turns, lift in a jump and settle on landing, ease outward when sliding, and sink out of view when you look up at the sky
- [x] Breathing when standing still (quicker and deeper after hurrying) and a small nod on landing, on top of the existing gait
- [x] A faint centre dot while looking around; the volume control steps aside until Esc

## Noticing things ✅
*Goal: the foundation for interaction — look, notice, focus, interact, the world responds.*

- [x] A generic interaction system (`src/interactions/`), separate from the player controller; it never knows what a thing is, only the interactable contract (`onFocus`, `onBlur`, `interact`)
- [x] Registry of interactable things; the gaze only ever tests those, never the rest of the scene
- [x] Gaze from the centre of the view, within a configurable reach (3 m), with a little aim tolerance for small things and a little hold so focus doesn't flicker
- [x] Focus states (none → focused → interacting) with `focus`, `blur`, `targetchange`, `interact` and `interactend` events; interactions may be instant or take time
- [x] A gentle warm edge light on what is in focus, without touching its materials; a quiet "E  Examine" prompt; the crosshair opens into a faint ring
- [x] E interacts once per press (holding doesn't repeat unless allowed); nothing happens while the pointer is free
- [x] Hands lift a touch when something is in focus; the right hand makes a small reach on E
- [x] Development fixtures (a stone and a flower near the start, dev server only) and a `?debug` readout
- [x] Story subtitles sit just above the left hand instead of over it

## The world notices you ✅
*Goal: your presence has consequences — the sand, the plants and the stones answer you, quietly.*

- [x] An environment system (`src/environment/`) that listens to what the player does (steps, landings, where they stand, what they touch) and lets nearby reactive things respond in their own way; the player knows nothing about them
- [x] Reactive objects register and unregister; a spatial grid means only nearby ones are looked at; enter / leave once each, with a little margin so standing at the edge doesn't flicker
- [x] Interactables can respond to presence too (`onProximity`, `onLeaveProximity`, `onStepNearby`, `onLandNearby`, `response`), fully backwards compatible
- [x] Plants (the desert's shrubs and the oasis flowers): lean away while you are near and ease back after, shiver at nearby footsteps (more when hurrying) and landings, away from your feet and along your way; walking right through a shrub brushes your hand
- [x] Stones rock in their bed when touched: tip, lift and shift a little, push sand aside, settle back within a second or so; E waits until they have settled
- [x] Sand: footprints and grains as before, plus more grains and a faint puff when hurrying, a ring of grains and dust on landing, a trickle of dust while sliding
- [x] Pooled particles (dust, pollen, dry bits), coloured by the light so they never glow at night; fewer and shorter-lived in `?quality=low`, secondary ones left out
- [x] Small sounds made in the browser: dry rustles, a stone shifting, sand sifting; the environment's events are the hooks for more later
- [x] The hand pauses a moment at the touch before coming back
- [x] Solid things (trunks, the old tree, rocks, dunes) hide what is behind them from the gaze
- [x] `dynamic` interactables and reactive objects: their bounds follow them each frame, cheaply

## Phase 5 — Music of the journey
*Goal: the music tells the story of the walk.*

- [x] Footsteps generated in the browser: heel thump + sand crunch, alternating left/right, splashes in the pool, a thud on landing; they keep playing when the music fades near the light
- [ ] Music layers driven by distance walked: wind alone → low drone → melody
- [ ] A change of key at first light
- [ ] Soft chimes near moments along the way (Phase 7)

## Phase 6 — The look-back ending
*Goal: the final image is your own path, not the destination.*

- [x] Footprints left in the sand as you walk
- [ ] At the end, the story asks you to turn around; your trail glows all the way back to the oasis
- [ ] Epilogue that reflects on *your* walk (distance, moments found), then the fade

## Phase 7 — Moments along the way
*Goal: reward wandering; nothing blocks the ending.*

- [ ] 4–5 optional discoveries off the straight path (a cold campfire, a camel skull, a half-buried jar, a lone flower, someone else's footprints), each with a short reflective line

## Phase 8 — Polish

- [ ] Title screen, pause on `Esc`, subtitle/volume menu
- [ ] Performance pass: instanced flowers and shrubs, measure on real laptops (target 60fps)
- [ ] Mobile fallback: touch joystick, or a "best on desktop" notice
- [ ] Deploy (GitHub Pages / Netlify / Vercel)

---

## Decisions

1. **Setting:** the desert and the Al-Fayoum oasis (the "mirage" direction).
2. **The journey matters more than the destination:** the world, sky and music respond to how far you walk and what you notice, not only to how close you are to the light.
3. **Runs in any browser:** data is bundled with the app, nothing is downloaded while playing.
4. **Text:** original lines inspired by the book, not quotations.
