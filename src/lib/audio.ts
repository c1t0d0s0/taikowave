/**
 * 音まわり: 曲（abcjs で ABC から作った音声）・太鼓の音（WebAudio で合成）・ゲームの時計。
 *
 * ゲームの時刻は AudioContext の時計で数える。曲の音声は AudioBufferSourceNode で
 * ちょうど決めた時刻（songStart）から鳴らすので、「いま聞こえている曲の位置」は
 * getOutputTimestamp()（スピーカーから出ている音の時刻）から求められる。
 */
import abcjs from "abcjs";

type AudioContextCtor = typeof AudioContext;

export class GameAudio {
	readonly ctx: AudioContext;
	private readonly music: GainNode;
	private readonly se: GainNode;
	private readonly noise: AudioBuffer;
	private readonly cache = new Map<string, Promise<AudioBuffer>>();
	private source: AudioBufferSourceNode | null = null;
	/** 曲の頭を鳴らす AudioContext の時刻 */
	songStart = 0;

	constructor() {
		const Ctor: AudioContextCtor | undefined =
			window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
		if (!Ctor) throw new Error("no-audio");
		this.ctx = new Ctor({ latencyHint: "interactive" });
		this.music = this.ctx.createGain();
		this.se = this.ctx.createGain();
		this.music.connect(this.ctx.destination);
		this.se.connect(this.ctx.destination);
		abcjs.synth.registerAudioContext(this.ctx);

		const len = Math.floor(this.ctx.sampleRate * 0.5);
		this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
		const data = this.noise.getChannelData(0);
		// 毎回同じ音になるよう、決まった種の乱数で作る
		let seed = 12345;
		for (let i = 0; i < len; i++) {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			data[i] = (seed / 0x3fffffff - 1) * 0.9;
		}
	}

	/** 利用者の操作（クリック・タップ・キー）の中で呼ぶ。iOS ではこれがないと音が出ない */
	unlock() {
		if (this.ctx.state !== "running") void this.ctx.resume();
		// iOS Safari は、操作の中で一度でも音を鳴らさないと解除されないことがある
		const b = this.ctx.createBufferSource();
		b.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
		b.connect(this.ctx.destination);
		b.start();
	}

