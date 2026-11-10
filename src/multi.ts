/**
 * 2人プレイ（対戦・協力）の画面と流れ。
 * 入口（部屋をつくる・入る）→ 待合室（曲・難易度・準備OK）→ 演奏 → 結果（もう一度・曲をえらびなおす）。
 * 部屋の状態は src/net/room.ts の Room が持ち、ここでは状態が変わるたびに画面を描き直す。
 */
import { t, tr } from "./i18n";
import type { ScreenName } from "./main";
import { assignCoop, DIFFICULTIES, type Chart, type ChartNote, type CoopOwner, type Difficulty, type SourceSong } from "./lib/chart";
import type { GameAudio } from "./lib/audio";
import type { Renderer } from "./lib/render";
import { rankFor, type Counts, type Grade, type GameState, type Rank } from "./lib/game";
import { trackEvent } from "./lib/analytics";
import { load, save } from "./lib/storage";
import { SONGS, type SongMeta } from "./songs/meta";
import { LocalBackend, type Backend } from "./net/backend";
import { FIREBASE_CONFIG, useLocalNet } from "./net/config";
import {
	decodeMarks,
	encodeMarks,
	inviteUrl,
	isRoomCode,
	joinMarks,
	mergeCoopMarks,
	normalizeRoomCode,
	notesOf,
	sanitizeName,
	serverToContextTime,
	STAMPS,
	teamStats,
	versusWinner,
	type Mode,
	type RoomData,
	type Seat,
	type SeatData,
	type TeamStats,
} from "./net/protocol";
import { Room, RoomError, type Progress } from "./net/room";

/** 演奏中に main.ts から呼ぶ、2人プレイの処理 */
export interface NetPlay {
	mode: Mode;
	/** 協力プレイで自分が叩く音符（1人用・対戦は null で、譜面の全部を叩く） */
	notes: ChartNote[] | null;
	/** 協力プレイで、譜面の音符ごとに自分が叩くか（相方の音符は薄く描く） */
	mine: boolean[] | null;
	/** 開始時刻（AudioContext の時刻） */
	startAt(ctx: BaseAudioContext): number;
	/** 描画に使う、譜面全体の判定 */
	judged(state: GameState, now: number): readonly (Grade | null)[];
	/** 太鼓に出すコンボ（協力ではチームのコンボ） */
	combo(state: GameState): number;
	/** 画面上部のスコア・ゲージ・相手の表示 */
	hud(state: GameState): void;
	/** 毎フレーム呼ぶ（成績を送る、名札・交代の表示） */
	tick(state: GameState, now: number): void;
	/** 右側に描く相手の譜面の難易度（音符の流れる速さに使う） */
	rivalDifficulty: Difficulty;
	/** 毎フレーム、右側に相手のプレイを描く */
	drawRival(rv: Renderer, state: GameState, now: number): void;
	/** 叩き終えた */
	finish(state: GameState): void;
}

export interface MultiDeps {
	$: <T extends HTMLElement = HTMLElement>(id: string) => T;
	show(name: ScreenName, path?: string): void;
	getAudio(): GameAudio | null;
	chartFor(id: string, d: Difficulty): Chart;
	sourceFor(id: string): SourceSong;
	songCard(song: SongMeta, d: Difficulty, opts?: { selected?: boolean; playLabel?: string; disabled?: boolean }): string;
	startGame(song: SongMeta, d: Difficulty, net: NetPlay): Promise<void>;
	stopSession(): void;
	abc(id: string): string;
	settings: { difficulty: Difficulty };
	saveSettings(): void;
}

/** 成績を送る間隔（ミリ秒）。相手の画面で、こちらの判定の演出が遅れすぎないように短めにする */
const PUBLISH_MS = 150;
/** 相手側のレーンで、まだ判定が届いていない音符を、判定の輪を何秒過ぎるまで描くか */
const RIVAL_CUTOFF = 0.15;
/** スタンプを出しておく時間（ミリ秒） */
const STAMP_MS = 2600;

type View = "entry" | "lobby" | "play" | "result";

/** 叩き終えたときの自分の成績（結果画面で使う） */
interface MyFinal {
	round: number;
	score: number;
	counts: Counts;
	maxCombo: number;
	marks: string;
	difficulty: Difficulty;
}

/** 演奏中・結果画面で使う、今の曲の情報 */
interface Current {
	round: number;
	song: SongMeta;
	difficulty: Difficulty;
	/** 協力プレイの譜面の分け方 */
	owners: CoopOwner[] | null;
	chart: Chart;
}

