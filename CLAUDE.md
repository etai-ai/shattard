# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SHATTARD: Awaken is a browser-based arcade game built with vanilla JavaScript and HTML5 Canvas 2D. No build tools, no dependencies, no frameworks.

## Running the Game

Open `index.html` in a browser. There is no build step, package manager, or dev server. For live reload during development, use any static file server (e.g., `python -m http.server` or VS Code Live Server).

## Architecture

Three-file structure:

- **`index.html`**: HTML markup only — two canvases (`#rain` for background, `#gameCanvas` for gameplay), three screens (`#titleScreen`, `#hud` + game, `#gameOver`) toggled via `.hidden` class, flash overlay, scanlines. Inline `onclick` handlers reference functions in `game.js`. Loads CrazyGames SDK, `styles.css`, and `game.js`.
- **`styles.css`**: Matrix-green theme via CSS variables (`--matrix-green`, `--glow`, etc.), screen transitions, HUD, scanline overlay, slow-mo bar, tutorial, pause overlay, wave announcements, near-miss text. Fonts: Share Tech Mono + Orbitron (Google Fonts via `@import`).
- **`game.js`**: All game logic — CrazyGames SDK wrapper, persistent stats (localStorage), matrix rain background, game state, entity spawning (good/bad/power/splitter/cluster), input (touch + mouse), pause, audio (Web Audio API sfx), tutorial animations, wave system, game loop (`requestAnimationFrame` → `gameLoop` → `update` → `render`), collision (distance-based via `Math.hypot`), rendering (vignette, entity trails, glyph text with glow, particle system, player as layered geometry avatar).

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