	setMusicVolume(v: number) {
		this.music.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.02);
	}

	setSeVolume(v: number) {
		this.se.gain.setTargetAtTime(v * v * 1.4, this.ctx.currentTime, 0.02);
	}

	/** ABC から曲の音声を作る（サウンドフォントを読み込んで合成するので数秒かかる）。結果は覚えておく */
	prepareSong(id: string, abc: string): Promise<AudioBuffer> {
		let p = this.cache.get(id);
		if (!p) {
			p = this.render(abc);
			this.cache.set(id, p);
			p.catch(() => this.cache.delete(id));
		}
		return p;
	}

	private async render(abc: string): Promise<AudioBuffer> {
		const tune = abcjs.parseOnly(abc)[0];
		if (!tune) throw new Error("parse");
		const synth = new abcjs.synth.CreateSynth();
		await synth.init({ audioContext: this.ctx, visualObj: tune, millisecondsPerMeasure: tune.millisecondsPerMeasure() });
		await synth.prime();
		const buf = (synth as unknown as { getAudioBuffer(): AudioBuffer | undefined }).getAudioBuffer();
		if (!buf) throw new Error("render");
		return buf;
	}

	/**
	 * 曲の音声の中で、最初に音が鳴り始める位置（秒）。
	 * 譜面の最初の音符の時刻と比べて、音声の頭に無音があればその分を補正する。
	 */
	static firstSoundTime(buf: AudioBuffer): number {
		const ch = buf.getChannelData(0);
		for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]!) > 0.004) return i / buf.sampleRate;
		return 0;
	}

	/** 曲を AudioContext の時刻 when から鳴らす */
	playSong(buf: AudioBuffer, when: number) {
		this.stopSong();
		const s = this.ctx.createBufferSource();
		s.buffer = buf;
		s.connect(this.music);
		s.start(when);
		this.source = s;
		this.songStart = when;
	}

	stopSong() {
		try {
			this.source?.stop();
		} catch {
			/* まだ鳴っていない */
		}
		this.source?.disconnect();
		this.source = null;
	}

	/**
	 * performance.now() の時刻 perfMs に「スピーカーから聞こえていた」AudioContext の時刻。
	 * 出力の遅れ（Bluetooth イヤホンなど）も含めて合わせる。
	 */
	heardContextTime(perfMs: number = performance.now()): number {
		const ctx = this.ctx;
		const ts = ctx.getOutputTimestamp?.();
		if (ts && ts.contextTime && ts.performanceTime) {
			if (ctx.state !== "running") return ts.contextTime;
			// 時計は処理の単位ごとにしか進まないので、performance.now() との差で補う（大きくずれたら補わない）
			const d = (perfMs - ts.performanceTime) / 1000;
			return ts.contextTime + Math.max(-0.2, Math.min(0.2, d));
		}
		const lat = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
		return ctx.currentTime - lat - (performance.now() - perfMs) / 1000;
	}

	/** 曲の頭からの秒（いま聞こえている位置） */
	songTime(perfMs?: number) {
		return this.heardContextTime(perfMs) - this.songStart;
	}

	// ---- 効果音 ----

	private env(g: GainNode, t: number, peak: number, decay: number) {
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(peak, t + 0.003);
		g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
	}

	private noiseBurst(t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
		const src = this.ctx.createBufferSource();
		src.buffer = this.noise;
		const f = this.ctx.createBiquadFilter();
		f.type = type;
		f.frequency.value = freq;
		f.Q.value = q;
		const g = this.ctx.createGain();
		this.env(g, t, peak, decay);
		src.connect(f).connect(g).connect(this.se);
		src.start(t);
		src.stop(t + decay + 0.02);
	}

	private tone(t: number, type: OscillatorType, from: number, to: number, sweep: number, peak: number, decay: number) {
		const o = this.ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(from, t);
		o.frequency.exponentialRampToValueAtTime(to, t + sweep);
		const g = this.ctx.createGain();
		this.env(g, t, peak, decay);
		o.connect(g).connect(this.se);
		o.start(t);
		o.stop(t + decay + 0.02);
	}

	/** 「ドン」: 太鼓の真ん中。低く響く音 */
	don(big = false) {
		const t = this.ctx.currentTime;
		const k = big ? 1.25 : 1;
		this.tone(t, "sine", 150, 52, 0.16, 0.9 * k, 0.42);
		this.tone(t, "triangle", 95, 60, 0.1, 0.35 * k, 0.22);
		this.noiseBurst(t, "lowpass", 900, 0.7, 0.35 * k, 0.05);
	}

	/** 「カン」: 太鼓のふち（木の胴）。乾いた高い音 */
	ka() {
		const t = this.ctx.currentTime;
		this.tone(t, "triangle", 1650, 1400, 0.03, 0.4, 0.07);
		this.tone(t, "square", 2900, 2600, 0.02, 0.07, 0.04);
		this.noiseBurst(t, "bandpass", 3200, 2.5, 0.55, 0.045);
	}

	/** 開始前のカウント（拍子木風）。when は AudioContext の時刻 */
	clap(when: number, accent = false) {
		const t = Math.max(when, this.ctx.currentTime);
		this.tone(t, "sine", accent ? 2400 : 2000, accent ? 2300 : 1900, 0.02, 0.35, 0.06);
		this.noiseBurst(t, "highpass", 4000, 0.7, 0.2, 0.03);
	}

	/** 曲の途中で一時停止・再開（AudioContext ごと止めるので、時計も止まる） */
	pause() {
		return this.ctx.suspend();
	}

	resume() {
		return this.ctx.resume();
	}
}
