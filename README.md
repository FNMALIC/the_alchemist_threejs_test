# The Mirage of Light

A short interactive parable in Three.js, inspired by Paulo Coelho's *The Alchemist*.

You wake before dawn beneath an old tree at the Al-Fayoum oasis in Egypt. Far away, a light.
Overhead is the real sky of this morning: the stars, moon and planets where they actually
are over the oasis today. As you walk, the night turns slowly toward sunrise and the music
grows. Someone crossed this desert before you: at the places they stopped, scraps of a
letter, weighted with stones, written to someone they left behind. Halfway across, a
sandstorm takes the stars. You reach the light as the sun rises behind it, and it fades
away. Their footprints turn back toward home. Under the old tree, by their stones, the
last letter is waiting. You can sit.

The desert remembers you: the next time you come, your last walk is still faintly in the
sand, and a pebble lies by the stones for each time you sat there.

The journey matters more than the destination: there is no message at the end.

## Running it

```bash
npm install
npm run dev       # start a dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build
```

**Controls:** click to start, move the mouse to look around, WASD / arrow keys to walk,
Shift to hurry, Space to jump, E to interact with something you are looking at (or to sit
under the old tree, in the morning), Esc to let go of the mouse (click to carry on).
Headphones recommended.

**Weaker device?** Add `?quality=low` to the URL to turn off bloom and shadows.

**Choose a morning:** add `?date=YYYY-MM-DD` to the URL to see the sky of another day,
e.g. `http://localhost:5173/?date=2027-01-15`.

## Project structure

```
index.html            Page, UI elements and styles
public/ambient.mp3    Background music
scripts/
  build-stars.mjs     Generates src/data/stars.json from the HYG star database
  build-constellations.mjs  Generates src/data/constellations.json from d3-celestial
src/
  main.js             Scene setup and main loop
  render.js           Renderer, tone mapping, shadows, bloom, quality settings; the morning's heat haze and mirage
  stages.js           The journey: night, crossing, mirage, morning, rest
  story.js            Story state machine and story text overlay
  moments.js          Discoveries along the way (lines and letters), shown once when you come near
  storm.js            The sandstorm partway across: when it rises, how long it lasts
  memory.js           What the browser remembers between visits: your journeys and your last walk
  player/
    playerController.js  The player: input, and the order its parts update in each frame
    pointerLock.js       Pointer Lock API (Esc releases, click locks again)
    firstPersonCamera.js Mouse look: the body turns (yaw), the head tilts (pitch, clamped)
    movement.js          Movement and sand physics: climbing, sliding, sinking, wading, jumping, collisions
    movementState.js     idle / walking / sprinting / sliding / jumping / falling / landing, with change events
    breathing.js         One uneven breath, quicker after hurrying, felt in the head
    headBob.js           The head's motion: gait, breathing when still, a nod on landing
    gait.js              Natural head motion while walking (step rhythm, sway, roll)
    spring.js            Critically damped spring used by the head
    bodyShadow.js        Your shadow on the sand, from a body only the lights can see
  interactions/
    interaction.js       Noticing things: focus state machine, E to interact, events, context
    gaze.js              What the crosshair rests on: centre ray plus a little tolerance, registered things only
    occlusion.js         Whether something solid (a trunk, a rock, a dune) hides it from view
    bounds.js            Bounding spheres that follow moving things cheaply
    interactable.js      The contract every interactable thing follows (createInteractable)
    interactionRegistry.js  The things that can be interacted with
    focusHighlight.js    The gentle edge light on what is in focus (never touches its materials)
    interactionPrompt.js The "E  Examine" prompt and the crosshair's focused ring
    interactionDebug.js  Dev only (?debug): what the gaze rests on
    testInteractables.js Dev only: a test stone and flower near the start (?fixtures=off hides them)
  environment/
    environment.js       The world noticing the player: proximity, footsteps, landings, touches, events
    reactive.js          The contract for things that respond to the player (createReactive)
    responses.js         How they move: Sway (plants), Tip (stones); springs that always settle
    vegetation.js        The desert's shrubs and the oasis flowers as reactive plants
    sandResponse.js      The sand under the feet: footprints, grains and dust for steps, landings, slides
    particles.js         Pooled dust puffs, pollen and dry bits, one draw call
    spatialGrid.js       Reactive things sorted into cells, so only nearby ones are looked at
  orb.js              The light: glowing orb, sound-reactive waves and particles; fades away like a mirage
  audio.js            Background track, proximity volume fade and reverb
  music.js            Music that grows with the walk: wind, drone, plucked Hijaz melody, key change at first light;
                      the crest whistle, the singing dune and the jackal
  soundscape.js       Places of silence, crests and hollows, singing dunes, the one jackal
  data/stars.json     5,070 naked-eye stars (generated, see below)
  world/
    world.js          Puts the world together: oasis, desert, lights, fog
    terrain.js        Dune height function and ground mesh; the mesh follows you, so the desert never ends
    desertChunks.js   The desert beyond the known one: stones, shrubs and outcrops made (and taken away) as you walk
    sky.js            The real sky: stars that twinkle low and hold still overhead, moon phase, planets
                      (Venus glowing as the morning star), zodiacal light, twilight colours, sun and moonlight
    milkyWay.js       The Milky Way, placed by galactic coordinates, with the Great Rift and Andromeda
    meteors.js        Shooting stars at real rates: sporadic ones and the year's showers from their radiants
    wind.js           One wind for everything: still at night, a breeze before dawn, still at sunrise
    sandWisps.js      Sand blowing off the high dune crests when the wind can lift it
    constellations.js Rest your gaze on a constellation and its figure draws itself, then its name
    astronomy.js      Sky positions over Al-Fayoum, dawn times, and the walking-driven sky clock
    props.js          Old tree, palms, shrubs, rocks, grass, flowers (seeded, for the endless desert)
    traces.js         The other traveller: their trail (and their mood in it), campfire, well, jar, letters,
                      the hollow where they watched the stars, a drawing, a white stone, the hole under the light
    dust.js           Sand drifting on the wind
    sandPatch.js      Detailed sand around the player: footprints and slide grooves pressed in as real dents, slowly filled by the wind
    footprints.js     The footprint trail further away (fades after a few minutes)
    sandSpray.js      Grains kicked up by steps, landings and slides
```

