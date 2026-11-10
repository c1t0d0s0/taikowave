import "./style.css";
import { lang, t, tr } from "./i18n";
import { SONGS, type SongMeta } from "./songs/meta";
import { buildChart, DIFFICULTIES, sourceFromAbc, type Chart, type Difficulty, type NoteKind, type SourceSong } from "./lib/chart";
import { GameAudio } from "./lib/audio";
import { GameState, type Grade, type Judgement } from "./lib/game";
import { Renderer } from "./lib/render";
import { bindInput } from "./lib/input";
import { trackEvent, trackPageView } from "./lib/analytics";
import { load, save } from "./lib/storage";
import { multiplayerAvailable } from "./net/config";
import { initMulti, type NetPlay } from "./multi";

const abcSources = import.meta.glob<string>("./songs/*.abc", { query: "?raw", import: "default", eager: true });
const abcById = new Map(Object.entries(abcSources).map(([p, abc]) => [p.replace(/^.*\//, "").replace(/\.abc$/, ""), abc]));

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- 設定とハイスコア ----

interface Settings {
	music: number;
	se: number;
	speed: number;
	offset: number;
	difficulty: Difficulty;
}

const settings: Settings = {
	music: 0.8,
	se: 0.9,
	speed: 1,
	offset: 0,
	difficulty: "normal",
	...load<Partial<Settings>>("settings", {}),
};
if (!DIFFICULTIES.includes(settings.difficulty)) settings.difficulty = "normal";

const bests = load<Record<string, number>>("bests", {});
const bestKey = (id: string, d: Difficulty) => `${id}:${d}`;

// ---- 文言 ----

document.documentElement.lang = lang;
document.title = `${t.appName} ${lang === "ja" ? "TaikoWave" : "– Drum Rhythm Game"}`;
for (const el of document.querySelectorAll<HTMLElement>("[data-t]")) {
	el.textContent = String(t[el.dataset.t as keyof typeof t]);
}
for (const el of document.querySelectorAll<HTMLElement>("[data-html]")) {
	el.innerHTML = String(t[el.dataset.html as keyof typeof t]);
}
$("howto-list").innerHTML = t.howToItems.map((s) => `<li>${s}</li>`).join("");

// 提灯
const lanternWords = ["祭", "", "ドン", "", "カン", "", "祭", "", "ドン", "", "カン", "", "祭", ""];
$("lanterns").innerHTML = lanternWords
	.map((w, i) => `<span class="lantern ${i % 2 ? "lantern-small" : ""}" style="--i:${i}"><b>${w}</b></span>`)
	.join("");

// ---- 画面の切り替え ----

export type ScreenName = "title" | "select" | "play" | "result" | "multi" | "lobby" | "mresult";
function show(name: ScreenName, path: string = `/${name === "title" ? "" : name}`) {
	for (const s of document.querySelectorAll<HTMLElement>(".screen")) s.hidden = s.id !== `screen-${name}`;
	document.body.dataset.screen = name;
	trackPageView(path, `${t.appName} – ${name}`);
}

// ---- 音 ----

let audio: GameAudio | null = null;
function getAudio(): GameAudio | null {
	if (!audio) {
		try {
			audio = new GameAudio();
			audio.setMusicVolume(settings.music);
			audio.setSeVolume(settings.se);
		} catch {
			return null;
		}
	}
	return audio;
}

// ---- 曲の情報（譜面は最初に使うときに作る） ----

const sources = new Map<string, SourceSong>();
function sourceFor(id: string): SourceSong {
	let s = sources.get(id);
	if (!s) {
		s = sourceFromAbc(abcById.get(id)!);
		sources.set(id, s);
	}
	return s;
}
const charts = new Map<string, Chart>();
function chartFor(id: string, d: Difficulty): Chart {
	const k = bestKey(id, d);
	let c = charts.get(k);
	if (!c) {
		c = buildChart(sourceFor(id), d);
		charts.set(k, c);
	}
	return c;
}

function formatTime(sec: number) {
	const s = Math.round(sec);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---- タイトル ----

$("btn-start").addEventListener("click", () => {
	getAudio()?.unlock();
	renderSelect();
	show("select");
});

// ---- 曲選択 ----

function renderDiffTabs() {
	$("diff-tabs").innerHTML = DIFFICULTIES.map(
		(d) =>
			`<button role="radio" class="diff diff-${d}" data-d="${d}" aria-checked="${d === settings.difficulty}">${t.difficulties[d]}</button>`,
	).join("");
}

$("diff-tabs").addEventListener("click", (e) => {
	const b = (e.target as HTMLElement).closest<HTMLElement>("[data-d]");
	if (!b) return;
	settings.difficulty = b.dataset.d as Difficulty;
	save("settings", settings);
	renderSelect();
});

/** 曲のカード。selected は2人プレイの待合室で選んでいる曲、playLabel は右側のボタンの文字 */
function songCard(song: SongMeta, d: Difficulty = settings.difficulty, opts: { selected?: boolean; playLabel?: string; disabled?: boolean } = {}) {
	const chart = chartFor(song.id, d);
	const best = bests[bestKey(song.id, d)];
	const flames = Array.from({ length: 5 }, (_, i) => `<i class="${i < song.intensity ? "on" : ""}"></i>`).join("");
	return `<li>
		<button class="song${opts.selected ? " selected" : ""}" data-id="${song.id}" style="--song:${song.color}"${opts.selected ? ' aria-pressed="true"' : ""}${opts.disabled ? " disabled" : ""}>
			<span class="song-title">${tr(song.title)}</span>
			<span class="song-sub">${tr(song.subtitle)}</span>
			<span class="song-composer">${tr(song.composer)}</span>
			<span class="song-meta">
				<span class="flames" title="${t.intensity}" aria-label="${t.intensity} ${song.intensity}/5">${flames}</span>
				<span>${chart.notes.length} ${t.notes}</span>
				<span>${formatTime(chart.duration)}</span>
				${best !== undefined ? `<span class="song-best">${t.best} ${best.toLocaleString()}</span>` : ""}
			</span>
			<span class="song-play">${opts.playLabel ?? t.play}</span>
		</button>
	</li>`;
}

function renderSelect() {
	renderDiffTabs();
	$("song-list").innerHTML = SONGS.map((s) => songCard(s)).join("");
}

$("song-list").addEventListener("click", (e) => {
	const b = (e.target as HTMLElement).closest<HTMLElement>("[data-id]");
	if (!b) return;
	const song = SONGS.find((s) => s.id === b.dataset.id);
	if (song) void startGame(song, settings.difficulty);
});

$("btn-select-back").addEventListener("click", () => show("title"));

// 設定
function bindRange(id: string, key: "music" | "se" | "speed" | "offset", onChange?: (v: number) => void, out?: string, fmt?: (v: number) => string) {
	const input = $<HTMLInputElement>(id);
	input.value = String(settings[key]);
	const update = () => {
		const v = Number(input.value);
		settings[key] = v;
		if (out && fmt) $(out).textContent = fmt(v);
		onChange?.(v);
	};
	input.addEventListener("input", update);
	input.addEventListener("change", () => save("settings", settings));
	update();
}
bindRange("set-music", "music", (v) => audio?.setMusicVolume(v));
bindRange("set-se", "se", (v) => {
	audio?.setSeVolume(v);
});
bindRange("set-speed", "speed", undefined, "out-speed", (v) => `×${v.toFixed(1)}`);
bindRange("set-offset", "offset", undefined, "out-offset", (v) => `${v > 0 ? "+" : ""}${v} ms`);
// 太鼓の音量を変えたら、試しに鳴らす
$("set-se").addEventListener("change", () => getAudio()?.don());

// ---- プレイ ----

const canvas = $<HTMLCanvasElement>("stage");
const renderer = new Renderer(canvas);
/** 2人プレイで、画面の右側に相手のプレイを描く */
const rivalRenderer = new Renderer($<HTMLCanvasElement>("stage-rival"));

interface Session {
	song: SongMeta;
	difficulty: Difficulty;
	chart: Chart;
	state: GameState;
	/** 音声の頭の無音などで、譜面と音声がずれている分（秒） */
	audioShift: number;
	endTime: number;
	paused: boolean;
	done: boolean;
	raf: number;
	unbind: () => void;
	/** 2人プレイのとき（1人なら null） */
	net: NetPlay | null;
}

let session: Session | null = null;
/** 曲を読み込んでいる最中に別の操作をしたら、読み込み後に始めないようにするための番号 */
let loadToken = 0;

const SCROLL_TIME: Record<Difficulty, number> = { easy: 1.9, normal: 1.6, hard: 1.35, extreme: 1.15 };

function gameTime(perfMs?: number) {
	if (!audio || !session) return 0;
	return audio.songTime(perfMs) - session.audioShift - settings.offset / 1000;
}

async function startGame(song: SongMeta, difficulty: Difficulty, net: NetPlay | null = null) {
	const a = getAudio();
	stopSession();
	show("play", net ? `/${net.mode}/play/${song.id}/${difficulty}` : `/play/${song.id}/${difficulty}`);
	$("hud-song").textContent = `${tr(song.title)} ・ ${t.difficulties[difficulty]}`;
	$("hud-score").textContent = "0";
	$("gauge-fill").style.width = "0%";
	if (net) document.body.dataset.net = net.mode;
	for (const id of ["ov-pause", "ov-error", "ov-mquit"]) $(id).hidden = true;
	renderer.resize();
	if (net) rivalRenderer.resize();
	if (!a) return showError(t.noAudio);
	a.unlock();

	const token = ++loadToken;
	const chart = chartFor(song.id, difficulty);
	$("ov-loading").hidden = false;
	let buf: AudioBuffer;
	try {
		buf = await a.prepareSong(song.id, abcById.get(song.id)!);
	} catch {
		if (token === loadToken) showError(t.loadError);
		return;
	}
	if (token !== loadToken) return;
	$("ov-loading").hidden = true;

	// 音声の最初の音と譜面の最初の音のずれ（abcjs の音声の頭に少し無音が入ることがあるので）
	const src = sourceFor(song.id);
	const firstOnset = Math.min(Infinity, ...src.tracks.flatMap((track) => track.filter((n) => n.volume > 0).slice(0, 1).map((n) => n.start)));
	const shift = GameAudio.firstSoundTime(buf) - (Number.isFinite(firstOnset) ? (firstOnset * 240) / src.tempo : 0);
	const audioShift = Math.max(0, Math.min(0.3, shift));

	renderer.scrollTime = SCROLL_TIME[difficulty] / settings.speed;
	renderer.beatSeconds = chart.beatSeconds;
	if (net) {
		rivalRenderer.scrollTime = SCROLL_TIME[net.rivalDifficulty] / settings.speed;
		rivalRenderer.beatSeconds = chart.beatSeconds;
	}
	const lead = Math.max(2.4, renderer.scrollTime + 1);
	// 2人プレイでは、2人で決めた開始時刻に始める（間に合わなかったら、途中から鳴らす）
	const startAt = net ? net.startAt(a.ctx) : a.ctx.currentTime + lead;
	a.playSong(buf, startAt);
	// 開始前に4拍カウント
	const beat = Math.max(0.3, chart.beatSeconds);
	for (let k = 4; k >= 1; k--) if (startAt + audioShift - k * beat > a.ctx.currentTime) a.clap(startAt + audioShift - k * beat, k === 4);

	// 協力プレイでは、自分が叩く音符だけで判定する
	const state = new GameState(net?.notes ?? chart.notes, difficulty);
	const lastNote = chart.notes[chart.notes.length - 1]?.time ?? 0;
	session = {
		song,
		difficulty,
		chart,
		state,
		audioShift,
		endTime: Math.max(chart.duration, lastNote) + 1.2,
		paused: false,
		done: false,
		raf: 0,
		unbind: bindInput(canvas, (x, y) => renderer.hitTest(x, y), { hit: onHit, pause: togglePause }),
		net,
	};
	updateHud();
	trackEvent("game_start", { song: song.id, difficulty });
	session.raf = requestAnimationFrame(loop);
}

function judgeLabel(j: Judgement) {
	return j.double ? `${t.grades[j.grade]} ×2` : t.grades[j.grade];
}

function applyJudgement(j: Judgement) {
	const s = session!;
	renderer.onJudge(j.grade, judgeLabel(j), s.state.notes[j.note]);
	if (j.grade !== "miss" && !j.double) renderer.onCombo(j.combo);
	updateHud();
}

function onHit(kind: NoteKind, perfMs: number) {
	const s = session;
	if (!s || s.paused || s.done || !audio) return;
	const j = s.state.hit(kind, gameTime(perfMs));
	// 大きい音符をドンで叩いたら、低く長く響く音にする
	if (kind === "don") audio.don(!!j && j.grade !== "miss" && !!s.state.notes[j.note]?.big);
	else audio.ka();
	renderer.onHit(kind);
	if (j) applyJudgement(j);
}

function updateHud() {
	const s = session!;
	if (s.net) return s.net.hud(s.state);
	$("hud-score").textContent = s.state.score.toLocaleString();
	const fill = $("gauge-fill");
	fill.style.width = `${s.state.gauge}%`;
	fill.classList.toggle("full", s.state.cleared);
}

function loop() {
	const s = session;
	if (!s || s.paused || s.done) return;
	const now = gameTime();
	for (const j of s.state.expire(now)) applyJudgement(j);
	const judged: readonly (Grade | null)[] = s.net ? s.net.judged(s.state, now) : s.state.results;
	renderer.draw(s.chart.notes, judged, now, s.net?.combo(s.state) ?? s.state.combo, true, s.net?.mine ?? null);
	s.net?.tick(s.state, now);
	s.net?.drawRival(rivalRenderer, s.state, now);
	if (now >= s.endTime) {
		finish();
		return;
	}
	s.raf = requestAnimationFrame(loop);
}

function togglePause() {
	const s = session;
	if (!s || s.done) return;
	// 2人プレイでは止めない（部屋を出るかどうかを聞くだけ）
	if (s.net) {
		$("ov-mquit").hidden = !$("ov-mquit").hidden;
		return;
	}
	if (s.paused) return resumeGame();
	s.paused = true;
	cancelAnimationFrame(s.raf);
	void audio?.pause();
	$("ov-pause").hidden = false;
}

function resumeGame() {
	const s = session;
	if (!s || !s.paused) return;
	$("ov-pause").hidden = true;
	audio?.unlock();
	void audio?.resume().then(() => {
		s.paused = false;
		s.raf = requestAnimationFrame(loop);
	});
}

function stopSession() {
	loadToken++;
	if (session) {
		cancelAnimationFrame(session.raf);
		session.unbind();
		session.done = true;
		session = null;
	}
	delete document.body.dataset.net;
	audio?.stopSong();
	if (audio && audio.ctx.state === "suspended") void audio.resume();
	$("ov-loading").hidden = true;
}

function showError(msg: string) {
	$("ov-loading").hidden = true;
	$("error-text").textContent = msg;
	$("ov-error").hidden = false;
}

$("btn-pause").addEventListener("click", togglePause);
$("btn-resume").addEventListener("click", resumeGame);
$("btn-retry").addEventListener("click", () => session && void startGame(session.song, session.difficulty));
$("btn-quit").addEventListener("click", () => {
	stopSession();
	renderSelect();
	show("select");
});
$("btn-error-back").addEventListener("click", () => {
	stopSession();
	renderSelect();
	show("select");
});

document.addEventListener("visibilitychange", () => {
	if (document.hidden && session && !session.net && !session.paused && !session.done) togglePause();
});
window.addEventListener("resize", () => {
	renderer.resize();
	if (session?.net) rivalRenderer.resize();
});

// ---- 結果 ----

let lastPlayed: { song: SongMeta; difficulty: Difficulty } | null = null;

function finish() {
	const s = session!;
	s.done = true;
	const st = s.state;
	if (s.net) {
		const net = s.net;
		stopSession();
		net.finish(st);
		return;
	}
	const key = bestKey(s.song.id, s.difficulty);
	const isBest = st.score > (bests[key] ?? -1);
	if (isBest) {
		bests[key] = st.score;
		save("bests", bests);
	}
	trackEvent("game_finish", {
		song: s.song.id,
		difficulty: s.difficulty,
		score: st.score,
		accuracy: Math.round(st.accuracy * 100),
		cleared: st.cleared,
	});
	lastPlayed = { song: s.song, difficulty: s.difficulty };
	stopSession();

	$("res-song").textContent = `${tr(s.song.title)} ・ ${t.difficulties[s.difficulty]}`;
	$("res-clear").textContent = st.cleared ? t.cleared : t.failed;
	$("res-clear").classList.toggle("ok", st.cleared);
	const rank = $("res-rank");
	rank.textContent = t.ranks[st.rank];
	rank.className = `rank-stamp rank-${st.rank}`;
	$("res-best").hidden = !isBest || st.score === 0;
	const ms = Math.round(st.meanDelta * 1000);
	const tendency = Math.abs(ms) <= 5 ? t.justRight : ms < 0 ? t.early(-ms) : t.late(ms);
	const rows: [string, string, string?][] = [
		[t.grades.great, String(st.counts.great), "great"],
		[t.grades.good, String(st.counts.good), "good"],
		[t.grades.ok, String(st.counts.ok), "ok"],
		[t.grades.miss, String(st.counts.miss), "miss"],
		[t.maxCombo, String(st.maxCombo)],
		[t.timing, tendency],
	];
	$("res-grid").innerHTML = rows.map(([k, v, c]) => `<div class="${c ?? ""}"><dt>${k}</dt><dd>${v}</dd></div>`).join("");
	show("result", "/result");
	countUp($("res-score"), st.score);
	if (st.cleared) {
		// 結果画面でも紙吹雪
		document.body.classList.add("celebrate");
		setTimeout(() => document.body.classList.remove("celebrate"), 4000);
	}
}

function countUp(el: HTMLElement, value: number) {
	const t0 = performance.now();
	const dur = 900;
	const step = () => {
		const k = Math.min(1, (performance.now() - t0) / dur);
		el.textContent = Math.round(value * (1 - (1 - k) ** 3)).toLocaleString();
		if (k < 1) requestAnimationFrame(step);
	};
	step();
}

$("btn-res-retry").addEventListener("click", () => lastPlayed && void startGame(lastPlayed.song, lastPlayed.difficulty));
$("btn-res-select").addEventListener("click", () => {
	renderSelect();
	show("select");
});

// ---- 2人プレイ ----

$("btn-multi").hidden = !multiplayerAvailable();
const multi = multiplayerAvailable()
	? initMulti({
			$,
			show,
			getAudio,
			chartFor,
			sourceFor,
			songCard,
			startGame,
			stopSession,
			abc: (id) => abcById.get(id)!,
			settings,
			saveSettings: () => save("settings", settings),
		})
	: null;
$("btn-multi").addEventListener("click", () => {
	getAudio()?.unlock();
	multi?.open();
});
$("btn-mquit-resume").addEventListener("click", () => ($("ov-mquit").hidden = true));
$("btn-mquit-leave").addEventListener("click", () => {
	$("ov-mquit").hidden = true;
	stopSession();
	void multi?.leave();
});

show("title", "/");
// 招待URL（?room=12345）から開いたら、2人プレイの入口を開く
multi?.openFromUrl();

// 開発サーバーでだけ、自動テストから状態を読めるようにする（本番のビルドには含まれない）
if (import.meta.env.DEV) {
	Object.assign(window, { __taiko: { session: () => session, gameTime: () => gameTime(), multi } });
}
