# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHATTARD: Awaken is a browser-based arcade game built with vanilla JavaScript and HTML5 Canvas 2D. The entire application lives in a single `index.html` file (~774 lines). No build tools, no dependencies, no frameworks.

## Running the Game

Open `index.html` in a browser. There is no build step, package manager, or dev server. For live reload during development, use any static file server (e.g., `python -m http.server` or VS Code Live Server).

## Architecture

Single-file architecture with these logical sections inside `index.html`:

- **CSS** (lines 7-260): Matrix-green theme via CSS variables (`--matrix-green`, `--glow`, etc.), screen transitions, HUD, scanline overlay, slow-mo bar. Fonts: Share Tech Mono + Orbitron (Google Fonts).
- **HTML** (lines 262-304): Two canvases (`#rain` for background, `#gameCanvas` for gameplay), three screens (`#titleScreen`, `#hud` + game, `#gameOver`) toggled via `.hidden` class, flash overlay, scanlines.
- **Matrix rain** (lines 307-337): Separate canvas + animation loop for falling katakana/digit rain background, runs independently of game loop.
- **Game state** (lines 339-358): Player, entities, particles, score/combo, lives, slow-mo energy, difficulty ramp, input tracking.
- **Entity spawning** (lines 360-393): Three types — `good` (green glyphs, collect), `bad` (red glyphs, dodge), `power` (cyan hexagon, refills bullet time). Entities fall top-to-bottom with wobble.
- **Input** (lines 425-465): Touch (drag to move, double-tap for slow-mo) and mouse (click-drag to move, double-click for slow-mo). Player smooth-follows the pointer position.
- **Game loop** (lines 536-648): `requestAnimationFrame` → `gameLoop(now)` → `update(dt)` → `render()`. Slow-mo scales dt by 0.3. Difficulty ramps linearly with score (caps at 8).
- **Rendering** (lines 650-753): Vignette, entity trails, glyph text rendering with colored glow, particle system, player as glowing hexagon with rotating inner shape.
- **Collision** (lines 498-501, 603-632): Distance-based (`Math.hypot`) between player and entity centers.

## Key Game Constants

- `PLAYER_SIZE = 22`, `MAX_LIVES = 3`, `SLOW_MO_DURATION = 3000ms`
- Good glyphs: 45% spawn rate, green (`#00ff41`), +10 score × combo multiplier
- Bad glyphs: 55% spawn rate, red (`#ff3333`), -1 life on hit
- Power-ups: 4% chance per spawn cycle, cyan (`#00ffff`), refills slow-mo energy
- Spawn rate: starts at 0.6s, decreases to 0.15s as difficulty ramps
- Difficulty = `min(score / 500, 8)`

## Repository

- GitHub: https://github.com/etai-ai/shattard.git
- Branch: master
- Deployed via GitHub Pages
