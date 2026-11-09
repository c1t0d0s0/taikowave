import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { assignCoop, buildChart, DIFFICULTIES, sourceFromAbc } from "../src/lib/chart";
import { MemoryBackend, MemoryStore } from "../src/net/backend";
import {
	decodeMarks,
	encodeMarks,
	inviteUrl,
	isRoomCode,
	joinMarks,
	mergeCoopMarks,
	normalizeRoomCode,
	notesOf,
	randomRoomCode,
	readyKey,
	sanitizeName,
	splitMarks,
	serverToContextTime,
	teamStats,
	versusWinner,
} from "../src/net/protocol";
import { Room, RoomError, START_DELAY_MS } from "../src/net/room";
import type { RoomData } from "../src/net/protocol";
import { SONGS } from "../src/songs/meta";

const dir = path.join(import.meta.dirname, "..", "src", "songs");

describe("部屋コード", () => {
	it("5桁の数字", () => {
		expect(randomRoomCode(() => 0)).toBe("00000");
		expect(randomRoomCode(() => 0.999999)).toBe("99999");
		expect(randomRoomCode(() => 0.12345)).toBe("12345");
		for (let i = 0; i < 200; i++) expect(isRoomCode(randomRoomCode())).toBe(true);
		expect(isRoomCode("1234")).toBe(false);
		expect(isRoomCode("123456")).toBe(false);
		expect(isRoomCode("12a45")).toBe(false);
	});

	it("入力から数字だけを取り出す（全角も）", () => {
		expect(normalizeRoomCode(" 12-34 5 ")).toBe("12345");
		expect(normalizeRoomCode("１２３４５")).toBe("12345");
		expect(normalizeRoomCode("1234567")).toBe("12345");
	});

	it("招待URL", () => {
		expect(inviteUrl("04213", "https://example.com/taiko/?lang=ja#x")).toBe("https://example.com/taiko/?room=04213");
	});
});

describe("名前", () => {
	it("前後の空白と制御文字を除き、12文字までにする", () => {
		expect(sanitizeName("  たろう\n ", "P")).toBe("たろう");
		expect(sanitizeName("", "プレイヤー")).toBe("プレイヤー");
		expect(sanitizeName("あいうえおかきくけこさしすせそ", "P")).toBe("あいうえおかきくけこさし");
	});
});

describe("時刻の換算", () => {
	it("サーバー時刻を AudioContext の時刻に直す", () => {
		// 自分の時計はサーバーより 500ms 遅れている（offset = +500）。サーバー時刻 10_000 は自分の 9_500
		expect(serverToContextTime(10_000, 500, 9_000, 2)).toBeCloseTo(2.5, 9);
		expect(serverToContextTime(10_000, -500, 9_000, 2)).toBeCloseTo(3.5, 9);
	});
});

describe("対戦の勝ち負け", () => {
	it("スコアが高いほうが勝ち", () => {
		expect(versusWinner(10, 5)).toBe("p1");
		expect(versusWinner(5, 10)).toBe("p2");
		expect(versusWinner(7, 7)).toBe("draw");
	});
});

