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
- With "Play with a friend", two people in different places can drum the same song at the same time (see "Two-player mode" below)

The UI is shown in Japanese if the browser's first language is Japanese, and in English otherwise. Add `?lang=en` or `?lang=ja` to the URL to switch.

## Two-player mode (Versus and Co-op)

Two people in different places can play the same song at the same time, using Firebase Realtime Database. Builds without a Firebase configuration do not show the "Play with a friend" button.

- **Versus**: play the same song at the same time and compete for the higher score. Each player picks their own difficulty. While playing, you can see your friend's score, combo, and gauge
- **Co-op**: take turns every two bars on one chart (call and response), and play the last two bars together.
  Your partner's notes are drawn faded. Aim for a great success with the team score, combo, and festival gauge. The host decides the difficulty

How to play:

1. Choose "Play with a friend" → "Create a room" and pick Versus or Co-op. A 5-digit room number, an invite link, and a QR code appear
2. Your friend enters the number under "Join a room", or opens the invite link or QR code and presses "Join"
3. The host picks a song. When both players press "Ready!", the song starts for both at the same moment once both have finished preparing it
4. On the result screen, if both players press "Play again", you play the same song again. The host can go back to the lobby with "Choose another song".
   You can send stamps (👍🔥😂👏🎉) on the result screen and in the lobby

You can't pause while playing with a friend (switching to another tab doesn't stop the song either). If your friend leaves, you can still play to the end. In Co-op, a departed partner's remaining notes count as "Miss".
When the host leaves, the room is closed.

### Setting up Firebase

Create a Firebase project just for TaikoWave (the free Spark plan is enough).

1. Create a project in the [Firebase console](https://console.firebase.google.com/) (for example `taikowave`). You don't need Google Analytics for it
2. Under "Build > Authentication", press "Get started" and enable **Anonymous** under "Sign-in method"
3. Under "Build > Realtime Database", press "Create database". Choose a location close to your players (for Japan, e.g. `asia-southeast1`) and start in "locked mode"
4. Paste the contents of [`database.rules.json`](database.rules.json) from this repository into the "Rules" tab of Realtime Database and press "Publish".
   With the Firebase CLI, you can instead run `npx firebase-tools login` and then `npx firebase-tools deploy --only database --project <project ID>`
5. Under "Project settings > General > Your apps", add a web app (`</>`) and paste the `firebaseConfig` it shows into `FIREBASE_CONFIG` in `config.js`.
   Copying `config.example.js` is the easiest way. `databaseURL` is required, so copy the config after step 3

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza…",
  authDomain: "taikowave.firebaseapp.com",
  databaseURL: "https://taikowave-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "taikowave",
  appId: "1:…:web:…",
};
```

6. To publish on GitHub Pages, register the same configuration as JSON in the repository variable `FIREBASE_CONFIG` (see "Deploying to GitHub Pages" below)

The Firebase web configuration (`apiKey` and so on) is safe to publish, and it is embedded in the page at build time. The data is protected by the rules:

- Only anonymously signed-in users can read and write rooms with a 5-digit number (`rooms/{number}`). The list of rooms can't be read
- Only the host can change the room information (song, phase, start time, etc.), and only the player sitting in a seat (`seats/p1`, `seats/p2`) can change that seat
- Value types and lengths are validated (names are at most 12 characters, etc.)
- When the host disconnects, the whole room is removed; when the joining player disconnects, their seat is removed

On the development server, add `?net=local` to the URL to connect to another tab in the same browser instead of Firebase. This is for trying two-player mode without Firebase and is not available in production builds.

## Development

```bash
npm install
npm run dev       # development server
npm test          # tests for chart generation, judging, scoring, and two-player rooms
npm run build     # output the static site to dist/
npm run preview   # preview the build
npm run icons     # regenerate favicon.ico and apple-touch-icon.png from public/favicon.svg
```

You can put `dist/` as-is on GitHub Pages or similar hosting (it is built with relative paths).

### Deploying to GitHub Pages

Pushing to the `main` branch runs GitHub Actions (`.github/workflows/deploy.yml`), which tests, builds and deploys the site to GitHub Pages.
First, set Settings → Pages → Build and deployment → Source to "GitHub Actions".
You can register these repository variables under Settings → Secrets and variables → Actions → Variables (both optional):

| Variable | Contents |
| --- | --- |
| `GTM_ID` | `G-…` or `GTM-…`. The tracking tag is embedded with that ID (nothing is embedded if it is not set) |
| `FIREBASE_CONFIG` | The Firebase configuration for two-player mode, as JSON (e.g. `{"apiKey":"AIza…","databaseURL":"https://….firebasedatabase.app","projectId":"taikowave"}`). If it is not set, the two-player button is hidden |

### Files

| Path | Contents |
| --- | --- |
| `src/lib/chart.ts` | ABC → chart. Collects the note onsets of all voices, ranks them by loudness, length, and beat position, and thins them out by a minimum interval per difficulty. Rising pitch becomes Kan, falling pitch becomes Don |
| `src/lib/game.ts` | Judging, scoring, combo, festival gauge, rank |
| `src/lib/audio.ts` | Rendering and playing the song audio, Don / Kan sound effects (synthesized with WebAudio), and the game clock (aligned with what is actually being heard via `getOutputTimestamp()`) |
| `src/lib/render.ts` | Canvas rendering |
| `src/lib/input.ts` | Keyboard, click, and tap input |
| `src/songs/` | Song ABC scores (copied from music-abc) and song metadata |
| `src/multi.ts` | Two-player screens (entrance, lobby, results) and the friend / team display while playing |
| `src/net/room.ts` | Two-player rooms (create, join, ready, start together, results, play again, leave) |
| `src/net/protocol.ts` | Room numbers, winner, combining Co-op judgements, converting server time |
| `src/net/backend.ts`, `firebase.ts` | Database access (for Firebase, and for tests and `?net=local`) |
| `database.rules.json` | Realtime Database rules |

## Analytics (optional)

If you put a Google Analytics 4 measurement ID (`G-`) or a Google Tag Manager container ID (`GTM-`) in `config.js` at the project root,
the tracking tag is embedded during `npm run build` (you can also set it with the `GA_ID` / `GTM_ID` environment variable; the development server never tracks).

```js
const GTM_ID = 'G-XXXXXXXXXX';
```

The site sends a virtual page view for each screen (`/select`, `/play/<song>/<difficulty>`, `/result`, and for two-player mode `/multi`, `/<versus|coop>/lobby`, etc.),
plus `game_start` and `game_finish` events (song, difficulty, score, accuracy, cleared) and `room_create`, `room_join` (mode), and `room_finish` (mode, song, difficulty, score, result) events.
Turn off "Page changes based on browser history events" under GA4's Enhanced measurement, or page views will be counted twice.

## License

- Source code: MIT License ([LICENSE](LICENSE))
- Song ABC scores: CC0 1.0 (transcribed by ABC Score Studio). The copyright term of every composer's work has expired
- Original songs (`matsuri-debut`, `lantern-march`, `wave-rider`, `yagura-groove`, `starmine`, `storm-odaiko`, `kingyo-waltz`, `bon-odori`, `yatai-rush`, `summer-thunder`, `dragon-dance`, `grand-finale`): composed for this project, CC0 1.0
- Third-party: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
