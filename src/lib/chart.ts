/**
 * ABC の曲から太鼓の譜面（いつ・ドンかカンか）を作る。
 *
 * abcjs の setUpAudio() が返す声部ごとの音（開始位置・長さ・音高・強さ）を使う。
 * 開始位置と長さは「全音符 = 1」の単位で、途中のテンポの変化は最初のテンポに換算済みなので、
 * 秒 = 位置 × 240 / テンポ（4分音符/分）で求められる。これは abcjs の再生と同じ時刻になる。
 */
import abcjs from "abcjs";

export type NoteKind = "don" | "ka";

export interface ChartNote {
	/** 曲の頭からの秒 */
	time: number;
	kind: NoteKind;
	/** 大きい音符（ドン2つ・カン2つを同時に叩くと得点が2倍） */
	big: boolean;
}

export type Difficulty = "easy" | "normal" | "hard" | "extreme";
export const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard", "extreme"];

/** 難易度ごとの、音符と音符の最小の間隔（秒） */
export const MIN_GAP: Record<Difficulty, number> = {
	easy: 0.42,
	normal: 0.24,
	hard: 0.14,
	extreme: 0.085,
};

export interface SourceNote {
	/** 全音符 = 1 */
	start: number;
	duration: number;
	pitch: number;
	volume: number;
}

export interface SourceSong {
	/** 4分音符/分 */
	tempo: number;
	/** 1小節の長さ（全音符 = 1） */
	measureLength: number;
	/** 1拍の長さ（全音符 = 1） */
	beatLength: number;
	/** 声部ごとの音 */
	tracks: SourceNote[][];
	/** 曲全体の長さ（全音符 = 1） */
	totalDuration: number;
}

export interface Chart {
	notes: ChartNote[];
	/** 曲の長さ（秒） */
	duration: number;
	/** 1拍の長さ（秒）。開始前のカウントに使う */
	beatSeconds: number;
}

/** ABC 文字列から、譜面作りに必要な情報を取り出す */
export function sourceFromAbc(abc: string): SourceSong {
	const tune = abcjs.parseOnly(abc)[0];
	if (!tune) throw new Error("ABC を読み込めませんでした");
	const seq = tune.setUpAudio({});
	const meter = tune.getMeter() as { value?: { num: string; den: string }[] } | undefined;
	const num = Number(meter?.value?.[0]?.num) || 4;
	const den = Number(meter?.value?.[0]?.den) || 4;
	const tracks = seq.tracks.map((t) =>
		t.flatMap((e) =>
			e.cmd === "note" ? [{ start: e.start, duration: e.duration, pitch: e.pitch, volume: e.volume }] : [],
		),
	);
	// seq.tempo は拍子の1拍（2/2 なら2分音符、6/8 なら付点4分音符）を単位にした値なので、
	// 再生と同じ millisecondsPerMeasure から4分音符/分に直す
	const msPerMeasure = tune.millisecondsPerMeasure();
	const tempo = msPerMeasure > 0 ? (240 * (num / den) * 1000) / msPerMeasure : seq.tempo;
	return {
		tempo,
		measureLength: num / den,
		beatLength: 1 / den,
		tracks,
		totalDuration: seq.totalDuration,
	};
}

interface Onset {
	/** 全音符単位の位置 */
	pos: number;
	time: number;
	/** 同時に鳴る音の中でいちばん高い音 */
	top: number;
	/** いちばん大きな強さ（0〜127） */
	volume: number;
	/** いちばん長い音の長さ（秒） */
	length: number;
	/** 同時に鳴り始める音の数 */
	count: number;
	/** 拍の強さ: 3 = 小節の頭、2 = 拍の頭、1 = 半拍、0 = それ以外 */
	metric: number;
	priority: number;
}

const EPS = 1e-4;

function isMultiple(x: number, unit: number) {
	const r = x / unit;
	return Math.abs(r - Math.round(r)) < EPS / unit;
}

/** 全声部の音を「鳴り始め」ごとにまとめる */
export function collectOnsets(src: SourceSong): Onset[] {
	const secPerWhole = 240 / src.tempo;
	const byPos = new Map<number, Onset>();
	for (const track of src.tracks) {
		for (const n of track) {
			if (n.volume <= 0) continue;
			// 浮動小数の誤差をならすため、1/960 全音符の格子にそろえる
			const key = Math.round(n.start * 960);
			const pos = key / 960;
			const length = n.duration * secPerWhole;
			const o = byPos.get(key);
			if (o) {
				o.top = Math.max(o.top, n.pitch);
				o.volume = Math.max(o.volume, n.volume);
				o.length = Math.max(o.length, length);
				o.count++;
			} else {
				byPos.set(key, {
					pos,
					time: pos * secPerWhole,
					top: n.pitch,
					volume: n.volume,
					length,
					count: 1,
					metric: 0,
					priority: 0,
				});
			}
		}
	}
	const onsets = [...byPos.values()].sort((a, b) => a.pos - b.pos);
	for (const o of onsets) {
		o.metric = isMultiple(o.pos, src.measureLength)
			? 3
			: isMultiple(o.pos, src.beatLength)
				? 2
				: isMultiple(o.pos, src.beatLength / 2)
					? 1
					: 0;
		o.priority =
			o.volume / 127 + o.metric * 0.35 + Math.min(o.length, 1) * 0.5 + Math.min(o.count - 1, 4) * 0.05;
	}
	return onsets;
}