describe("協力: 判定の文字列", () => {
	it("作って戻すと同じになる", () => {
		const r = ["great", "good", null, "miss", "ok", null, null] as const;
		const s = encodeMarks(r);
		expect(s).toBe("Gg.mo");
		expect(decodeMarks(s, r.length)).toEqual([...r]);
	});

	it("100文字ずつに区切って、元に戻せる", () => {
		const marks = "G".repeat(1050) + "m";
		const mk = splitMarks(marks);
		expect(Object.keys(mk)).toEqual(["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10"]);
		expect(mk.c10).toBe("G".repeat(50) + "m");
		// 順番がばらばらでも、番号の順に戻す（c10 は c9 のあと）
		const shuffled = Object.fromEntries(Object.entries(mk).reverse());
		expect(joinMarks(shuffled)).toBe(marks);
		expect(joinMarks(null)).toBe("");
		expect(splitMarks("")).toEqual({});
	});

	it("2人の判定を譜面全体に戻す。2人とも叩く音符は良いほう", () => {
		const owners = ["p1", "p1", "p2", "p2", "both", "both"] as const;
		expect(notesOf(owners, "p1")).toEqual([0, 1, 4, 5]);
		expect(notesOf(owners, "p2")).toEqual([2, 3, 4, 5]);
		const merged = mergeCoopMarks(owners, { p1: "GgmG", p2: "omGo" });
		expect(merged).toEqual(["great", "good", "ok", "miss", "great", "great"]);
	});

	it("退出した人のまだの音符は「ざんねん」", () => {
		const owners = ["p1", "p2", "p1", "p2"] as const;
		expect(mergeCoopMarks(owners, { p1: "GG", p2: "G" })).toEqual(["great", "great", "great", null]);
		expect(mergeCoopMarks(owners, { p1: "GG", p2: "G" }, ["p2"])).toEqual(["great", "great", "great", "miss"]);
	});

	it("チームのコンボとゲージ", () => {
		const all = Array(20).fill("great");
		const st = teamStats(all);
		expect(st.combo).toBe(20);
		expect(st.maxCombo).toBe(20);
		expect(st.gauge).toBe(100);
		expect(st.cleared).toBe(true);
		expect(st.rank).toBe("kiwami");

		const broken = teamStats(["great", "great", "miss", "great", null, "great"]);
		expect(broken.combo).toBe(1);
		expect(broken.maxCombo).toBe(2);
		expect(broken.counts).toEqual({ great: 4, good: 0, ok: 0, miss: 1 });
		expect(broken.cleared).toBe(false);
	});
});

