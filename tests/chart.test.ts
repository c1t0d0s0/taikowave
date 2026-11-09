import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildChart, DIFFICULTIES, MIN_GAP, sourceFromAbc } from "../src/lib/chart";
import { SONGS } from "../src/songs/meta";

const dir = path.join(import.meta.dirname, "..", "src", "songs");
const abcFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".abc"));

describe("収録曲", () => {
	it("meta.ts の曲と .abc ファイルが一対一で対応している", () => {
		expect(SONGS.map((s) => `${s.id}.abc`).sort()).toEqual([...abcFiles].sort());
	});
});

describe.each(SONGS.map((s) => s.id))("%s の譜面", (id) => {
	const src = sourceFromAbc(fs.readFileSync(path.join(dir, `${id}.abc`), "utf8"));
	const charts = Object.fromEntries(DIFFICULTIES.map((d) => [d, buildChart(src, d)]));

	it("どの難易度でも音符がある", () => {
		for (const d of DIFFICULTIES) expect(charts[d]!.notes.length).toBeGreaterThan(20);
	});

	it("難しいほど音符が多い（同じか増える）", () => {
		for (let i = 1; i < DIFFICULTIES.length; i++) {
			expect(charts[DIFFICULTIES[i]!]!.notes.length).toBeGreaterThanOrEqual(charts[DIFFICULTIES[i - 1]!]!.notes.length);
		}
		expect(charts.extreme!.notes.length).toBeGreaterThan(charts.easy!.notes.length);
	});

	it("音符は時刻の順に並び、最小の間隔を守っている", () => {
		for (const d of DIFFICULTIES) {
			const notes = charts[d]!.notes;
			for (let i = 1; i < notes.length; i++) {
				expect(notes[i]!.time - notes[i - 1]!.time).toBeGreaterThanOrEqual(MIN_GAP[d] - 1e-3);
			}
			expect(notes[0]!.time).toBeGreaterThanOrEqual(0);
			expect(notes[notes.length - 1]!.time).toBeLessThanOrEqual(charts[d]!.duration);
		}
	});

	it("ドンとカンの両方がある", () => {
		for (const d of DIFFICULTIES) {
			const kinds = new Set(charts[d]!.notes.map((n) => n.kind));
			expect(kinds).toEqual(new Set(["don", "ka"]));
		}
	});

	it("毎回同じ譜面になる", () => {
		const again = sourceFromAbc(fs.readFileSync(path.join(dir, `${id}.abc`), "utf8"));
		for (const d of DIFFICULTIES) expect(buildChart(again, d)).toEqual(charts[d]);
	});

	it("音符は曲の音の鳴り始めと一致する", () => {
		const secPerWhole = 240 / src.tempo;
		const onsets = new Set(src.tracks.flat().filter((n) => n.volume > 0).map((n) => Math.round(n.start * 960)));
		for (const n of charts.hard!.notes) expect(onsets.has(Math.round((n.time / secPerWhole) * 960))).toBe(true);
	});
});

describe("テンポ", () => {
	// abcjs の seq.tempo は拍子の1拍が単位なので、2/2 や 6/8 では4分音符/分と違う
	it.each([
		["yagura-groove", 120], // 4/4, Q:1/4=120
		["mendelssohn-violin-concerto-1", 224], // 2/2, Q:1/2=112
		["summer-thunder", 189], // 6/8, Q:1/4=189（付点4分 = 126）
	])("%s は4分音符/分で %d", (id, bpm) => {
		const src = sourceFromAbc(fs.readFileSync(path.join(dir, `${id}.abc`), "utf8"));
		expect(src.tempo).toBeCloseTo(bpm, 6);
	});
});
