/**
 * 収録曲。
 * - 次の曲は、このプロジェクトのオリジナル曲（CC0）。
 *   - 初級向け: matsuri-debut / lantern-march / wave-rider
 *   - ふつう向け: yagura-groove / kingyo-waltz / bon-odori
 *   - むずかしい向け: starmine / yatai-rush / summer-thunder
 *   - げきむず向け: storm-odaiko / dragon-dance / grand-finale
 * - それ以外の ABC 譜は ABC 譜面スタジオ（music-abc）の収録曲をそのままコピーしたもの（CC0）。
 *   作曲者はいずれも 1967 年以前に亡くなっており、楽曲の著作権は消滅している。
 */
import type { Localized } from "../i18n";

export interface SongMeta {
	id: string;
	title: Localized;
	subtitle: Localized;
	composer: Localized;
	/** 曲選択の画面の並び順と、表示する「激しさ」（1〜5） */
	intensity: number;
	/** 曲選択のカードの色（CSS の色） */
	color: string;
}

export const SONGS: SongMeta[] = [
	{
		id: "matsuri-debut",
		title: { ja: "はじめての祭りばやし", en: "Festival Debut" },
		subtitle: { ja: "オリジナル曲・はじめての人におすすめ", en: "Original song — perfect for your first play" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 1,
		color: "#38a169",
	},
	{
		id: "lantern-march",
		title: { ja: "ちょうちん行進曲", en: "Lantern March" },
		subtitle: { ja: "オリジナル曲・8分音符の練習に", en: "Original song — practice eighth notes" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 1,
		color: "#dd6b20",
	},
	{
		id: "wave-rider",
		title: { ja: "なみのり太鼓", en: "Wave Rider" },
		subtitle: { ja: "オリジナル曲・ドンとカンの掛け合い", en: "Original song — call and response with Don and Kan" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 2,
		color: "#3182ce",
	},
	{
		id: "yagura-groove",
		title: { ja: "やぐらの上で", en: "Yagura Groove" },
		subtitle: { ja: "オリジナル曲・「ふつう」におすすめ", en: "Original song — recommended for Normal" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 3,
		color: "#d53f8c",
	},
	{
		id: "kingyo-waltz",
		title: { ja: "金魚すくいワルツ", en: "Goldfish Waltz" },
		subtitle: { ja: "オリジナル曲・「ふつう」・3拍子のワルツ", en: "Original song — Normal, a waltz in 3/4" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 3,
		color: "#f56565",
	},
	{
		id: "bon-odori",
		title: { ja: "盆踊りの輪", en: "Bon Dance Circle" },
		subtitle: { ja: "オリジナル曲・「ふつう」・呼びかけと応え", en: "Original song — Normal, call and response" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 3,
		color: "#319795",
	},
	{
		id: "starmine",
		title: { ja: "花火スターマイン", en: "Starmine" },
		subtitle: { ja: "オリジナル曲・「むずかしい」におすすめ", en: "Original song — recommended for Hard" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 4,
		color: "#805ad5",
	},
	{
		id: "yatai-rush",
		title: { ja: "屋台ラッシュ", en: "Food Stall Rush" },
		subtitle: { ja: "オリジナル曲・「むずかしい」・16分の連打", en: "Original song — Hard, sixteenth-note bursts" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 4,
		color: "#b7791f",
	},
	{
		id: "summer-thunder",
		title: { ja: "夏の雷", en: "Summer Thunder" },
		subtitle: { ja: "オリジナル曲・「むずかしい」・6/8 で駆けるジグ", en: "Original song — Hard, a racing 6/8 jig" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 4,
		color: "#4c51bf",
	},
	{
		id: "storm-odaiko",
		title: { ja: "嵐の大太鼓", en: "Storm Odaiko" },
		subtitle: { ja: "オリジナル曲・「げきむず」に挑戦", en: "Original song — a challenge for Extreme" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 5,
		color: "#2d3748",
	},
	{
		id: "dragon-dance",
		title: { ja: "龍の舞", en: "Dragon Dance" },
		subtitle: { ja: "オリジナル曲・「げきむず」・連打と跳躍", en: "Original song — Extreme, rapid repeats and leaps" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 5,
		color: "#276749",
	},
	{
		id: "grand-finale",
		title: { ja: "祭りのフィナーレ", en: "Grand Finale" },
		subtitle: { ja: "オリジナル曲・「げきむず」・後半で速くなる", en: "Original song — Extreme, speeds up in the second half" },
		composer: { ja: "太鼓ウェーブ オリジナル", en: "TaikoWave original" },
		intensity: 5,
		color: "#00a3c4",
	},
	{
		id: "la-marseillaise",
		title: { ja: "ラ・マルセイエーズ", en: "La Marseillaise" },
		subtitle: { ja: "フランス国歌・入門におすすめ", en: "French national anthem — good for beginners" },
		composer: { ja: "ルージェ・ド・リール", en: "Claude Joseph Rouget de Lisle" },
		intensity: 2,
		color: "#2b6cb0",
	},
	{
		id: "vivaldi-summer-3",
		title: { ja: "四季「夏」第3楽章", en: "The Four Seasons: Summer, 3rd mvt." },
		subtitle: { ja: "嵐のプレスト（冒頭）", en: "The stormy Presto (opening)" },
		composer: { ja: "アントニオ・ヴィヴァルディ", en: "Antonio Vivaldi" },
		intensity: 4,
		color: "#e53e3e",
	},
	{
		id: "mendelssohn-violin-concerto-1",
		title: { ja: "ヴァイオリン協奏曲 ホ短調 第1楽章", en: "Violin Concerto in E minor, 1st mvt." },
		subtitle: { ja: "作品64（冒頭）", en: "Op. 64 (opening)" },
		composer: { ja: "フェリックス・メンデルスゾーン", en: "Felix Mendelssohn" },
		intensity: 3,
		color: "#d69e2e",
	},
	{
		id: "revolutionary-etude",
		title: { ja: "革命のエチュード", en: "Revolutionary Étude" },
		subtitle: { ja: "練習曲 ハ短調 作品10-12", en: "Étude in C minor, Op. 10 No. 12" },
		composer: { ja: "フレデリック・ショパン", en: "Frédéric Chopin" },
		intensity: 5,
		color: "#9b2c2c",
	},
	{
		id: "fantaisie-impromptu",
		title: { ja: "幻想即興曲", en: "Fantaisie-Impromptu" },
		subtitle: { ja: "即興曲第4番 作品66（全曲）", en: "Impromptu No. 4, Op. 66 (complete)" },
		composer: { ja: "フレデリック・ショパン", en: "Frédéric Chopin" },
		intensity: 5,
		color: "#6b46c1",
	},
];
