//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { IMakeArgs, make } from './make.ts';
import { IRenderArgs, render } from './render.ts';
import { gba, IGbaArgs } from './gba.ts';
import { IImageArgs, image } from './image.ts';
import { argParse, Path } from './deps.ts';
import version from '../version.json' assert { type: 'json' };

const path = new Path();

function printVersion() {
  console.log(`gvsong - Builds and renders songs designed for Game Boy Advance
by Sean Connelly (@velipso), https://sean.cm
Project Home: https://github.com/velipso/gvsong
SPDX-License-Identifier: 0BSD
Version: ${version[0]}.${version[1]}.${version[2]}`);
}

function printHelp() {
  console.log(`gvsong <command> [<args...>]

Command Summary:
  make      Convert a .sink song to a .gvsong binary file
  render    Render a .sink or .gvsong into a high-resolution .wav file
  gba       Generate a .gba ROM file that plays a .sink or .gvsong file
  image     Generate a PNG of the patterns inside a .sink or .gvsong file

For more help, try:
  gvsong <command> --help`);
}

function printMakeHelp() {
  console.log(`gvsong make <input> [-o <output>]

<input>        The input .sink file
-o <output>    The output file (default: input with .gvsong extension)`);
}

function parseMakeArgs(args: string[]): number | IMakeArgs {
  let badArgs = false;
  const a = argParse(args, {
    string: ['output'],
    boolean: ['help'],
    alias: { h: 'help', o: 'output' },
    unknown: (_arg: string, key?: string) => {
      if (key) {
        console.error(`Unknown argument: -${key}`);
        badArgs = true;
        return false;
      }
      return true;
    },
  });
  if (badArgs) {
    return 1;
  }
  if (a.help) {
    printMakeHelp();
    return 0;
  }
  if (a._.length <= 0) {
    console.error('Missing input file');
    return 1;
  }
  if (a._.length > 1) {
    console.error('Can only have one input file');
    return 1;
  }
  const input = a._[0] as string;
  const output = a.output;
  return {
    input,
    output: output ?? path.replaceExt(input, '.gvsong'),
  };
}

function printRenderHelp() {
  console.log(`gvsong render <input> [-o <output>] [-l <loops>] [-s <sequence>]

<input>        The input .sink or .gvsong file
-o <output>    The output file (default: input with .wav extension)
-l <loops>     How many times to loop (default: 3)
-s <sequence>  Sequence index (default: 0)`);
}

function parseRenderArgs(args: string[]): number | IRenderArgs {
  let badArgs = false;
  const a = argParse(args, {
    string: ['output', 'loop', 'sequence'],
    boolean: ['help'],
    alias: { h: 'help', o: 'output', l: 'loop', s: 'sequence' },
    unknown: (_arg: string, key?: string) => {
      if (key) {
        console.error(`Unknown argument: -${key}`);
        badArgs = true;
        return false;
      }
      return true;
    },
  });
  if (badArgs) {
    return 1;
  }
  if (a.help) {
    printRenderHelp();
    return 0;
  }
  if (a._.length <= 0) {
    console.error('Missing input file');
    return 1;
  }
  if (a._.length > 1) {
    console.error('Can only have one input file');
    return 1;
  }
  const input = a._[0] as string;
  const output = a.output;
  const loop = parseFloat(a.loop || '3');
  const sequence = parseFloat(a.sequence || '0');
  if (isNaN(loop) || loop < 1) {
    console.error(`Bad loop value: ${a.loop}`);
    return 1;
  }
  if (isNaN(sequence)) {
    console.error(`Bad sequence value: ${a.sequence}`);
    return 1;
  }
  return {
    input,
    output: output ?? path.replaceExt(input, '.wav'),
    loop,
    sequence,
  };
}

function printGbaHelp() {
  console.log(`gvsong gba <input> [-o <output>] [-m <message>]

<input>        The input .sink or .gvsong file
-o <output>    The output file (default: input with .gba extension)
-m <message>   Messages to embed in the ROM (default: input filename)
               You can specify up to three messages:
                 -m 'Line 1' -m 'Line 2' -m 'Line 3'`);
}

