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

async function checkGvasm(cmd: string) {
  try {
    const gv = await Deno.run({ cmd: [cmd, '--version'], stdout: 'piped', stderr: 'piped' });
    if (!(await gv.status()).success) {
      return false;
    }
    const output = new TextDecoder().decode(await gv.output()).match(/Version: (\d+)\.\d+\.\d+\b/);
    return output && output[1] === '2';
  } catch (_e) {
    return false;
  }
}

const gvasm = (await checkGvasm('gvasm'))
  ? 'gvasm'
  : (await checkGvasm('gvasm2'))
  ? 'gvasm2'
  : false;

if (!gvasm) {
  console.error(`Missing gvasm v2 -- please install by visiting:
  https://github.com/velipso/gvasm`);
  Deno.exit(1);
}

const mainGvasm = new URL('../gba/main.gvasm', import.meta.url).pathname;
const make = await Deno.run({ cmd: [gvasm, 'make', mainGvasm] });
await make.status();
const rom = await Deno.readFile(new URL('../gba/main.gba', import.meta.url).pathname);
const romOutput = new URL('../cli/rom.json', import.meta.url).pathname;
console.log(`Writing rom to: ${romOutput}`);
await Deno.writeTextFile(romOutput, JSON.stringify(Array.from(rom)));
