/**
 * 2人プレイ（対戦・協力）の決まりごと。データベースにも画面にも触れない純粋な関数なので、テストから直接使える。
 */
import type { CoopOwner, Difficulty } from "../lib/chart";
import { CLEAR_GAUGE, GAUGE_GAIN, gaugeStepFor, rankFor, type Counts, type Grade, type Rank } from "../lib/game";

export type Mode = "versus" | "coop";
export type Seat = "p1" | "p2";
export type Phase = "lobby" | "loading" | "playing" | "result";

export const MODES: Mode[] = ["versus", "coop"];
export const SEATS: Seat[] = ["p1", "p2"];

/** 席に座っている人の状態。自分の席だけを自分で書き換える */
export interface SeatData {
	uid: string;
	name: string;
	/** 対戦で自分が選んだ難易度（協力では部屋の難易度を使う） */
	difficulty: Difficulty;
	/** 準備OKにした曲（readyKey の値）。準備していなければ "" */
	ready: string;
	/** 曲の音声を作り終えた round */
	loaded: number;
	/** 叩き終えた round */
	finished: number;
	score: number;
	combo: number;
	maxCombo: number;
	/** 祭りゲージ（0〜100） */
	gauge: number;
	counts: Counts;
	/** 最新の判定（まだなければ ""） */
	last: Grade | "";
	/** 協力プレイの判定の文字列（encodeMarks） */
	marks: string;
	/** スタンプと、押した時刻（同じスタンプを続けて押しても届くように） */
	stamp: string;
	stampAt: number;
}

export interface RoomData {
	host: string;
	createdAt: number;
	mode: Mode;
	/** 曲 id。まだ選んでいなければ "" */
	song: string;
	/** 協力プレイの難易度 */
	difficulty: Difficulty;
	/** 何曲目か。再戦すると 1 増える */
	round: number;
	phase: Phase;
	/** 開始時刻（サーバー時刻のミリ秒） */
	startAt: number;
	seats?: Partial<Record<Seat, SeatData>>;
}

// ---- 部屋コード ----

export const ROOM_CODE_RE = /^[0-9]{5}$/;

/** 5桁の数字の部屋コード（00000〜99999） */
export function randomRoomCode(rand: () => number = Math.random): string {
	return String(Math.floor(rand() * 100000) % 100000).padStart(5, "0");
}

/** 入力された文字から数字だけを取り出す（全角数字も半角にする） */
export function normalizeRoomCode(input: string): string {
	return input
		.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
		.replace(/[^0-9]/g, "")
		.slice(0, 5);
}

export function isRoomCode(code: string): boolean {
	return ROOM_CODE_RE.test(code);
}

/** 招待URL（今のページに ?room=12345 を付けたもの） */
export function inviteUrl(code: string, href: string): string {
	const u = new URL(href);
	u.search = "";
	u.hash = "";
	u.searchParams.set("room", code);
	return u.href;
}

// ---- 名前 ----

export const NAME_MAX = 12;

export function sanitizeName(name: string, fallback: string): string {
	const s = [...name.replace(/[\u0000-\u001f\u007f]/g, "").trim()].slice(0, NAME_MAX).join("");
	return s || fallback;
}

// ---- スタンプ ----

export const STAMPS = ["👍", "🔥", "😂", "👏", "🎉"] as const;

// ---- 準備 ----

/**
 * 準備OKにしたときに席に書く値。曲や難易度が変わったら合わなくなるので、準備し直しになる。
 * 対戦の難易度はそれぞれの席にあるので含めない。協力は部屋の難易度を含める。
 */
export function readyKey(room: Pick<RoomData, "mode" | "song" | "difficulty">, round: number): string {
	return room.mode === "coop" ? `${round}:${room.song}:${room.difficulty}` : `${round}:${room.song}`;
}

export function otherSeat(seat: Seat): Seat {
	return seat === "p1" ? "p2" : "p1";
}

// ---- 時刻 ----

/**
 * サーバー時刻のミリ秒 serverMs を、AudioContext の時刻（秒）に直す。
 * serverOffset はサーバー時刻 − 自分の Date.now()（Firebase の .info/serverTimeOffset）。
 */
