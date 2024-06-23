#!/usr/bin/env -S deno run --check=all --allow-read --allow-write --allow-run
//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.fun
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

//
// This script will generate the rom.json file from gba/main.gvasm
//

try {
  const gvCmd = new Deno.Command('gvasm', {
    args: ['--version'],
  });
  const gv = await gvCmd.output();
  if (!gv.success) {
    throw '`gvasm --version` failed to execute';
  }
  const output = new TextDecoder().decode(gv.stdout).match(/Version: (\d+)\.\d+\.\d+\b/);
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
const makeCmd = new Deno.Command('gvasm', {
  args: ['make', mainGvasm],
});
const make = await makeCmd.output();
if (!make.success) {
  console.error('Failed to assemble ROM');
  Deno.exit(1);
}
const rom = await Deno.readFile(new URL('../gba/main.gba', import.meta.url).pathname);
const romOutput = new URL('../cli/rom.json', import.meta.url).pathname;
console.log(`Writing rom to: ${romOutput}`);
await Deno.writeTextFile(romOutput, JSON.stringify(Array.from(rom)));