/** 二分探索: 並んだ times の中で x 以上の最初の位置 */
function lowerBound(times: number[], x: number) {
	let lo = 0;
	let hi = times.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (times[mid]! < x) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * 大事な音（強い・長い・拍の頭）から順に、前後 minGap 秒以内にほかの音符がなければ採用する。
 * 同じ優先度なら早い方を先に採る（毎回同じ譜面になるように）。
 */
export function thin(onsets: Onset[], minGap: number): Onset[] {
	const order = onsets.map((_, i) => i).sort((a, b) => onsets[b]!.priority - onsets[a]!.priority || a - b);
	const times: number[] = [];
	const picked: Onset[] = [];
	for (const i of order) {
		const o = onsets[i]!;
		const at = lowerBound(times, o.time);
		const prev = times[at - 1];
		const next = times[at];
		if (prev !== undefined && o.time - prev < minGap - EPS) continue;
		if (next !== undefined && next - o.time < minGap - EPS) continue;
		times.splice(at, 0, o.time);
		picked.push(o);
	}
	return picked.sort((a, b) => a.time - b.time);
}

/**
 * ドンとカンを決める。
 * - 小節の頭・音が下がるところはドン、音が上がるところはカン
 * - 同じ高さが続くときは、ドンとカンを交互にする（同じ音の連打を左右で叩き分けるように）
 * - 長く伸ばす強い音・強い和音の小節の頭と、最後の音は大きい音符
 */
/** 大きい音符は全体のこの割合まで（多すぎると特別感がなくなる） */
const BIG_RATIO = 0.08;

export function assignKinds(picked: Onset[]): ChartNote[] {
	const notes: ChartNote[] = [];
	const bigCandidates: number[] = [];
	let prevTop: number | null = null;
	picked.forEach((o, i) => {
		let kind: NoteKind;
		if (prevTop === null || o.metric === 3) kind = "don";
		else if (o.top > prevTop) kind = "ka";
		else if (o.top < prevTop) kind = "don";
		else kind = notes[notes.length - 1]!.kind === "don" ? "ka" : "don";
		// 次の音符まで間がある音だけ大きくする（両手で叩く余裕があるように）
		const roomy = (picked[i + 1]?.time ?? Infinity) - o.time >= 0.45;
		if (roomy && ((o.length >= 0.6 && o.volume >= 85) || (o.metric === 3 && o.count >= 3 && o.volume >= 105))) {
			bigCandidates.push(i);
		}
		notes.push({ time: round(o.time), kind, big: false });
		prevTop = o.top;
	});
	const limit = Math.floor(picked.length * BIG_RATIO);
	bigCandidates
		.sort((a, b) => picked[b]!.priority - picked[a]!.priority || a - b)
		.slice(0, limit)
		.forEach((i) => (notes[i]!.big = true));
	if (notes.length) notes[notes.length - 1]!.big = true;
	return notes;
}

function round(x: number) {
	return Math.round(x * 1e6) / 1e6;
}

export function buildChart(src: SourceSong, difficulty: Difficulty): Chart {
	const secPerWhole = 240 / src.tempo;
	const notes = assignKinds(thin(collectOnsets(src), MIN_GAP[difficulty]));
	return {
		notes,
		duration: src.totalDuration * secPerWhole,
		beatSeconds: src.beatLength * secPerWhole,
	};
}

/** 協力プレイで、その音符をだれが叩くか */
export type CoopOwner = "p1" | "p2" | "both";

/** 協力プレイで交代する小節の数 */
export const COOP_SWAP_BARS = 2;

/**
 * 協力プレイの譜面の分け方（掛け合い）。最初の音符がある小節から数えて、
 * COOP_SWAP_BARS 小節ごとに p1 → p2 → p1 … と交代し、最後の COOP_SWAP_BARS 小節は2人とも叩く。
 * 途中でテンポが変わる曲では小節の位置が少しずれるが、交代の位置がずれるだけなので気にしない。
 */
export function assignCoop(chart: Chart, src: SourceSong): CoopOwner[] {
	const notes = chart.notes;
	if (!notes.length) return [];
	const secPerBar = (240 / src.tempo) * src.measureLength;
	const barOf = (t: number) => Math.floor(t / secPerBar + 1e-6);
	const first = barOf(notes[0]!.time);
	const last = barOf(notes[notes.length - 1]!.time);
	return notes.map((n) => {
		const bar = barOf(n.time);
		if (bar > last - COOP_SWAP_BARS) return "both";
		return Math.floor((bar - first) / COOP_SWAP_BARS) % 2 === 0 ? "p1" : "p2";
	});
}
