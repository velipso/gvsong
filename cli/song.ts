//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { canvas } from './deps.ts';
import tables from './tables.json' assert { type: 'json' };

const TOTAL_SAMPLES = 5;

export type IEnvelope = (number | 'sus' | 'rel')[];

interface IInstrumentEnvelope {
  env: number[];
  attack: number;
  sustain: number;
}

interface IInstrument {
  wave: number;
  volume: IInstrumentEnvelope;
  pitch: IInstrumentEnvelope;
}

interface IPatternLine {
  commands: number[];
  wait: number;
}

interface ISequence {
  patterns: number[];
  loopIndex: number;
}

interface IChannel {
  state: 'off' | 'rel' | 'on';
  log: ('on' | 'rel' | 'off')[];
  delay: number;
  delayedNote: {
    left: number;
    note: number;
  };
  delayedBend: {
    left: number;
    duration: number;
    note: number;
  };
  chanVolume: number;
  envVolumeIndex: number;
  basePitch: number;
  noteOnPitch: number;
  targetPitch: number;
  bendCounter: number;
  bendCounterMax: number;
  envPitchIndex: number;
  phase: number;
  instIndex: number;
}

interface IPlayer {
  tempoIndex: number;
  tickStart: number;
  tickLeft: number;
  tick16thLeft: number;
  total16th: number;
  seqIndex: number;
  patIndex: number;
  rowIndex: number;
  loopsLeft: number;
  endOfSongFade: number;
}

function parseEnvelope(
  envelope: IEnvelope,
  low: number,
  high: number,
): IInstrumentEnvelope | string {
  const env: number[] = [];
  let attack = -1;
  let sustain = 0;
  let gotRel = false;
  for (const s of envelope) {
    if (!gotRel) {
      sustain = env.length;
    }
    if (s === 'sus') {
      if (attack >= 0) {
        return 'Canot define SUS multiple times';
      }
      attack = env.length;
    } else if (s === 'rel') {
      if (gotRel) {
        return 'Cannot define REL multiple times';
      }
      gotRel = true;
    } else if (typeof s === 'number') {
      if (s < low || s > high) {
        return `Envelope value out of range ${low}..${high}: ${s}`;
      }
      env.push(s);
    } else {
      return 'Bad data';
    }
  }
  if (!gotRel) {
    sustain += 1;
  }
  if (attack < 0) {
    return 'Missing SUS';
  }
  if (env.length >= 256) {
    throw new Error(`Envelope too large; max length of 255`);
  }
  return { env, attack, sustain };
}

function isEnd(cmd: number) {
  return (cmd & 0x7f) === 2 || (cmd >> 7) === 6;
}

const tempoTable: { tempo: number; start: number }[] = [];
const bendTable: number[] = [];
for (let i = 0; i < 64; i++) {
  const idealTempo = (i + 18) * 10 / 4;
  const start = Math.round(32768 * 60 * 256 / (608 * 16 * idealTempo));
  const tempo = 32768 * 60 * 256 / (608 * 16 * start);
  tempoTable.push({ tempo, start });

  const framesPer16thNote = start / 256;
  const pitchDivision = 16;
  for (let dpitchAbs = 1; dpitchAbs <= 128; dpitchAbs++) {
    const bendCounterMax = Math.floor(65536 * framesPer16thNote / (dpitchAbs * pitchDivision));
    if (bendCounterMax < 0 || bendCounterMax >= 65536) {
      throw new Error('bendTable overflow');
    }
    bendTable.push(bendCounterMax);
  }
}
// deno-fmt-ignore
const lowpassIndexTable = [
   0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
   0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2,
   2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4,
   4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6,
   7, 7, 7, 7, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9,10,10,
  10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,
  10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,
  10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,
];

export class Song {
  channelCount = 6;
  instruments: IInstrument[] = [];
  pcmMapping: number[] = Array.from({ length: 120 }).map(() => 0);
  patterns: IPatternLine[][] = [];
  sequences: ISequence[] = [];

