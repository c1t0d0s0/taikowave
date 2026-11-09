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
- 「ふたりで遊ぶ」で、離れた2人が同じ曲を同時に叩けます（下の「2人プレイ」を参照）

ブラウザの第一言語が日本語なら日本語、それ以外は英語で表示します。URL に `?lang=en` / `?lang=ja` を付けると切り替えられます。

## 2人プレイ（対戦・協力）

Firebase Realtime Database を使って、離れた2人が同じ曲を同時に叩けます。Firebase の設定がないビルドでは「ふたりで遊ぶ」のボタンは出ません。

- **対戦**: 同じ曲を同時に叩いてスコアを競います。むずかしさはそれぞれが選べます。演奏中は相手のスコア・コンボ・ゲージが見えます
- **協力**: 1つの譜面を2小節ずつ交代で叩き（掛け合い）、最後の2小節は2人でいっしょに叩きます。
  相方の音符は薄く表示されます。チームのスコア・コンボ・祭りゲージで大成功を目指します。むずかしさはホストが決めます

遊び方:

1. 「ふたりで遊ぶ」→「部屋をつくる」で対戦か協力を選ぶと、5桁の部屋の番号・招待リンク・QR コードが出ます
2. 相手は「部屋に入る」に番号を入力するか、招待リンク・QR コードから開いて「入る」を押します
3. ホストが曲を選び、2人とも「準備OK！」を押すと、2人の曲の準備ができたところで同時に始まります
4. 結果画面では、2人とも「もう一度」を押すと同じ曲をもう一度遊べます。ホストは「曲をえらびなおす」で待合室に戻れます。
   結果画面と待合室ではスタンプ（👍🔥😂👏🎉）を送れます

演奏中は一時停止できません（ほかのタブに切り替えても止まりません）。相手が退出しても最後まで遊べます。協力では、退出した相方の残りの音符は「ざんねん」になります。
ホストが退出すると部屋はなくなります。

### Firebase の設定

太鼓ウェーブ専用の Firebase プロジェクトを作ります（無料の Spark プランで使えます）。

