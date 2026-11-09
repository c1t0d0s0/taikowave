/**
 * 2人プレイの部屋。データベースの rooms/{部屋コード} を2人で読み書きする。
 *
 * 段階（phase）はホスト（部屋を作った人、p1）だけが進める。
 *   lobby   … ホストが曲を選び、2人とも準備OKにするのを待つ
 *   loading … それぞれ曲の音声を作る。2人とも作り終えたら、ホストが開始時刻を決める
 *   playing … 開始時刻に2人同時に始める
 *   result  … 2人とも叩き終えた。2人とも「もう一度」なら同じ曲をもう一度
 * 席（seats/p1, seats/p2）は、それぞれが自分の席だけを書き換える。
 */
import type { Difficulty } from "../lib/chart";
import type { Counts, Grade } from "../lib/game";
import type { Backend, Unsubscribe } from "./backend";
import {
	isRoomCode,
	splitMarks,
	otherSeat,
	randomRoomCode,
	readyKey,
	type Mode,
	type RoomData,
	type Seat,
	type SeatData,
} from "./protocol";

/** ホストが開始時刻を決めてから、実際に始まるまで（ミリ秒） */
export const START_DELAY_MS = 4000;

export type RoomErrorCode = "notFound" | "full" | "badCode" | "createFailed";

export class RoomError extends Error {
	readonly code: RoomErrorCode;
	constructor(code: RoomErrorCode) {
		super(code);
		this.code = code;
	}
}

export interface Player {
	name: string;
	difficulty: Difficulty;
}

function newSeat(uid: string, p: Player): SeatData {
	return {
		uid,
		name: p.name,
		difficulty: p.difficulty,
		ready: "",
		loaded: 0,
		finished: 0,
		score: 0,
		combo: 0,
		maxCombo: 0,
		gauge: 0,
		counts: { great: 0, good: 0, ok: 0, miss: 0 },
		last: "",
		stamp: "",
		stampAt: 0,
	};
}

/** 演奏中に送る、自分の成績 */
export interface Progress {
	score: number;
	combo: number;
	maxCombo: number;
	gauge: number;
	counts: Counts;
	last: Grade | "";
	marks: string;
}

export class Room {
	readonly code: string;
	readonly seat: Seat;
	private readonly backend: Backend;
	private readonly path: string;
	/** 部屋の今の状態（部屋が消えたら null） */
	data: RoomData | null = null;
	private listeners = new Set<(data: RoomData | null) => void>();
	private unwatch: Unsubscribe | null = null;
	private left = false;
	/** ホストが同じ書き込みを何度もしないように、最後に進めた段階を覚えておく */
	private driven = "";
	/** 最後に送った判定の文字列の区切り（変わった区切りだけを送る） */
	private sentMarks = new Map<string, string>();

	private constructor(backend: Backend, code: string, seat: Seat) {
		this.backend = backend;
		this.code = code;
		this.seat = seat;
		this.path = `rooms/${code}`;
	}

	/** 部屋を作る。部屋コードがほかの部屋とかぶったら作り直す */
	static async create(backend: Backend, mode: Mode, me: Player, rand: () => number = Math.random): Promise<Room> {
		for (let attempt = 0; attempt < 20; attempt++) {
			const code = randomRoomCode(rand);
			const data: RoomData = {
				host: backend.uid,
				createdAt: Date.now() + backend.serverOffset(),
				mode,
				song: "",
				difficulty: me.difficulty,
				round: 1,
				phase: "lobby",
				startAt: 0,
				seats: { p1: newSeat(backend.uid, me) },
			};
			if (!(await backend.create(`rooms/${code}`, data))) continue;
			const room = new Room(backend, code, "p1");
			// ホストがいなくなったら部屋ごと消す
			await backend.removeOnDisconnect(room.path);
			await room.start();
			return room;
		}
		throw new RoomError("createFailed");
	}

