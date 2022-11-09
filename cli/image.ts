//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { makeOrReadFile } from './make.ts';

export interface IImageArgs {
  input: string;
  output: string;
  sequence: number;
  channels: number[];
  bend: boolean;
}

export async function image(
  { input, output, sequence, channels, bend }: IImageArgs,
): Promise<number> {
  const song = await makeOrReadFile(input);
  if (typeof song === 'string') {
    throw new Error(song);
  }
  await Deno.writeFile(output, song.toImage(sequence, channels, bend));
  return 0;
}