describe("協力: 譜面の分け方", () => {
	it.each(SONGS.map((s) => s.id))("%s は2人でほぼ半分ずつ、最後は2人で叩く", (id) => {
		const src = sourceFromAbc(fs.readFileSync(path.join(dir, `${id}.abc`), "utf8"));
		for (const d of DIFFICULTIES) {
			const chart = buildChart(src, d);
			const owners = assignCoop(chart, src);
			expect(owners).toHaveLength(chart.notes.length);
			expect(owners[0]).toBe("p1");
			expect(owners[owners.length - 1]).toBe("both");
			const p1 = notesOf(owners, "p1").length / owners.length;
			const p2 = notesOf(owners, "p2").length / owners.length;
			expect(p1).toBeGreaterThan(0.25);
			expect(p2).toBeGreaterThan(0.25);
		}
	});

	it("2小節ごとに交代する", () => {
		// 4/4 拍子・♩=120 → 1小節 2秒。音符は1秒ごと
		const src = { tempo: 120, measureLength: 1, beatLength: 0.25, tracks: [], totalDuration: 0 };
		const notes = Array.from({ length: 16 }, (_, i) => ({ time: i, kind: "don" as const, big: false }));
		const owners = assignCoop({ notes, duration: 16, beatSeconds: 0.5 }, src);
		// 0〜3秒: p1、4〜7秒: p2、8〜11秒: p1、12〜15秒（最後の2小節）: 2人とも
		expect(owners).toEqual([
			...Array(4).fill("p1"),
			...Array(4).fill("p2"),
			...Array(4).fill("p1"),
			...Array(4).fill("both"),
		]);
	});
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function until(cond: () => boolean, ms = 500) {
	const t0 = Date.now();
	while (!cond()) {
		if (Date.now() - t0 > ms) throw new Error("timeout");
		await flush();
	}
}

describe("部屋", () => {
	it("作成 → 参加 → 準備 → 読み込み → 開始 → 結果 → 再戦", async () => {
		const store = new MemoryStore();
		const a = new MemoryBackend(store, { uid: "A" });
		const b = new MemoryBackend(store, { uid: "B", serverOffset: 30 });
		const host = await Room.create(a, "versus", { name: "あ", difficulty: "hard" });
		expect(host.code).toMatch(/^[0-9]{5}$/);
		expect(host.isHost).toBe(true);

		const guest = await Room.join(b, host.code, { name: "い", difficulty: "easy" });
		expect(guest.seat).toBe("p2");
		await until(() => !!host.partner());
		expect(host.partner()?.name).toBe("い");
		expect(guest.partner()?.difficulty).toBe("hard");

		// 曲が決まっていないうちは始まらない
		await host.setReady(true);
		await guest.setReady(true);
		await flush();
		expect(host.data?.phase).toBe("lobby");

		// 曲を選ぶと準備し直し
		await host.setSong("starmine");
		await until(() => guest.data?.song === "starmine");
		expect(guest.isReady()).toBe(false);
		await host.setReady(true);
		await guest.setReady(true);
		await until(() => guest.data?.phase === "loading");

		await host.markLoaded();
		await flush();
		expect(host.data?.phase).toBe("loading");
		const before = Date.now();
		await guest.markLoaded();
		await until(() => guest.data?.phase === "playing");
		expect(guest.data!.startAt).toBeGreaterThanOrEqual(before + START_DELAY_MS);

		await host.finish({ score: 100, combo: 1, maxCombo: 1, gauge: 1, counts: { great: 1, good: 0, ok: 0, miss: 0 }, last: "great", marks: "" });
		await flush();
		expect(host.data?.phase).toBe("playing");
		await guest.finish({ score: 50, combo: 0, maxCombo: 0, gauge: 0, counts: { great: 0, good: 0, ok: 0, miss: 1 }, last: "miss", marks: "" });
		await until(() => guest.data?.phase === "result");
		expect(guest.partner()?.score).toBe(100);

		// 2人とも「もう一度」で、同じ曲をもう一度読み込む
		await host.wantRematch();
		await flush();
		expect(host.data?.phase).toBe("result");
		await guest.wantRematch();
		await until(() => guest.data?.phase === "loading");
		expect(guest.data?.round).toBe(2);
		expect(guest.data?.song).toBe("starmine");

		await guest.leave();
		await host.leave();
		expect(store.read("rooms")).toBeNull();
	});

	it("協力では部屋の難易度が変わると準備し直し", async () => {
		const store = new MemoryStore();
		const host = await Room.create(new MemoryBackend(store), "coop", { name: "あ", difficulty: "normal" });
		const guest = await Room.join(new MemoryBackend(store), host.code, { name: "い", difficulty: "normal" });
		await host.setSong("wave-rider");
		await until(() => !!guest.data?.song);
		await guest.setReady(true);
		await until(() => host.isReady("p2"));
		await host.setRoomDifficulty("hard");
		await until(() => guest.data?.difficulty === "hard");
		expect(guest.isReady()).toBe(false);
		expect(readyKey(guest.data!, 1)).toBe("1:wave-rider:hard");
	});

	it("3人目は入れない。ない部屋には入れない", async () => {
		const store = new MemoryStore();
		const host = await Room.create(new MemoryBackend(store), "versus", { name: "あ", difficulty: "normal" });
		await Room.join(new MemoryBackend(store), host.code, { name: "い", difficulty: "normal" });
		await expect(Room.join(new MemoryBackend(store), host.code, { name: "う", difficulty: "normal" })).rejects.toThrow(RoomError);
		const missing = host.code === "00000" ? "00001" : "00000";
		await expect(Room.join(new MemoryBackend(store), missing, { name: "う", difficulty: "normal" })).rejects.toMatchObject({
			code: "notFound",
		});
		await expect(Room.join(new MemoryBackend(store), "12", { name: "う", difficulty: "normal" })).rejects.toMatchObject({
			code: "badCode",
		});
	});

	it("部屋コードがかぶったら作り直す", async () => {
		const store = new MemoryStore();
		const seq = [0.11111, 0.11111, 0.22222];
		const rand = () => seq.shift() ?? 0.5;
		const r1 = await Room.create(new MemoryBackend(store), "versus", { name: "あ", difficulty: "normal" }, rand);
		const r2 = await Room.create(new MemoryBackend(store), "versus", { name: "い", difficulty: "normal" }, rand);
		expect(r1.code).toBe("11111");
		expect(r2.code).toBe("22222");
	});

	it("接続が切れたら席や部屋が消える", async () => {
		const store = new MemoryStore();
		const a = new MemoryBackend(store);
		const b = new MemoryBackend(store);
		const host = await Room.create(a, "versus", { name: "あ", difficulty: "normal" });
		const guest = await Room.join(b, host.code, { name: "い", difficulty: "normal" });
		await until(() => !!host.partner());
		b.disconnect();
		await until(() => !host.partner());
		expect(host.data).not.toBeNull();

		const seen: (RoomData | null)[] = [];
		const c = new MemoryBackend(store);
		const g2 = await Room.join(c, host.code, { name: "う", difficulty: "normal" });
		g2.onChange((d) => seen.push(d));
		a.disconnect();
		await until(() => seen.at(-1) === null);
		expect(store.read(`rooms/${host.code}`)).toBeNull();
		void guest;
	});

	it("判定の文字列は、変わった区切りだけを送る", async () => {
		const store = new MemoryStore();
		const writes: Record<string, unknown>[] = [];
		class Spy extends MemoryBackend {
			override async update(path: string, values: Record<string, unknown>) {
				if (path.endsWith("/seats/p1")) writes.push(values);
				return super.update(path, values);
			}
		}
		const host = await Room.create(new Spy(store), "coop", { name: "あ", difficulty: "normal" });
		const progress = (marks: string) => ({ score: 0, combo: 0, maxCombo: 0, gauge: 0, counts: { great: 0, good: 0, ok: 0, miss: 0 }, last: "" as const, marks });
		await host.publish(progress("G".repeat(150)));
		expect(Object.keys(writes.at(-1)!).filter((k) => k.startsWith("mk/"))).toEqual(["mk/c0", "mk/c1"]);
		await host.publish(progress("G".repeat(151)));
		expect(Object.keys(writes.at(-1)!).filter((k) => k.startsWith("mk/"))).toEqual(["mk/c1"]);
		await host.publish(progress("G".repeat(151)));
		expect(Object.keys(writes.at(-1)!).filter((k) => k.startsWith("mk/"))).toEqual([]);
		await flush();
		expect(joinMarks(host.me()?.mk)).toBe("G".repeat(151));
		// 演奏を始める前に空にすると、最初から送り直す
		await host.resetProgress();
		await flush();
		expect(host.me()?.mk).toBeUndefined();
		await host.publish(progress("g"));
		expect(Object.keys(writes.at(-1)!).filter((k) => k.startsWith("mk/"))).toEqual(["mk/c0"]);
	});

	it("相手が演奏中に抜けても、ホストが終われば結果になる", async () => {
		const store = new MemoryStore();
		const host = await Room.create(new MemoryBackend(store), "versus", { name: "あ", difficulty: "normal" });
		const gb = new MemoryBackend(store);
		const guest = await Room.join(gb, host.code, { name: "い", difficulty: "normal" });
		await host.setSong("wave-rider");
		await until(() => !!guest.data?.song);
		await host.setReady(true);
		await guest.setReady(true);
		await until(() => host.data?.phase === "loading");
		await host.markLoaded();
		await guest.markLoaded();
		await until(() => host.data?.phase === "playing");
		gb.disconnect();
		await until(() => !host.partner());
		await host.finish({ score: 1, combo: 0, maxCombo: 0, gauge: 0, counts: { great: 0, good: 0, ok: 0, miss: 0 }, last: "", marks: "" });
		// 結果になり、相手がいないので待合室に戻る
		await until(() => host.data?.phase === "lobby");
		expect(host.data?.round).toBe(2);
	});
});
