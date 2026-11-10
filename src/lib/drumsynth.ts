/**
 * 太鼓の音を、音の波形（サンプルの並び）として計算で作る。
 *
 * 「ドン」は皮の振動。丸い膜は、倍音が整数倍にならない（1 : 1.59 : 2.14 : 2.30 : 2.65 …）。
 * 叩いた瞬間は皮が強く張って音が少し高く、すぐに落ち着く（音程が下がる）。
 * そこに胴の中の空気の低い響きと、バチが皮に当たる「ドッ」という音を重ねる。
 *
 * 「カン」はバチが木のふちに当たる音。硬い木の短く高い響きに、皮と胴がわずかに鳴る音を重ねる。
 *
 * どちらも最後に小さな部屋の響きを足す。叩くたびに同じ音だと機械的に聞こえるので、
 * 乱数の種を変えて、音程・強さ・響きが少しずつ違う音をいくつか作っておく。
 * WebAudio に触れない純粋な関数なので、テストから直接使える。
 */

export type Rand = () => number;

/** 決まった種から、毎回同じ並びになる乱数を作る（0 以上 1 未満） */
export function seededRand(seed: number): Rand {
	let s = seed >>> 0 || 1;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 0x100000000;
	};
}

interface Mode {
	/** 周波数（Hz） */
	f: number;
	/** 大きさ */
	a: number;
	/** 減衰の時定数（秒） */
	d: number;
}

interface Glide {
	/** 叩いた瞬間に、どれだけ高くなるか（0.1 で 10% 高い） */
	amount: number;
	/** 元の高さに戻るまでの時定数（秒） */
	tau: number;
}

/** 減衰する正弦波（モード）を足す。attack は立ち上がりの時定数（秒） */
function addModes(out: Float32Array, sr: number, modes: Mode[], glide: Glide | null, attack: number) {
	for (const m of modes) {
		let phase = 0;
		let env = m.a;
		const decay = Math.exp(-1 / (m.d * sr));
		let rise = 1;
		const riseK = Math.exp(-1 / (attack * sr));
		let bend = glide ? glide.amount : 0;
		const bendK = glide ? Math.exp(-1 / (glide.tau * sr)) : 1;
		for (let i = 0; i < out.length; i++) {
			phase += (2 * Math.PI * m.f * (1 + bend)) / sr;
			out[i]! += env * (1 - rise) * Math.sin(phase);
			env *= decay;
			rise *= riseK;
			bend *= bendK;
			if (env < 1e-5) break;
		}
	}
}

/** 雑音を作る */
function noise(len: number, rand: Rand): Float32Array {
	const x = new Float32Array(len);
	for (let i = 0; i < len; i++) x[i] = rand() * 2 - 1;
	return x;
}

/** 2次のフィルター（RBJ の式） */
function biquad(x: Float32Array, sr: number, type: "lowpass" | "bandpass" | "highpass", f: number, q: number): Float32Array {
	const w = (2 * Math.PI * f) / sr;
	const cos = Math.cos(w);
	const alpha = Math.sin(w) / (2 * q);
	let b0: number, b1: number, b2: number;
	if (type === "lowpass") {
		b0 = (1 - cos) / 2;
		b1 = 1 - cos;
		b2 = b0;
	} else if (type === "highpass") {
		b0 = (1 + cos) / 2;
		b1 = -(1 + cos);
		b2 = b0;
	} else {
		b0 = alpha;
		b1 = 0;
		b2 = -alpha;
	}
	const a0 = 1 + alpha;
	const a1 = -2 * cos;
	const a2 = 1 - alpha;
	const y = new Float32Array(x.length);
	let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
	for (let i = 0; i < x.length; i++) {
		const v = (b0 * x[i]! + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
		x2 = x1;
		x1 = x[i]!;
		y2 = y1;
		y1 = v;
		y[i] = v;
	}
	return y;
}

/** フィルターをかけた雑音を、すぐ消える形で足す */
function addBurst(
	out: Float32Array,
	sr: number,
	rand: Rand,
	type: "lowpass" | "bandpass" | "highpass",
	f: number,
	q: number,
	amp: number,
	decay: number,
) {
	const len = Math.min(out.length, Math.ceil(decay * sr * 8));
	const y = biquad(noise(len, rand), sr, type, f, q);
	let env = amp;
	const k = Math.exp(-1 / (decay * sr));
	for (let i = 0; i < len; i++) {
		out[i]! += y[i]! * env;
		env *= k;
	}
}

/** 小さな部屋の響き（くし形フィルターを並べた簡単なリバーブ）を、amount の大きさで足す */
function addRoom(out: Float32Array, sr: number, amount: number) {
	const dry = out.slice();
	const wet = new Float32Array(out.length);
	const combs = [0.0297, 0.0371, 0.0411, 0.0437];
	for (const sec of combs) {
		const n = Math.round(sec * sr);
		const buf = new Float32Array(n);
		let p = 0;
		let lp = 0;
		for (let i = 0; i < out.length; i++) {
			const y = buf[p]!;
			lp = y * 0.6 + lp * 0.4; // 高い音ほど早く消える
			buf[p] = dry[i]! + lp * 0.62;
			wet[i]! += y;
			p = (p + 1) % n;
		}
	}
	for (let i = 0; i < out.length; i++) out[i]! += (wet[i]! * amount) / combs.length;
}

/** 少し歪ませて、叩いた瞬間の力強さを出す */
function saturate(out: Float32Array, drive: number) {
	const k = Math.tanh(drive);
	for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]! * drive) / k;
}

