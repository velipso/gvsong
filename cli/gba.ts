//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { Song } from './song.ts';
import { defaultFileSystemContext, makeFromFile } from './make.ts';

export interface IGbaArgs {
  input: string;
  output: string;
}

export async function gba({ input, output }: IGbaArgs): Promise<number> {
  const fs = defaultFileSystemContext();
  const basename = fs.path.basename(input).replace(/\.(sink|gvsong)$/i, '');
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
    const songBin = song.toArray();

    const romFile = new URL('../gba/main.bin', import.meta.url).pathname;
    const romBin = await fs.readBinaryFile(romFile);

    const out = await Deno.open(output, { write: true, create: true, truncate: true });
    await out.write(romBin);
    const title: number[] = [];
    const shortBasename = basename.length > 30 ? `${basename.substr(0, 27)}...` : basename;
    for (let i = 0; i < shortBasename.length; i++) {
      let ch = shortBasename.charCodeAt(i);
      if (ch < 32 || ch >= 128) {
        ch = 63; // '?'
      }
      title.push(ch);
    }
    while (title.length < 30) {
      if (title.length % 2) {
        title.push(0);
      } else {
        title.unshift(32);
      }
    }
    title.push(0, 0);
    await out.write(new Uint8Array(title));
    await out.write(songBin);
    Deno.close(out.rid);
    console.log(`Success! File output to: ${output}`);
  } else {
    throw new Error(`Not a file: ${input}`);
  }
  return 0;
}