  static fromArray(data: Uint8Array): Song | false {
    try {
      let next = 0;
      const u8 = () => {
        if (next >= data.length) {
          throw false;
        }
        const res = data[next];
        next++;
        return res;
      };
      const i8 = () => {
        const a = u8();
        return a >= 128 ? a - 256 : a;
      };
      const u16 = () => {
        const a = u8();
        const b = u8();
        return (b << 8) | a;
      };
      const u32 = () => {
        const a = u8();
        const b = u8();
        const c = u8();
        const d = u8();
        return (d * (1 << 24)) + (c * (1 << 16)) + (b * (1 << 8)) + a;
      };
      const result = new Song();

      const magic = u32();
      if (magic !== 0x737667fb) {
        return false;
      }
      const version = u8();
      if (version !== 0) {
        return false;
      }
      result.channelCount = u8();
      u16(); // reserved
      const instsLength = u8();
      const seqsLength = u8();
      const patsLength = u16();
      const instTableOffset = u32();
      const seqTableOffset = u32();
      const patTableOffset = u32();

      const pcmMapping: number[] = [];
      for (let i = 0; i < 120; i++) {
        pcmMapping.push(u16());
      }

      next = instTableOffset;
      const instOffset: number[] = [];
      for (let i = 0; i < instsLength; i++) {
        instOffset.push(u32());
      }

      next = seqTableOffset;
      const seqOffset: number[] = [];
      for (let i = 0; i < seqsLength; i++) {
        seqOffset.push(u32());
      }

      next = patTableOffset;
      const patOffset: number[] = [];
      for (let i = 0; i < patsLength; i++) {
        patOffset.push(u32());
      }

      // instruments
      for (let i = 0; i < instsLength; i++) {
        next = instOffset[i];
        const wave = u16();
        const vattack = u8();
        const vsustain = u8();
        const vlength = u8();
        const pattack = u8();
        const psustain = u8();
        const plength = u8();
        const voffset = u16();
        const poffset = u16();
        next = instOffset[i] + voffset;
        const venv: number[] = [];
        for (let i = 0; i < vlength; i++) {
          venv.push(i8());
        }
        next = instOffset[i] + poffset;
        const penv: number[] = [];
        for (let i = 0; i < plength; i++) {
          penv.push(i8());
        }
        result.instruments.push({
          wave,
          volume: {
            env: venv,
            attack: vattack,
            sustain: vsustain,
          },
          pitch: {
            env: penv,
            attack: pattack,
            sustain: psustain,
          },
        });
      }

      // sequences
      for (let i = 0; i < seqsLength; i++) {
        next = seqOffset[i];
        const patLength = u16();
        const loopIndex = u16();
        const patterns: number[] = [];
        for (let j = 0; j < patLength; j++) {
          patterns.push(u16());
        }
        result.sequences.push({ patterns, loopIndex });
      }

      // patterns
      for (let i = 0; i < patsLength; i++) {
        next = patOffset[i];
        const plines: IPatternLine[] = [];
        while (true) {
          let gotEnd = false;
          const commands: number[] = [];
          for (let ch = 0; ch < result.channelCount; ch++) {
            const c = u16();
            gotEnd = gotEnd || isEnd(c);
            commands.push(c);
          }
          const wait = u16();
          plines.push({ commands, wait });
          if (gotEnd) {
            break;
          }
        }
        result.patterns.push(plines);
      }
      return result;
    } catch (e) {
      if (e === false) {
        return false;
      }
      throw e;
    }
  }

