/**
 * 判定・得点・コンボ・祭りゲージ。画面や音には触れないので、テストから直接使える。
 */
import type { ChartNote, Difficulty, NoteKind } from "./chart";

export type Grade = "great" | "good" | "ok" | "miss";

/** 判定の幅（秒、±）。むずかしい・げきむずが基準で、やさしい難易度ほど広い */
const BASE_WINDOW = { great: 0.035, good: 0.08, ok: 0.12 } as const;
const WINDOW_SCALE: Record<Difficulty, number> = { easy: 1.35, normal: 1.15, hard: 1, extreme: 1 };

export function windows(difficulty: Difficulty) {
	const s = WINDOW_SCALE[difficulty];
	return { great: BASE_WINDOW.great * s, good: BASE_WINDOW.good * s, ok: BASE_WINDOW.ok * s };
}

export const BASE_POINTS: Record<Grade, number> = { great: 1000, good: 500, ok: 100, miss: 0 };
/** 「あっぱれ」のうち、ぴったりに近いほど最大でこれだけ足す */
export const PRECISION_BONUS = 300;
/** 大きい音符を両手で叩いたときに、2打目として認める間隔（秒） */
export const BIG_DOUBLE_WINDOW = 0.06;

export function gradeFor(delta: number, difficulty: Difficulty): Grade {
	const w = windows(difficulty);
	const d = Math.abs(delta);
	if (d <= w.great) return "great";
	if (d <= w.good) return "good";
	if (d <= w.ok) return "ok";
	return "miss";
}

/** コンボ倍率: 10 コンボごとに +10%、最大 2 倍 */
export function comboMultiplier(combo: number) {
	return 1 + Math.min(Math.floor(combo / 10) * 0.1, 1);
}

/** 1つの音符の得点（コンボ倍率をかける前） */
export function basePoints(grade: Grade, delta: number, difficulty: Difficulty) {
	let p = BASE_POINTS[grade];
	if (grade === "great") {
		const w = windows(difficulty).great;
		p += Math.round(PRECISION_BONUS * Math.max(0, 1 - Math.abs(delta) / w));
	}
	return p;
}

export interface Judgement {
	note: number;
	grade: Grade;
	/** 叩いた時刻 − 音符の時刻（秒）。見逃しは NaN */
	delta: number;
	points: number;
	combo: number;
	/** 大きい音符の両手打ちのボーナス */
	double?: boolean;
}

export interface Counts {
	great: number;
	good: number;
	ok: number;
	miss: number;
}

export type Rank = "kiwami" | "matsu" | "take" | "ume" | "shugyo";

export class GameState {
	readonly notes: ChartNote[];
	readonly difficulty: Difficulty;
	/** 各音符の判定（まだなら null） */
	readonly results: (Grade | null)[];
	score = 0;
	combo = 0;
	maxCombo = 0;
	/** 祭りゲージ（0〜100） */
	gauge = 0;
	counts: Counts = { great: 0, good: 0, ok: 0, miss: 0 };
	/** 判定した音符のずれの合計（平均の早い・遅いの表示用） */
	private deltaSum = 0;
	private deltaCount = 0;
	/** まだ判定していない最初の音符 */
	private cursor = 0;
	/** 大きい音符を1打目で判定したもの（2打目を待つ） */
	private pendingBig: { note: number; kind: NoteKind; time: number; points: number } | null = null;
	private readonly gaugeStep: number;

	constructor(notes: ChartNote[], difficulty: Difficulty) {
		this.notes = notes;
		this.difficulty = difficulty;
		this.results = notes.map(() => null);
		this.gaugeStep = gaugeStepFor(notes.length);
	}

	get finished() {
		return this.cursor >= this.notes.length;
	}

