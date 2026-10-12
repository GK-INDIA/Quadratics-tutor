import { describe, expect, it } from 'vitest';
import { pcmToWav } from '../apps/api/src/providers/speech';

describe('pcmToWav', () => {
  it('writes a valid 24 kHz mono 16-bit header in front of the samples', () => {
    const pcm = Buffer.alloc(48_000); // one second
    const wav = pcmToWav(pcm);
    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.toString('latin1', 0, 4)).toBe('RIFF');
    expect(wav.toString('latin1', 8, 12)).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.toString('base64').startsWith('UklGR')).toBe(true); // what the player sniffs for
  });
});