  toArray(): Uint8Array {
    const out: number[] = [];
    const u8 = (n: number) => out.push(n & 0xff);
    const u16 = (n: number) => {
      out.push(n & 0xff);
      out.push((n >> 8) & 0xff);
    };
    const rewrite16 = () => {
      const i = out.length;
      out.push(0, 0);
      return (n: number) => {
        out[i] = n & 0xff;
        out[i + 1] = (n >> 8) & 0xff;
      };
    };
    const rewrite32 = () => {
      const i = out.length;
      out.push(0, 0, 0, 0);
      return (n: number) => {
        out[i] = n & 0xff;
        out[i + 1] = (n >> 8) & 0xff;
        out[i + 2] = (n >> 16) & 0xff;
        out[i + 3] = (n >> 24) & 0xff;
      };
    };
    const align = (n: number) => {
      while ((out.length % n) !== 0) {
        out.push(0);
      }
    };

    // header
    out.push(0xfb, 0x67, 0x76, 0x73); // magic 'gvs'
    u8(0); // version
    u8(this.channelCount); // channel count
    u16(0); // reserved
    u8(this.instruments.length); // instruments length
    u8(this.sequences.length); // sequences length
    u16(this.patterns.length); // patterns length
    const instTableOffset = rewrite32();
    const seqTableOffset = rewrite32();
    const patTableOffset = rewrite32();

    // pcm mapping
    for (let i = 0; i < 120; i++) {
      u16(this.pcmMapping[i]);
    }

    // instrument table
    instTableOffset(out.length);
    const instOffset: ((n: number) => void)[] = [];
    for (let i = 0; i < this.instruments.length; i++) {
      instOffset.push(rewrite32());
    }

    // sequence table
    seqTableOffset(out.length);
    const seqOffset: ((n: number) => void)[] = [];
    for (let i = 0; i < this.sequences.length; i++) {
      seqOffset.push(rewrite32());
    }

    // pattern table
    patTableOffset(out.length);
    const patOffset: ((n: number) => void)[] = [];
    for (let i = 0; i < this.patterns.length; i++) {
      patOffset.push(rewrite32());
    }

    // instruments
    for (let i = 0; i < this.instruments.length; i++) {
      const { wave, volume, pitch } = this.instruments[i];
      const instLabel = out.length;
      instOffset[i](instLabel);
      u16(wave); // wave
      u8(volume.attack); // volume attack
      u8(volume.sustain); // volume sustain
      u8(volume.env.length); // volume length
      u8(pitch.attack); // pitch attack
      u8(pitch.sustain); // pitch sustain
      u8(pitch.env.length); // pitch length
      const volumeOffset = rewrite16();
      const pitchOffset = rewrite16();
      volumeOffset(out.length - instLabel);
      for (const e of volume.env) {
        u8(e);
      }
      align(2);
      pitchOffset(out.length - instLabel);
      for (const e of pitch.env) {
        u8(e);
      }
      align(2);
    }

    // sequences
    for (let i = 0; i < this.sequences.length; i++) {
      const { patterns, loopIndex } = this.sequences[i];
      seqOffset[i](out.length);
      u16(patterns.length);
      u16(loopIndex);
      for (const p of patterns) {
        u16(p);
      }
    }

    // patterns
    for (let i = 0; i < this.patterns.length; i++) {
      const pattern = this.patterns[i];
      patOffset[i](out.length);
      for (const { commands, wait } of pattern) {
        let gotEnd = false;
        for (const c of commands) {
          u16(c);
          gotEnd = gotEnd || isEnd(c);
        }
        u16(wait);
        if (gotEnd) {
          break;
        }
      }
    }

    return new Uint8Array(out);
  }

  addInstrument(wave: number, volumeEnv: IEnvelope, pitchEnv: IEnvelope) {
    const i = this.instruments.length;
    if (i >= 64) {
      throw new Error('Too many instruments; max of 64');
    }
    if (wave < 0 || wave >= 12) {
      throw new Error(`Invalid wave for instrument ${i}; expecting number 0-11 but got: ${wave}`);
    }
    const volume = parseEnvelope(volumeEnv, 0, 16);
    if (typeof volume === 'string') {
      throw new Error(`Invalid volume envelope for instrument ${i}: ${volume}`);
    }
    const pitch = parseEnvelope(pitchEnv, -128, 127);
    if (typeof pitch === 'string') {
      throw new Error(`Invalid pitch envelope for instrument ${i}: ${pitch}`);
    }
    this.instruments.push({ wave, volume, pitch });
    return this;
  }

  setPCMMapping(pcmMapping: number[]) {
    if (pcmMapping.length !== 120) {
      throw new Error('Invalid PCM mapping; expecting 120 values');
    }
    for (let i = 0; i < pcmMapping.length; i++) {
      const s = pcmMapping[i];
      if (s < 0 || s >= TOTAL_SAMPLES) {
        throw new Error(
          `Invalid PCM sample at index ${i}; must be between 0 and ${TOTAL_SAMPLES - 1}`,
        );
      }
    }
    this.pcmMapping = pcmMapping;
    return this;
  }

