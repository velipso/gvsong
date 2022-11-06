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
    await out.write(songBin);
    Deno.close(out.rid);
    console.log(`Success! File output to: ${output}`);
  } else {
    throw new Error(`Not a file: ${input}`);
  }
  return 0;
}