In dev mode (`npm run dev`), `window.mirage` exposes the scene, camera, player, world and
story for debugging in the browser console, e.g. `mirage.story.goTo('mirage')`,
`mirage.world.sky.clock.progress = 0.9`, or `mirage.debug.timeScale = 4` to fast-forward.

### The player

`PlayerController` owns the player's parts and updates them in order each frame: the body
moves (`Movement`), its state is worked out once (`MovementState`), then the breath and head
follow from that state. Other systems read the player only through the controller:
`player.position`, `player.state.current`, `player.slide`, the `step` and `land` events
(`player.addEventListener('step', ({ step }) => ...)`, also the `onStep` / `onLand` hooks), and
`player.state.addEventListener('change', ...)` or `player.pointerLock.addEventListener('lock' | 'unlock', ...)`.

In dev mode, `mirage.player.state.current` shows the movement state.

### Interactions

Things become interactable by registering them; the interaction system never knows what
they are, it only calls their own hooks:

```js
const stone = player.interaction.register({
    id: 'old-stone',              // for code and debugging, never shown
    object: stoneMesh,            // the Object3D the gaze can rest on
    prompt: 'Examine',            // shown under the crosshair
    onFocus(context) {},          // optional
    onBlur(context) {},           // optional
    interact(context) {           // E; may return a promise for a longer interaction
        console.log(context.distance, context.movementState);
    }
});
player.interaction.unregister(stone);
```

`context` has `player`, `camera`, `scene`, `interaction`, `target`, `distance`,
`point`, `eye`, `position`, `direction` and `movementState`. Other options: `maxDistance`,
`repeatable` (holding E repeats), `cooldown` (seconds before E works on it again, default 0.25),
`highlight` (default on), `enabled`, and `dynamic: true` for things that move (their bounds then
follow them each frame, cheaply; a static thing that was moved can call `updateBounds()`).

