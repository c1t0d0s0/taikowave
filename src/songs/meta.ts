/**
 * 収録曲。ABC 譜は ABC 譜面スタジオ（music-abc）の収録曲をそのままコピーしたもの（CC0）。
 * 作曲者はいずれも 1967 年以前に亡くなっており、楽曲の著作権は消滅している。
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
