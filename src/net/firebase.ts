/**
 * Firebase Realtime Database を使うバックエンド。匿名サインインしてから使う（ルールで auth != null を求めている）。
 * 2人プレイを始めたときに import() で読み込むので、1人で遊ぶときは Firebase の SDK を読み込まない。
 */
import { getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
	get,
	getDatabase,
	onDisconnect,
	onValue,
	ref,
	remove,
	runTransaction,
	set,
	update,
	type Database,
} from "firebase/database";
import type { Backend, Unsubscribe } from "./backend";
import type { FirebaseWebConfig } from "./config";

class FirebaseBackend implements Backend {
	readonly uid: string;
	private readonly db: Database;
	private offset = 0;
	private unsubs = new Set<Unsubscribe>();

	constructor(db: Database, uid: string) {
		this.db = db;
		this.uid = uid;
		this.unsubs.add(
			onValue(ref(db, ".info/serverTimeOffset"), (s) => {
				this.offset = Number(s.val()) || 0;
			}),
		);
	}

	serverOffset() {
		return this.offset;
	}

	async get<T>(path: string) {
		const s = await get(ref(this.db, path));
		return s.exists() ? (s.val() as T) : null;
	}

	set(path: string, value: unknown) {
		return set(ref(this.db, path), value);
	}

	update(path: string, values: Record<string, unknown>) {
		return update(ref(this.db, path), values);
	}

	remove(path: string) {
		return remove(ref(this.db, path));
	}

	async create(path: string, value: unknown) {
		const r = await runTransaction(ref(this.db, path), (cur) => (cur === null ? value : undefined), {
			applyLocally: false,
		});
		return r.committed;
	}

	watch<T>(path: string, cb: (value: T | null) => void): Unsubscribe {
		const un = onValue(
			ref(this.db, path),
			(s) => cb(s.exists() ? (s.val() as T) : null),
			// 読めなくなった（部屋が消えた・権限がない）ときは、消えたものとして扱う
			() => cb(null),
		);
		this.unsubs.add(un);
		return () => {
			un();
			this.unsubs.delete(un);
		};
	}

	removeOnDisconnect(path: string) {
		return onDisconnect(ref(this.db, path)).remove();
	}

	cancelOnDisconnect(path: string) {
		return onDisconnect(ref(this.db, path)).cancel();
	}

	dispose() {
		for (const un of this.unsubs) un();
		this.unsubs.clear();
	}
}

let connecting: Promise<Backend> | null = null;

/** Firebase につないで、匿名サインインする（2回目からは同じものを返す） */
export function connectFirebase(config: FirebaseWebConfig): Promise<Backend> {
	if (!connecting) {
		connecting = (async () => {
			const app = getApps()[0] ?? initializeApp(config);
			const auth = getAuth(app);
			const cred = auth.currentUser ? { user: auth.currentUser } : await signInAnonymously(auth);
			return new FirebaseBackend(getDatabase(app), cred.user.uid);
		})();
		connecting.catch(() => (connecting = null));
	}
	return connecting;
}
