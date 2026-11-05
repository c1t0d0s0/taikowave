/**
 * 設定とハイスコアをブラウザに保存する。
 * プライベートブラウズなどで保存できない環境では、ページを開いている間だけ有効になる。
 */
const PREFIX = "taikowave:";

export function load<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(PREFIX + key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

export function save(key: string, value: unknown) {
	try {
		localStorage.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		/* 保存できない環境 */
	}
}
