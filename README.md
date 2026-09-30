# The Mirage of Light

A short interactive parable in Three.js, inspired by Paulo Coelho's *The Alchemist*.

You wake in a strange, dark place. A pulsing light calls to you from the distance.
As you walk toward it, the world grows quiet and echoing, the light brightens, and
whispers grow clearer, until you reach the light and discover what you were
searching for was never outside you.

## Running it

```bash
npm install
npm run dev       # start a dev server at http://localhost:5173
npm run build     # production build into dist/
npm run preview   # serve the production build
```

**Controls:** click to start, move the mouse to look around, WASD / arrow keys to walk.
Headphones recommended.

## Project structure

```
index.html            Page, UI elements and styles
public/ambient.mp3    Background music
src/
  main.js             Scene setup and main loop
  stages.js           The stages of the journey (story text and what happens at each stage)
  story.js            Story state machine and story text overlay
  player.js           First-person movement
  orb.js              The glowing orb, its sound-reactive waves and particles
  audio.js            Music, proximity volume fade and reverb
  effects.js          One-shot particle effects (shatter, transformation)
  world/
    environment.js    Terrain and vegetation
```

### Adding to the story

The journey is a list of stages in `src/stages.js`. Each stage can define:

- `enter()`: runs when the stage starts (show text, trigger effects)
- `update(stageTime, delta)`: return the name of the next stage to move on
- `exit()`: runs when the stage ends

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the plan to turn this into a full journey:
a desert crossing, omens, the mirage, and the return home.
