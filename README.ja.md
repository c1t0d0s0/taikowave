# 太鼓ウェーブ（TaikoWave）

[English](README.md) | 日本語

クラシックの名曲に合わせて太鼓を叩くリズムゲームです。PC でもスマートフォンでも遊べます。

- 曲は [abcjs](https://github.com/paulrosen/abcjs) で ABC 譜から MIDI 音源（FluidR3_GM サウンドフォント）で鳴らし、
  譜面（ドン・カンの音符）も同じ ABC 譜から自動で作ります
- Vite + TypeScript（サーバー不要の静的サイト）

## 遊び方

- 右から流れてくる音符が左の輪に重なった瞬間に叩きます
- 赤い音符（ド）は太鼓の **真ん中** =「ドン」、青い音符（カ）は太鼓の **ふち** =「カン」
- キーボード: `F` `J`（または Space）= ドン、`D` `K` = カン、`Esc` = 一時停止。画面の太鼓のクリックでも叩けます
- スマホ: 太鼓の真ん中をタップでドン、ふち（真ん中の円の外側）をタップでカン。マルチタッチ対応
- 判定は「あっぱれ」「よし」「おしい」「ざんねん」。ぴったりに近いほど点が高く（あっぱれの中でもずれが小さいほど加点）、
  10 コンボごとに得点が 10% 増えます（最大 2 倍）。大きい音符は両手で同時に叩くと 2 倍
- 難易度は 4 段階（かんたん・ふつう・むずかしい・げきむず）。曲・難易度ごとのハイスコアはブラウザに保存されます
- 設定で曲と太鼓の音量、音符の速さ、タイミング調整（Bluetooth イヤホンなどで遅れるとき）を変えられます

ブラウザの第一言語が日本語なら日本語、それ以外は英語で表示します。URL に `?lang=en` / `?lang=ja` を付けると切り替えられます。

## 開発

```bash
npm install
npm run dev       # 開発サーバー
npm test          # 譜面の生成・判定・得点のテスト
npm run build     # dist/ に静的サイトを出力
npm run preview   # ビルド結果の確認
npm run icons     # public/favicon.svg から favicon.ico と apple-touch-icon.png を作り直す
```

`dist/` をそのまま GitHub Pages などに置けば動きます（相対パスで出力）。

### GitHub Pages へのデプロイ

`main` ブランチに push すると GitHub Actions（`.github/workflows/deploy.yml`）がテスト・ビルドして GitHub Pages にデプロイします。
初回はリポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にしてください。
Settings → Secrets and variables → Actions → Variables にリポジトリ変数 `GTM_ID`（`G-…` または `GTM-…`）を登録すると、その ID で計測タグが埋め込まれます（未登録なら埋め込みません）。

### ファイル

| パス | 内容 |
| --- | --- |
| `src/lib/chart.ts` | ABC → 譜面。全声部の音の鳴り始めを集め、強さ・長さ・拍の位置で優先度をつけて、難易度ごとの最小間隔で間引く。音が上がればカン、下がればドン |
| `src/lib/game.ts` | 判定・得点・コンボ・祭りゲージ・ランク |
| `src/lib/audio.ts` | 曲の音声の合成と再生、ドン・カンの効果音（WebAudio で合成）、ゲームの時計（`getOutputTimestamp()` で実際に聞こえている位置に合わせる） |
| `src/lib/render.ts` | Canvas の描画 |
| `src/lib/input.ts` | キーボード・クリック・タップ |
| `src/songs/` | 曲の ABC 譜（music-abc からコピー）と曲情報 |

## アクセス解析（任意）

プロジェクト直下の `config.js` に Google アナリティクス 4 の測定 ID（`G-`）または Google タグマネージャーのコンテナ ID（`GTM-`）を書くと、
`npm run build` のときに計測タグが埋め込まれます（環境変数 `GA_ID` / `GTM_ID` でも指定可能。開発サーバーでは計測しません）。

```js
const GTM_ID = 'G-XXXXXXXXXX';
```

画面ごとに仮想のページビュー（`/select`、`/play/<曲>/<難易度>`、`/result`）と、`game_start`・`game_finish`（曲・難易度・スコア・正確さ・クリア）イベントを送ります。
GA4 の「拡張計測機能」の「ブラウザの履歴イベントに基づくページの変更」はオフにしてください。オンのままだとページビューが重複します。

## ライセンス

- ソースコード: MIT License（[LICENSE](LICENSE)）
- 曲の ABC 譜: CC0 1.0（ABC 譜面スタジオによる書き起こし）。作曲者はいずれも著作権の保護期間が満了しています
- オリジナル曲（`matsuri-debut`・`lantern-march`・`wave-rider`・`yagura-groove`・`starmine`・`storm-odaiko`・`kingyo-waltz`・`bon-odori`・`yatai-rush`・`summer-thunder`・`dragon-dance`・`grand-finale`）: このプロジェクトのための書き下ろし。CC0 1.0
- サードパーティ: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
