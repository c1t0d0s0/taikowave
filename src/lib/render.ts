/**
 * プレイ画面の Canvas 描画。画面中央を上から下へ音符が降ってくる縦レーンと、画面下部の小さな太鼓。
 */
import type { ChartNote, NoteKind } from "./chart";
import type { Grade } from "./game";
import { drawScenery } from "./scenery";

export interface Layout {
	w: number;
	h: number;
	/** 縦レーン。judgeY は判定の輪の中心の高さ（音符はここへ向かって上から降ってくる） */
	lane: { x: number; y: number; w: number; h: number; judgeY: number };
	drum: { cx: number; cy: number; r: number; inner: number };
	noteR: number;
}

interface Popup {
	grade: Grade;
	label: string;
	at: number;
}

interface Burst {
	kind: NoteKind;
	big: boolean;
	at: number;
	grade: Grade;
}

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	rot: number;
	vr: number;
	color: string;
	at: number;
	life: number;
}

export const COLORS = {
	don: "#f0442c",
	donDark: "#a51c0c",
	ka: "#2b8fd8",
	kaDark: "#124f86",
	gold: "#ffc531",
	cream: "#fff6e0",
	ink: "#3a1d0e",
	lane: "#3a1d0e",
};

/** 2人プレイの左右の色（CSS の --side-me / --side-rival と同じ） */
export const SIDE_COLORS = { me: "#ff5a2e", rival: "#3aa6ff" };

const GRADE_COLOR: Record<Grade, string> = {
	great: "#ffcf2e",
	good: "#ffffff",
	ok: "#9fe0ff",
	miss: "#b9a9a0",
};

interface Spark {
	x: number;
	y: number;
	vx: number;
	vy: number;
	color: string;
}

/** レーン左右で上がる花火 */
interface Firework {
	x: number;
	y: number;
	at: number;
	life: number;
	sparks: Spark[];
}

const CONFETTI = ["#f0442c", "#ffc531", "#2b8fd8", "#3fbf6a", "#ff7ab8", "#ffffff"];

