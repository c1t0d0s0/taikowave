# サードパーティのソフトウェアとデータ

## ビルドに含まれるライブラリ

| 名前 | ライセンス | 著作権者 | 用途 |
| --- | --- | --- | --- |
| [abcjs](https://github.com/paulrosen/abcjs) | MIT | Copyright (c) 2009-2026 Paul Rosen and Gregory Dyke | ABC 譜の解析・音声の合成 |
| [Firebase JavaScript SDK](https://github.com/firebase/firebase-js-sdk) | Apache-2.0 | Copyright Google LLC | 2人プレイ（Realtime Database・匿名認証）。2人プレイを始めたときだけ読み込む |
| [node-qrcode](https://github.com/soldair/node-qrcode) | MIT | Copyright (c) 2012 Ryan Day | 2人プレイの招待用の QR コード |

## 実行時に読み込むデータ

### 2人プレイ

2人プレイでは、このサイトを公開する人が用意した Firebase プロジェクト（Google のサービス）に接続します。
送るのは、匿名サインインの ID、入力した名前、部屋の番号、選んだ曲と難易度、演奏中の成績です。

### サウンドフォント（FluidR3_GM）

曲の再生では、abcjs の既定の設定どおり https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/ から音源を読み込みます。

- [paulrosen/midi-js-soundfonts](https://github.com/paulrosen/midi-js-soundfonts)
  （[gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) のフォーク）
- FluidR3_GM は Frank Wen らが作成したサウンドフォントで、midi-js-soundfonts では
  [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/us/) のもとで提供されています。

### Web フォント

Google Fonts から Dela Gothic One と Zen Maru Gothic を読み込みます（いずれも SIL Open Font License 1.1）。

## 楽曲

次の曲は、このプロジェクトのオリジナル曲です（CC0 1.0）。

- 初級向け: `matsuri-debut.abc`・`lantern-march.abc`・`wave-rider.abc`
- ふつう向け: `yagura-groove.abc`・`kingyo-waltz.abc`・`bon-odori.abc`
- むずかしい向け: `starmine.abc`・`yatai-rush.abc`・`summer-thunder.abc`
- げきむず向け: `storm-odaiko.abc`・`dragon-dance.abc`・`grand-finale.abc`

それ以外の `src/songs/*.abc` は [ABC 譜面スタジオ](https://github.com/c1t0d0s0/music-abc) の収録曲をそのままコピーしたものです（CC0 1.0）。
作曲者（ヴィヴァルディ、ショパン、メンデルスゾーン、ルージェ・ド・リール）はいずれも 1967 年以前に亡くなっており、
日本の著作権法で保護期間が満了しています。
