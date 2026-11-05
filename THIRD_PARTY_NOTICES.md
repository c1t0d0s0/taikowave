# サードパーティのソフトウェアとデータ

## ビルドに含まれるライブラリ

| 名前 | ライセンス | 著作権者 | 用途 |
| --- | --- | --- | --- |
| [abcjs](https://github.com/paulrosen/abcjs) | MIT | Copyright (c) 2009-2026 Paul Rosen and Gregory Dyke | ABC 譜の解析・音声の合成 |

## 実行時に読み込むデータ

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