  setPatterns(patterns: string[]) {
    const result: IPatternLine[][] = [];
    for (let pi = 0; pi < patterns.length; pi++) {
      const pattern = patterns[pi];
      let gotEnd = false;
      let lastBeat = 0;
      let lastSixt = 0;
      const plines: IPatternLine[] = [];
      for (const rawLine of pattern.trim().toUpperCase().split('\n')) {
        const line = rawLine.replace(/\/\/.*/, '').trim();
        if (line === '') {
          continue;
        }
        const commands: number[] = [];
        const parts = line.split('  ');
        if (parts.length !== this.channelCount + 1) {
          throw new Error(
            `Bad line in pattern ${pi}; expecting ${this.channelCount} channels: ${rawLine}`,
          );
        }

        // parse time
        const time = parts.shift();
        if (!time || time.length !== 2) {
          throw new Error(`Bad line in pattern ${pi}; missing time column: ${rawLine}`);
        }
        const beat = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(time.charAt(0));
        const sixt = '0123456789ABCDEF'.indexOf(time.charAt(1));
        const wait = (beat * 16 + sixt) - (lastBeat * 16 + lastSixt);
        if (beat < 0 || sixt < 0 || wait < 0) {
          throw new Error(`Bad time ${time}: ${rawLine}`);
        }
        lastBeat = beat;
        lastSixt = sixt;
        if (plines.length <= 0 && wait !== 0) {
          throw new Error(`First row must start on time 00: ${rawLine}`);
        }
        if (plines.length > 0) {
          // see if we can remove last line
          if (plines.length > 1 && plines[plines.length - 1].commands.every((c) => c === 0)) {
            plines.pop();
          }
          plines[plines.length - 1].wait += wait;
        }

        // parse channels
        for (let ch = 0; ch < parts.length; ch++) {
          const inst = parts[ch].split(':');
          if (inst.length !== 2 || inst[0].length !== 3 || inst[1].length !== 3) {
            throw new Error(`Bad channel ${ch} instruction: ${parts[ch]}`);
          }

          // parse note (7 bits)
          // - continue        --- 0x00
          // - note off        OFF 0x01
          // - end pattern     END 0x02
          // - reserved        ??? 0x03-0x07
          // - note on         C#5 0x08-0x7F   or 001-120
          let note = 0;
          if (inst[0] == '---') {
            note = 0;
          } else if (inst[0] == 'OFF') {
            note = 1;
          } else if (inst[0] == 'END') {
            note = 2;
            gotEnd = true;
          } else {
            if (inst[0].charAt(0) == '0' || inst[0].charAt(0) == '1') {
              note = parseInt(inst[0], 10);
              if (isNaN(note)) {
                throw new Error(`Bad note ${inst[0]}: ${parts[ch]}`);
              }
              note += 7;
            } else {
              const noteStr = inst[0].substr(0, 2);
              if (noteStr == 'C-') note = 0x08;
              else if (noteStr == 'C#' || noteStr == 'DB') note = 0x09;
              else if (noteStr == 'D-') note = 0x0a;
              else if (noteStr == 'D#' || noteStr == 'EB') note = 0x0b;
              else if (noteStr == 'E-') note = 0x0c;
              else if (noteStr == 'F-') note = 0x0d;
              else if (noteStr == 'F#' || noteStr == 'GB') note = 0x0e;
              else if (noteStr == 'G-') note = 0x0f;
              else if (noteStr == 'G#' || noteStr == 'AB') note = 0x10;
              else if (noteStr == 'A-') note = 0x11;
              else if (noteStr == 'A#' || noteStr == 'BB') note = 0x12;
              else if (noteStr == 'B-') note = 0x13;
              else {
                throw new Error(`Unknown note ${inst[0]}: ${parts[ch]}`);
              }
              const oct = '0123456789'.indexOf(inst[0].charAt(2));
              if (oct < 0) {
                throw new Error(`Unknown octave ${inst[0]}: ${parts[ch]}`);
              }
              note += oct * 12;
            }
            if (note < 0x08 || note > 0x7f) {
              throw new Error(`Note out of range: ${parts[ch]}`);
            }
          }

          // parse effect (3 bit command + 6 bit payload)
          // 000 command
          //     - 000000 continue (---)
          //     - 000001 set volume 0 (V00)
          //     - 000010 set note delay 0 (D00)
          //     - 000011 bend immediately (B00)
          //     - 000100 set instrument silence (I00)
          //     - 000101 set instrument pcm (PCM)
          //     - 000110 end pattern (END)
          // 001 set volume (V01-V64)
          // 010 set note delay (D01-D64, frames)
          // 011 start bend (B01-B64, 16th notes)
          // 100 set instrument (I01-I64)
          // 101 set tempo (045-202)
          // 110 ???
          // 111 ???
          let effect = 0;
          if (inst[1] == '---') {
            effect = 0;
          } else if (inst[1] == 'V00') {
            effect = 1;
          } else if (inst[1] == 'D00') {
            effect = 2;
          } else if (inst[1] == 'B00') {
            effect = 3;
          } else if (inst[1] == 'I00') {
            effect = 4;
          } else if (inst[1] == 'PCM') {
            effect = 5;
          } else if (inst[1] == 'END') {
            effect = 6;
            gotEnd = true;
          } else if (!isNaN(parseInt(inst[1], 10))) {
            const tempo = parseInt(inst[1], 10);
            if (isNaN(tempo) || tempo < 45 || tempo > 202) {
              throw new Error(`Unknown tempo ${inst[1]}: ${parts[ch]}`);
            }
            let best = 0;
            for (let i = 0; i < tempoTable.length; i++) {
              if (
                Math.abs(tempoTable[i].tempo - tempo) < Math.abs(tempoTable[best].tempo - tempo)
              ) {
                best = i;
              }
            }
            effect = 0x140 | best;
          } else {
            const cmd = inst[1].charAt(0);
            let payload = parseInt(inst[1].substr(1), 10);
            if (isNaN(payload) || payload < 1 || payload > 64) {
              throw new Error(`Bad payload for command ${cmd}: ${parts[ch]}`);
            }
            payload -= 1;
            if (cmd == 'V') {
              effect = 0x040 | payload;
            } else if (cmd == 'D') {
              effect = 0x080 | payload;
            } else if (cmd == 'B') {
              effect = 0x0c0 | payload;
            } else if (cmd == 'I') {
              if (payload >= this.instruments.length) {
                throw new Error(`Instrument ${payload + 1} not defined: ${parts[ch]}`);
              }
              effect = 0x100 | payload;
            } else {
              throw new Error(`Unknown effect ${inst[1]}: ${parts[ch]}`);
            }
          }

          commands.push((effect << 7) | note);
        }
        plines.push({ commands, wait: 0 });
      }
      if (!gotEnd) {
        throw new Error(`Pattern ${pi} missing END command`);
      }
      result.push(plines);
    }
    if (result.length >= 65536) {
      throw new Error(`Too many patterns; max of 65535`);
    }
    this.patterns = result;
    return this;
  }

