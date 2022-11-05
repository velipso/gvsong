//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { IMakeArgs, make } from './make.ts';
import { IRenderArgs, render } from './render.ts';
import { argParse, Path } from './deps.ts';

function printVersion() {
  console.log(`gvsong - Builds and renders songs designed for Game Boy Advance
by Sean Connelly (@velipso), https://sean.cm
Project Home: https://github.com/velipso/gvsong
SPDX-License-Identifier: 0BSD
Version: 0.1`);
}

function printHelp() {
  console.log(`gvsong <command> [<args...>]

Command Summary:
  make      Convert a .sink song to a .gvsong binary file
  render    Render a .sink or .gvsong into a high-resolution .wav file

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
    output: output ?? (new Path()).replaceExt(input, '.gvsong'),
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
  if (isNaN(loop)) {
    console.error(`Bad loop value: ${a.loop}`);
    return 1;
  }
  if (isNaN(sequence)) {
    console.error(`Bad sequence value: ${a.sequence}`);
    return 1;
  }
  return {
    input,
    output: output ?? (new Path()).replaceExt(input, '.wav'),
    loop,
    sequence
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
  }
  return 0;
}
