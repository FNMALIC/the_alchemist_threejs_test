# The Mirage of Light — Roadmap

A short interactive parable inspired by *The Alchemist*: a seeker follows a distant
light, discovers it was a mirage, and finds the treasure was within them all along.

## The journey we're building

A 5–10 minute walk with a clear shape:

1. **Departure** — you wake at night in a quiet oasis beside an old tree. A distant light appears on the horizon.
2. **The desert** — you cross the dunes toward the light, guided by omens (small glowing signs, sounds, wind).
3. **The mirage** — you reach the light and it breaks apart. It was never there.
4. **The return** — the fragments of light lead you back to where you started.
5. **The treasure** — at the old tree, the light joins with you. *"You were the light all along."* Fade to white.

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

- [x] Split `script.js` into modules under `src/`: `main.js` (setup + loop), `player.js`, `orb.js`, `audio.js`, `effects.js`, `story.js`, `stages.js`, `world/environment.js`
- [x] Replace the `setTimeout` chain with a story state machine: each stage has `enter()`, `update(stageTime, delta)` and `exit()`, and moves on based on where the player is or how long the stage has run
- [x] Move UI elements and styles into `index.html` / CSS
- [x] Repo cleanup: keep one lockfile (npm), drop `package.json` `main`, stop tracking `.idea/`, write a README (how to run it, the concept, structure)

## Phase 3 — Build the world (desert + oasis)
*Goal: the space has to be big enough for a real journey.*

- [ ] Larger terrain (~400×400) with dunes from proper noise (e.g. `simplex-noise`)
- [ ] **The oasis** (start point): the old tree, palms, a small pool. This is the "home" you'll return to
- [ ] The orb placed far away (~150 units), faintly visible on the horizon from the start
  (currently the orb is so close that at walking speed you reach it before the "very close" line can show)
- [ ] Night sky: stars, moon, deep blue-to-black gradient
- [ ] Fog that thins as you approach the orb, so the light "pulls" through the haze
- [ ] Keep the player on the terrain surface (height lookup) and inside world bounds
- [ ] Ambient dust particles and floating lights (as `Points` / `InstancedMesh`)

## Phase 4 — Omens & the mirage
*Goal: make the book's ideas things the player does, not just reads.*

- [ ] **Omens:** 3–5 small glowing markers along the route. Touching one plays a chime, shows a short line and briefly lights the way forward
- [ ] Optional **false light:** a weaker glow off the route that disappears when approached
- [ ] Rework the orb arrival as **the mirage:** heat-haze shader, the orb flickers and shatters, the music drops out briefly, silence
- [ ] The fragments form a trail of light **leading back to the oasis**

## Phase 5 — The return & ending
*Goal: the book's twist, where the treasure was at the start.*

- [ ] The return walk: the music comes back warmer (new key/layer), and the world is a little brighter
- [ ] At the old tree: the fragments gather and join with the player (reuse the transformation effect)
- [ ] Epilogue text, fade to white, "Experience Again"
- [ ] Optional: small changes on replay (a new line of text, the oasis already lit)

## Phase 6 — Polish

- [ ] Bloom post-processing (`UnrealBloomPass`) so lights actually glow
- [ ] Tone mapping + `setPixelRatio`
- [ ] Layered audio: wind, footsteps on sand, omen chimes, positional orb sound (`THREE.PositionalAudio`)
- [ ] Title screen, pause on `Esc`, subtitle/volume menu
- [ ] Performance pass: instanced vegetation, dispose effects, target 60fps on a laptop
- [ ] Mobile fallback: touch joystick, or a "best on desktop" notice
- [ ] Deploy (GitHub Pages / Netlify / Vercel)

---

## Open decisions

1. **Desert or keep the forest?** The plan assumes a desert, which fits the book and the "mirage" title.
2. **Book quotes or original text?** Original lines inspired by the book avoid copyright questions when publishing.
3. **Target length?** Currently ~5–10 minutes.
