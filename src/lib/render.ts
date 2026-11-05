/**
 * プレイ画面の Canvas 描画。上に音符が流れるレーン、下に叩く太鼓。
 */
import type { ChartNote, NoteKind } from "./chart";
import type { Grade } from "./game";

export interface Layout {
	w: number;
	h: number;
	lane: { x: number; y: number; w: number; h: number; judgeX: number };
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

const GRADE_COLOR: Record<Grade, string> = {
	great: "#ffcf2e",
	good: "#ffffff",
	ok: "#9fe0ff",
	miss: "#b9a9a0",
};

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

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.g = canvas.getContext("2d")!;
		this.resize();
	}

	resize() {
		const rect = this.canvas.getBoundingClientRect();
		const w = Math.max(1, rect.width);
		const h = Math.max(1, rect.height);
		this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
		this.canvas.width = Math.round(w * this.dpr);
		this.canvas.height = Math.round(h * this.dpr);
		const portrait = h > w * 1.05;
		const laneH = portrait ? Math.min(130, Math.max(84, h * 0.17)) : Math.min(150, Math.max(90, h * 0.26));
		const laneY = portrait ? h * 0.06 : h * 0.05;
		const below = laneY + laneH;
		const r = portrait
			? Math.min(w * 0.44, (h - below) * 0.4)
			: Math.min((h - below) * 0.42, w * 0.22);
		const cy = below + (h - below) / 2;
		const judgeX = Math.max(56, laneH * 0.62);
		this.layout = {
			w,
			h,
			lane: { x: 0, y: laneY, w, h: laneH, judgeX },
			drum: { cx: w / 2, cy, r, inner: r * 0.66 },
			noteR: laneH * 0.27,
		};
	}

	/** 太鼓のどこを押したか。太鼓より下の領域全体を太鼓として扱う（スマホで押しやすいように） */
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
	}

	onCombo(combo: number) {
		this.comboPulse = performance.now();
		if (combo > 0 && combo % 50 === 0) this.confetti(60);
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

	draw(notes: ChartNote[], judged: (Grade | null)[], songTime: number, combo: number, kindHint: boolean) {
		const g = this.g;
		const L = this.layout;
		const now = performance.now();
		g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		g.clearRect(0, 0, L.w, L.h);
		this.drawLane(now);
		this.drawNotes(notes, judged, songTime, kindHint);
		this.drawBursts(now);
		this.drawPopups(now);
		this.drawDrum(now, combo);
		this.drawParticles(now);
	}

	private drawLane(now: number) {
		const g = this.g;
		const { lane, noteR } = this.layout;
		// レーンの帯（墨色に金の縁）
		g.fillStyle = COLORS.lane;
		g.fillRect(lane.x, lane.y, lane.w, lane.h);
		const grad = g.createLinearGradient(0, lane.y, 0, lane.y + lane.h);
		grad.addColorStop(0, "rgba(255,255,255,0.10)");
		grad.addColorStop(0.5, "rgba(255,255,255,0)");
		grad.addColorStop(1, "rgba(0,0,0,0.25)");
		g.fillStyle = grad;
		g.fillRect(lane.x, lane.y, lane.w, lane.h);
		g.fillStyle = COLORS.gold;
		g.fillRect(lane.x, lane.y - 4, lane.w, 4);
		g.fillRect(lane.x, lane.y + lane.h, lane.w, 4);

		// 判定の輪
		const cy = lane.y + lane.h / 2;
		const fd = Math.max(0, 1 - (now - this.flash.don) / 160);
		const fk = Math.max(0, 1 - (now - this.flash.ka) / 160);
		if (fd > 0 || fk > 0) {
			g.fillStyle = fd >= fk ? `rgba(240,68,44,${0.45 * fd})` : `rgba(43,143,216,${0.45 * fk})`;
			g.fillRect(lane.x, lane.y, lane.judgeX + noteR * 1.6, lane.h);
		}
		g.lineWidth = 3;
		g.strokeStyle = "rgba(255,246,224,0.85)";
		g.beginPath();
		g.arc(lane.judgeX, cy, noteR * 1.08, 0, Math.PI * 2);
		g.stroke();
		g.strokeStyle = "rgba(255,246,224,0.35)";
		g.beginPath();
		g.arc(lane.judgeX, cy, noteR * 1.45, 0, Math.PI * 2);
		g.stroke();
	}

	private noteX(t: number, songTime: number) {
		const { lane } = this.layout;
		const speed = (lane.w - lane.judgeX) / this.scrollTime;
		return lane.judgeX + (t - songTime) * speed;
	}

	private drawNote(x: number, y: number, kind: NoteKind, big: boolean, hint: boolean, alpha = 1) {
		const g = this.g;
		const r = this.layout.noteR * (big ? 1.4 : 1);
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

	private drawNotes(notes: ChartNote[], judged: (Grade | null)[], songTime: number, hint: boolean) {
		const { lane, noteR, w } = this.layout;
		const cy = lane.y + lane.h / 2;
		// 遠い音符から描いて、近い音符が上に重なるようにする
		for (let i = notes.length - 1; i >= 0; i--) {
			const n = notes[i]!;
			const x = this.noteX(n.time, songTime);
			if (x < -noteR * 2) break;
			if (x > w + noteR * 2) continue;
			const res = judged[i];
			if (res && res !== "miss") continue;
			this.drawNote(x, cy, n.kind, n.big, hint, res === "miss" ? 0.35 : 1);
		}
	}

	private drawBursts(now: number) {
		const g = this.g;
		const { lane, noteR } = this.layout;
		const cy = lane.y + lane.h / 2;
		this.bursts = this.bursts.filter((b) => now - b.at < 320);
		for (const b of this.bursts) {
			const p = (now - b.at) / 320;
			const r = noteR * (b.big ? 1.4 : 1) * (1 + p * 1.2);
			g.strokeStyle = b.grade === "great" ? `rgba(255,207,46,${1 - p})` : `rgba(255,255,255,${1 - p})`;
			g.lineWidth = 6 * (1 - p) + 1;
			g.beginPath();
			g.arc(lane.judgeX, cy, r, 0, Math.PI * 2);
			g.stroke();
			// 叩いた音符が少し跳ねて消える
			this.drawNote(lane.judgeX + p * noteR * 2, cy - Math.sin(p * Math.PI) * lane.h * 0.6, b.kind, b.big, false, 1 - p);
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
		// レーンのすぐ下、判定の輪の近くに出す
		const x = lane.judgeX + noteR * 0.4;
		const y = lane.y + lane.h + 10 - k * 6;
		g.lineWidth = 5;
		g.strokeStyle = COLORS.ink;
		g.textAlign = "left";
		g.strokeText(p.label, x - noteR * 1.4, y);
		g.fillStyle = GRADE_COLOR[p.grade];
		g.fillText(p.label, x - noteR * 1.4, y);
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
