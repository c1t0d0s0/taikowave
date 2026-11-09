import { defineConfig, type Plugin } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

const root = import.meta.dirname;
const ID_RE = /^(G|GTM)-[A-Z0-9]+$/;

/**
 * Google アナリティクス 4 または Google タグマネージャーの ID を取得する。
 * 1. 環境変数 GA_ID または GTM_ID が設定されていればそれを優先
 * 2. なければプロジェクト直下の config.js（git 管理外）から GTM_ID を読む
 *   G-XXXXXXX   … Google アナリティクス 4 の測定 ID（gtag.js を埋め込む）
 *   GTM-XXXXXXX … Google タグマネージャーのコンテナ ID
 */
export function readAnalyticsId(dir = root, env: NodeJS.ProcessEnv = process.env): string {
	const envId = (env.GA_ID || env.GTM_ID || "").trim();
	if (envId) {
		if (!ID_RE.test(envId)) {
			console.warn(`環境変数の ID の形式が正しくないため、アクセス解析のタグを入れません: ${envId}`);
			return "";
		}
		return envId;
	}
	const file = path.join(dir, "config.js");
	if (!fs.existsSync(file)) return "";
	const id = fs.readFileSync(file, "utf8").match(/\bGTM_ID\s*=\s*["'`]([^"'`]*)["'`]/)?.[1]?.trim() ?? "";
	if (!id) return "";
	if (!ID_RE.test(id)) {
		console.warn(`config.js の GTM_ID の形式が正しくないため、アクセス解析のタグを入れません: ${id}`);
		return "";
	}
	return id;
}

export interface FirebaseWebConfig {
	apiKey: string;
	databaseURL: string;
	[key: string]: string;
}

const FIREBASE_KEYS = ["apiKey", "authDomain", "databaseURL", "projectId", "storageBucket", "messagingSenderId", "appId", "measurementId"];

/** JSON か JavaScript のオブジェクトの書き方（キーに引用符がないものも）の文字列を読む */
function parseObject(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		/* JavaScript の書き方 */
	}
	try {
		// config.js も環境変数も、このプロジェクトを公開する人が自分で書くものなので、そのまま評価する
		return new Function(`return (${text});`)();
	} catch {
		return null;
	}
}

function toFirebaseConfig(v: unknown): FirebaseWebConfig | null {
	if (!v || typeof v !== "object") return null;
	const out: Record<string, string> = {};
	for (const k of FIREBASE_KEYS) {
		const x = (v as Record<string, unknown>)[k];
		if (typeof x === "string" && x.trim()) out[k] = x.trim();
	}
	if (!out.apiKey || !/^https:\/\/[^/]+/.test(out.databaseURL ?? "")) return null;
	// config.example.js のひな形のまま（YOUR_API_KEY など）は使わない
	if (/^YOUR_/i.test(out.apiKey) || /your-project/i.test(out.databaseURL!)) return null;
	return out as FirebaseWebConfig;
}

/**
 * 2人プレイで使う Firebase の Web 用の設定を取得する（公開してよい値なので、バンドルに埋め込む）。
 * 1. 環境変数 FIREBASE_CONFIG（JSON。GitHub Actions ではリポジトリ変数から渡す）があればそれを優先
 * 2. なければ config.js の FIREBASE_CONFIG = { … }
 * どちらもなければ null（2人プレイのボタンを出さない）
 */
export function readFirebaseConfig(dir = root, env: NodeJS.ProcessEnv = process.env): FirebaseWebConfig | null {
	const raw = (env.FIREBASE_CONFIG || "").trim();
	if (raw) {
		const c = toFirebaseConfig(parseObject(raw.replace(/^[^{]*/, "").replace(/;?\s*$/, "")));
		if (!c) console.warn("環境変数 FIREBASE_CONFIG を読めなかったため、2人プレイを使えないようにします（apiKey と databaseURL が必要です）");
		return c;
	}
	const file = path.join(dir, "config.js");
	if (!fs.existsSync(file)) return null;
	// Firebase の設定は入れ子のないオブジェクトなので、最初の } までを読む
	const m = fs.readFileSync(file, "utf8").match(/\bFIREBASE_CONFIG\s*=\s*(\{[^}]*\})/);
	if (!m) return null;
	const c = toFirebaseConfig(parseObject(m[1]!));
	if (!c) console.warn("config.js の FIREBASE_CONFIG を読めなかったため、2人プレイを使えないようにします（apiKey と databaseURL が必要です）");
	return c;
}

/** index.html にアクセス解析のタグを入れる */
function analyticsPlugin(id: string): Plugin {
	return {
		name: "taikowave:analytics",
		transformIndexHtml() {
			if (!id) return [];
			if (id.startsWith("GTM-")) {
				return [
					{
						tag: "script",
						injectTo: "head-prepend",
						children: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`,
					},
					{
						tag: "noscript",
						injectTo: "body-prepend",
						children: `<iframe src="https://www.googletagmanager.com/ns.html?id=${id}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`,
					},
				];
			}
			return [
				{
					tag: "script",
					attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` },
					injectTo: "head-prepend",
				},
				{
					tag: "script",
					injectTo: "head-prepend",
					// ページビューは画面が切り替わるたびに src/lib/analytics.ts から送るので、自動送信は止める
					children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{send_page_view:false});`,
				},
			];
		},
	};
}

export default defineConfig(({ command }) => {
	// 開発サーバーでは計測しない（開発中のアクセスが集計に混ざらないように）
	const analyticsId = command === "build" ? readAnalyticsId() : "";
	return {
		// 相対パスで出力し、GitHub Pages などのサブディレクトリ配置でも動くようにする
		base: "./",
		define: {
			__ANALYTICS_ID__: JSON.stringify(analyticsId),
			// 2人プレイを試せるように、開発サーバーでも埋め込む
			__FIREBASE_CONFIG__: JSON.stringify(readFirebaseConfig()),
		},
		plugins: [analyticsPlugin(analyticsId)],
		build: {
			// abcjs 本体だけで約 500 kB あるため
			chunkSizeWarningLimit: 700,
		},
		test: {
			environment: "node",
		},
	};
});
