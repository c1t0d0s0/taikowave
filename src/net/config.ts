/**
 * 2人プレイの設定。Firebase の Web 用の設定は、ビルド時に config.js（または環境変数 FIREBASE_CONFIG）から
 * 埋め込まれる（vite.config.ts を参照）。このファイルは Firebase の SDK を読み込まない。
 */

export interface FirebaseWebConfig {
	apiKey: string;
	authDomain?: string;
	databaseURL: string;
	projectId?: string;
	storageBucket?: string;
	messagingSenderId?: string;
	appId?: string;
	measurementId?: string;
}

declare const __FIREBASE_CONFIG__: FirebaseWebConfig | null;

export const FIREBASE_CONFIG: FirebaseWebConfig | null =
	typeof __FIREBASE_CONFIG__ === "object" && __FIREBASE_CONFIG__ ? __FIREBASE_CONFIG__ : null;

/**
 * 開発サーバーで ?net=local を付けると、Firebase の代わりに同じブラウザの別のタブとつなぐ（動作確認用）。
 * 本番のビルドでは使えない。
 */
export function useLocalNet(): boolean {
	return import.meta.env.DEV && new URLSearchParams(location.search).get("net") === "local";
}

/** 2人プレイができるか（Firebase の設定があるか、開発中のローカル接続か） */
export function multiplayerAvailable(): boolean {
	return !!FIREBASE_CONFIG || useLocalNet();
}
