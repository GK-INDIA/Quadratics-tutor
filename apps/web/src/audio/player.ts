import type { Segment } from '@tutor/shared';

export interface Utterance {
  segment: Segment;
  /** Base64 mp3 from the server. Absent when the browser should speak the text itself. */
  audio?: string;
}

/**
 * Plays the tutor's segments strictly in order. `onStart` fires as each one
 * begins, which is when its board changes are applied, so writing and
 * highlighting stay in step with the voice.
 */
export class Speaker {
  private queue: Utterance[] = [];
  private playing = false;
  private current: HTMLAudioElement | null = null;
  private generation = 0;

  constructor(
    private onStart: (segment: Segment) => void,
    private onIdle: () => void,
  ) {}

  enqueue(utterance: Utterance): void {
    this.queue.push(utterance);
    if (!this.playing) void this.drain();
  }

  /** Stops immediately and drops anything queued: the student has started talking. */
  stop(): void {
    this.generation += 1;
    this.queue = [];
    this.current?.pause();
    this.current = null;
    window.speechSynthesis?.cancel();
    this.playing = false;
  }

  get busy(): boolean {
    return this.playing;
  }

  private async drain(): Promise<void> {
    const generation = this.generation;
    this.playing = true;
    while (this.queue.length > 0 && generation === this.generation) {
      const next = this.queue.shift()!;
      this.onStart(next.segment);
      await this.play(next).catch(() => undefined);
    }
    if (generation === this.generation) {
      this.playing = false;
      this.onIdle();
    }
  }

  private play({ segment, audio }: Utterance): Promise<void> {
    if (audio) {
      return this.playAudio(audio).catch(() => this.speakInBrowser(segment.say));
    }
    return this.speakInBrowser(segment.say);
  }

  private playAudio(base64: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const el = new Audio(`data:audio/mpeg;base64,${base64}`);
      this.current = el;
      el.onended = () => resolve();
      el.onpause = () => resolve(); // stop() pauses; do not leave the queue hanging
      el.onerror = () => reject(new Error('audio failed'));
      el.play().catch(reject);
    });
  }

  private speakInBrowser(text: string): Promise<void> {
    const synth = window.speechSynthesis;
    // No voice at all: leave the words on screen for about as long as they take to read.
    if (!synth) return new Promise((resolve) => setTimeout(resolve, Math.min(6000, 400 + text.length * 45)));
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-IN';
      utterance.rate = 0.95;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      synth.speak(utterance);
    });
  }
}
