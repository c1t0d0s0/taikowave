/**
 * プレイ画面の背景（動かない絵）。夕暮れの空、止まった花火、屋台、人混みのシルエット。
 * 毎フレーム描くと重いので、Renderer がオフスクリーンの canvas に一度だけ描いて使い回す。
 */
import type { Layout } from "./render";

const STALLS = [
	{ name: "たこやき", stripe: "#e0352a" },
	{ name: "きんぎょ", stripe: "#2b8fd8" },
	{ name: "わたあめ", stripe: "#ff7ab8" },
	{ name: "やきそば", stripe: "#3fa45f" },
];

const FIREWORK_COLORS = ["#ffcf2e", "#ff6b8a", "#7fd3ff", "#ffffff", "#b9f27a", "#ff9a3c"];

/** 画面サイズが同じなら毎回同じ絵になるよう、固定の種で乱数を作る */
function seeded(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

export function drawScenery(g: CanvasRenderingContext2D, L: Layout) {
	const { w, h, lane, drum } = L;
	const rand = seeded(20260807);
	// 地面の高さ（太鼓の少し上）。太鼓は手前に描かれるので、屋台の足元は太鼓に隠れてよい
	const horizon = drum.cy - drum.r * 0.45;

	// 夕暮れの空
	const sky = g.createLinearGradient(0, 0, 0, horizon);
	sky.addColorStop(0, "#1b1846");
	sky.addColorStop(0.55, "#4a2a6e");
	sky.addColorStop(0.85, "#b8487a");
	sky.addColorStop(1, "#f08a4b");
	g.fillStyle = sky;
	g.fillRect(0, 0, w, horizon);

	// 星
	for (let i = 0; i < Math.round((w * horizon) / 5000); i++) {
		const x = rand() * w;
		const y = rand() * horizon * 0.55;
		g.fillStyle = `rgba(255,250,230,${0.35 + rand() * 0.5})`;
		g.beginPath();
		g.arc(x, y, 0.6 + rand() * 1.1, 0, Math.PI * 2);
		g.fill();
	}

	const sides: [number, number][] = [
		[0, lane.x - 4],
		[lane.x + lane.w + 4, w],
	];

	// 空に咲いている花火（止まった絵）
	for (const [x0, x1] of sides) {
		const sw = x1 - x0;
		if (sw < 40) continue;
		const n = Math.max(2, Math.min(5, Math.round(sw / 110)));
		for (let i = 0; i < n; i++) {
			const R = Math.min(sw * 0.42, 90) * (0.6 + rand() * 0.5);
			const x = x0 + sw * ((i + 0.5) / n) + (rand() - 0.5) * sw * 0.15;
			const y = horizon * (0.22 + rand() * 0.3);
			staticFirework(g, x, y, R, FIREWORK_COLORS[Math.floor(rand() * FIREWORK_COLORS.length)]!, rand);
		}
	}

	// 地面（提灯の明かりで少し赤みがかった土）
	const ground = g.createLinearGradient(0, horizon, 0, h);
	ground.addColorStop(0, "#5a2f1c");
	ground.addColorStop(1, "#2a160c");
	g.fillStyle = ground;
	g.fillRect(0, horizon, w, h - horizon);

	// 屋台
	let stallIndex = 0;
	for (const [x0, x1] of sides) {
		const sw = x1 - x0;
		if (sw < 60) continue;
		const count = sw > 420 ? 2 : 1;
		const W = Math.min(sw / count - 12, 210);
		const H = Math.min(W * 1.15, (horizon - h * 0.2) * 0.9);
		for (let i = 0; i < count; i++) {
			const cx = x0 + sw * ((i + 0.5) / count);
			stall(g, cx, horizon + H * 0.05, W, H, STALLS[stallIndex++ % STALLS.length]!);
		}
	}

	// 手前の人混み（シルエット）
	for (const [x0, x1] of sides) {
		const sw = x1 - x0;
		if (sw < 40) continue;
		const size = Math.max(12, Math.min(26, h * 0.032));
		let x = x0 + size * 0.4;
		while (x < x1 - size * 0.4) {
			const s = size * (0.85 + rand() * 0.35);
			person(g, x, horizon + size * 1.6 + rand() * size * 0.4, s, rand);
			x += s * (1.1 + rand() * 0.5);
		}
	}
}

function staticFirework(g: CanvasRenderingContext2D, x: number, y: number, R: number, color: string, rand: () => number) {
	const rays = 28;
	g.save();
	g.globalAlpha = 0.85;
	// ほのかな光
	const glow = g.createRadialGradient(x, y, 0, x, y, R * 1.1);
	glow.addColorStop(0, "rgba(255,255,255,0.18)");
	glow.addColorStop(1, "rgba(255,255,255,0)");
	g.fillStyle = glow;
	g.beginPath();
	g.arc(x, y, R * 1.1, 0, Math.PI * 2);
	g.fill();
	g.strokeStyle = color;
	g.fillStyle = color;
	g.lineCap = "round";
	for (let i = 0; i < rays; i++) {
		const a = (i / rays) * Math.PI * 2 + rand() * 0.05;
		const c = Math.cos(a);
		const s = Math.sin(a);
		g.lineWidth = 1.6;
		g.beginPath();
		g.moveTo(x + c * R * 0.25, y + s * R * 0.25);
		g.lineTo(x + c * R * 0.85, y + s * R * 0.85);
		g.stroke();
		g.beginPath();
		g.arc(x + c * R, y + s * R, Math.max(1.8, R * 0.045), 0, Math.PI * 2);
		g.fill();
	}
	// 内側の輪（色違い）
	g.fillStyle = "#fff6c8";
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		g.beginPath();
		g.arc(x + Math.cos(a) * R * 0.45, y + Math.sin(a) * R * 0.45, Math.max(1.4, R * 0.03), 0, Math.PI * 2);
		g.fill();
	}
	g.restore();
}

