/**
 * 叩く操作: キーボード（F/J/Space = ドン、D/K = カン）と、太鼓の画面のクリック・タップ（マルチタッチ対応）。
 * 時刻は event.timeStamp（performance.now() と同じ基準のミリ秒）で渡す。
 */
import type { NoteKind } from "./chart";

export const DON_KEYS = new Set(["KeyF", "KeyJ", "Space"]);
export const KA_KEYS = new Set(["KeyD", "KeyK"]);

export interface InputHandlers {
	hit(kind: NoteKind, perfMs: number): void;
	pause(): void;
}

export function bindInput(
	canvas: HTMLCanvasElement,
	hitTest: (x: number, y: number) => NoteKind | null,
	h: InputHandlers,
): () => void {
	const onKey = (e: KeyboardEvent) => {
		if (e.code === "Escape" || e.code === "KeyP") {
			e.preventDefault();
			h.pause();
			return;
		}
		const kind: NoteKind | null = DON_KEYS.has(e.code) ? "don" : KA_KEYS.has(e.code) ? "ka" : null;
		if (!kind) return;
		e.preventDefault();
		if (e.repeat) return;
		h.hit(kind, e.timeStamp || performance.now());
	};

	const onPointer = (e: PointerEvent) => {
		if (e.button > 0) return;
		const rect = canvas.getBoundingClientRect();
		const kind = hitTest(e.clientX - rect.left, e.clientY - rect.top);
		if (!kind) return;
		e.preventDefault();
		h.hit(kind, e.timeStamp || performance.now());
	};

	// ダブルタップでの拡大・長押しのメニューを止める
	const prevent = (e: Event) => e.preventDefault();

	window.addEventListener("keydown", onKey);
	canvas.addEventListener("pointerdown", onPointer);
	canvas.addEventListener("contextmenu", prevent);
	canvas.addEventListener("touchstart", prevent, { passive: false });
	canvas.addEventListener("dblclick", prevent);

	return () => {
		window.removeEventListener("keydown", onKey);
		canvas.removeEventListener("pointerdown", onPointer);
		canvas.removeEventListener("contextmenu", prevent);
		canvas.removeEventListener("touchstart", prevent);
		canvas.removeEventListener("dblclick", prevent);
	};
}
