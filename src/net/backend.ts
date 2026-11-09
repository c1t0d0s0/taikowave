/**
 * 2人プレイで使うデータベースの読み書き。Firebase Realtime Database と同じ考え方（パスと値の木）で、
 * 実装を入れ替えられるようにしている。
 * - Firebase 用: src/net/firebase.ts
 * - メモリ上（テスト用）: MemoryBackend
 * - 同じブラウザの別のタブとつなぐもの（開発中の確認用、?net=local）: LocalBackend
 */

export type Unsubscribe = () => void;

export interface Backend {
	/** 自分の id（Firebase では匿名サインインの uid） */
	readonly uid: string;
	/** サーバー時刻 − 自分の Date.now()（ミリ秒） */
	serverOffset(): number;
	get<T>(path: string): Promise<T | null>;
	set(path: string, value: unknown): Promise<void>;
	/** path の下の、いくつかの子のパスをまとめて書き換える（null は削除） */
	update(path: string, values: Record<string, unknown>): Promise<void>;
	remove(path: string): Promise<void>;
	/** path にまだ何もないときだけ value を書く。書けたら true */
	create(path: string, value: unknown): Promise<boolean>;
	/** path の値が変わるたびに呼ぶ（最初の値もすぐに呼ぶ） */
	watch<T>(path: string, cb: (value: T | null) => void): Unsubscribe;
	/** 接続が切れたら path を消すようにサーバーに頼んでおく */
	removeOnDisconnect(path: string): Promise<void>;
	cancelOnDisconnect(path: string): Promise<void>;
	dispose(): void;
}

// ---- メモリ上の木 ----

type Tree = { [k: string]: Tree | string | number | boolean };

function split(path: string): string[] {
	return path.split("/").filter(Boolean);
}