/** いちばん大きいところが peak になるようにそろえ、最後をなめらかに消す */
function finish(out: Float32Array, sr: number, peak: number): Float32Array {
	let max = 0;
	for (const v of out) max = Math.max(max, Math.abs(v));
	const g = max > 0 ? peak / max : 0;
	const fade = Math.min(out.length, Math.round(0.03 * sr));
	for (let i = 0; i < out.length; i++) {
		const tail = out.length - i;
		out[i] = out[i]! * g * (tail < fade ? tail / fade : 1);
	}
	return out;
}

/** 「ドン」（太鼓の真ん中）。big は大きい音符用で、低く長く響く */
export function synthDon(sr: number, rand: Rand, big = false): Float32Array {
	const jitter = () => 1 + (rand() - 0.5) * 0.035;
	const L = big ? 1.35 : 1;
	const out = new Float32Array(Math.floor(sr * (big ? 1.5 : 1.15)));
	const f0 = (big ? 88 : 100) * jitter();
	// 皮の振動（丸い膜の倍音）
	addModes(
		out,
		sr,
		[
			{ f: f0, a: 1, d: 0.4 * L },
			{ f: f0 * 1.594, a: 0.42 * jitter(), d: 0.19 * L },
			{ f: f0 * 2.136, a: 0.24 * jitter(), d: 0.12 * L },
			{ f: f0 * 2.296, a: 0.17 * jitter(), d: 0.1 * L },
			{ f: f0 * 2.653, a: 0.11 * jitter(), d: 0.075 * L },
			{ f: f0 * 2.918, a: 0.07, d: 0.055 * L },
			{ f: f0 * 3.156, a: 0.05, d: 0.045 * L },
		],
		{ amount: big ? 0.2 : 0.15, tau: 0.04 },
		0.0005,
	);
	// 胴の中の空気の低い響き（少し遅れてふくらむ）
	addModes(out, sr, [{ f: f0 * 0.66, a: 0.5, d: 0.32 * L }], { amount: 0.04, tau: 0.05 }, 0.007);
	// バチが皮に当たる音: 低い「ドッ」・皮をはたく音・バチの先の小さな音
	addBurst(out, sr, rand, "lowpass", 900, 0.8, 1.1, 0.012);
	addBurst(out, sr, rand, "bandpass", 480 * jitter(), 1.3, 0.9, 0.02);
	addBurst(out, sr, rand, "bandpass", 2600, 0.9, 0.22, 0.003);
	saturate(out, big ? 1.9 : 1.6);
	addRoom(out, sr, big ? 0.3 : 0.22);
	return finish(out, sr, big ? 0.98 : 0.92);
}

/** 「カン」（太鼓のふち＝木の胴）。乾いた高い音 */
export function synthKa(sr: number, rand: Rand): Float32Array {
	const jitter = () => 1 + (rand() - 0.5) * 0.04;
	const out = new Float32Array(Math.floor(sr * 0.4));
	const f1 = 1180 * jitter();
	// 硬い木の響き（倍音は整数倍にならない）
	addModes(
		out,
		sr,
		[
			{ f: f1, a: 1, d: 0.05 },
			{ f: f1 * 2.31, a: 0.55 * jitter(), d: 0.028 },
			{ f: f1 * 3.47, a: 0.32 * jitter(), d: 0.017 },
			{ f: f1 * 4.95, a: 0.16, d: 0.01 },
		],
		null,
		0.0002,
	);
	// 胴の木のこもった響きと、ふちを叩いた振動でわずかに鳴る皮
	addModes(out, sr, [{ f: 430 * jitter(), a: 0.22, d: 0.035 }], null, 0.0004);
	addModes(out, sr, [{ f: 100, a: 0.12, d: 0.09 }, { f: 159, a: 0.06, d: 0.05 }], { amount: 0.05, tau: 0.03 }, 0.002);
	// バチと木がぶつかる「カッ」
	addBurst(out, sr, rand, "bandpass", 4200 * jitter(), 0.9, 1.4, 0.0035);
	addBurst(out, sr, rand, "highpass", 7000, 0.7, 0.35, 0.0015);
	saturate(out, 1.3);
	addRoom(out, sr, 0.16);
	return finish(out, sr, 0.62);
}