function parseGbaArgs(args: string[]): number | IGbaArgs {
  let badArgs = false;
  // why does typescript hate the flags library?
  // deno-lint-ignore no-explicit-any
  const a: any = argParse(args, {
    string: ['output'],
    boolean: ['help'],
    collect: ['message'],
    alias: { h: 'help', o: 'output', m: 'message' },
    unknown: (_arg: string, key?: string) => {
      if (key) {
        console.error(`Unknown argument: -${key}`);
        badArgs = true;
        return false;
      }
      return true;
    },
  });
  if (badArgs) {
    return 1;
  }
  if (a.help) {
    printGbaHelp();
    return 0;
  }
  if (a._.length <= 0) {
    console.error('Missing input file');
    return 1;
  }
  if (a._.length > 1) {
    console.error('Can only have one input file');
    return 1;
  }
  const input = a._[0] as string;
  const output = a.output;
  const message = a.message
    ? a.message
    : ['', path.basename(input).replace(/\.(sink|gvsong)$/i, ''), ''];
  return {
    input,
    output: output ?? path.replaceExt(input, '.gba'),
    message,
  };
}

function printImageHelp() {
  console.log(`gvsong image <input> [-o <output>] [-s <sequence>] [-c <channels>] [-b] [-v]

<input>        The input .sink or .gvsong file
-o <output>    The output file (default: input with .png extension)
-s <sequence>  The sequence to draw (default: 0)
-c <channels>  The channels to draw (comma separated, ex: 0,1,2 -- default: all)
-b             Show pitch bends (default: false)
-v             Show volume envelopes (default: false)`);
}

function parseImageArgs(args: string[]): number | IImageArgs {
  let badArgs = false;
  const a = argParse(args, {
    string: ['output', 'sequence', 'channels'],
    boolean: ['help', 'bend', 'volume'],
    alias: { h: 'help', o: 'output', s: 'sequence', c: 'channels', b: 'bend', v: 'volume' },
    unknown: (_arg: string, key?: string) => {
      if (key) {
        console.error(`Unknown argument: -${key}`);
        badArgs = true;
        return false;
      }
      return true;
    },
  });
  if (badArgs) {
    return 1;
  }
  if (a.help) {
    printImageHelp();
    return 0;
  }
  if (a._.length <= 0) {
    console.error('Missing input file');
    return 1;
  }
  if (a._.length > 1) {
    console.error('Can only have one input file');
    return 1;
  }
  const input = a._[0] as string;
  const output = a.output;
  const sequence = parseFloat(a.sequence || '0');
  if (isNaN(sequence)) {
    console.error(`Bad sequence value: ${a.sequence}`);
    return 1;
  }
  const channels = (a.channels || '0,1,2,3,4,5,6,7,8,9,10').split(',').map((ch) =>
    parseInt(ch, 10)
  );
  if (channels.some(isNaN)) {
    console.error(`Bad channels list: ${a.channels}`);
    return 1;
  }
  const bend = !!a.bend;
  const volume = !!a.volume;
  return {
    input,
    output: output ?? path.replaceExt(input, '.png'),
    channels,
    sequence,
    bend,
    volume,
  };
}

export async function main(args: string[]): Promise<number> {
  if (args.length <= 0 || args[0] === '-h' || args[0] === '--help') {
    printVersion();
    console.log('');
    printHelp();
    return 0;
  } else if (args[0] === '-v' || args[0] === '--version') {
    printVersion();
    return 0;
  } else if (args[0] === 'make') {
    const makeArgs = parseMakeArgs(args.slice(1));
    if (typeof makeArgs === 'number') {
      return makeArgs;
    }
    return await make(makeArgs);
  } else if (args[0] === 'render') {
    const renderArgs = parseRenderArgs(args.slice(1));
    if (typeof renderArgs === 'number') {
      return renderArgs;
    }
    return await render(renderArgs);
  } else if (args[0] === 'gba') {
    const gbaArgs = parseGbaArgs(args.slice(1));
    if (typeof gbaArgs === 'number') {
      return gbaArgs;
    }
    return await gba(gbaArgs);
  } else if (args[0] === 'image') {
    const imageArgs = parseImageArgs(args.slice(1));
    if (typeof imageArgs === 'number') {
      return imageArgs;
    }
    return await image(imageArgs);
  }
  return 0;
}
