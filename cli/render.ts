//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { Song } from './song.ts';
import { defaultFileSystemContext, makeFromFile } from './make.ts';

export interface IRenderArgs {
  input: string;
  output: string;
  loop: number;
  sequence: number;
}

export async function render({ input, output, loop, sequence }: IRenderArgs): Promise<number> {
  const fs = defaultFileSystemContext();
  const file = await Deno.open(input, { read: true });
  const fileInfo = await file.stat();
  if (fileInfo.isFile) {
    const header = new Uint8Array(4);
    const bytesRead = await file.read(header);
    Deno.close(file.rid);
    const data = (
        bytesRead === 4 &&
        header[0] == 0xfb &&
        header[1] == 0x67 &&
        header[2] == 0x76 &&
        header[3] == 0x73
      )
      ? await fs.readBinaryFile(input)
      : await makeFromFile(input, fs);
    const song = Song.fromArray(data);
    if (song === false) {
      throw new Error(`Bad file format: ${input}`);
    }
    const wave = song.render(loop, sequence);
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
  } else {
    throw new Error(`Not a file: ${input}`);
  }
  return 0;
}
