import { describe, expect, it } from "vitest";
import type { ChartNote } from "../src/lib/chart";
import { BIG_DOUBLE_WINDOW, comboMultiplier, GameState, gradeFor, windows } from "../src/lib/game";

const note = (time: number, kind: "don" | "ka" = "don", big = false): ChartNote => ({ time, kind, big });

describe("判定", () => {
	it("ずれが小さいほど良い判定", () => {
		const w = windows("hard");
		expect(gradeFor(0, "hard")).toBe("great");
		expect(gradeFor(-w.great, "hard")).toBe("great");
		expect(gradeFor(w.great + 0.001, "hard")).toBe("good");
		expect(gradeFor(-(w.ok - 0.001), "hard")).toBe("ok");
		expect(gradeFor(w.ok + 0.001, "hard")).toBe("miss");
	});

	it("やさしい難易度ほど判定の幅が広い", () => {
		expect(windows("easy").great).toBeGreaterThan(windows("normal").great);
		expect(windows("normal").great).toBeGreaterThan(windows("hard").great);
	});

	it("コンボ倍率は 10 コンボごとに 10% 増え、2 倍で止まる", () => {
		expect(comboMultiplier(9)).toBe(1);
		expect(comboMultiplier(10)).toBeCloseTo(1.1);
		expect(comboMultiplier(1000)).toBe(2);
	});
});

describe("GameState", () => {
	it("ぴったり叩くほど得点が高い", () => {
		const a = new GameState([note(1)], "hard");
		const b = new GameState([note(1)], "hard");
		a.hit("don", 1);
		b.hit("don", 1.02);
		expect(a.score).toBeGreaterThan(b.score);
		expect(a.counts.great).toBe(1);
		expect(b.counts.great).toBe(1);
	});

	it("違う種類を叩くと「ざんねん」でコンボが切れる", () => {
		const g = new GameState([note(1), note(2), note(3, "ka")], "hard");
		g.hit("don", 1);
		g.hit("don", 2);
		expect(g.combo).toBe(2);
		g.hit("don", 3);
		expect(g.results[2]).toBe("miss");
		expect(g.combo).toBe(0);
	});

	it("近くにある別の種類の音符を誤って判定しない", () => {
		// ドンの 0.1 秒後のカンを叩いたとき、まだ判定していないドンを「ざんねん」にしない
		const g = new GameState([note(1, "don"), note(1.1, "ka")], "hard");
		const j = g.hit("ka", 1.1);
		expect(j?.note).toBe(1);
		expect(j?.grade).toBe("great");
		expect(g.results[0]).toBeNull();
	});

	it("早すぎる空打ちでは音符を消さない", () => {
		const g = new GameState([note(1)], "hard");
		expect(g.hit("don", 0.5)).toBeNull();
		expect(g.results[0]).toBeNull();
	});

	it("叩かずに過ぎた音符は見逃しになる", () => {
		const g = new GameState([note(1), note(2)], "hard");
		const out = g.expire(1.5);
		expect(out.map((j) => j.grade)).toEqual(["miss"]);
		expect(g.results).toEqual(["miss", null]);
	});

	it("大きい音符は両手で叩くと得点が2倍", () => {
		const one = new GameState([note(1, "don", true)], "hard");
		one.hit("don", 1);
		const two = new GameState([note(1, "don", true)], "hard");
		two.hit("don", 1);
		const j = two.hit("don", 1 + BIG_DOUBLE_WINDOW / 2);
		expect(j?.double).toBe(true);
		expect(two.score).toBe(one.score * 2);
		expect(two.combo).toBe(1);
	});

	it("すべて「あっぱれ」なら祭りゲージが満タンでクリア、ランクは極", () => {
		const notes = Array.from({ length: 40 }, (_, i) => note(1 + i * 0.5, i % 3 ? "don" : "ka"));
		const g = new GameState(notes, "normal");
		for (const n of notes) g.hit(n.kind, n.time);
		expect(g.finished).toBe(true);
		expect(g.gauge).toBe(100);
		expect(g.cleared).toBe(true);
		expect(g.rank).toBe("kiwami");
		expect(g.maxCombo).toBe(40);
	});

	it("ずれの平均（早め・遅め）", () => {
		const g = new GameState([note(1), note(2)], "hard");
		g.hit("don", 1.02);
		g.hit("don", 2.04);
		expect(g.meanDelta).toBeCloseTo(0.03);
	});
});
