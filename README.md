# The Mirage of Light

A short interactive parable in Three.js, inspired by Paulo Coelho's *The Alchemist*.

You wake before dawn beneath an old tree at the Al-Fayoum oasis in Egypt. Far across
the dunes, a light is pulsing. Overhead is the real sky of this morning: the stars,
moon and planets where they actually are over the oasis today. As you walk, the night
turns slowly toward sunrise, the mist lifts and the world grows quiet and echoing,
until you reach the light as the sun rises behind it.

## Running it

```bash
npm install
npm run dev       # start a dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build
```

**Controls:** click to start, move the mouse to look around, WASD / arrow keys to walk,
Space to jump. Headphones recommended.

**Weaker device?** Add `?quality=low` to the URL to turn off bloom and shadows.

**Choose a morning:** add `?date=YYYY-MM-DD` to the URL to see the sky of another day,
e.g. `http://localhost:5173/?date=2027-01-15`.

## Project structure

```
index.html            Page, UI elements and styles
public/ambient.mp3    Background music
scripts/
  build-stars.mjs     Generates src/data/stars.json from the HYG star database
src/
  main.js             Scene setup and main loop
  render.js           Renderer, tone mapping, shadows, bloom, quality settings
  stages.js           The stages of the journey (story text and what happens at each stage)
  story.js            Story state machine and story text overlay
  player.js           First-person movement: slopes, wading, jumping, collisions, head bob
  orb.js              The glowing orb, its sound-reactive waves and particles
  audio.js            Music, proximity volume fade and reverb
  effects.js          One-shot particle effects (shatter, transformation)
  data/stars.json     5,070 naked-eye stars (generated, see below)
  world/
    world.js          Puts the world together: oasis, desert, lights, fog
    terrain.js        Dune height function and ground mesh
    sky.js            The real sky: stars, moon phase, planets, twilight colours, sun and moonlight
    astronomy.js      Sky positions over Al-Fayoum, dawn times, and the walking-driven sky clock
    props.js          Old tree, palms, shrubs, rocks, grass, flowers
    dust.js           Sand drifting on the wind
```

In dev mode (`npm run dev`), `window.mirage` exposes the scene, camera, player, world and
story for debugging in the browser console, e.g. `mirage.story.goTo('touch')` or
`mirage.world.sky.clock.progress = 0.9`.

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

## Credits

- Star data: HYG database, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
  `src/data/stars.json` is a derived work under the same licence.
- Sun, moon and planet positions: [astronomy-engine](https://github.com/cosinekitty/astronomy)
  by Don Cross, MIT licence.

## Roadmap

See [ROADMAP.md](ROADMAP.md) for what's done and what's next: music that grows with the
walk, footprints and a look-back ending, and small moments along the way.