function esc(s: string) {
	return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function gradeOf(results: readonly (Grade | null)[]): Grade | "" {
	for (let i = results.length - 1; i >= 0; i--) if (results[i]) return results[i]!;
	return "";
}

function accuracyOf(c: Counts) {
	const n = c.great + c.good + c.ok + c.miss;
	return n ? (c.great + c.good * 0.5 + c.ok * 0.1) / n : 0;
}

export function initMulti(deps: MultiDeps) {
	const { $ } = deps;
	let backend: Backend | null = null;
	let room: Room | null = null;
	let unwatch: (() => void) | null = null;
	let view: View = "entry";
	/** 音声を作り始めた round / 演奏を始めた round */
	let loadedRound = 0;
	let startedRound = 0;
	let lastPartnerUid = "";
	/** 演奏中に部屋が消えた（ホストが退出した） */
	let roomGone = false;
	let current: Current | null = null;
	let myFinal: MyFinal | null = null;
	let celebrated = 0;
	let busy = false;

	// ---- なまえ ----

	const nameInput = $<HTMLInputElement>("mp-name");
	nameInput.value = load<string>("name", "") || `${t.defaultName}${Math.floor(100 + Math.random() * 900)}`;
	const myName = () => sanitizeName(nameInput.value, t.defaultName);
	nameInput.addEventListener("change", () => {
		nameInput.value = myName();
		save("name", nameInput.value);
		void room?.setName(nameInput.value);
	});

	// ---- 共通 ----

	/** 中身が変わったときだけ書き換える（アニメーションが最初からやり直しにならないように） */
	const lastHtml = new Map<string, string>();
	function setHtml(id: string, html: string) {
		if (lastHtml.get(id) === html) return;
		lastHtml.set(id, html);
		$(id).innerHTML = html;
	}

	let toastTimer = 0;
	function toast(msg: string) {
		const el = $("toast");
		el.textContent = msg;
		el.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = window.setTimeout(() => (el.hidden = true), 3200);
	}

	function setStatus(id: string, msg: string, error = false) {
		const el = $(id);
		el.textContent = msg;
		el.classList.toggle("error", error);
	}

	async function getBackend(): Promise<Backend> {
		if (backend) return backend;
		if (useLocalNet()) backend = await LocalBackend.connect();
		else {
			const { connectFirebase } = await import("./net/firebase");
			backend = await connectFirebase(FIREBASE_CONFIG!);
		}
		return backend;
	}

	function songById(id: string) {
		return SONGS.find((s) => s.id === id);
	}

	function myDifficulty(d: RoomData): Difficulty {
		if (d.mode === "coop") return d.difficulty;
		return room?.me()?.difficulty ?? deps.settings.difficulty;
	}

	function stampHtml(seat: SeatData | undefined) {
		if (!seat?.stamp || !room) return "";
		const age = room.serverNow() - seat.stampAt;
		if (age < 0 || age > STAMP_MS) return "";
		return `<span class="stamp-bubble" style="animation-delay:-${Math.round(age)}ms">${esc(seat.stamp)}</span>`;
	}

	const stampsHtml = STAMPS.map((e) => `<button class="stamp-btn" data-stamp="${e}" aria-label="${e}">${e}</button>`).join("");
	for (const id of ["lb-stamps", "mr-stamps"]) {
		$(id).innerHTML = stampsHtml;
		$(id).setAttribute("aria-label", t.stamps);
		$(id).addEventListener("click", (e) => {
			const b = (e.target as HTMLElement).closest<HTMLElement>("[data-stamp]");
			if (b && room) void room.stamp(b.dataset.stamp!);
		});
	}

	// ---- 入口 ----

	function open(msg = "", error = false) {
		view = "entry";
		deps.show("multi", "/multi");
		setStatus("mp-status", msg, error);
		setEntryBusy(false);
	}

	function setEntryBusy(on: boolean) {
		busy = on;
		for (const id of ["mp-create-versus", "mp-create-coop", "mp-join"]) $<HTMLButtonElement>(id).disabled = on;
	}

	function errorMessage(e: unknown) {
		if (e instanceof RoomError) {
			if (e.code === "notFound") return t.errNotFound;
			if (e.code === "full") return t.errFull;
			if (e.code === "badCode") return t.errBadCode;
			return t.errCreate;
		}
		return t.errConnect;
	}

	async function create(mode: Mode) {
		if (busy) return;
		deps.getAudio()?.unlock();
		setEntryBusy(true);
		setStatus("mp-status", t.connecting);
		try {
			const b = await getBackend();
			const r = await Room.create(b, mode, { name: myName(), difficulty: deps.settings.difficulty });
			trackEvent("room_create", { mode });
			enterRoom(r);
		} catch (e) {
			console.warn("[multi] create", e);
			setStatus("mp-status", errorMessage(e), true);
		} finally {
			setEntryBusy(false);
		}
	}

	async function join(code: string) {
		if (busy) return;
		deps.getAudio()?.unlock();
		if (!isRoomCode(code)) return setStatus("mp-status", t.errBadCode, true);
		setEntryBusy(true);
		setStatus("mp-status", t.connecting);
		try {
			const b = await getBackend();
			const r = await Room.join(b, code, { name: myName(), difficulty: deps.settings.difficulty });
			trackEvent("room_join", { mode: r.mode });
			enterRoom(r);
		} catch (e) {
			console.warn("[multi] join", e);
			setStatus("mp-status", errorMessage(e), true);
		} finally {
			setEntryBusy(false);
		}
	}

	$("btn-multi-back").addEventListener("click", () => deps.show("title"));
	$("mp-create-versus").addEventListener("click", () => void create("versus"));
	$("mp-create-coop").addEventListener("click", () => void create("coop"));
	const codeInput = $<HTMLInputElement>("mp-code");
	codeInput.addEventListener("input", () => (codeInput.value = normalizeRoomCode(codeInput.value)));
	$("mp-join-form").addEventListener("submit", (e) => {
		e.preventDefault();
		void join(normalizeRoomCode(codeInput.value));
	});

	// ---- 部屋に入った ----

	function enterRoom(r: Room) {
		room = r;
		roomGone = false;
		loadedRound = 0;
		startedRound = 0;
		myFinal = null;
		current = null;
		lastPartnerUid = r.partner()?.uid ?? "";
		renderInvite(r.code);
		view = "lobby";
		deps.show("lobby", `/${r.mode}/lobby`);
		unwatch = r.onChange(onRoom);
	}

	function cleanup() {
		unwatch?.();
		unwatch = null;
		room = null;
		current = null;
		myFinal = null;
	}

	async function leave() {
		const r = room;
		cleanup();
		deps.stopSession();
		open();
		await r?.leave();
	}

	function onRoom(d: RoomData | null) {
		const r = room;
		if (!r) return;
		if (!d) {
			// 部屋が消えた（ホストが退出した）。演奏中なら最後まで遊べるようにする
			if (view === "play") {
				roomGone = true;
				return;
			}
			if (view === "result" && roomGone) return renderResult();
			cleanup();
			open(t.roomClosed, true);
			return;
		}
		const partner = r.partner();
		if (lastPartnerUid && partner?.uid !== lastPartnerUid) toast(t.partnerLeft);
		lastPartnerUid = partner?.uid ?? "";

		if (d.phase === "loading" && loadedRound !== d.round) void prepare(d);
		if (d.phase === "playing" && loadedRound === d.round && startedRound !== d.round) begin(d);
		// ホストが「曲をえらびなおす」を押した・2人とも「もう一度」を押したら、結果画面から待合室へ。
		// 相手がいなくなって待合室に戻ったときは、自分の結果を見られるように結果画面のままにする
		if (view === "result" && partner && d.round !== myFinal?.round && (d.phase === "lobby" || d.phase === "loading")) {
			view = "lobby";
			deps.show("lobby", `/${d.mode}/lobby`);
		}
		if (view === "lobby") renderLobby(d);
		else if (view === "result") renderResult();
	}

	/** 曲の音声を作って、作り終えたら知らせる */
	async function prepare(d: RoomData) {
		const r = room!;
		loadedRound = d.round;
		const a = deps.getAudio();
		const song = songById(d.song);
		if (!a || !song) return toast(t.noAudio);
		try {
			await a.prepareSong(song.id, deps.abc(song.id));
		} catch {
			toast(t.loadError);
			return;
		}
		if (room !== r) return;
		await r.resetProgress();
		await r.markLoaded();
	}

	// ---- 招待 ----

	function myInviteUrl(code: string) {
		const u = new URL(inviteUrl(code, location.href));
		if (useLocalNet()) u.searchParams.set("net", "local");
		return u.href;
	}

	function renderInvite(code: string) {
		$("lb-code").textContent = code;
		const url = myInviteUrl(code);
		$("lb-share").hidden = !navigator.share;
		const qr = $<HTMLCanvasElement>("lb-qr");
		void import("qrcode")
			.then((QR) => QR.toCanvas(qr, url, { width: 132, margin: 1, errorCorrectionLevel: "M", color: { dark: "#3a1d0e", light: "#ffffff" } }))
			.catch(() => (qr.hidden = true));
	}

	$("lb-copy").addEventListener("click", async () => {
		if (!room) return;
		try {
			await navigator.clipboard.writeText(myInviteUrl(room.code));
			toast(t.copied);
		} catch {
			prompt(t.copyLink, myInviteUrl(room.code));
		}
	});
	$("lb-share").addEventListener("click", () => {
		if (!room) return;
		void navigator.share?.({ title: t.appName, text: `${t.roomCode}: ${room.code}`, url: myInviteUrl(room.code) }).catch(() => {});
	});
	$("lb-leave").addEventListener("click", () => void leave());

	// ---- 待合室 ----

	function seatCard(seat: Seat, d: RoomData) {
		const r = room!;
		const s = d.seats?.[seat];
		if (!s) return `<div class="seat seat-${seat} empty"><p class="seat-name">${t.waitingPartner}</p></div>`;
		const badges = [seat === "p1" ? `<span class="badge">${t.host}</span>` : "", seat === r.seat ? `<span class="badge you">${t.you}</span>` : ""].join("");
		const ready = r.isReady(seat);
		const diff = d.mode === "versus" ? `<span class="seat-diff diff-${s.difficulty}">${t.difficulties[s.difficulty]}</span>` : "";
		return `<div class="seat seat-${seat}${ready ? " ready" : ""}">
			${stampHtml(s)}
			<p class="seat-name">${esc(s.name)}</p>
			<p class="seat-badges">${badges}${diff}</p>
			<p class="seat-ready">${ready ? `✔ ${t.readyState}` : t.notReady}</p>
		</div>`;
	}

	function renderLobby(d: RoomData) {
		const r = room!;
		const partner = r.partner();
		$("lb-title").textContent = d.mode === "coop" ? t.coop : t.versus;
		$("lb-invite").classList.toggle("compact", !!partner);
		setHtml("lb-seats", seatCard("p1", d) + seatCard("p2", d));

		// むずかしさ
		const diff = myDifficulty(d);
		const canDiff = d.phase === "lobby" && (d.mode === "versus" || r.isHost);
		$("lb-diff-label").textContent = d.mode === "coop" ? (r.isHost ? t.roomDifficulty : `${t.roomDifficulty} ・ ${t.hostDecides}`) : t.myDifficulty;
		setHtml("lb-diff", DIFFICULTIES.map(
			(x) =>
				`<button role="radio" class="diff diff-${x}" data-d="${x}" aria-checked="${x === diff}"${canDiff ? "" : " disabled"}>${t.difficulties[x]}</button>`,
			).join(""),
		);

		// 曲
		const song = songById(d.song);
		if (r.isHost && d.phase === "lobby") {
			$("lb-song-label").textContent = t.chooseSong;
			setHtml("lb-songs", SONGS.map((s) =>
				deps.songCard(s, diff, { selected: s.id === d.song, playLabel: s.id === d.song ? t.picked : t.pickSong }),
				).join(""),
			);
		} else {
			$("lb-song-label").textContent = song ? t.picked : "";
			setHtml("lb-songs", song
				? deps.songCard(song, diff, { selected: true, playLabel: t.picked, disabled: true })
				: `<li class="lb-empty">${t.hostPicking}</li>`,
			);
		}

		// 準備OK
		const ready = r.isReady();
		const btn = $<HTMLButtonElement>("lb-ready");
		btn.textContent = ready ? t.cancelReady : t.readyBtn;
		btn.classList.toggle("btn-ghost", ready);
		btn.disabled = d.phase !== "lobby" || !song || !partner;

		let status = "";
		if (d.phase === "loading") status = loadedRound === d.round && r.me()?.loaded === d.round ? t.waitingLoad : t.preparing;
		else if (d.phase === "playing" || d.phase === "result") status = startedRound === d.round ? "" : t.inProgress;
		else if (!partner) status = t.waitingPartner;
		else if (!song) status = r.isHost ? "" : t.hostPicking;
		else if (ready && !r.isReady(r.partnerSeat)) status = t.waitingLoad;
		setStatus("lb-status", status);
	}

	$("lb-diff").addEventListener("click", (e) => {
		const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-d]");
		const r = room;
		if (!b || b.disabled || !r?.data) return;
		const d = b.dataset.d as Difficulty;
		if (r.data.mode === "coop") void r.setRoomDifficulty(d);
		else {
			void r.setMyDifficulty(d);
			void r.setReady(false);
		}
		deps.settings.difficulty = d;
		deps.saveSettings();
	});

	$("lb-songs").addEventListener("click", (e) => {
		const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-id]");
		const r = room;
		if (!b || b.disabled || !r?.isHost || r.data?.phase !== "lobby") return;
		void r.setSong(b.dataset.id!);
	});

	$("lb-ready").addEventListener("click", () => {
		const r = room;
		if (!r) return;
		// スマホでは、ボタンを押したときでないと音を鳴らせるようにできない
		deps.getAudio()?.unlock();
		void r.setReady(!r.isReady());
	});

	// ---- 演奏 ----

	function begin(d: RoomData) {
		const r = room!;
		const song = songById(d.song);
		if (!song) return;
		startedRound = d.round;
		const difficulty = myDifficulty(d);
		const chart = deps.chartFor(song.id, difficulty);
		const owners = d.mode === "coop" ? assignCoop(chart, deps.sourceFor(song.id)) : null;
		current = { round: d.round, song, difficulty, owners, chart };
		myFinal = null;
		celebrated = 0;
		view = "play";
		const startAt = d.startAt;
		const net = d.mode === "coop" ? coopPlay(r, chart, owners!, difficulty) : versusPlay(r, song, r.partner()?.difficulty ?? difficulty);
		showSides(r, d.mode);
		const base = {
			startAt: (ctx: BaseAudioContext) => serverToContextTime(startAt, r.serverOffset(), Date.now(), ctx.currentTime),
			finish: (st: GameState) => void finished(st),
		};
		void deps.startGame(song, difficulty, { ...net, ...base });
		$("hud-song").textContent = `${tr(song.title)} ・ ${t.difficulties[difficulty]} ・ ${d.mode === "coop" ? t.coop : t.versus}`;
	}

	/** 成績を一定の間隔で送る */
	function publisher(r: Room) {
		let last = 0;
		return (p: () => Progress) => {
			const now = performance.now();
			if (now - last < PUBLISH_MS) return;
			last = now;
			void r.publish(p());
		};
	}

	function progressOf(st: GameState, marks: string): Progress {
		return {
			score: st.score,
			combo: st.combo,
			maxCombo: st.maxCombo,
			gauge: Math.round(st.gauge * 10) / 10,
			counts: { ...st.counts },
			last: gradeOf(st.results),
			marks,
		};
	}

	function partnerGone(r: Room) {
		return roomGone || !r.partner();
	}

	function sideTag(text: string) {
		return `<span class="tag">${esc(text)}</span>`;
	}

	/**
	 * 演奏画面の左右を、どちらが自分か一目でわかるようにする。
	 * 左（自分）は朱色、右（相手）は藍色の帯と枠にして、真ん中に VS（協力は 🤝）を置く。
	 * 始まる前のカウントのあいだだけ、左に「ここを叩こう！」、右に「○○さんの演奏」と大きく出す。
	 */
	function showSides(r: Room, mode: Mode) {
		const myName = r.me()?.name ?? "";
		const partnerName = r.partner()?.name ?? "";
		const rivalTag = mode === "coop" ? t.partner : t.rivalTag;
		$("stage-label-me").innerHTML = `${sideTag(t.you)}<span class="nm">${esc(myName)}</span>`;
		$("stage-label-rival").innerHTML = `${sideTag(rivalTag)}<span class="nm">${esc(partnerName)}</span>`;
		$("stage-rival-wrap").classList.remove("gone");
		$("stage-badge").textContent = mode === "coop" ? "🤝" : "VS";
		$("stage-badge").dataset.mode = mode;
		const intro = (id: string, html: string) => {
			const el = $(id);
			el.innerHTML = html;
			// アニメーションを最初からやり直す
			el.classList.remove("play");
			void el.offsetWidth;
			el.classList.add("play");
		};
		intro("stage-intro-me", `<b>${esc(t.you)}</b><span>${esc(t.tapHere)}</span><i aria-hidden="true">▼</i>`);
		intro("stage-intro-rival", `<b>${esc(rivalTag)}</b><span>${esc(t.watching(partnerName))}</span>`);
	}

	/** 右側の名札。相手がいなくなったら右側を薄くする */
	function rivalLabeler(r: Room) {
		let last = "";
		return (html: (p: SeatData) => string) => {
			const p = roomGone ? undefined : r.partner();
			const next = p ? html(p) : esc(t.partnerLeft);
			if (next === last) return;
			last = next;
			$("stage-label-rival").innerHTML = next;
			$("stage-rival-wrap").classList.toggle("gone", !p);
		};
	}

	/**
	 * 相手側のレーン。届いた判定の文字列が増えたら、新しく判定された音符について、
	 * 相手側の太鼓を光らせ、判定の文字・音符が弾ける演出・コンボを出す。
	 * idx は、判定の文字列の k 文字目が notes の何番目の音符か。
	 */
	function rivalLane(notes: readonly ChartNote[], idx: readonly number[]) {
		let marks = "";
		const grades: (Grade | null)[] = idx.map(() => null);
		let combo = 0;
		return {
			grades,
			combo: () => combo,
			update(rv: Renderer, next: string) {
				if (next === marks) return;
				marks = next;
				decodeMarks(next, idx.length).forEach((g, k) => {
					if (!g || grades[k]) return;
					grades[k] = g;
					const note = notes[idx[k]!];
					if (g === "miss") combo = 0;
					else {
						combo++;
						if (note) rv.onHit(note.kind);
					}
					rv.onJudge(g, t.grades[g], note);
					if (g !== "miss") rv.onCombo(combo);
				});
			},
		};
	}

	function versusPlay(r: Room, song: SongMeta, rivalDifficulty: Difficulty): Omit<NetPlay, "startAt" | "finish"> {
		const publish = publisher(r);
		const label = rivalLabeler(r);
		// 相手は自分で選んだ難易度の譜面を叩いているので、その譜面を手元で作って描く
		const rivalNotes = deps.chartFor(song.id, rivalDifficulty).notes;
		const lane = rivalLane(
			rivalNotes,
			rivalNotes.map((_, i) => i),
		);
		return {
			mode: "versus",
			notes: null,
			mine: null,
			rivalDifficulty,
			judged: (st) => st.results,
			combo: (st) => st.combo,
			hud(st) {
				$("hud-score").textContent = st.score.toLocaleString();
				const fill = $("gauge-fill");
				fill.style.width = `${st.gauge}%`;
				fill.classList.toggle("full", st.cleared);
			},
			tick(st) {
				publish(() => progressOf(st, encodeMarks(st.results)));
				label((p) => `${sideTag(t.rivalTag)}<span class="nm">${esc(p.name)}</span><b>${p.score.toLocaleString()}</b>`);
			},
			drawRival(rv, _st, now) {
				const p = roomGone ? undefined : r.partner();
				if (p) lane.update(rv, joinMarks(p.mk));
				rv.draw(rivalNotes, lane.grades, now, lane.combo(), true, null, RIVAL_CUTOFF);
			},
		};
	}

	function coopPlay(r: Room, chart: Chart, owners: CoopOwner[], difficulty: Difficulty): Omit<NetPlay, "startAt" | "finish"> {
		const publish = publisher(r);
		const label = rivalLabeler(r);
		const mySeat = r.seat;
		const partnerSeat = r.partnerSeat;
		const myIdx = notesOf(owners, mySeat);
		const partnerIdx = notesOf(owners, partnerSeat);
		const mine = owners.map((o) => o === mySeat || o === "both");
		const full: (Grade | null)[] = owners.map(() => null);
		let partnerMarks = "";
		let partnerGrades: (Grade | null)[] = [];
		let team: TeamStats = teamStats(full);
		// 右側（相方）のレーン: 相方の音符を普通に、自分の音符を薄く描く
		const lane = rivalLane(chart.notes, partnerIdx);
		const partnerMask = owners.map((o) => o === partnerSeat || o === "both");
		const rivalJudged: (Grade | null)[] = owners.map(() => null);
		let lastTurn = "";
		let cursor = 0;

		/** 相方の判定。相方がいなくなったら、叩く時間を過ぎた相方の音符を「ざんねん」にする */
		function partnerResults(now: number): (Grade | null)[] {
			const p = r.partner();
			const marks = p ? joinMarks(p.mk) : partnerMarks;
			if (marks !== partnerMarks || partnerGrades.length !== partnerIdx.length) {
				partnerMarks = marks;
				partnerGrades = decodeMarks(marks, partnerIdx.length);
			}
			if (!partnerGone(r)) return partnerGrades;
			return partnerGrades.map((g, k) => g ?? (chart.notes[partnerIdx[k]!]!.time < now - 0.2 ? "miss" : null));
		}

		const play: Omit<NetPlay, "startAt" | "finish"> = {
			mode: "coop",
			notes: myIdx.map((i) => chart.notes[i]!),
			mine,
			rivalDifficulty: difficulty,
			judged(st, now) {
				full.fill(null);
				const pg = partnerResults(now);
				// 2人とも叩く音符は、自分の判定だけで描く（相方が先に叩いても、自分の音符は消さない）
				partnerIdx.forEach((n, k) => {
					if (owners[n] !== "both") full[n] = pg[k] ?? null;
				});
				myIdx.forEach((n, k) => (full[n] = st.results[k] ?? null));
				return full;
			},
			combo: () => team.combo,
			hud(st) {
				const p = r.partner();
				$("hud-score").textContent = (st.score + (p && !roomGone ? p.score : 0)).toLocaleString();
				const fill = $("gauge-fill");
				fill.style.width = `${team.gauge}%`;
				fill.classList.toggle("full", team.cleared);
			},
			tick(st, now) {
				const marks = encodeMarks(st.results);
				publish(() => progressOf(st, marks));
				const pg = partnerResults(now);
				team = teamStats(
					mergeCoopMarks(owners, { [mySeat]: marks, [partnerSeat]: encodeMarks(pg) } as Record<Seat, string>),
				);
				play.hud(st);
				const p = r.partner();
				label((q) => `${sideTag(t.partner)}<span class="nm">${esc(q.name)}</span>`);
				// 次に叩く人
				while (cursor < chart.notes.length && chart.notes[cursor]!.time < now - 0.1) cursor++;
				const o = owners[cursor];
				const turn = o === undefined ? "" : o === "both" ? "both" : o === mySeat ? "mine" : "partner";
				if (turn !== lastTurn) {
					lastTurn = turn;
					const el = $("play-turn");
					el.hidden = !turn;
					el.className = `play-turn turn-${turn}`;
					el.textContent = turn === "mine" ? t.yourTurn : turn === "both" ? t.together : t.partnerTurn(p?.name ?? t.partner);
				}
			},
			drawRival(rv, st, now) {
				const p = roomGone ? undefined : r.partner();
				if (p) lane.update(rv, joinMarks(p.mk));
				rivalJudged.fill(null);
				partnerIdx.forEach((n, k) => (rivalJudged[n] = lane.grades[k] ?? null));
				// 自分だけが叩く音符は、自分の判定で消す（右側では薄く描いている）
				myIdx.forEach((n, k) => {
					if (owners[n] === mySeat) rivalJudged[n] = st.results[k] ?? null;
				});
				rv.draw(chart.notes, rivalJudged, now, team.combo, true, partnerMask, RIVAL_CUTOFF);
			},
		};
		return play;
	}

	async function finished(st: GameState) {
		const r = room;
		const c = current;
		$("play-turn").hidden = true;
		if (!r || !c) return;
		const marks = c.owners ? encodeMarks(st.results) : "";
		myFinal = { round: c.round, score: st.score, counts: { ...st.counts }, maxCombo: st.maxCombo, marks, difficulty: c.difficulty };
		view = "result";
		deps.show("mresult", `/${r.mode}/result`);
		renderResult();
		await r.finish(progressOf(st, marks));
	}

	// ---- 結果 ----

	/**
	 * 結果の1人分の欄。演奏画面と同じく、自分は朱色、相手は藍色の帯と枠にする。
	 * 帯には「あなた」「相手（協力では相方）」と名前を出し、勝った人には王冠と「勝ち！」の札を付ける。
	 */
	function playerColumn(name: string, difficulty: Difficulty, score: number, counts: Counts, maxCombo: number, opts: { you: boolean; winner?: boolean; rank?: Rank; stamp?: string; waiting?: boolean }) {
		const rank = opts.rank ? `<span class="mr-rank">${t.ranks[opts.rank]}</span>` : "";
		const rows = (["great", "good", "ok", "miss"] as const)
			.map((g) => `<div class="${g}"><dt>${t.grades[g]}</dt><dd>${counts[g]}</dd></div>`)
			.join("");
		return `<div class="mr-player ${opts.you ? "side-me" : "side-rival"}${opts.winner ? " winner" : ""}">
			${opts.stamp ?? ""}
			<p class="mr-head">${sideTag(opts.you ? t.you : partnerTag())}<span class="nm">${opts.winner ? "👑 " : ""}${esc(name)}</span></p>
			${opts.winner ? `<span class="mr-win">${esc(t.win)}</span>` : ""}
			<p class="mr-diff"><span class="seat-diff diff-${difficulty}">${t.difficulties[difficulty]}</span>${rank}</p>
			<p class="mr-score">${opts.waiting ? "…" : score.toLocaleString()}</p>
			<dl class="result-grid">${rows}<div><dt>${t.maxCombo}</dt><dd>${maxCombo}</dd></div></dl>
		</div>`;
	}

	/** 相手を呼ぶ名前（対戦は「相手」、協力は「相方」） */
	function partnerTag() {
		return current?.owners ? t.partner : t.rivalTag;
	}

	/** 結果の2人の欄の間に置く VS（協力は 🤝） */
	function resultBadge() {
		return current?.owners ? `<div class="mr-vs coop" aria-hidden="true">🤝</div>` : `<div class="mr-vs" aria-hidden="true">VS</div>`;
	}

	function renderResult() {
		const r = room;
		const c = current;
		const me = myFinal;
		if (!r || !c || !me) return;
		const d = r.data;
		const partner = roomGone ? undefined : r.partner();
		const partnerDone = !partner || partner.finished === c.round;
		const gone = !partner;
		$("mr-song").textContent = `${tr(c.song.title)} ・ ${c.owners ? t.coop : t.versus}`;
		const title = $("mr-title");
		let good = false;

		const meCol = (extra: { winner?: boolean; rank?: Rank }) =>
			playerColumn(myName(), me.difficulty, me.score, me.counts, me.maxCombo, { you: true, stamp: stampHtml(r.me()), ...extra });
		const partnerCol = (extra: { winner?: boolean; rank?: Rank }) =>
			partner
				? playerColumn(partner.name, c.owners ? c.difficulty : partner.difficulty, partner.score, partner.counts, partner.maxCombo, {
						you: false,
						stamp: stampHtml(partner),
						waiting: !partnerDone,
						...extra,
					})
				: `<div class="mr-player side-rival gone"><p class="mr-head">${sideTag(partnerTag())}</p><p class="mr-gone">${t.partnerLeft}</p></div>`;

		if (c.owners) {
			// 協力: チームの成績
			const mySeat = r.seat;
			const missing: Seat[] = partnerDone ? ["p1", "p2"] : [mySeat];
			const merged = mergeCoopMarks(
				c.owners,
				{ [mySeat]: me.marks, [r.partnerSeat]: joinMarks(partner?.mk) } as Record<Seat, string>,
				missing,
			);
			const team = teamStats(merged);
			const teamScore = me.score + (partner?.score ?? 0);
			good = partnerDone && team.cleared;
			title.textContent = partnerDone ? (team.cleared ? t.cleared : t.failed) : t.waitingFinish;
			title.classList.toggle("ok", good);
			$("mr-team").hidden = false;
			setHtml("mr-team", `
				<div class="rank-stamp rank-${team.rank}">${t.ranks[team.rank]}</div>
				<div>
					<p class="result-label">${t.team} ${t.score}</p>
					<p class="result-score">${teamScore.toLocaleString()}</p>
					<p class="mr-team-combo">${t.maxCombo} ${team.maxCombo}</p>
				</div>`,
			);
			setHtml("mr-players", meCol({}) + resultBadge() + partnerCol({}));
		} else {
			// 対戦: 勝ち負け
			$("mr-team").hidden = true;
			const w = partner && partnerDone ? versusWinner(r.seat === "p1" ? me.score : partner.score, r.seat === "p1" ? partner.score : me.score) : null;
			const iWin = gone || w === r.seat;
			good = partnerDone && iWin;
			title.textContent = !partnerDone ? t.waitingFinish : gone ? t.partnerLeft : w === "draw" ? t.draw : iWin ? t.win : t.lose;
			title.classList.toggle("ok", good);
			const pRank = partner && partnerDone ? rankFor(accuracyOf(partner.counts)) : undefined;
			setHtml(
				"mr-players",
				meCol({ winner: !!w && w === r.seat, rank: rankFor(accuracyOf(me.counts)) }) +
					resultBadge() +
					partnerCol({ winner: !!w && w === r.partnerSeat, rank: pRank }),
			);
		}

		if (partnerDone && celebrated !== c.round) {
			celebrated = c.round;
			trackEvent("room_finish", { mode: r.mode, song: c.song.id, difficulty: c.difficulty, score: me.score, result: good ? "good" : "bad" });
			if (good) {
				document.body.classList.add("celebrate");
				setTimeout(() => document.body.classList.remove("celebrate"), 4000);
			}
		}

		// ボタンと状態
		const canRematch = !!d && !!partner && partnerDone && d.phase === "result";
		const want = r.wantsRematch();
		const btn = $<HTMLButtonElement>("mr-rematch");
		btn.disabled = !canRematch;
		btn.classList.toggle("btn-ghost", want);
		btn.textContent = want ? t.cancelReady : t.rematch;
		$("mr-lobby").hidden = !r.isHost || !d;
		let status = "";
		if (gone) status = roomGone ? t.roomClosed : t.partnerLeft;
		else if (!partnerDone) status = t.waitingFinish;
		else if (want) status = t.rematchWaiting;
		else if (r.wantsRematch(r.partnerSeat)) status = t.partnerWantsRematch;
		setStatus("mr-status", status);
		$("mr-stamps").hidden = gone;
	}

	$("mr-rematch").addEventListener("click", () => {
		const r = room;
		if (!r) return;
		deps.getAudio()?.unlock();
		void r.wantRematch(!r.wantsRematch());
	});
	$("mr-lobby").addEventListener("click", () => {
		const r = room;
		if (!r?.data) return;
		if (r.data.phase === "result") return void r.backToLobby();
		// 相手がいなくなって、もう待合室に戻っている
		view = "lobby";
		deps.show("lobby", `/${r.mode}/lobby`);
		renderLobby(r.data);
	});
	$("mr-leave").addEventListener("click", () => void leave());

	// スタンプを時間で消すために、ときどき描き直す
	setInterval(() => {
		if (!room?.data) return;
		if (view === "lobby") renderLobby(room.data);
		else if (view === "result") renderResult();
	}, 1000);

	return {
		/** 入口を開く */
		open: () => (room ? deps.show(view === "result" ? "mresult" : "lobby") : open()),
		leave,
		/** 招待URL（?room=12345）から開いたとき */
		openFromUrl() {
			const params = new URLSearchParams(location.search);
			const code = normalizeRoomCode(params.get("room") ?? "");
			if (!code) return;
			// 再読み込みでもう一度入ろうとしないように、URL から部屋の番号を消しておく
			params.delete("room");
			const q = params.toString();
			history.replaceState(null, "", `${location.pathname}${q ? `?${q}` : ""}${location.hash}`);
			open();
			codeInput.value = code;
			$("mp-join").focus();
		},
		/** 自動テスト用 */
		room: () => room,
	};
}