1. [Firebase コンソール](https://console.firebase.google.com/)でプロジェクトを作ります（例: `taikowave`）。Google アナリティクスは使わなくてかまいません
2. 「構築 > Authentication」で「始める」を押し、「ログイン方法」で **匿名** を有効にします
3. 「構築 > Realtime Database」で「データベースを作成」を押します。場所はプレイヤーに近いところ（日本なら `asia-southeast1` など）を選び、「ロックモード」で始めます
4. Realtime Database の「ルール」タブに、このリポジトリの [`database.rules.json`](database.rules.json) の中身を貼って「公開」します。
   Firebase CLI を使う場合は `npx firebase-tools login` のあと `npx firebase-tools deploy --only database --project <プロジェクト ID>` でも反映できます
5. 「プロジェクトの設定 > 全般 > マイアプリ」でウェブアプリ（`</>`）を追加し、表示された `firebaseConfig` を `config.js` の `FIREBASE_CONFIG` に貼ります。
   `config.example.js` をコピーすると楽です。`databaseURL` が必要なので、手順 3 のあとにコピーしてください

```js
const FIREBASE_CONFIG = {
  apiKey: "AIza…",
  authDomain: "taikowave.firebaseapp.com",
  databaseURL: "https://taikowave-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "taikowave",
  appId: "1:…:web:…",
};
```

6. GitHub Pages で公開するときは、リポジトリ変数 `FIREBASE_CONFIG` に同じ設定を JSON で登録します（下の「GitHub Pages へのデプロイ」を参照）

Firebase の Web 用の設定（`apiKey` など）は公開してよい値で、ビルド時にページに埋め込まれます。データはルールで守っています。

- 匿名サインインした人だけが、5桁の番号の部屋（`rooms/{番号}`）を読み書きできます。部屋の一覧は読めません
- 部屋の情報（曲・段階・開始時刻など）はホストだけが、席（`seats/p1`・`seats/p2`）はその席に座った本人だけが書き換えられます
- 値の種類と長さを確かめています（名前は12文字まで、など）
- ホストが切断すると部屋ごと、参加した人が切断するとその席が自動で消えます

開発サーバーで URL に `?net=local` を付けると、Firebase の代わりに同じブラウザの別のタブとつながります（Firebase なしで2人プレイを試すためのもので、本番のビルドでは使えません）。

## 開発

```bash
npm install
npm run dev       # 開発サーバー
npm test          # 譜面の生成・判定・得点・2人プレイの部屋のテスト
npm run build     # dist/ に静的サイトを出力
npm run preview   # ビルド結果の確認
npm run icons     # public/favicon.svg から favicon.ico と apple-touch-icon.png を作り直す
```

`dist/` をそのまま GitHub Pages などに置けば動きます（相対パスで出力）。

### GitHub Pages へのデプロイ

`main` ブランチに push すると GitHub Actions（`.github/workflows/deploy.yml`）がテスト・ビルドして GitHub Pages にデプロイします。
初回はリポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」にしてください。
Settings → Secrets and variables → Actions → Variables に、次のリポジトリ変数を登録できます（どちらも任意）。

| 変数 | 内容 |
| --- | --- |
| `GTM_ID` | `G-…` または `GTM-…`。その ID で計測タグが埋め込まれます（未登録なら埋め込みません） |
| `FIREBASE_CONFIG` | 2人プレイの Firebase の設定（JSON。例: `{"apiKey":"AIza…","databaseURL":"https://….firebasedatabase.app","projectId":"taikowave"}`）。未登録なら2人プレイのボタンを出しません |

### ファイル

| パス | 内容 |
| --- | --- |
| `src/lib/chart.ts` | ABC → 譜面。全声部の音の鳴り始めを集め、強さ・長さ・拍の位置で優先度をつけて、難易度ごとの最小間隔で間引く。音が上がればカン、下がればドン |
| `src/lib/game.ts` | 判定・得点・コンボ・祭りゲージ・ランク |
| `src/lib/audio.ts` | 曲の音声の合成と再生、ドン・カンの効果音（WebAudio で合成）、ゲームの時計（`getOutputTimestamp()` で実際に聞こえている位置に合わせる） |
| `src/lib/render.ts` | Canvas の描画 |
| `src/lib/input.ts` | キーボード・クリック・タップ |
| `src/songs/` | 曲の ABC 譜（music-abc からコピー）と曲情報 |
| `src/multi.ts` | 2人プレイの画面（入口・待合室・結果）と、演奏中の相手・チームの表示 |
| `src/net/room.ts` | 2人プレイの部屋（作る・入る・準備・同時に始める・結果・もう一度・退出） |
| `src/net/protocol.ts` | 部屋の番号、勝ち負け、協力の判定のまとめ方、サーバー時刻の換算 |
| `src/net/backend.ts`・`firebase.ts` | データベースの読み書き（Firebase 用と、テスト・`?net=local` 用） |
| `database.rules.json` | Realtime Database のルール |

## アクセス解析（任意）

プロジェクト直下の `config.js` に Google アナリティクス 4 の測定 ID（`G-`）または Google タグマネージャーのコンテナ ID（`GTM-`）を書くと、
`npm run build` のときに計測タグが埋め込まれます（環境変数 `GA_ID` / `GTM_ID` でも指定可能。開発サーバーでは計測しません）。

```js
const GTM_ID = 'G-XXXXXXXXXX';
```

画面ごとに仮想のページビュー（`/select`、`/play/<曲>/<難易度>`、`/result`、2人プレイは `/multi`・`/<versus|coop>/lobby` など）と、
`game_start`・`game_finish`（曲・難易度・スコア・正確さ・クリア）、`room_create`・`room_join`（モード）・`room_finish`（モード・曲・難易度・スコア・結果）イベントを送ります。
GA4 の「拡張計測機能」の「ブラウザの履歴イベントに基づくページの変更」はオフにしてください。オンのままだとページビューが重複します。

## ライセンス

- ソースコード: MIT License（[LICENSE](LICENSE)）
- 曲の ABC 譜: CC0 1.0（ABC 譜面スタジオによる書き起こし）。作曲者はいずれも著作権の保護期間が満了しています
- オリジナル曲（`matsuri-debut`・`lantern-march`・`wave-rider`・`yagura-groove`・`starmine`・`storm-odaiko`・`kingyo-waltz`・`bon-odori`・`yatai-rush`・`summer-thunder`・`dragon-dance`・`grand-finale`）: このプロジェクトのための書き下ろし。CC0 1.0
- サードパーティ: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