The gaze tests only registered things, within `INTERACTION_DISTANCE` (3 m, in `main.js`) of the
eye, and only while the pointer is locked. Something solid in the way hides what is behind it:
by default the world's solids (palm trunks, the old tree, larger rocks; `world.solids`) and the
dunes. `player.interaction.occlusion.enabled = false` switches that off, and
`occlusion.addBlocker(object)` adds more. Listen with `player.interaction.addEventListener(type, ...)`
for `focus`, `blur`, `targetchange`, `interact` and `interactend` (each with `interactable`);
`player.interaction.target` and `.state` (`none`, `focused`, `interacting`) say where things stand.

### The environment

Things that respond to the player's presence register with the environment; nothing in the
player knows about them. The desert's shrubs and the oasis flowers are registered this way
(`registerVegetation` in `main.js`): they lean away when you come near, shiver at your steps
and landings, and settle back.

```js
import { Sway } from './environment/responses.js';

const bush = environment.registerReactive({
    id: 'bush',
    object: bushMesh,
    reactionRadius: 1,             // metres: "near" for enter / leave
    response: new Sway(bushMesh),  // how it moves (or Tip, for something heavy)
    sound: 'rustle',               // for a sound hook (none plays for now)
    onProximity(context) {},       // optional: onLeaveProximity, onStepNearby, onLandNearby
});
environment.unregisterReactive(bush);
```

An interactable can take the same options (`response`, `reactionRadius`, `onProximity`, ...,
plus `interactStrength` for how much E moves it): the environment picks it up while it is
registered. The environment's events are the hooks for sound and anything later: `playerenter`,
`playerleave`, `stepnearby`, `landnearby`, `react` (something moved: `cause` is `proximity`,
`step`, `land` or `interact`) and `sand` (sand disturbed). In `?quality=low` there are fewer
particles, they fade sooner, and pollen and dry bits are left out.

In the dev server, a test stone and flower sit a few steps from the start (`?fixtures=off` leaves
them out), `?debug` shows what the gaze rests on and what is near, and `mirage.interaction` and
`mirage.environment` are the systems themselves. None of this is in a production build.

### Adding to the story

The journey is a list of stages in `src/stages.js`. Each stage can define:

- `enter()`: runs when the stage starts (show text, trigger effects)
- `update(stageTime, delta)`: return the name of the next stage to move on
- `exit()`: runs when the stage ends

### How the sky works

- The sky clock runs from full night (just before astronomical dawn) to just after sunrise.
  It advances with the distance you walk (about 160 units for the whole dawn), and only
  slowly on its own while you stand still.
- The whole sky is turned so that the sun rises directly behind the light.
- Everything is bundled with the app; nothing is downloaded while playing.

## Star data

`src/data/stars.json` is generated from the [HYG database](https://github.com/astronexus/HYG-Database)
(v3.8, by David Nash), which combines the Hipparcos, Yale Bright Star and Gliese catalogues:

```bash
node scripts/build-stars.mjs path/to/hyg_v38.csv.gz
```

`src/data/constellations.json` (the figures of all 88 constellations and their names) is generated
from [d3-celestial](https://github.com/ofrohn/d3-celestial)'s `data/constellations.lines.json` and
`data/constellations.json`:

```bash
node scripts/build-constellations.mjs path/to/constellations.lines.json path/to/constellations.json
```

## Credits

- Star data: HYG database, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  `src/data/stars.json` is a derived work under the same licence.
- Constellation figures and names: [d3-celestial](https://github.com/ofrohn/d3-celestial) by
  Olaf Frohn, BSD 3-clause licence (Copyright (c) 2015, Olaf Frohn).
- Sun, moon and planet positions: [astronomy-engine](https://github.com/cosinekitty/astronomy)
  by Don Cross, MIT licence.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's done and what's next: music that grows with the
walk, footprints and a look-back ending, and small moments along the way.
