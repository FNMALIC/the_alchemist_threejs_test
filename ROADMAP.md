# The Mirage of Light — Roadmap

A short interactive parable inspired by *The Alchemist*: a seeker follows a distant
light across the desert and discovers that the walk itself was the treasure.

## The journey we're building

The journey matters more than the destination. Very few words; the world tells the story.

1. **Night** — you wake beneath an old tree at the Al-Fayoum oasis. *Far away, a light.*
2. **The crossing** — the real sky turns overhead and gives way to dawn as you walk; the music grows. Someone walked here before you: their old footprints, a cold campfire, a dry well, a water jar.
3. **The mirage** — you reach the light as the sun rises behind it, and it fades away. *Their footprints turn back here.*
4. **Morning** — follow them home, or don't.
5. **Rest** — under the old tree, beside their small stack of stones, you can sit. The music falls away, the light whitens, a bird. Nothing more.

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

## Sand you can press into ✅
*Goal: inspired by desert-dusky (Babylon.js/WebGPU): real footprint dents, while staying WebGL and browser-friendly.*

- [x] A 16 m patch of detailed sand follows the player (6 cm vertices, 1.6 cm deformation texture); the shader places, shades and colours it and blends its edge into the desert, so moving it costs only a few milliseconds
- [x] Each step presses a bare-sole print (deepest at heel and ball, narrower arch, a rim of pushed-aside sand); landings press both feet; sliding cuts a groove with low banks
- [x] The wind slowly fills dents back in (half-filled after 2.5 minutes); further away, footprint marks carry the trail on and fade after 4-8 minutes

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

## Phase 5 — Music of the journey ✅
*Goal: the music tells the story of the walk.*

- [x] Footsteps generated in the browser: heel thump + sand crunch, alternating left/right, splashes in the pool, a thud on landing; they keep playing when the music fades near the light
- [x] Music layers driven by distance walked: wind in gusts at the oasis → a low drone on D and A → the background track at full → a sparse plucked (Karplus-Strong, oud-like) melody in the Hijaz scale, with a desert echo
- [x] A change of key at first light: the melody turns to D major pentatonic and the drone gains a major third
- [ ] Soft chimes near the traces along the way

## The story, rewritten ✅
*Goal: the journey is the story; the ending is quiet and empty.*

- [x] Five stages: night, crossing, mirage, morning, rest; only three short lines from the story itself
- [x] The other traveller, told only through traces: their half-erased trail out to the light and back home, a cold campfire, a dry well, a water jar, a stack of stones under the old tree; each trace has one line, found only by wandering
- [x] The light fades into the sunrise (no shatter, no explanation)
- [x] Sit under the old tree (E): the music falls away, the screen whitens, a bird, "Walk again"
- [x] Footstep sounds turned off (later removed altogether)

## Something to feel ✅
*Goal: the journey had beauty but no feeling. Give it a person, one hard moment, and memory.*

- [x] The traveller's letters: at the campfire, the well, the jar, where the light was and under the tree, a scrap of paper weighted with a stone. The last one reveals who they were writing to.
- [x] A sandstorm partway across: stars gone, sand-coloured haze, the wind roars over the music and pushes you; then it passes
- [x] The desert remembers (in this browser): your last walk appears faintly in the sand ("Footprints. Yours."), and a pebble is added by the stones each time you sit

## A desert without end ✅
*Goal: no invisible wall. You can walk the wrong way for as long as you like.*

- [x] The dunes are a formula, so the ground mesh follows the player: it is worked out again around them a few rows per frame, then jumps 60 m (a whole number of grid cells and ripple tiles, so the jump can't be seen)
- [x] Beyond the known desert, 60 m squares grow their own stones, dry shrubs and now and then an outcrop, from their own seed, so a place looks the same when you come back; squares far behind are taken away
- [x] Streamed shrubs still answer the player (the environment registers and unregisters them)

## Quieter, emptier ✅
- [x] The first-person hands are gone: nothing between you and the desert
- [x] Walking is silent: no footsteps, landing or sliding sounds, and no rustles or stone sounds from the environment (the music, wind and birdsong stay)

## A sky to look up at ✅
*Goal: the sky rewards those who stop and look. Everything follows the real date over Al-Fayoum.*

- [x] Shooting stars at real rates: ~6 an hour on an ordinary night, more during the year's 11 major showers (from their radiants, only while above the horizon), fewer as dawn brightens the sky; you might miss them
- [x] Stars twinkle with the air they shine through: strongly near the horizon (bright low stars flash colours), almost steady overhead; low stars are dimmer and redder; planets don't twinkle
- [x] The Milky Way placed by real galactic coordinates, mottled with star clouds and split by the Great Rift, plus the Andromeda galaxy; only on a dark night, washed out by the moon and by twilight
- [x] The zodiacal light: a faint tilted cone along the ecliptic, rising above where the sun will come up, before twilight begins
- [x] Venus as the morning star when it is up (from November 2026): the brightest light before sunrise, with a soft glow; Jupiter glows a little too
- [x] Constellations: rest the centre dot on one for a moment and its figure draws itself from star to star (each star ringed as the line reaches it), then its name and meaning appear below it ("Aries, the Ram"); all 88, only on a dark enough night, above the horizon and with nothing in the way; looking away fades it

## Wind and sand ✅
*Goal: the desert is never quite still, and it does not keep your path.*

- [x] One wind (`wind.js`) for the dust, the music's wind, the palms and grass, the ripples, the crests and the footprints; it veers a few degrees over time
- [x] The night's wind follows the real sun: still in the cold hours, a breeze rising before dawn (from ~15° below the horizon), still again at sunrise, a light warm breeze later in the morning; the storm overrides it
- [x] Sand streams off the high crests in thin wisps once the wind can lift it (above a threshold, more as it rises), carried downwind off the sharp edge; against a low sun or the moon the grains shine
- [x] The ripples creep downwind, a centimetre or two a second
- [x] Footprints age by the wind's work, not by the clock: a breeze fills them in a minute or two, still air leaves them for many minutes, the storm wipes the trail; distant prints fill grain by grain from the side the wind comes from
- [x] The sand cools and warms: blue-tinted at night, gold at sunrise, plain and warm by mid-morning
- [x] The morning goes on after the light: walking home, the sun climbs (up to an hour past sunrise), and by mid-morning the warm air makes the far horizon shimmer

## Light and atmosphere ✅
- [x] Heat haze that knows what is far: only distant ground wavers (read from the depth buffer); just under the far skyline a thin strip of sky appears on the hot sand, the inferior mirage that looks like water
- [x] Your shadow: a body only the lights see (legs, arms, head; it swings as you walk and folds when you sit) casts a long shadow at sunrise, ahead of you on the way home, and a moon shadow at night
- [x] Moonlight by the moon's real brightness (its magnitude: a half moon gives about a tenth of a full moon's light), silver when high, warmer near the horizon; a bright moon turns the night sky deep blue; a moonless night is starlit, dim but readable
- [x] The light's warm glow pools wide on the sand around it, stronger as you come close, and bounces back up from the sand, warming everything from below

## Next ideas

- [ ] Daylight details on the way back: things you passed in the dark look different in the morning
- [ ] Morning sounds at the oasis (birds, water)

## Polish

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
