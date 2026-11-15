# saltline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/Andy-6969/saltline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/Andy-6969/saltline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

SALTLINE is a round-based tactical first-person shooter for the browser, written on three.js with no build step and no asset files: five against five on Brinehouse Works, an original salt-refinery map, where the Tide Runners plant a thermite charge on one of two sites and the Harbor Watch hold them and defuse it. It has a buy menu and round economy, seven weapons with learnable recoil and movement inaccuracy, head, body and leg hits with armour and wall penetration, frag, flash and smoke grenades, and bots that walk routes, hold angles, rotate on calls, plant and defuse.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Click a side to start; the menu lists the controls.

## How it is put together

- `game/src/sim/` is the game itself: a fixed 60 Hz simulation of plain numbers with no three.js and no DOM, so it also runs headless (`node tools/simtest.mjs 6` plays six bot-only matches and reports how the rounds ended).
- `game/src/render/` draws the simulation's state with three.js. Every texture, model and effect is generated in code at load.
- `game/src/ui/` is keyboard and mouse in, HUD and synthesised sound out.
- `main.ts` hands the entry in: it copies `game/` and `screenshots/` to the output directory and writes `dossier.json`.
- `tools/playtest.mjs` plays a scripted round in real Chrome; `tools/shots.mjs` takes the screenshots listed in `shots.json`, which are untouched frames of the game.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cf6kszsp&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