	/** 叩いた。判定した音符があれば返す（大きい音符の2打目は double つきで返す） */
	hit(kind: NoteKind, time: number): Judgement | null {
		const pb = this.pendingBig;
		if (pb && pb.kind === kind && time - pb.time <= BIG_DOUBLE_WINDOW) {
			this.pendingBig = null;
			this.score += pb.points;
			return { note: pb.note, grade: this.results[pb.note]!, delta: 0, points: pb.points, combo: this.combo, double: true };
		}
		this.expire(time);
		const w = windows(this.difficulty);
		// 判定幅の中で、同じ種類のいちばん近い音符を叩いたことにする
		let best = -1;
		let nearest = -1;
		for (let i = this.cursor; i < this.notes.length; i++) {
			const n = this.notes[i]!;
			if (n.time - time > w.ok) break;
			if (this.results[i] !== null) continue;
			const d = Math.abs(time - n.time);
			if (d > w.ok) continue;
			if (n.kind === kind && (best < 0 || d < Math.abs(time - this.notes[best]!.time))) best = i;
			if (nearest < 0 || d < Math.abs(time - this.notes[nearest]!.time)) nearest = i;
		}
		if (best >= 0) {
			const n = this.notes[best]!;
			const delta = time - n.time;
			const j = this.judge(best, gradeFor(delta, this.difficulty), delta);
			if (n.big) this.pendingBig = { note: best, kind, time, points: j.points };
			return j;
		}
		// 違う種類を、音符のすぐ近くで叩いた（でたらめに叩いても点が取れないように）
		if (nearest >= 0 && Math.abs(time - this.notes[nearest]!.time) <= w.good) {
			return this.judge(nearest, "miss", time - this.notes[nearest]!.time);
		}
		return null;
	}

	/** 時刻 time の時点で、叩ける時間を過ぎた音符を見逃しにする */
	expire(time: number): Judgement[] {
		const out: Judgement[] = [];
		const okWindow = windows(this.difficulty).ok;
		if (this.pendingBig && time - this.pendingBig.time > BIG_DOUBLE_WINDOW) this.pendingBig = null;
		while (this.cursor < this.notes.length) {
			const i = this.cursor;
			if (this.results[i] !== null) {
				this.cursor++;
				continue;
			}
			if (time - this.notes[i]!.time <= okWindow) break;
			out.push(this.judge(i, "miss", NaN));
		}
		return out;
	}

	private judge(i: number, grade: Grade, delta: number): Judgement {
		this.results[i] = grade;
		this.counts[grade]++;
		let points = 0;
		this.gauge = Math.min(100, Math.max(0, this.gauge + this.gaugeStep * GAUGE_GAIN[grade]));
		if (grade === "miss") {
			this.combo = 0;
		} else {
			this.combo++;
			this.maxCombo = Math.max(this.maxCombo, this.combo);
			points = Math.round(basePoints(grade, delta, this.difficulty) * comboMultiplier(this.combo));
			this.score += points;
			this.deltaSum += delta;
			this.deltaCount++;
		}
		while (this.cursor < this.notes.length && this.results[this.cursor] !== null) this.cursor++;
		return { note: i, grade, delta, points, combo: this.combo };
	}

	/** 叩いたずれの平均（秒）。正なら遅め */
	get meanDelta() {
		return this.deltaCount ? this.deltaSum / this.deltaCount : 0;
	}

	/** 正確さ（0〜1）: あっぱれ 1、よし 0.5、おしい 0.1 */
	get accuracy() {
		const n = this.notes.length;
		if (!n) return 0;
		return (this.counts.great + this.counts.good * 0.5 + this.counts.ok * 0.1) / n;
	}

	get cleared() {
		return this.gauge >= CLEAR_GAUGE;
	}

	get rank(): Rank {
		return rankFor(this.accuracy);
	}
}

/** 正確さ（0〜1）からランクを決める */
export function rankFor(accuracy: number): Rank {
	if (accuracy >= 0.95) return "kiwami";
	if (accuracy >= 0.85) return "matsu";
	if (accuracy >= 0.7) return "take";
	if (accuracy >= 0.5) return "ume";
	return "shugyo";
}

/** 判定ごとの、祭りゲージの増え方（1 = 「あっぱれ」1つ分）。「ざんねん」は減る */
export const GAUGE_GAIN: Record<Grade, number> = { great: 1, good: 0.6, ok: 0, miss: -1.5 };
/** 全体の 3/4 を「あっぱれ」で叩けばゲージが満タンになる */
export function gaugeStepFor(noteCount: number) {
	return 100 / Math.max(1, noteCount * 0.75);
}
/** 大成功になる祭りゲージ */
export const CLEAR_GAUGE = 70;