export function serverToContextTime(serverMs: number, serverOffset: number, nowMs: number, contextNow: number): number {
	return contextNow + (serverMs - (nowMs + serverOffset)) / 1000;
}

// ---- 対戦 ----

export type Winner = Seat | "draw";

export function versusWinner(p1Score: number, p2Score: number): Winner {
	if (p1Score === p2Score) return "draw";
	return p1Score > p2Score ? "p1" : "p2";
}

// ---- 協力: 判定の文字列 ----

const GRADE_CHAR: Record<Grade, string> = { great: "G", good: "g", ok: "o", miss: "m" };
const CHAR_GRADE: Record<string, Grade> = { G: "great", g: "good", o: "ok", m: "miss" };
/** 判定の文字列に使える文字（まだ判定していない音符は "."） */
export const MARKS_RE = /^[Ggom.]*$/;
export const MARKS_MAX = 2000;

/** 判定の並びを1文字ずつの文字列にする。最後のまだ判定していない分は省く */
export function encodeMarks(results: readonly (Grade | null)[]): string {
	return results
		.map((g) => (g ? GRADE_CHAR[g] : "."))
		.join("")
		.replace(/\.+$/, "");
}

export function decodeMarks(marks: string, length: number): (Grade | null)[] {
	const out: (Grade | null)[] = [];
	for (let i = 0; i < length; i++) out.push(CHAR_GRADE[marks[i] ?? "."] ?? null);
	return out;
}

/** その席が叩く音符の番号（譜面全体での番号）の一覧 */
export function notesOf(owners: readonly CoopOwner[], seat: Seat): number[] {
	const out: number[] = [];
	owners.forEach((o, i) => {
		if (o === seat || o === "both") out.push(i);
	});
	return out;
}

const GRADE_ORDER: Record<Grade, number> = { great: 3, good: 2, ok: 1, miss: 0 };

function better(a: Grade | null, b: Grade | null): Grade | null {
	if (!a) return b;
	if (!b) return a;
	return GRADE_ORDER[a] >= GRADE_ORDER[b] ? a : b;
}

/**
 * 2人の判定の文字列から、譜面全体の判定に戻す。2人とも叩く音符は良いほうを使う。
 * missing に入れた席は、まだ判定がない音符を「ざんねん」にする（途中で退出した・最後まで終わった）。
 */
export function mergeCoopMarks(
	owners: readonly CoopOwner[],
	marks: Record<Seat, string>,
	missing: readonly Seat[] = [],
): (Grade | null)[] {
	const out: (Grade | null)[] = owners.map(() => null);
	for (const seat of SEATS) {
		const idx = notesOf(owners, seat);
		const grades = decodeMarks(marks[seat], idx.length);
		const fill = missing.includes(seat);
		idx.forEach((n, k) => {
			out[n] = better(out[n] ?? null, grades[k] ?? (fill ? "miss" : null));
		});
	}
	return out;
}

export interface TeamStats {
	combo: number;
	maxCombo: number;
	gauge: number;
	counts: Counts;
	accuracy: number;
	rank: Rank;
	cleared: boolean;
}

/**
 * 譜面全体の判定から、チームのコンボ・祭りゲージ・ランクを計算する（1人用と同じ決め方）。
 * コンボとゲージは、まだ判定がない音符の手前までを数える。
 */
export function teamStats(grades: readonly (Grade | null)[]): TeamStats {
	const counts: Counts = { great: 0, good: 0, ok: 0, miss: 0 };
	const step = gaugeStepFor(grades.length);
	let combo = 0;
	let maxCombo = 0;
	let gauge = 0;
	let open = true;
	for (const g of grades) {
		if (!g) {
			open = false;
			continue;
		}
		counts[g]++;
		if (!open) continue;
		gauge = Math.min(100, Math.max(0, gauge + step * GAUGE_GAIN[g]));
		if (g === "miss") combo = 0;
		else maxCombo = Math.max(maxCombo, ++combo);
	}
	const n = grades.length;
	const accuracy = n ? (counts.great + counts.good * 0.5 + counts.ok * 0.1) / n : 0;
	return { combo, maxCombo, gauge, counts, accuracy, rank: rankFor(accuracy), cleared: gauge >= CLEAR_GAUGE };
}