  setSequences(sequences: (number | 'loop')[][]) {
    const result: ISequence[] = [];
    for (let i = 0; i < sequences.length; i++) {
      const seq = sequences[i];
      const patterns: number[] = [];
      let loopIndex = -1;
      for (const s of seq) {
        if (s === 'loop') {
          if (loopIndex >= 0) {
            throw new Error(`Cannot define multiple loop points in sequence ${i}`);
          }
          loopIndex = patterns.length;
        } else if (typeof s === 'number') {
          if (s < 0 || s >= this.patterns.length) {
            throw new Error(`Invalid pattern index ${s} in sequence ${i}`);
          }
          patterns.push(s);
        } else {
          throw new Error(`Bad data in sequence ${i}`);
        }
      }
      if (loopIndex < 0) {
        loopIndex = 0;
      }
      result.push({ patterns, loopIndex });
    }
    if (result.length >= 256) {
      throw new Error('Too many sequences; max of 255');
    }
    for (let i = 0; i < result.length; i++) {
      if (result[i].patterns.length >= 65536) {
        throw new Error(`Too many patterns in sequence ${i}; max of 65535`);
      }
    }
    this.sequences = result;
    return this;
  }

  private createChannels(): IChannel[] {
    const channels: IChannel[] = [];
    for (let i = 0; i < this.channelCount; i++) {
      channels.push({
        state: 'off',
        log: [],
        delay: 0,
        delayedNote: {
          left: 0,
          note: 0,
        },
        delayedBend: {
          left: 0,
          duration: 0,
          note: 0,
        },
        chanVolume: 0.5,
        envVolumeIndex: 0,
        basePitch: 0,
        noteOnPitch: 0,
        targetPitch: 0,
        bendCounter: 0,
        bendCounterMax: 0,
        envPitchIndex: 0,
        phase: 0,
        instIndex: -1,
      });
    }
    return channels;
  }

