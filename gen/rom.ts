#!/usr/bin/env -S deno run --check=all --allow-read --allow-write --allow-run
//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

//
// This script will generate the rom.json file from gba/main.gvasm
//

try {
  const gv = await Deno.run({ cmd: ['gvasm', '--version'], stdout: 'piped', stderr: 'piped' });
  if (!(await gv.status()).success) {
    throw '`gvasm --version` failed to execute';
  }
  const output = new TextDecoder().decode(await gv.output()).match(/Version: (\d+)\.\d+\.\d+\b/);
  if (!output) {
    throw '`gvasm --version` did not report a version';
  }
  if (output[1] !== '2') {
    throw `Bad version for gvasm; required v2 but got v${output[1]}`;
  }
} catch (e) {
  if (typeof e !== 'string') {
    console.error(e);
  }
  console.error(`Failed to find gvasm v2 -- install by visiting:
  https://github.com/velipso/gvasm`);
  if (typeof e === 'string') {
    console.error(`Error: ${e}`);
  }
  Deno.exit(1);
}

const mainGvasm = new URL('../gba/main.gvasm', import.meta.url).pathname;
const make = await Deno.run({ cmd: ['gvasm', 'make', mainGvasm] });
await make.status();
const rom = await Deno.readFile(new URL('../gba/main.gba', import.meta.url).pathname);
const romOutput = new URL('../cli/rom.json', import.meta.url).pathname;
console.log(`Writing rom to: ${romOutput}`);
await Deno.writeTextFile(romOutput, JSON.stringify(Array.from(rom)));
