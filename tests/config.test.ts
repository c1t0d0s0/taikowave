import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFirebaseConfig } from "../vite.config";

const dirs: string[] = [];
function tmpWith(configJs?: string) {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "taikowave-"));
	dirs.push(d);
	if (configJs !== undefined) fs.writeFileSync(path.join(d, "config.js"), configJs);
	return d;
}
afterEach(() => {
	for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
	vi.restoreAllMocks();
});

const sample = {
	apiKey: "AIzaSyExample",
	authDomain: "taikowave.firebaseapp.com",
	databaseURL: "https://taikowave-default-rtdb.asia-southeast1.firebasedatabase.app",
	projectId: "taikowave",
	appId: "1:123:web:abc",
};

describe("Firebase の設定の読み込み", () => {
	it("config.js の FIREBASE_CONFIG（JavaScript の書き方）を読む", () => {
		const d = tmpWith(`const GTM_ID = 'G-TEST';

// 2人プレイ
const FIREBASE_CONFIG = {
  apiKey: "${sample.apiKey}",
  authDomain: '${sample.authDomain}',
  databaseURL: "${sample.databaseURL}",
  projectId: "${sample.projectId}",
  appId: "${sample.appId}",
};
`);
		expect(readFirebaseConfig(d, {})).toEqual(sample);
	});

	it("環境変数 FIREBASE_CONFIG（JSON）を優先する", () => {
		const d = tmpWith(`const FIREBASE_CONFIG = { apiKey: "x", databaseURL: "https://other.example" };`);
		expect(readFirebaseConfig(d, { FIREBASE_CONFIG: JSON.stringify(sample) })).toEqual(sample);
	});

	it("環境変数に Firebase コンソールの貼り付けそのまま（const firebaseConfig = {...};）でも読む", () => {
		const text = `const firebaseConfig = {\n  apiKey: "${sample.apiKey}",\n  databaseURL: "${sample.databaseURL}"\n};`;
		expect(readFirebaseConfig(tmpWith(), { FIREBASE_CONFIG: text })).toEqual({
			apiKey: sample.apiKey,
			databaseURL: sample.databaseURL,
		});
	});

	it("設定がない・足りないときは null", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(readFirebaseConfig(tmpWith(), {})).toBeNull();
		expect(readFirebaseConfig(tmpWith(`const GTM_ID = 'G-TEST';`), {})).toBeNull();
		expect(readFirebaseConfig(tmpWith(`const FIREBASE_CONFIG = { apiKey: "YOUR_API_KEY" };`), {})).toBeNull();
		expect(readFirebaseConfig(tmpWith(), { FIREBASE_CONFIG: "not json" })).toBeNull();
		// config.example.js のひな形のまま
		const example = fs.readFileSync(path.join(import.meta.dirname, "..", "config.example.js"), "utf8");
		expect(readFirebaseConfig(tmpWith(example), {})).toBeNull();
	});
});