  private render(
    loop: number,
    sequence: number,
    channels: IChannel[],
    onFrame: (player: IPlayer) => void,
    onFrameEnd: (player: IPlayer) => void,
  ) {
    if (sequence < 0 || sequence >= this.sequences.length) {
      throw new Error(`Invalid sequence: ${sequence}`);
    }

    // initialize
    const player: IPlayer = {
      tempoIndex: 0,
      tickStart: tempoTable[0].start,
      tickLeft: 0,
      tick16thLeft: 0,
      total16th: 0,
      seqIndex: 0,
      patIndex: this.sequences[sequence].patterns[0],
      rowIndex: 0,
      loopsLeft: loop - 1,
      endOfSongFade: 1,
    };

    const noteOn = (chan: IChannel, note: number, immediately: boolean) => {
      if (!immediately && chan.delay > 0) {
        chan.delayedNote.left = chan.delay;
        chan.delayedNote.note = note;
      } else {
        chan.log.push('on');
        chan.state = 'on';
        chan.phase = 0;
        chan.envVolumeIndex = 0;
        chan.envPitchIndex = 0;
        chan.basePitch = note << 4;
        chan.noteOnPitch = note << 4;
        chan.targetPitch = note << 4;
      }
    };

    const setBend = (chan: IChannel, duration: number, note: number, immediately: boolean) => {
      if (!immediately && chan.delay > 0) {
        chan.delayedBend.left = chan.delay;
        chan.delayedBend.duration = duration;
        chan.delayedBend.note = note;
      } else { // TODO: should I check for chan.state === 'off'?
        chan.targetPitch = note << 4;
        if (duration <= 0) {
          chan.basePitch = note << 4;
        } else {
          const dpitchAbs = Math.abs(chan.targetPitch - chan.basePitch) >> 4;
          if (dpitchAbs <= 0) {
            chan.targetPitch = chan.basePitch;
          } else {
            chan.bendCounter = 0;
            chan.bendCounterMax = duration * bendTable[player.tempoIndex * 128 + dpitchAbs - 1];
          }
        }
      }
    };

    // render song
    while (true) {
      // advance tick counter
      player.tickLeft -= 256;
      player.tick16thLeft -= 256;
      while (player.tickLeft <= 0 && player.loopsLeft >= 0) {
        // perform tick
        let endFlag = false;
        for (let ch = 0; ch < this.channelCount; ch++) {
          const chan = channels[ch];
          const instruction = this.patterns[player.patIndex][player.rowIndex].commands[ch];

          // apply effect
          const effect = (instruction >> 13);
          const payload = (instruction >> 7) & 0x3f;
          const note = instruction & 0x7f;
          let didBend = false;
          switch (effect) {
            case 0: // command
              switch (payload) {
                case 0: // continue
                  break;
                case 1: // set volume 0
                  chan.chanVolume = 0;
                  break;
                case 2: // set delay 0
                  chan.delay = 0;
                  break;
                case 3: // set bend 0
                  setBend(chan, 0, note, false);
                  didBend = true;
                  break;
                case 4: // set instrument 0
                  chan.log.push('off');
                  chan.state = 'off';
                  chan.basePitch = 0;
                  chan.noteOnPitch = 0;
                  chan.targetPitch = 0;
                  chan.delayedNote.left = 0;
                  chan.delayedBend.left = 0;
                  chan.instIndex = -1;
                  break;
                case 5: // set pcm instrument
                  chan.log.push('off');
                  chan.state = 'off';
                  chan.basePitch = 0;
                  chan.noteOnPitch = 0;
                  chan.targetPitch = 0;
                  chan.delayedNote.left = 0;
                  chan.delayedBend.left = 0;
                  chan.instIndex = -2;
                  break;
                case 6:
                  endFlag = true;
                  break;
                default:
                  // malformed data
                  break;
              }
              break;
            case 1: // set volume
              chan.chanVolume = (payload + 1) / 64;
              break;
            case 2: // set delay
              chan.delay = payload + 1;
              break;
            case 3: // start bend
              setBend(chan, payload + 1, note, false);
              didBend = true;
              break;
            case 4: // set instrument
              chan.log.push('off');
              chan.state = 'off';
              chan.basePitch = 0;
              chan.noteOnPitch = 0;
              chan.targetPitch = 0;
              chan.delayedNote.left = 0;
              chan.delayedBend.left = 0;
              chan.instIndex = payload;
              break;
            case 5: // set tempo
              player.tempoIndex = payload;
              player.tickStart = tempoTable[player.tempoIndex].start;
              player.tickLeft = 0;
              player.tick16thLeft = 0;
              break;
            default:
              // malformed data
              break;
          }

          // apply note if not bending
          if (!didBend) {
            if (note === 0) {
              // do nothing
            } else if (note === 1) {
              if (chan.state === 'on') {
                chan.log.push('rel');
                chan.state = 'rel';
              }
            } else if (note === 2) {
              endFlag = true;
            } else {
              noteOn(chan, note, false);
            }
          }
        }
        const wait = this.patterns[player.patIndex][player.rowIndex].wait;
        player.rowIndex++;
        if (endFlag) {
          // end of pattern, load next one
          player.seqIndex++;
          if (player.seqIndex >= this.sequences[sequence].patterns.length) {
            player.seqIndex = this.sequences[sequence].loopIndex;
            player.loopsLeft--;
            if (player.loopsLeft < 0) {
              for (const chan of channels) {
                if (chan.state === 'on') {
                  chan.log.push('rel');
                  chan.state = 'rel';
                }
              }
            }
          }
          player.patIndex = this.sequences[sequence].patterns[player.seqIndex];
          player.rowIndex = 0;
        }
        player.tickLeft += wait * player.tickStart;
      }
      if (player.tick16thLeft <= 0) {
        player.tick16thLeft += player.tickStart;
        player.total16th++;
      }

      // render frame
      onFrame(player);

      for (let ch = 0; ch < this.channelCount; ch++) {
        const chan = channels[ch];

        // advance envelopes
        if (chan.state !== 'off' && chan.instIndex >= 0) {
          const inst = this.instruments[chan.instIndex];
          if (chan.state === 'rel') {
            chan.envVolumeIndex++;
            if (chan.envVolumeIndex >= inst.volume.env.length) {
              chan.log.push('off');
              chan.state = 'off';
            } else if (chan.envPitchIndex < inst.pitch.env.length - 1) {
              chan.envPitchIndex++;
            }
          } else { // note on
            chan.envVolumeIndex++;
            if (chan.envVolumeIndex >= inst.volume.sustain) {
              chan.envVolumeIndex = inst.volume.attack;
            }
            chan.envPitchIndex++;
            if (chan.envPitchIndex >= inst.pitch.sustain) {
              chan.envPitchIndex = inst.pitch.attack;
            }
          }
        }

        // check for delayed notes
        if (chan.delayedNote.left > 0) {
          chan.delayedNote.left--;
          if (chan.delayedNote.left <= 0) {
            noteOn(chan, chan.delayedNote.note, true);
          }
        }
        if (chan.delayedBend.left > 0) {
          chan.delayedBend.left--;
          if (chan.delayedBend.left <= 0) {
            setBend(chan, chan.delayedBend.duration, chan.delayedBend.note, true);
          }
        }
        // TODO: delayedNoteOff?

        // pitch bend
        if (chan.basePitch !== chan.targetPitch) {
          chan.bendCounter += 65536;
          while (chan.bendCounter >= chan.bendCounterMax) {
            chan.bendCounter -= chan.bendCounterMax;
            if (chan.basePitch < chan.targetPitch) {
              chan.basePitch++;
            } else {
              chan.basePitch--;
            }
          }
        }
      }

      onFrameEnd(player);

      if (player.loopsLeft < 0) {
        player.endOfSongFade *= 0.9;
        if (player.endOfSongFade < 0.001) {
          break;
        }
      }
    }
  }