/** 屋台。(cx, bottom) が足元の中央 */
function stall(g: CanvasRenderingContext2D, cx: number, bottom: number, W: number, H: number, info: { name: string; stripe: string }) {
	const ink = "#2a140a";
	const left = cx - W / 2;
	const top = bottom - H;
	const signH = H * 0.2;
	const awnTop = top + signH;
	const awnH = H * 0.16;
	const counterTop = bottom - H * 0.32;

	// 柱
	g.fillStyle = "#6b3a1c";
	g.fillRect(left + W * 0.04, top, W * 0.06, H);
	g.fillRect(left + W * 0.9, top, W * 0.06, H);

	// 店の奥（明かりのついた中）
	const inside = g.createLinearGradient(0, awnTop + awnH, 0, counterTop);
	inside.addColorStop(0, "#ffd88a");
	inside.addColorStop(1, "#e08a3c");
	g.fillStyle = inside;
	g.fillRect(left + W * 0.1, awnTop + awnH, W * 0.8, counterTop - awnTop - awnH);
	// 吊るした裸電球
	for (const k of [0.32, 0.68]) {
		const bx = left + W * k;
		const by = awnTop + awnH + (counterTop - awnTop - awnH) * 0.35;
		const halo = g.createRadialGradient(bx, by, 0, bx, by, W * 0.16);
		halo.addColorStop(0, "rgba(255,255,220,0.9)");
		halo.addColorStop(1, "rgba(255,255,220,0)");
		g.fillStyle = halo;
		g.beginPath();
		g.arc(bx, by, W * 0.16, 0, Math.PI * 2);
		g.fill();
		g.strokeStyle = ink;
		g.lineWidth = 1;
		g.beginPath();
		g.moveTo(bx, awnTop + awnH);
		g.lineTo(bx, by);
		g.stroke();
	}

	// 看板
	g.fillStyle = "#fff6e0";
	g.strokeStyle = ink;
	g.lineWidth = 2;
	g.fillRect(left, top, W, signH);
	g.strokeRect(left, top, W, signH);
	g.fillStyle = info.stripe;
	const fs = Math.min(signH * 0.62, (W * 0.86) / info.name.length);
	g.font = `900 ${Math.round(fs)}px "Zen Maru Gothic", sans-serif`;
	g.textAlign = "center";
	g.textBaseline = "middle";
	g.fillText(info.name, cx, top + signH * 0.54);

	// しま模様の日よけ（下のふちは波形）
	const stripes = 7;
	const sw = W / stripes;
	for (let i = 0; i < stripes; i++) {
		g.fillStyle = i % 2 ? "#fff6e0" : info.stripe;
		g.beginPath();
		g.moveTo(left + i * sw, awnTop);
		g.lineTo(left + (i + 1) * sw, awnTop);
		g.lineTo(left + (i + 1) * sw, awnTop + awnH * 0.75);
		g.arc(left + (i + 0.5) * sw, awnTop + awnH * 0.75, sw / 2, 0, Math.PI);
		g.closePath();
		g.fill();
	}
	g.strokeStyle = ink;
	g.lineWidth = 1.5;
	g.beginPath();
	g.moveTo(left, awnTop);
	g.lineTo(left + W, awnTop);
	g.stroke();

	// 台（カウンター）
	g.fillStyle = "#9a5426";
	g.fillRect(left + W * 0.02, counterTop, W * 0.96, bottom - counterTop);
	g.fillStyle = "#b8682f";
	g.fillRect(left, counterTop - H * 0.03, W, H * 0.05);
	g.strokeStyle = ink;
	g.lineWidth = 2;
	g.strokeRect(left + W * 0.02, counterTop, W * 0.96, bottom - counterTop);
	// 台の上の品物（色の丸を並べるだけ）
	const items = 4;
	for (let i = 0; i < items; i++) {
		g.fillStyle = i % 2 ? info.stripe : "#fff6e0";
		g.beginPath();
		g.arc(left + W * (0.2 + (i * 0.6) / (items - 1)), counterTop - H * 0.05, Math.max(2.5, W * 0.045), 0, Math.PI * 2);
		g.fill();
		g.strokeStyle = ink;
		g.lineWidth = 1;
		g.stroke();
	}
	// 台の前の「祭」ののれん
	const ms = Math.min((bottom - counterTop) * 0.5, W * 0.26);
	g.fillStyle = "#fff6e0";
	g.beginPath();
	g.arc(cx, counterTop + (bottom - counterTop) * 0.42, ms * 0.72, 0, Math.PI * 2);
	g.fill();
	g.fillStyle = "#c2260f";
	g.font = `900 ${Math.round(ms)}px "Zen Maru Gothic", sans-serif`;
	g.fillText("祭", cx, counterTop + (bottom - counterTop) * 0.44);
}