	/** 部屋コードで参加する */
	static async join(backend: Backend, code: string, me: Player): Promise<Room> {
		if (!isRoomCode(code)) throw new RoomError("badCode");
		const data = await backend.get<RoomData>(`rooms/${code}`);
		if (!data || !data.host) throw new RoomError("notFound");
		const room = new Room(backend, code, "p2");
		const seatPath = `${room.path}/seats/p2`;
		const mine = data.seats?.p2?.uid === backend.uid;
		if (!mine && !(await backend.create(seatPath, newSeat(backend.uid, me)))) throw new RoomError("full");
		if (mine) await backend.update(seatPath, { name: me.name, ready: "" });
		await backend.removeOnDisconnect(seatPath);
		await room.start();
		return room;
	}

	private start(): Promise<void> {
		return new Promise((resolve) => {
			let first = true;
			this.unwatch = this.backend.watch<RoomData>(this.path, (v) => {
				this.data = v && v.host ? v : null;
				if (!this.left && this.isHost) void this.drive();
				for (const cb of this.listeners) cb(this.data);
				if (first) {
					first = false;
					resolve();
				}
			});
		});
	}

	get isHost() {
		return this.seat === "p1";
	}

	get mode(): Mode {
		return this.data?.mode ?? "versus";
	}

	get partnerSeat(): Seat {
		return otherSeat(this.seat);
	}

	me(): SeatData | undefined {
		return this.data?.seats?.[this.seat];
	}

	partner(): SeatData | undefined {
		return this.data?.seats?.[this.partnerSeat];
	}

	/** サーバー時刻のミリ秒 */
	serverNow() {
		return Date.now() + this.backend.serverOffset();
	}

	serverOffset() {
		return this.backend.serverOffset();
	}

	/** 部屋の状態が変わるたびに呼ぶ（すぐに今の状態でも呼ぶ） */
	onChange(cb: (data: RoomData | null) => void): Unsubscribe {
		this.listeners.add(cb);
		cb(this.data);
		return () => this.listeners.delete(cb);
	}

	private seatPath(seat: Seat = this.seat) {
		return `${this.path}/seats/${seat}`;
	}

	private writeMe(values: Partial<SeatData>) {
		// 部屋が消えたあとに書くと、席だけの半端なデータができてしまう
		if (this.left || !this.data || !this.me()) return Promise.resolve();
		return this.backend.update(this.seatPath(), values as Record<string, unknown>);
	}

	private writeRoom(values: Partial<Omit<RoomData, "seats" | "host" | "createdAt">>) {
		if (this.left || !this.isHost) return Promise.resolve();
		return this.backend.update(this.path, values as Record<string, unknown>);
	}

	// ---- 待合室 ----

	/** ホスト: 曲を選ぶ */
	setSong(id: string) {
		return this.writeRoom({ song: id });
	}

	/** ホスト: 協力プレイの難易度を決める */
	setRoomDifficulty(d: Difficulty) {
		return this.writeRoom({ difficulty: d });
	}

	/** 対戦: 自分の難易度を決める */
	setMyDifficulty(d: Difficulty) {
		return this.writeMe({ difficulty: d });
	}

	setName(name: string) {
		return this.writeMe({ name });
	}

	/** 今の曲で準備OKにする（false で取り消す） */
	setReady(on: boolean) {
		const d = this.data;
		if (!d) return Promise.resolve();
		return this.writeMe({ ready: on ? readyKey(d, d.round) : "" });
	}

	/** 自分が今の曲で準備OKにしているか */
	isReady(seat: Seat = this.seat) {
		const d = this.data;
		return !!d && d.seats?.[seat]?.ready === readyKey(d, d.round);
	}

	stamp(emoji: string) {
		return this.writeMe({ stamp: emoji, stampAt: this.serverNow() });
	}

	// ---- 演奏 ----

	/** 曲の音声を作り終えた */
	markLoaded() {
		const d = this.data;
		if (!d) return Promise.resolve();
		return this.writeMe({ loaded: d.round });
	}