export class Renderer {
	readonly canvas: HTMLCanvasElement;
	private readonly g: CanvasRenderingContext2D;
	layout!: Layout;
	private dpr = 1;
	/** 判定の輪に音符が届くまでの秒 */
	scrollTime = 1.4;
	private popups: Popup[] = [];
	private bursts: Burst[] = [];
	private particles: Particle[] = [];
	private flash = { don: -1e9, ka: -1e9 };
	private comboPulse = -1e9;
	private fireworks: Firework[] = [];
	private lastFirework = -1e9;
	/** 1拍の秒数（提灯を拍に合わせて揺らす） */
	beatSeconds = 0.5;
	/** レーンの縁の色（2人プレイでは、自分は朱色・相手は藍色にして見分けやすくする） */
	edge: string = COLORS.gold;
	private bg: HTMLCanvasElement | null = null;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.g = canvas.getContext("2d")!;
		this.resize();
		// 屋台の看板の文字をフォントが読み込まれてから描き直す
		document.fonts?.ready.then(() => this.buildBackground());
	}

	/** 動かない背景をオフスクリーンに描いておく */
	private buildBackground() {
		const { w, h } = this.layout;
		const bg = this.bg ?? document.createElement("canvas");
		bg.width = Math.round(w * this.dpr);
		bg.height = Math.round(h * this.dpr);
		const bgc = bg.getContext("2d")!;
		bgc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		drawScenery(bgc, this.layout);
		this.bg = bg;
	}

	resize() {
		const rect = this.canvas.getBoundingClientRect();
		const w = Math.max(1, rect.width);
		const h = Math.max(1, rect.height);
		this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
		this.canvas.width = Math.round(w * this.dpr);
		this.canvas.height = Math.round(h * this.dpr);
		const portrait = h > w * 1.05;
		// 太鼓は小さめにして画面下部に置く
		const r = Math.max(
			36,
			portrait ? Math.min(w * 0.33, h * 0.19, 150) : Math.min(h * 0.21, w * 0.15, 140),
		);
		const cy = h - r * 1.18;
		// 縦レーンは画面の真ん中
		const laneW = portrait ? Math.min(120, Math.max(80, w * 0.26)) : Math.min(130, Math.max(84, h * 0.2));
		const noteR = laneW * 0.27;
		const judgeY = cy - r - noteR * 1.75;
		const laneBottom = judgeY + noteR * 1.6;
		this.layout = {
			w,
			h,
			lane: { x: (w - laneW) / 2, y: 0, w: laneW, h: laneBottom, judgeY },
			drum: { cx: w / 2, cy, r, inner: r * 0.66 },
			noteR,
		};
		this.buildBackground();
	}

	/** 太鼓のどこを押したか。レーンの下（太鼓の高さ）の横一帯を太鼓として扱う（スマホで押しやすいように） */
	hitTest(x: number, y: number): NoteKind | null {
		const { lane, drum } = this.layout;
		if (y < lane.y + lane.h) return null;
		const d = Math.hypot(x - drum.cx, y - drum.cy);
		return d <= drum.inner ? "don" : "ka";
	}

	onHit(kind: NoteKind) {
		this.flash[kind] = performance.now();
	}

	onJudge(grade: Grade, label: string, note: ChartNote | undefined) {
		const now = performance.now();
		this.popups.push({ grade, label, at: now });
		if (this.popups.length > 4) this.popups.shift();
		if (note && grade !== "miss") this.bursts.push({ kind: note.kind, big: note.big, at: now, grade });
		// 「あっぱれ」と大音符で花火を上げる（出しすぎないよう間隔をあける）
		if (grade === "great" || (note?.big && grade !== "miss")) this.launchFirework(note?.big ? 1.4 : 1);
	}

	onCombo(combo: number) {
		this.comboPulse = performance.now();
		if (combo > 0 && combo % 50 === 0) this.confetti(60);
		if (combo > 0 && combo % 10 === 0) {
			// 10コンボごとに左右で大きめの花火
			this.launchFirework(1.6, true);
			this.launchFirework(1.6, true);
		}
	}

	private launchFirework(scale: number, force = false) {
		const now = performance.now();
		if (!force && now - this.lastFirework < 140) return;
		const { lane, drum, h } = this.layout;
		const side = lane.x;
		if (side < 50) return;
		this.lastFirework = now;
		const left = Math.random() < 0.5;
		const margin = Math.min(30, side * 0.2);
		const x = left
			? margin + Math.random() * (side - margin * 2)
			: lane.x + lane.w + margin + Math.random() * (side - margin * 2);
		const top = h * 0.14;
		const bottom = Math.max(top + 20, drum.cy - drum.r * 1.1);
		const y = top + Math.random() * (bottom - top);
		const n = Math.round(22 * scale);
		const speed = Math.min(side * 0.55, 150) * scale;
		const c1 = CONFETTI[Math.floor(Math.random() * 5)]!;
		const c2 = CONFETTI[Math.floor(Math.random() * CONFETTI.length)]!;
		const sparks: Spark[] = [];
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 + Math.random() * 0.2;
			const v = speed * (0.75 + Math.random() * 0.25);
			sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: i % 2 ? c1 : c2 });
		}
		this.fireworks.push({ x, y, at: now, life: 900, sparks });
		if (this.fireworks.length > 10) this.fireworks.shift();
	}

	confetti(n: number) {
		const now = performance.now();
		const { w } = this.layout;
		for (let i = 0; i < n; i++) {
			this.particles.push({
				x: Math.random() * w,
				y: -10 - Math.random() * 40,
				vx: (Math.random() - 0.5) * 120,
				vy: 120 + Math.random() * 180,
				rot: Math.random() * Math.PI,
				vr: (Math.random() - 0.5) * 10,
				color: CONFETTI[i % CONFETTI.length]!,
				at: now,
				life: 2200 + Math.random() * 1200,
			});
		}
	}

	/**
	 * mine は協力プレイで、音符ごとに自分が叩くかどうか。相方の音符は小さく薄く描く（1人なら null）。
	 * cutoff を指定すると、まだ判定のない音符を、判定の輪をその秒数だけ過ぎたら描かない
	 * （2人プレイの相手側。相手の判定が届くまでのあいだ、音符が輪の下へ流れ続けないように）
	 */
	draw(
		notes: readonly ChartNote[],
		judged: readonly (Grade | null)[],
		songTime: number,
		combo: number,
		kindHint: boolean,
		mine: readonly boolean[] | null = null,
		cutoff: number | null = null,
	) {
		const g = this.g;
		const L = this.layout;
		const now = performance.now();
		g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		g.clearRect(0, 0, L.w, L.h);
		if (this.bg) g.drawImage(this.bg, 0, 0, L.w, L.h);
		this.drawFireworks(now);
		this.drawLanterns(now, songTime);
		this.drawLane(now);
		this.drawNotes(notes, judged, songTime, kindHint, mine, cutoff);
		this.drawBursts(now);
		this.drawPopups(now);
		this.drawDrum(now, combo);
		this.drawParticles(now);
	}

	/** レーン左右に吊るした提灯。拍に合わせて揺れ、叩くと明るく光る */
	private drawLanterns(now: number, songTime: number) {
		const g = this.g;
		const { lane, w, h } = this.layout;
		const side = lane.x;
		if (side < 50) return;
		const per = Math.max(1, Math.min(4, Math.floor(side / 75)));
		const lr = Math.min(26, side / (per * 2.6), h * 0.04);
		const ropeY = Math.max(10, h * 0.025);
		const sag = lr * 1.1;
		const glow = Math.max(0, 1 - (now - Math.max(this.flash.don, this.flash.ka)) / 220);
		const beat = Math.max(0.2, this.beatSeconds);
		const phase = (songTime / beat) * Math.PI;
		const sway = Math.sin(phase) * 0.12;
		const bounce = Math.abs(Math.sin(phase));

		for (const [x0, x1] of [
			[0, side - 6],
			[lane.x + lane.w + 6, w],
		] as const) {
			// 綱
			g.strokeStyle = "rgba(255,230,180,0.75)";
			g.lineWidth = 2;
			g.beginPath();
			g.moveTo(x0, ropeY);
			g.quadraticCurveTo((x0 + x1) / 2, ropeY + sag * 2, x1, ropeY);
			g.stroke();
			for (let i = 0; i < per; i++) {
				const t = (i + 0.5) / per;
				const x = x0 + (x1 - x0) * t;
				// 二次曲線上の高さ
				const y = ropeY + sag * 2 * 2 * t * (1 - t);
				const hang = lr * 0.6 + bounce * 2;
				const sw = i % 2 ? -sway : sway;
				g.save();
				g.translate(x, y);
				g.rotate(sw);
				g.strokeStyle = "rgba(255,230,180,0.75)";
				g.lineWidth = 1.5;
				g.beginPath();
				g.moveTo(0, 0);
				g.lineTo(0, hang);
				g.stroke();
				g.translate(0, hang + lr * 1.15);
				this.drawLantern(lr, i % 2 === 0, glow);
				g.restore();
			}
		}
	}

	private drawLantern(r: number, red: boolean, glow: number) {
		const g = this.g;
		const hh = r * 1.15;
		if (glow > 0) {
			const halo = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.2);
			halo.addColorStop(0, `rgba(255,214,90,${0.55 * glow})`);
			halo.addColorStop(1, "rgba(255,214,90,0)");
			g.fillStyle = halo;
			g.beginPath();
			g.arc(0, 0, r * 2.2, 0, Math.PI * 2);
			g.fill();
		}
		// 上下の黒い枠
		g.fillStyle = COLORS.ink;
		g.fillRect(-r * 0.55, -hh - r * 0.18, r * 1.1, r * 0.26);
		g.fillRect(-r * 0.55, hh - r * 0.08, r * 1.1, r * 0.26);
		// 胴
		const body = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 1.2);
		if (red) {
			body.addColorStop(0, glow > 0 ? "#ffb36b" : "#ff7a4d");
			body.addColorStop(1, "#c2260f");
		} else {
			body.addColorStop(0, glow > 0 ? "#fffbe8" : "#fff4d0");
			body.addColorStop(1, "#f0c35a");
		}
		g.fillStyle = body;
		g.beginPath();
		g.ellipse(0, 0, r, hh, 0, 0, Math.PI * 2);
		g.fill();
		g.strokeStyle = COLORS.ink;
		g.lineWidth = 2;
		g.stroke();
		// 骨（横じま）
		g.strokeStyle = red ? "rgba(90,15,5,0.35)" : "rgba(150,90,20,0.35)";
		g.lineWidth = 1;
		for (let k = -2; k <= 2; k++) {
			const yy = (k / 3) * hh;
			const ww = r * Math.sqrt(1 - (yy / hh) ** 2);
			g.beginPath();
			g.moveTo(-ww, yy);
			g.lineTo(ww, yy);
			g.stroke();
		}
		// 房
		g.strokeStyle = red ? COLORS.gold : COLORS.don;
		g.lineWidth = 2;
		for (let k = -1; k <= 1; k++) {
			g.beginPath();
			g.moveTo(k * r * 0.15, hh + r * 0.18);
			g.lineTo(k * r * 0.22, hh + r * 0.7);
			g.stroke();
		}
	}

	private drawFireworks(now: number) {
		const g = this.g;
		this.fireworks = this.fireworks.filter((f) => now - f.at < f.life);
		for (const f of this.fireworks) {
			const p = (now - f.at) / f.life;
			const t = (now - f.at) / 1000;
			// 速度が落ちていく広がり方 + 少しだけ重力
			const spread = (1 - Math.exp(-t * 4)) / 4;
			const drop = 40 * t * t;
			// 最初の一瞬の閃光
			if (p < 0.12) {
				g.fillStyle = `rgba(255,250,220,${1 - p / 0.12})`;
				g.beginPath();
				g.arc(f.x, f.y, 10 * (1 - p / 0.12) + 4, 0, Math.PI * 2);
				g.fill();
			}
			g.globalAlpha = 1 - p * p;
			for (const s of f.sparks) {
				const x = f.x + s.vx * spread;
				const y = f.y + s.vy * spread + drop;
				// 尾
				const tx = f.x + s.vx * spread * 0.7;
				const ty = f.y + s.vy * spread * 0.7 + drop * 0.8;
				g.strokeStyle = s.color;
				g.lineWidth = 2;
				g.beginPath();
				g.moveTo(tx, ty);
				g.lineTo(x, y);
				g.stroke();
				g.fillStyle = s.color;
				g.beginPath();
				g.arc(x, y, 2.6 * (1 - p * 0.5), 0, Math.PI * 2);
				g.fill();
			}
			g.globalAlpha = 1;
		}
	}

	private drawLane(now: number) {
		const g = this.g;
		const { lane, noteR } = this.layout;
		// レーンの帯（墨色に金の縁）
		g.fillStyle = COLORS.lane;
		g.fillRect(lane.x, lane.y, lane.w, lane.h);
		const grad = g.createLinearGradient(lane.x, 0, lane.x + lane.w, 0);
		grad.addColorStop(0, "rgba(0,0,0,0.25)");
		grad.addColorStop(0.5, "rgba(255,255,255,0.08)");
		grad.addColorStop(1, "rgba(0,0,0,0.25)");
		g.fillStyle = grad;
		g.fillRect(lane.x, lane.y, lane.w, lane.h);
		g.fillStyle = this.edge;
		g.fillRect(lane.x - 4, lane.y, 4, lane.h);
		g.fillRect(lane.x + lane.w, lane.y, 4, lane.h);
		g.fillRect(lane.x - 4, lane.y + lane.h, lane.w + 8, 4);

		// 判定の輪
		const cx = lane.x + lane.w / 2;
		const fd = Math.max(0, 1 - (now - this.flash.don) / 160);
		const fk = Math.max(0, 1 - (now - this.flash.ka) / 160);
		if (fd > 0 || fk > 0) {
			g.fillStyle = fd >= fk ? `rgba(240,68,44,${0.45 * fd})` : `rgba(43,143,216,${0.45 * fk})`;
			const top = lane.judgeY - noteR * 1.6;
			g.fillRect(lane.x, top, lane.w, lane.y + lane.h - top);
		}
		g.lineWidth = 3;
		g.strokeStyle = "rgba(255,246,224,0.85)";
		g.beginPath();
		g.arc(cx, lane.judgeY, noteR * 1.08, 0, Math.PI * 2);
		g.stroke();
		g.strokeStyle = "rgba(255,246,224,0.35)";
		g.beginPath();
		g.arc(cx, lane.judgeY, noteR * 1.45, 0, Math.PI * 2);
		g.stroke();
	}

	private noteY(t: number, songTime: number) {
		const { lane, noteR } = this.layout;
		// レーンの上端の少し外から降り始める
		const dist = lane.judgeY - (lane.y - noteR * 1.5);
		const speed = dist / this.scrollTime;
		return lane.judgeY - (t - songTime) * speed;
	}

	private drawNote(x: number, y: number, kind: NoteKind, big: boolean, hint: boolean, alpha = 1, scale = 1) {
		const g = this.g;
		const r = this.layout.noteR * (big ? 1.4 : 1) * scale;
		g.globalAlpha = alpha;
		g.fillStyle = COLORS.ink;
		g.beginPath();
		g.arc(x, y, r + 3, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = COLORS.cream;
		g.beginPath();
		g.arc(x, y, r, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = kind === "don" ? COLORS.don : COLORS.ka;
		g.beginPath();
		g.arc(x, y, r * 0.8, 0, Math.PI * 2);
		g.fill();
		// つやの光
		g.fillStyle = "rgba(255,255,255,0.35)";
		g.beginPath();
		g.ellipse(x - r * 0.25, y - r * 0.32, r * 0.35, r * 0.18, -0.5, 0, Math.PI * 2);
		g.fill();
		if (hint) {
			g.fillStyle = "#fff";
			g.font = `900 ${Math.round(r * 0.78)}px "Zen Maru Gothic", sans-serif`;
			g.textAlign = "center";
			g.textBaseline = "middle";
			g.fillText(kind === "don" ? "ド" : "カ", x, y + r * 0.04);
		}
		g.globalAlpha = 1;
	}

	private drawNotes(
		notes: readonly ChartNote[],
		judged: readonly (Grade | null)[],
		songTime: number,
		hint: boolean,
		mine: readonly boolean[] | null,
		cutoff: number | null,
	) {
		const { lane, noteR } = this.layout;
		const cx = lane.x + lane.w / 2;
		const bottom = lane.y + lane.h;
		// レーンの下（太鼓の上）にははみ出さないように切り取る
		const g = this.g;
		g.save();
		g.beginPath();
		g.rect(0, lane.y - noteR * 3, this.layout.w, bottom - lane.y + noteR * 3);
		g.clip();
		// 遠い音符から描いて、近い音符が上に重なるようにする
		for (let i = notes.length - 1; i >= 0; i--) {
			const n = notes[i]!;
			const y = this.noteY(n.time, songTime);
			if (y > bottom + noteR) break;
			if (y < lane.y - noteR * 2) continue;
			const res = judged[i];
			if (res && res !== "miss") continue;
			if (cutoff !== null && !res && n.time < songTime - cutoff) continue;
			if (mine && !mine[i]) this.drawNote(cx, y, n.kind, n.big, false, res === "miss" ? 0.15 : 0.32, 0.72);
			else this.drawNote(cx, y, n.kind, n.big, hint, res === "miss" ? 0.35 : 1);
		}
		g.restore();
	}

	private drawBursts(now: number) {
		const g = this.g;
		const { lane, noteR } = this.layout;
		const cx = lane.x + lane.w / 2;
		const cy = lane.judgeY;
		this.bursts = this.bursts.filter((b) => now - b.at < 320);
		for (const b of this.bursts) {
			const p = (now - b.at) / 320;
			const r = noteR * (b.big ? 1.4 : 1) * (1 + p * 1.2);
			g.strokeStyle = b.grade === "great" ? `rgba(255,207,46,${1 - p})` : `rgba(255,255,255,${1 - p})`;
			g.lineWidth = 6 * (1 - p) + 1;
			g.beginPath();
			g.arc(cx, cy, r, 0, Math.PI * 2);
			g.stroke();
			// 叩いた音符が少し跳ね上がって消える
			this.drawNote(cx + p * noteR * 1.5, cy - Math.sin(p * Math.PI * 0.5) * noteR * 3, b.kind, b.big, false, 1 - p);
		}
	}

	private drawPopups(now: number) {
		const g = this.g;
		const { lane, noteR } = this.layout;
		this.popups = this.popups.filter((p) => now - p.at < 500);
		const p = this.popups[this.popups.length - 1];
		if (!p) return;
		const k = (now - p.at) / 500;
		const size = Math.round(Math.max(18, noteR * 0.95) * (k < 0.12 ? 1 + (0.12 - k) * 3 : 1));
		g.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
		g.font = `900 ${size}px "Zen Maru Gothic", sans-serif`;
		g.textAlign = "center";
		g.textBaseline = "top";
		// 判定の輪の右隣（レーンの外）に出す。横に入りきらないとき（2人プレイのスマホなど）は輪の上に出す
		let x = lane.x + lane.w + 12;
		let y = lane.judgeY - k * 6;
		g.textAlign = "left";
		g.textBaseline = "middle";
		if (x + g.measureText(p.label).width > this.layout.w - 4) {
			x = lane.x + lane.w / 2;
			y = lane.judgeY - noteR * 1.9 - k * 6;
			g.textAlign = "center";
		}
		g.lineWidth = 5;
		g.strokeStyle = COLORS.ink;
		g.strokeText(p.label, x, y);
		g.fillStyle = GRADE_COLOR[p.grade];
		g.fillText(p.label, x, y);
		g.globalAlpha = 1;
	}

	private drawDrum(now: number, combo: number) {
		const g = this.g;
		const { cx, cy, r, inner } = this.layout.drum;
		const fd = Math.max(0, 1 - (now - this.flash.don) / 180);
		const fk = Math.max(0, 1 - (now - this.flash.ka) / 180);
		const shake = fd * 3;

		// 影
		g.fillStyle = "rgba(58,29,14,0.25)";
		g.beginPath();
		g.ellipse(cx, cy + r * 1.02, r * 0.95, r * 0.14, 0, 0, Math.PI * 2);
		g.fill();

		// ふち（胴）: 朱塗りの木
		const rimGrad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
		rimGrad.addColorStop(0, "#ff6b3d");
		rimGrad.addColorStop(1, "#b5260f");
		g.fillStyle = rimGrad;
		g.beginPath();
		g.arc(cx, cy + shake, r, 0, Math.PI * 2);
		g.fill();
		if (fk > 0) {
			g.fillStyle = `rgba(80,180,255,${0.6 * fk})`;
			g.beginPath();
			g.arc(cx, cy, r + 6 * fk, 0, Math.PI * 2);
			g.arc(cx, cy, inner, 0, Math.PI * 2, true);
			g.fill();
		}
		g.lineWidth = 4;
		g.strokeStyle = COLORS.ink;
		g.beginPath();
		g.arc(cx, cy + shake, r, 0, Math.PI * 2);
		g.stroke();

		// 鋲
		const studs = 16;
		const sr = (r + inner) / 2 + (r - inner) * 0.18;
		for (let i = 0; i < studs; i++) {
			// 真上は「カン」の文字があるので、鋲を半分ずらす
			const a = ((i + 0.5) / studs) * Math.PI * 2;
			const x = cx + Math.cos(a) * sr;
			const y = cy + shake + Math.sin(a) * sr;
			g.fillStyle = COLORS.gold;
			g.beginPath();
			g.arc(x, y, Math.max(2.5, r * 0.028), 0, Math.PI * 2);
			g.fill();
			g.strokeStyle = "rgba(58,29,14,0.6)";
			g.lineWidth = 1;
			g.stroke();
		}

		// 打面（皮）
		const headGrad = g.createRadialGradient(cx - inner * 0.25, cy - inner * 0.3, inner * 0.1, cx, cy, inner);
		headGrad.addColorStop(0, "#fffaf0");
		headGrad.addColorStop(1, "#f1dfb8");
		g.fillStyle = headGrad;
		g.beginPath();
		g.arc(cx, cy + shake, inner, 0, Math.PI * 2);
		g.fill();
		if (fd > 0) {
			g.fillStyle = `rgba(255,120,60,${0.45 * fd})`;
			g.beginPath();
			g.arc(cx, cy + shake, inner, 0, Math.PI * 2);
			g.fill();
		}
		g.lineWidth = 3;
		g.strokeStyle = COLORS.ink;
		g.beginPath();
		g.arc(cx, cy + shake, inner, 0, Math.PI * 2);
		g.stroke();

		// 打面の「波」の紋
		g.save();
		g.translate(cx, cy + shake);
		g.strokeStyle = "rgba(240,68,44,0.28)";
		g.lineWidth = Math.max(3, inner * 0.07);
		g.lineCap = "round";
		for (let k = -1; k <= 1; k++) {
			g.beginPath();
			const y0 = k * inner * 0.28;
			for (let x = -inner * 0.6; x <= inner * 0.6; x += 2) {
				const y = y0 + Math.sin((x / inner) * Math.PI * 2.2) * inner * 0.08;
				if (x === -inner * 0.6) g.moveTo(x, y);
				else g.lineTo(x, y);
			}
			g.stroke();
		}
		g.restore();

		// コンボ
		if (combo >= 5) {
			const pulse = Math.max(0, 1 - (now - this.comboPulse) / 150);
			const size = Math.round(inner * 0.5 * (1 + pulse * 0.12));
			g.font = `900 ${size}px "Zen Maru Gothic", sans-serif`;
			g.textAlign = "center";
			g.textBaseline = "middle";
			g.lineWidth = Math.max(4, size * 0.12);
			g.strokeStyle = COLORS.ink;
			g.strokeText(String(combo), cx, cy + shake - inner * 0.05);
			g.fillStyle = combo >= 100 ? COLORS.gold : "#ffffff";
			g.fillText(String(combo), cx, cy + shake - inner * 0.05);
			g.font = `800 ${Math.round(size * 0.32)}px "Zen Maru Gothic", sans-serif`;
			g.fillStyle = COLORS.ink;
			g.fillText("COMBO", cx, cy + shake + inner * 0.4);
		}

		// 「ドン」「カン」のラベル
		const label = Math.round(Math.max(12, r * 0.09));
		g.font = `800 ${label}px "Zen Maru Gothic", sans-serif`;
		g.textAlign = "center";
		g.textBaseline = "middle";
		g.fillStyle = "rgba(255,255,255,0.92)";
		g.fillText("カン", cx, cy - (r + inner) / 2 + shake);
		if (combo < 5) {
			g.fillStyle = "rgba(165,28,12,0.75)";
			g.font = `900 ${Math.round(inner * 0.28)}px "Zen Maru Gothic", sans-serif`;
			g.fillText("ドン", cx, cy + shake);
		}
	}

	private drawParticles(now: number) {
		const g = this.g;
		this.particles = this.particles.filter((p) => now - p.at < p.life);
		for (const p of this.particles) {
			const t = (now - p.at) / 1000;
			const x = p.x + p.vx * t + Math.sin(t * 3 + p.rot) * 20;
			const y = p.y + p.vy * t;
			g.save();
			g.translate(x, y);
			g.rotate(p.rot + p.vr * t);
			g.globalAlpha = 1 - (now - p.at) / p.life;
			g.fillStyle = p.color;
			g.fillRect(-5, -3, 10, 6);
			g.restore();
		}
		g.globalAlpha = 1;
	}
}
