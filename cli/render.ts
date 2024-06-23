//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.fun
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { makeOrReadFile } from './make.ts';

export interface IRenderArgs {
  input: string;
  output: string;
  loop: number;
  sequence: number;
}

export async function render({ input, output, loop, sequence }: IRenderArgs): Promise<number> {
  const song = await makeOrReadFile(input);
  if (typeof song === 'string') {
    throw new Error(song);
  }
  const wave = song.toWave(loop, sequence);
  const out: number[] = [];
  const u16 = (n: number) => {
    out.push(n & 0xff);
    out.push((n >> 8) & 0xff);
  };
  const u32 = (n: number) => {
    out.push(n & 0xff);
    out.push((n >> 8) & 0xff);
    out.push((n >> 16) & 0xff);
    out.push((n >> 24) & 0xff);
  };

  u32(0x46464952); // 'RIFF'
  u32(wave.length * 2 + 36); // file size minus 'RIFF'
  u32(0x45564157); // 'WAVE'
  u32(0x20746d66); // 'fmt '
  u32(16); // size of fmt chunk
  u16(1); // audio format
  u16(1); // mono
  u32(32768); // sample rate
  u32(32768 * 2); // bytes per second
  u16(2); // block align
  u16(16); // bits per sample
  u32(0x61746164); // 'data'
  u32(wave.length * 2); // size of data chunk
  for (const w of wave) {
    u16(w);
  }

  await Deno.writeFile(output, new Uint8Array(out));
  console.log(`Success! File output to: ${output}`);
  return 0;
}