/** 人のシルエット（頭と肩）。ときどき手にうちわや綿あめを持たせる */
function person(g: CanvasRenderingContext2D, x: number, base: number, s: number, rand: () => number) {
	g.fillStyle = "#1a0e18";
	g.beginPath();
	g.arc(x, base - s * 1.55, s * 0.42, 0, Math.PI * 2);
	g.fill();
	g.beginPath();
	g.moveTo(x - s * 0.62, base);
	g.quadraticCurveTo(x - s * 0.65, base - s * 1.1, x, base - s * 1.1);
	g.quadraticCurveTo(x + s * 0.65, base - s * 1.1, x + s * 0.62, base);
	g.closePath();
	g.fill();
	const r = rand();
	if (r < 0.25) {
		// うちわ
		g.fillStyle = rand() < 0.5 ? "#f0442c" : "#2b8fd8";
		g.beginPath();
		g.arc(x + s * 0.7, base - s * 1.7, s * 0.32, 0, Math.PI * 2);
		g.fill();
		g.strokeStyle = "#1a0e18";
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo(x + s * 0.5, base - s * 0.9);
		g.lineTo(x + s * 0.7, base - s * 1.4);
		g.stroke();
	} else if (r < 0.4) {
		// 綿あめ
		g.fillStyle = "#ffc2dd";
		g.beginPath();
		g.arc(x - s * 0.7, base - s * 1.75, s * 0.34, 0, Math.PI * 2);
		g.fill();
	}
}
