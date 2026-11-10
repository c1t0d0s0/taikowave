import { describe, expect, it } from "vitest";
import { seededRand, synthDon, synthKa } from "../src/lib/drumsynth";

const SR = 48000;

function peak(x: Float32Array) {
	return x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
}

/** 区間ごとの大きさ（二乗平均） */
function rms(x: Float32Array, from: number, to: number) {
	let s = 0;
	const a = Math.floor(from * SR);
	const b = Math.floor(to * SR);
	for (let i = a; i < b; i++) s += x[i]! ** 2;
	return Math.sqrt(s / (b - a));
}

/** 区間の中で、いちばん強い周波数（ゼロ交差の数から大まかに求める） */
function zeroCrossHz(x: Float32Array, from: number, to: number) {
	let n = 0;
	const a = Math.floor(from * SR);
	const b = Math.floor(to * SR);
	for (let i = a + 1; i < b; i++) if ((x[i - 1]! < 0) !== (x[i]! < 0)) n++;
	return n / 2 / (to - from);
}

describe("drumsynth", () => {
	it("同じ種なら同じ音、違う種なら少し違う音になる", () => {
		expect(synthDon(SR, seededRand(1))).toEqual(synthDon(SR, seededRand(1)));
		expect(synthKa(SR, seededRand(1))).not.toEqual(synthKa(SR, seededRand(2)));
	});

	it("音が割れない大きさにそろっていて、数でない値がない", () => {
		for (const x of [synthDon(SR, seededRand(3)), synthDon(SR, seededRand(3), true), synthKa(SR, seededRand(3))]) {
			expect(x.every(Number.isFinite)).toBe(true);
			expect(peak(x)).toBeGreaterThan(0.5);
			expect(peak(x)).toBeLessThanOrEqual(1);
			expect(Math.abs(x[x.length - 1]!)).toBeLessThan(1e-3);
		}
	});

	it("ドンは低く長く響き、カンは高く短く消える", () => {
		const don = synthDon(SR, seededRand(4));
		const ka = synthKa(SR, seededRand(4));
		expect(zeroCrossHz(don, 0.15, 0.4)).toBeLessThan(200);
		expect(zeroCrossHz(ka, 0.002, 0.03)).toBeGreaterThan(800);
		// 0.25秒後: ドンはまだ響いているが、カンはほとんど消えている
		expect(rms(don, 0.25, 0.3) / rms(don, 0, 0.05)).toBeGreaterThan(0.1);
		expect(rms(ka, 0.25, 0.3) / rms(ka, 0, 0.05)).toBeLessThan(0.05);
	});

	it("大きい音符のドンは、ふつうのドンより長く響く", () => {
		const don = synthDon(SR, seededRand(5));
		const big = synthDon(SR, seededRand(5), true);
		expect(big.length).toBeGreaterThan(don.length);
		expect(rms(big, 0.5, 0.7)).toBeGreaterThan(rms(don, 0.5, 0.7));
	});
});
