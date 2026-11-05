/**
 * アクセス解析（Google アナリティクス 4 / Google タグマネージャー）。
 * 測定 ID はビルド時に config.js から読み込まれる（vite.config.ts を参照）。ID がなければ何もしない。
 */

declare const __ANALYTICS_ID__: string;

export const ANALYTICS_ID: string = typeof __ANALYTICS_ID__ === "string" ? __ANALYTICS_ID__ : "";

type AnalyticsWindow = Window & {
	gtag?: (...args: unknown[]) => void;
	dataLayer?: unknown[];
};

/**
 * 画面が切り替わったときにページビューを送る。
 * 1ページのアプリなので、画面ごとに仮想のパス（/select, /play/vivaldi-summer-3 など）を付けて送る。
 */
export function trackPageView(path: string, title: string) {
	if (!ANALYTICS_ID) return;
	const base = location.origin + location.pathname;
	const page_location = new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : base + "/").href;
	trackEvent("page_view", { page_location, page_title: title });
}

export function trackEvent(name: string, params: Record<string, string | number | boolean>) {
	if (!ANALYTICS_ID) return;
	const w = window as AnalyticsWindow;
	if (ANALYTICS_ID.startsWith("GTM-")) w.dataLayer?.push({ event: name, ...params });
	else w.gtag?.("event", name, params);
}