  toWave(loop: number, sequence: number): number[] {
    const out: number[] = [];
    const channels = this.createChannels();

    this.render(loop, sequence, channels, ({ endOfSongFade }) => {
      const output = Array.from({ length: 608 }).map(() => 0);
      for (let ch = 0; ch < this.channelCount; ch++) {
        const chan = channels[ch];
        if (chan.state === 'off' || chan.instIndex === -1) {
          continue;
        } else if (chan.instIndex === -2) {
          // TODO: PCM
        } else {
          const inst = this.instruments[chan.instIndex];
          const finalVolume = endOfSongFade * chan.chanVolume *
            inst.volume.env[chan.envVolumeIndex] / 16;
          const finalPitch = chan.basePitch + inst.pitch.env[chan.envPitchIndex];
          const freq = 440 * Math.pow(2, ((finalPitch / 16) - 65) / 12);
          const dphase = freq * 2048 / 32768;
          if (inst.wave === 11) {
            // random noise
            for (let i = 0; i < 608; i++) {
              const w = tables[2048 * (11 * 11) + (chan.phase >> 7)];
              output[i] += finalVolume * w;
              chan.phase = (chan.phase + dphase) % (1 << 22);
            }
          } else {
            // oscillator
            const lp = lowpassIndexTable[Math.floor(finalPitch / 16)];
            for (let i = 0; i < 608; i++) {
              const w = tables[2048 * (11 * inst.wave + lp) + Math.floor(chan.phase)];
              output[i] += finalVolume * w;
              chan.phase = (chan.phase + dphase) % 2048;
            }
          }
        }
      }

      // write output
      for (let i = 0; i < output.length; i++) {
        const v = Math.min(
          32767,
          Math.max(-32768, Math.round(output[i] * (output[i] < 0 ? 32768 : 32767))),
        );
        if (isNaN(v)) {
          console.error('Error: NaN value detected');
          out.push(0);
        } else {
          out.push(v);
        }
      }
    }, () => {});

    return out;
  }

