# Trashketball

A first-person 3D paper-ball game built with Three.js. Crumple, aim, and shoot paper balls into a wastebasket across two levels:

1. **Macrodata Refinement.** A Severance-style severed floor: green carpet, a low tiled ceiling, the four-desk pod with green partitions and retro terminals, a founder's portrait, and a white hallway that goes on too long. The bin is a black wire-mesh office wastebasket.
2. **Casa Marea.** An oceanfront beach house at golden hour: double-height room, floor-to-ceiling glass onto a teak deck, sand, surf and palms. It has a curved bouclé sofa, terracotta velvet barrel chairs, a travertine coffee table and a rattan pendant. The bin is a woven seagrass basket.

Every basket is worth 10 points. Reach 100 on level 1 to unlock the beach house, then 200 to finish your stay. You can keep playing after that.

## Run it

```bash
npm install
npm run dev
```

Vite prints the local URL. `npm run build` writes a static build to `dist/`. Add `?level=2` to the URL to jump straight to the beach house.

## Controls

| Input | Action |
| --- | --- |
| Drag on the scene | Up/down changes power, left/right changes direction. Each drag starts from your last aim. |
| Release | Throw |
| Scroll, `W`/`S`, or the Arc buttons | Raise or lower the launch angle |
| Arrow keys | Fine-tune direction and power |
| `Space` | Throw with the current aim |
| `Esc` or right-click | Cancel a drag |
| `T` | Cycle the trajectory guide: Full, Short, Off |
| `M` | Mute |

The dotted guide shows the predicted flight up to the first thing the ball will touch, with a ring where it lands. Switch it to Short or Off for a harder game.

## How the physics works

Everything lives in [`src/physics.js`](src/physics.js).

- **Flight.** Gravity plus quadratic air drag (`a = −k·|v|·v`, k = 0.085/m, giving a terminal velocity of about 10.7 m/s). Long lobs steepen on the way down the way a real paper ball does. It uses a fixed 480 Hz semi-implicit Euler step.
- **Contacts.** Sphere against oriented boxes and against surfaces of revolution, with per-surface restitution and Coulomb friction. Carpet deadens a bounce; the marble island and oak floor keep more of it. Hard hits scatter slightly, because a crumpled ball is lumpy.
- **Bins.** A 2D profile (`[[0,0],[rBottom,0],[rTop,height]]`) swept around the vertical axis. The same profile gives the floor, the tapered wall, and a rounded rim. The mesh and the collider share one shape definition, so rim-outs happen where they look like they should.
- **Scoring.** A basket counts once the ball drops fully below the rim, inside the wall.
- **The guide.** It runs the same integrator from the same launch state, so it matches the real throw exactly until the first contact.

## Project layout

```
index.html            HUD and overlay markup
src/main.js           Game loop, input, scoring, bin relocation, level flow
src/physics.js        World, colliders, integrator, trajectory prediction
src/effects.js        Trajectory guide, flight trails, score confetti
src/bins.js           Wire-mesh office bin and woven basket
src/paperBall.js      Procedurally crumpled paper geometry
src/textures.js       Canvas-generated textures (no image assets)
src/audio.js          WebAudio-synthesized sound effects and ambience
src/levels/           Scene builders for each level
```

All textures and sounds are generated at runtime, so the project has no binary assets.

## Development hook

`window.__trashketball` exposes `aim(yawDeg, power, arcDeg)`, `throw()`, `predict()` and `step(seconds)` for scripted play-testing from the browser console.