	/** 演奏を始める前に、成績を空にする */
	resetProgress() {
		this.sentMarks.clear();
		return this.writeMe({ score: 0, combo: 0, maxCombo: 0, gauge: 0, counts: { great: 0, good: 0, ok: 0, miss: 0 }, last: "", mk: null } as unknown as Partial<SeatData>);
	}

	/** 成績を書く値にする。判定の文字列は、前に送ったときから変わった区切りだけにする */
	private progressValues(p: Progress): Record<string, unknown> {
		const { marks, ...rest } = p;
		const values: Record<string, unknown> = { ...rest };
		for (const [k, v] of Object.entries(splitMarks(marks))) {
			if (this.sentMarks.get(k) === v) continue;
			this.sentMarks.set(k, v);
			values[`mk/${k}`] = v;
		}
		return values;
	}

	/** 演奏中の成績を送る */
	publish(p: Progress) {
		return this.writeMe(this.progressValues(p) as Partial<SeatData>);
	}

	/** 叩き終えた。最後の成績を送る */
	finish(p: Progress) {
		const d = this.data;
		return this.writeMe({ ...this.progressValues(p), finished: d?.round ?? 0 } as Partial<SeatData>);
	}

	// ---- 結果 ----

	/** 同じ曲をもう一度（2人とも押したら始まる） */
	wantRematch(on = true) {
		const d = this.data;
		if (!d) return Promise.resolve();
		return this.writeMe({ ready: on ? readyKey(d, d.round + 1) : "" });
	}

	wantsRematch(seat: Seat = this.seat) {
		const d = this.data;
		return !!d && d.seats?.[seat]?.ready === readyKey(d, d.round + 1);
	}

	/** ホスト: 待合室に戻って曲を選びなおす */
	backToLobby() {
		const d = this.data;
		if (!d) return Promise.resolve();
		return this.writeRoom({ phase: "lobby", round: d.round + 1, startAt: 0 });
	}

	/** 部屋を出る。ホストが出たら部屋ごと消える */
	async leave() {
		if (this.left) return;
		this.left = true;
		this.unwatch?.();
		this.listeners.clear();
		const target = this.isHost ? this.path : this.seatPath();
		try {
			await this.backend.cancelOnDisconnect(target);
			await this.backend.remove(target);
		} catch {
			/* もう消えている */
		}
	}

	// ---- ホストが段階を進める ----

	private async drive() {
		const d = this.data;
		if (!d) return;
		const p1 = d.seats?.p1;
		const p2 = d.seats?.p2;
		const both = !!p1 && !!p2;
		let next: Partial<RoomData> | null = null;
		if (d.phase === "lobby") {
			if (both && d.song && p1.ready === readyKey(d, d.round) && p2.ready === readyKey(d, d.round)) next = { phase: "loading" };
		} else if (d.phase === "loading") {
			if (!p2) next = { phase: "lobby", round: d.round + 1 };
			else if (p1?.loaded === d.round && p2.loaded === d.round) next = { phase: "playing", startAt: this.serverNow() + START_DELAY_MS };
		} else if (d.phase === "playing") {
			const seats = [p1, p2].filter((s): s is SeatData => !!s);
			if (seats.every((s) => s.finished === d.round)) next = { phase: "result" };
		} else if (d.phase === "result") {
			if (!p2) next = { phase: "lobby", round: d.round + 1 };
			else if (p1?.ready === readyKey(d, d.round + 1) && p2.ready === readyKey(d, d.round + 1))
				next = { phase: "loading", round: d.round + 1 };
		}
		if (!next) return;
		// 同じ状態から同じ書き込みを2回しない（書き込みの結果が届く前に、もう一度呼ばれることがある）
		const key = `${d.phase}:${d.round}>${next.phase}:${next.round ?? d.round}`;
		if (key === this.driven) return;
		this.driven = key;
		await this.writeRoom(next);
	}
}