function clone<T>(v: T): T {
	return v === undefined || v === null ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** 空のオブジェクトや null を取り除く（Realtime Database と同じく、空の子は存在しない扱い） */
function prune(v: unknown): unknown {
	if (v === null || v === undefined) return null;
	if (typeof v !== "object") return v;
	const out: Tree = {};
	for (const [k, c] of Object.entries(v as Record<string, unknown>)) {
		const p = prune(c);
		if (p !== null) out[k] = p as Tree;
	}
	return Object.keys(out).length ? out : null;
}

interface Watcher {
	path: string[];
	cb: (v: unknown) => void;
	last: string;
}

/** パスと値の木。書き換えるたびに、値が変わったパスを見ている人へ知らせる */
export class MemoryStore {
	private root: unknown = null;
	private watchers = new Set<Watcher>();

	read(path: string): unknown {
		let node: unknown = this.root;
		for (const k of split(path)) {
			if (node === null || typeof node !== "object") return null;
			node = (node as Tree)[k] ?? null;
		}
		return clone(node);
	}

	/** 木全体（ほかのタブへ渡す用） */
	snapshot(): unknown {
		return clone(this.root);
	}

	load(root: unknown) {
		this.root = prune(clone(root));
		this.notify();
	}

	write(path: string, value: unknown) {
		this.writeSilently(path, value);
		this.notify();
	}

	writeMany(path: string, values: Record<string, unknown>) {
		for (const [k, v] of Object.entries(values)) this.writeSilently(`${path}/${k}`, v);
		this.notify();
	}

	private writeSilently(path: string, value: unknown) {
		const keys = split(path);
		const v = prune(clone(value));
		if (!keys.length) {
			this.root = v;
			return;
		}
		if (this.root === null || typeof this.root !== "object") this.root = {};
		let node = this.root as Tree;
		for (const k of keys.slice(0, -1)) {
			if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
			node = node[k] as Tree;
		}
		const last = keys[keys.length - 1]!;
		if (v === null) delete node[last];
		else node[last] = v as Tree;
		this.root = prune(this.root);
	}

	watch(path: string, cb: (v: unknown) => void): Unsubscribe {
		const w: Watcher = { path: split(path), cb, last: "\u0000" };
		this.watchers.add(w);
		this.notifyOne(w);
		return () => this.watchers.delete(w);
	}

	private notify() {
		for (const w of [...this.watchers]) this.notifyOne(w);
	}

	private notifyOne(w: Watcher) {
		const v = this.read(w.path.join("/"));
		const json = JSON.stringify(v);
		if (json === w.last) return;
		w.last = json;
		// Firebase と同じく、書いた直後ではなく少しあとで知らせる
		queueMicrotask(() => {
			if (this.watchers.has(w)) w.cb(v);
		});
	}
}

let idCounter = 0;
function newId(prefix: string) {
	return `${prefix}${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---- メモリ上のバックエンド（テスト用。同じ MemoryStore を共有すると、複数の人をまねられる） ----

export class MemoryBackend implements Backend {
	readonly uid: string;
	private readonly store: MemoryStore;
	private readonly offset: number;
	private disconnectPaths = new Set<string>();
	private unsubs = new Set<Unsubscribe>();
	private closed = false;

	constructor(store: MemoryStore, opts: { uid?: string; serverOffset?: number } = {}) {
		this.store = store;
		this.uid = opts.uid ?? newId("mem-");
		this.offset = opts.serverOffset ?? 0;
	}

	serverOffset() {
		return this.offset;
	}

	async get<T>(path: string) {
		return this.store.read(path) as T | null;
	}

	async set(path: string, value: unknown) {
		this.store.write(path, value);
	}

	async update(path: string, values: Record<string, unknown>) {
		this.store.writeMany(path, values);
	}

	async remove(path: string) {
		this.store.write(path, null);
	}

	async create(path: string, value: unknown) {
		if (this.store.read(path) !== null) return false;
		this.store.write(path, value);
		return true;
	}

	watch<T>(path: string, cb: (value: T | null) => void): Unsubscribe {
		const un = this.store.watch(path, (v) => {
			if (!this.closed) cb(v as T | null);
		});
		this.unsubs.add(un);
		return () => {
			un();
			this.unsubs.delete(un);
		};
	}

	async removeOnDisconnect(path: string) {
		this.disconnectPaths.add(path);
	}

	async cancelOnDisconnect(path: string) {
		this.disconnectPaths.delete(path);
	}

	/** 接続が切れたことにする（テスト用）。頼んでおいたパスを消す */
	disconnect() {
		for (const p of this.disconnectPaths) this.store.write(p, null);
		this.disconnectPaths.clear();
		this.dispose();
	}

	dispose() {
		this.closed = true;
		for (const un of this.unsubs) un();
		this.unsubs.clear();
	}
}

// ---- 同じブラウザの別のタブとつなぐバックエンド（開発中の確認用） ----

type LocalMessage =
	| { type: "hello"; from: string }
	| { type: "snapshot"; from: string; root: unknown }
	| { type: "write"; from: string; path: string; value: unknown }
	| { type: "writeMany"; from: string; path: string; values: Record<string, unknown> };

/**
 * BroadcastChannel で、同じブラウザで開いている太鼓ウェーブのタブどうしの木をそろえる。
 * サーバーはないので、それぞれのタブが同じ木のコピーを持ち、書き換えを全員に送る。
 * タブを閉じると、頼んでおいたパスを消す（Firebase の onDisconnect の代わり）。
 */
export class LocalBackend implements Backend {
	readonly uid = newId("local-");
	private readonly store = new MemoryStore();
	private readonly channel: BroadcastChannel;
	private readonly inner: MemoryBackend;
	private disconnectPaths = new Set<string>();
	private readonly onHide = () => this.goodbye();

	private constructor(name: string) {
		this.channel = new BroadcastChannel(name);
		this.inner = new MemoryBackend(this.store, { uid: this.uid });
		this.channel.onmessage = (e: MessageEvent<LocalMessage>) => this.receive(e.data);
		addEventListener("pagehide", this.onHide);
	}

	/** ほかのタブから今の木を受け取ってから使い始める */
	static async connect(name = "taikowave-local"): Promise<LocalBackend> {
		const b = new LocalBackend(name);
		b.post({ type: "hello", from: b.uid });
		await new Promise((r) => setTimeout(r, 150));
		return b;
	}

	private post(m: LocalMessage) {
		this.channel.postMessage(m);
	}

	private receive(m: LocalMessage) {
		if (m.from === this.uid) return;
		if (m.type === "hello") this.post({ type: "snapshot", from: this.uid, root: this.store.snapshot() });
		else if (m.type === "snapshot") {
			if (this.store.snapshot() === null && m.root !== null) this.store.load(m.root);
		} else if (m.type === "write") this.store.write(m.path, m.value);
		else if (m.type === "writeMany") this.store.writeMany(m.path, m.values);
	}

	serverOffset() {
		return 0;
	}

	get<T>(path: string) {
		return this.inner.get<T>(path);
	}

	async set(path: string, value: unknown) {
		this.store.write(path, value);
		this.post({ type: "write", from: this.uid, path, value: clone(value) });
	}

	async update(path: string, values: Record<string, unknown>) {
		this.store.writeMany(path, values);
		this.post({ type: "writeMany", from: this.uid, path, values: clone(values) });
	}

	remove(path: string) {
		return this.set(path, null);
	}

	async create(path: string, value: unknown) {
		if (this.store.read(path) !== null) return false;
		await this.set(path, value);
		return true;
	}

	watch<T>(path: string, cb: (value: T | null) => void) {
		return this.inner.watch<T>(path, cb);
	}

	async removeOnDisconnect(path: string) {
		this.disconnectPaths.add(path);
	}

	async cancelOnDisconnect(path: string) {
		this.disconnectPaths.delete(path);
	}

	private goodbye() {
		for (const p of this.disconnectPaths) void this.remove(p);
		this.disconnectPaths.clear();
	}

	dispose() {
		removeEventListener("pagehide", this.onHide);
		this.inner.dispose();
		this.channel.close();
	}
}
