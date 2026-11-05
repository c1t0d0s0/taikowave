/**
 * 表示の言語。ブラウザの第一言語が日本語なら日本語、それ以外は英語。
 * URL に ?lang=en / ?lang=ja を付けると切り替えられる。
 */
export type Lang = "ja" | "en";
export type Localized = { ja: string; en: string };

function detectLang(): Lang {
	if (typeof location !== "undefined") {
		const q = new URLSearchParams(location.search).get("lang");
		if (q === "ja" || q === "en") return q;
	}
	const first = typeof navigator !== "undefined" ? (navigator.languages?.[0] ?? navigator.language ?? "") : "";
	return first.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export const lang: Lang = detectLang();

export function tr(text: Localized | string, to: Lang = lang): string {
	return typeof text === "string" ? text : text[to];
}

const ja = {
	appName: "太鼓ウェーブ",
	tagline: "名曲に合わせて、ドンとカンで叩こう！",
	start: "はじめる",
	howTo: "あそびかた",
	howToItems: [
		"音符が右から流れてきます。左の輪に重なった瞬間に叩きましょう。",
		"赤い音符は太鼓の<b>真ん中</b>（ドン）、青い音符は太鼓の<b>ふち</b>（カン）。",
		"大きい音符は両手で同時に叩くと得点2倍！",
		"ぴったりのタイミングほど高得点。コンボが続くと得点が最大2倍に。",
	],
	keys: "キーボード: <kbd>F</kbd> <kbd>J</kbd> = ドン、<kbd>D</kbd> <kbd>K</kbd> = カン、<kbd>Esc</kbd> = 一時停止",
	touch: "スマホ: 太鼓の真ん中をタップでドン、ふちをタップでカン",
	chooseSong: "曲をえらぶ",
	difficulty: "むずかしさ",
	difficulties: { easy: "かんたん", normal: "ふつう", hard: "むずかしい", extreme: "げきむず" },
	intensity: "激しさ",
	notes: "音符",
	best: "ハイスコア",
	play: "叩く！",
	back: "もどる",
	settings: "設定",
	musicVolume: "曲の音量",
	seVolume: "太鼓の音量",
	offset: "タイミング調整",
	offsetHint: "音符がずれて感じるときに。＋にすると判定が遅めになります。",
	speed: "音符の速さ",
	loading: "曲を準備しています…",
	loadError: "曲を読み込めませんでした。通信状況を確かめてもう一度お試しください。",
	noAudio: "このブラウザでは音を鳴らせません。",
	tapToStart: "タップして開始",
	paused: "一時停止中",
	resume: "つづける",
	retry: "もう一度",
	quit: "曲をえらびなおす",
	score: "スコア",
	combo: "コンボ",
	maxCombo: "最大コンボ",
	gauge: "祭りゲージ",
	grades: { great: "あっぱれ", good: "よし", ok: "おしい", miss: "ざんねん" },
	ranks: { kiwami: "極", matsu: "松", take: "竹", ume: "梅", shugyo: "修行中" },
	cleared: "大成功！",
	failed: "もうひと息…",
	newBest: "ハイスコア更新！",
	timing: "タイミングの傾向",
	early: (ms: number) => `${ms}ms 早め`,
	late: (ms: number) => `${ms}ms 遅め`,
	justRight: "ぴったり",
	credits:
		"音源は FluidR3_GM サウンドフォント（CC BY 3.0）を abcjs で再生しています。",
};

type Messages = typeof ja;

const en: Messages = {
	appName: "TaikoWave",
	tagline: "Drum along to the classics — Don and Kan!",
	start: "Start",
	howTo: "How to play",
	howToItems: [
		"Notes scroll in from the right. Hit when one reaches the ring on the left.",
		"Red notes: hit the <b>center</b> of the drum (Don). Blue notes: hit the <b>rim</b> (Kan).",
		"Big notes score double if you hit with both hands at once!",
		"The closer to the beat, the more points. Keep a combo going for up to 2× points.",
	],
	keys: "Keyboard: <kbd>F</kbd> <kbd>J</kbd> = Don, <kbd>D</kbd> <kbd>K</kbd> = Kan, <kbd>Esc</kbd> = pause",
	touch: "Phone: tap the center of the drum for Don, the rim for Kan",
	chooseSong: "Choose a song",
	difficulty: "Difficulty",
	difficulties: { easy: "Easy", normal: "Normal", hard: "Hard", extreme: "Extreme" },
	intensity: "Intensity",
	notes: "notes",
	best: "Best",
	play: "Play!",
	back: "Back",
	settings: "Settings",
	musicVolume: "Music volume",
	seVolume: "Drum volume",
	offset: "Timing offset",
	offsetHint: "Use this if notes feel off. Positive values make judging later.",
	speed: "Note speed",
	loading: "Preparing the song…",
	loadError: "Could not load the song. Check your connection and try again.",
	noAudio: "This browser cannot play audio.",
	tapToStart: "Tap to start",
	paused: "Paused",
	resume: "Resume",
	retry: "Retry",
	quit: "Choose another song",
	score: "Score",
	combo: "Combo",
	maxCombo: "Max combo",
	gauge: "Festival gauge",
	grades: { great: "Bravo!", good: "Good", ok: "Close", miss: "Miss" },
	ranks: { kiwami: "Master", matsu: "Pine", take: "Bamboo", ume: "Plum", shugyo: "Trainee" },
	cleared: "Great success!",
	failed: "Almost there…",
	newBest: "New best score!",
	timing: "Timing tendency",
	early: (ms: number) => `${ms} ms early`,
	late: (ms: number) => `${ms} ms late`,
	justRight: "Spot on",
	credits:
		"Played with abcjs using the FluidR3_GM sound font (CC BY 3.0).",
};

export const t: Messages = lang === "ja" ? ja : en;
