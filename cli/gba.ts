//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.fun
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import rom from './rom.json' assert { type: 'json' };
import { makeOrReadFile } from './make.ts';

const romBin = new Uint8Array(rom);

export interface IGbaArgs {
  input: string;
  output: string;
  message: string[];
}

export async function gba({ input, output, message }: IGbaArgs): Promise<number> {
  const song = await makeOrReadFile(input);
  if (typeof song === 'string') {
    throw new Error(song);
  }
  const songBin = song.toArray();

  const out = await Deno.open(output, { write: true, create: true, truncate: true });
  await out.write(romBin);

  // output the three messages
  for (let m = 0; m < 3; m++) {
    const msg = message[m] ?? '';
    const shortMsg = msg.length > 30 ? `${msg.substr(0, 27)}...` : msg;
    const bytes: number[] = [];
    for (let i = 0; i < shortMsg.length; i++) {
      let ch = shortMsg.charCodeAt(i);
      if (ch < 32 || ch >= 128) {
        ch = 63; // '?'
      }
      bytes.push(ch);
    }
    while (bytes.length < 30) {
      if (bytes.length % 2) {
        bytes.push(0);
      } else {
        bytes.unshift(32);
      }
    }
    bytes.push(0, 0);
    await out.write(new Uint8Array(bytes));
  }

  await out.write(songBin);
  Deno.close(out.rid);
  console.log(`Success! File output to: ${output}`);
  return 0;
}