  toImage(
    sequence: number,
    drawChannels: number[],
    drawBends: boolean,
    drawVolume: boolean,
  ): Uint8Array {
    const channelIndexes = drawChannels.filter((ch) =>
      Math.floor(ch) === ch && ch >= 0 && ch < this.channelCount
    );
    const channels = this.createChannels();
    const chanState: ('on' | 'rel' | 'off')[] = Array.from({ length: this.channelCount }).map(() =>
      'off'
    );
    const hue = (n: number) => Math.floor(((n * 1.618) % 1) * 360);
    const patternPos: ({ pi: number; x: number; width: number })[] = [];
    const pitches: ({ x: number; inst: number; pitch: number; volume: number; noteOn: boolean })[] =
      [];
    const grid16th: number[] = [];
    let x = 0;
    let last16th = -1;
    this.render(1, sequence, channels, () => {}, (player) => {
      if (player.total16th !== last16th) {
        last16th = player.total16th;
        grid16th.push(x);
      }
      if (player.loopsLeft < 0) {
        return;
      }

      const pi = player.patIndex;
      if (patternPos.length > 0 && patternPos[patternPos.length - 1].pi === pi) {
        patternPos[patternPos.length - 1].width++;
      } else {
        patternPos.push({ pi, x, width: 1 });
      }

      for (const ch of channelIndexes) {
        const chan = channels[ch];
        let noteOn = false;
        while (true) {
          const s = chan.log.shift();
          if (!s) {
            break;
          }
          noteOn ||= s === 'on';
          chanState[ch] = s;
        }
        if (chanState[ch] !== 'off' && chan.instIndex !== -1) {
          let pitch = chan.noteOnPitch;
          let volume = 16;
          if (chan.instIndex === -2) {
            // TODO: PCM
          } else {
            const inst = this.instruments[chan.instIndex];
            if (drawBends) {
              pitch = chan.basePitch + inst.pitch.env[chan.envPitchIndex];
            }
            if (drawVolume) {
              volume = inst.volume.env[chan.envVolumeIndex];
            }
          }
          pitches.push({
            x,
            inst: chan.instIndex,
            pitch,
            volume,
            noteOn,
          });
        }
      }

      x++;
    });
    const cnv = canvas.createCanvas(x, 120 * 17 + 1);
    const ctx = cnv.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cnv.width, cnv.height);
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    for (let i = 0; i < grid16th.length; i += 2) {
      const x = grid16th[i];
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, cnv.height);
      ctx.strokeStyle = [
        '#555',
        '#111',
        '#111',
        '#111',
        '#222',
        '#111',
        '#111',
        '#111',
        '#333',
        '#111',
        '#111',
        '#111',
        '#222',
        '#111',
        '#111',
        '#111',
      ][i % 16];
      ctx.stroke();
    }
    for (let p = 0; p <= 120; p++) {
      ctx.beginPath();
      ctx.moveTo(0, p * 17 + 0.5);
      ctx.lineTo(cnv.width, p * 17 + 0.5);
      ctx.strokeStyle = (p % 12) === 0 ? '#555' : '#333';
      ctx.stroke();
    }
    for (const { x, inst, pitch, volume, noteOn } of pitches) {
      const y = 120 * 17 - Math.round(pitch * 17 / 16) - 8;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y - volume / 2);
      ctx.lineTo(x + 0.5, y + volume / 2);
      ctx.strokeStyle = `hsl(${hue(inst)}, 100%, ${noteOn ? 75 : 50}%)`;
      ctx.stroke();
    }
    return new Uint8Array(cnv.toBuffer('image/png').buffer);
  }
}
