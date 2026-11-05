# TaikoWave

English | [日本語](README.ja.md)

A rhythm game where you drum along to classical masterpieces. Playable on both PC and smartphones.

- Each song is played from its ABC score by [abcjs](https://github.com/paulrosen/abcjs) with a MIDI sound font (FluidR3_GM),
  and the drum chart (Don / Kan notes) is generated automatically from the same ABC score
- Vite + TypeScript (a static site; no server needed)

## How to play

- Notes scroll in from the right. Hit the drum the moment a note reaches the ring on the left
- Red notes (ド) mean the **center** of the drum = "Don"; blue notes (カ) mean the **rim** = "Kan"
- Keyboard: `F` `J` (or Space) = Don, `D` `K` = Kan, `Esc` = pause. You can also click the drum on screen
- Phone: tap the center of the drum for Don, the rim (outside the center circle) for Kan. Multi-touch is supported
- Judgements are "Bravo!", "Good", "Close", and "Miss". The closer to the beat, the more points (even within "Bravo!", a smaller offset earns a bonus).
  Every 10 combo adds 10% to your points (up to 2×). Big notes score double when hit with both hands at once
- Four difficulty levels (Easy, Normal, Hard, Extreme). High scores for each song and difficulty are saved in the browser
- In the settings you can change the music and drum volume, note speed, and timing offset (useful when audio lags, e.g. with Bluetooth earphones)

The UI is shown in Japanese if the browser's first language is Japanese, and in English otherwise. Add `?lang=en` or `?lang=ja` to the URL to switch.

## Development

```bash
npm install
npm run dev       # development server
npm test          # tests for chart generation, judging, and scoring
npm run build     # output the static site to dist/
npm run preview   # preview the build
npm run icons     # regenerate favicon.ico and apple-touch-icon.png from public/favicon.svg
```

You can put `dist/` as-is on GitHub Pages or similar hosting (it is built with relative paths).

### Deploying to GitHub Pages

Pushing to the `main` branch runs GitHub Actions (`.github/workflows/deploy.yml`), which tests, builds and deploys the site to GitHub Pages.
First, set Settings → Pages → Build and deployment → Source to "GitHub Actions".
If you add a repository variable `GTM_ID` (`G-…` or `GTM-…`) under Settings → Secrets and variables → Actions → Variables, the tracking tag is embedded with that ID (nothing is embedded if it is not set).

### Files

| Path | Contents |
| --- | --- |
| `src/lib/chart.ts` | ABC → chart. Collects the note onsets of all voices, ranks them by loudness, length, and beat position, and thins them out by a minimum interval per difficulty. Rising pitch becomes Kan, falling pitch becomes Don |
| `src/lib/game.ts` | Judging, scoring, combo, festival gauge, rank |
| `src/lib/audio.ts` | Rendering and playing the song audio, Don / Kan sound effects (synthesized with WebAudio), and the game clock (aligned with what is actually being heard via `getOutputTimestamp()`) |
| `src/lib/render.ts` | Canvas rendering |
| `src/lib/input.ts` | Keyboard, click, and tap input |
| `src/songs/` | Song ABC scores (copied from music-abc) and song metadata |

## Analytics (optional)

If you put a Google Analytics 4 measurement ID (`G-`) or a Google Tag Manager container ID (`GTM-`) in `config.js` at the project root,
the tracking tag is embedded during `npm run build` (you can also set it with the `GA_ID` / `GTM_ID` environment variable; the development server never tracks).

```js
const GTM_ID = 'G-XXXXXXXXXX';
```

The site sends a virtual page view for each screen (`/select`, `/play/<song>/<difficulty>`, `/result`), plus `game_start` and `game_finish` events (song, difficulty, score, accuracy, cleared).
Turn off "Page changes based on browser history events" under GA4's Enhanced measurement, or page views will be counted twice.

## License

- Source code: MIT License ([LICENSE](LICENSE))
- Song ABC scores: CC0 1.0 (transcribed by ABC Score Studio). The copyright term of every composer's work has expired
- Third-party: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
