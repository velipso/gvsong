#!/usr/bin/env -S deno run --check=all --allow-read --allow-write
//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

//
// This script will generate the PCM tables used by the rest of the library
//

const files: string[] = [];
for await (const f of Deno.readDir(new URL('../gen/pcm', import.meta.url).pathname)) {
  if (f.isFile && f.name.endsWith('.wav')) {
    files.push(f.name);
  }
}
files.sort((a, b) => a.localeCompare(b));

const meta: { name: string; offset: number; size: number }[] = [{
  name: 'silence',
  offset: 0,
  size: 0,
}];
const waves: number[] = [];
let wi = 1;
for (const file of files) {
  const data = await Deno.readFile(new URL(`../gen/pcm/${file}`, import.meta.url).pathname);
  const name = file.match(/^(\d\d\d)-(.+)\.wav$/);
  if (!name) {
    throw new Error(`Bad name, doesn't match XXX-name.wav: ${file}`);
  }
  if (parseInt(name[1], 10) !== wi) {
    throw new Error(`Bad name, misnumbered: ${file}`);
  }
  console.log(file);
  let di = 0;
  const u8 = () => {
    if (di >= data.length) {
      throw new Error(`Out of data for file: ${file}`);
    }
    const res = data[di];
    di++;
    return res;
  };
  const u16 = () => {
    const a = u8();
    const b = u8();
    return (b * (1 << 8)) + a;
  };
  const i16 = () => {
    const a = u16();
    return a >= (1 << 15) ? a - (1 << 16) : a;
  };
  const u32 = () => {
    const a = u8();
    const b = u8();
    const c = u8();
    const d = u8();
    return (d * (1 << 24)) + (c * (1 << 16)) + (b * (1 << 8)) + a;
  };

  if (u32() !== 0x46464952) { // 'RIFF'
    throw new Error(`Invalid data: ${file}`);
  }
  u32(); // size
  if (u32() !== 0x45564157) { // 'WAVE'
    throw new Error(`Invalid data: ${file}`);
  }

  while (true) {
    const type = u32();
    if (type === 0x20746d66) { // 'fmt '
      const size = u32();
      const fmt = u16();
      const channels = u16();
      const rate = u32();
      const rate2 = u32();
      u16(); // align
      const bits = u16();
      if (
        size !== 16 ||
        fmt !== 1 ||
        channels !== 1 ||
        rate !== 32768 ||
        rate2 !== 65536 ||
        bits !== 16
      ) {
        throw new Error(`Bad wave format; required 32768 sample rate, mono, 16-bits per sample`);
      }
    } else if (type === 0x61746164) { // 'data'
      break;
    }
  }
  const origSize = u32() >> 1;
  // all waves must be in steps of 608 samples
  const size = (origSize % 608) !== 0 ? origSize + 608 - (origSize % 608) : origSize;
  meta.push({
    name: name[2],
    offset: waves.length,
    size,
  });
  for (let i = 0; i < size; i++) {
    const v = i < origSize ? i16() : 0;
    waves.push(v / (v < 0 ? 32768 : 32767));
  }
  wi++;
}

const cliMetaOutput = new URL('../cli/pcm-meta.json', import.meta.url).pathname;
console.log(`Writing meta to: ${cliMetaOutput}`);
await Deno.writeTextFile(cliMetaOutput, JSON.stringify(meta));
const cliDataOutput = new URL('../cli/pcm-data.json', import.meta.url).pathname;
console.log(`Writing data to: ${cliDataOutput}`);
await Deno.writeTextFile(cliDataOutput, JSON.stringify(waves));

const gbaMetaOutput = new URL('../gba/pcm-meta.json', import.meta.url).pathname;
console.log(`Writing meta to: ${gbaMetaOutput}`);
await Deno.writeTextFile(
  gbaMetaOutput,
  JSON.stringify(meta.map(({ name, offset, size }) => [name, offset, size])),
);
const wavesBytes: number[] = [];
for (const v of waves) {
  const v2 = Math.min(32767, Math.max(-32768, Math.round(v * (v < 0 ? 16384 : 16383))));
  const v3 = v2 < 0 ? v2 + 65536 : v2;
  wavesBytes.push(v3 & 0xff);
  wavesBytes.push((v3 >> 8) & 0xff);
}
const gbaDataOutput = new URL('../gba/pcm-data.bin', import.meta.url).pathname;
console.log(`Writing data to: ${gbaDataOutput}`);
await Deno.writeFile(gbaDataOutput, new Uint8Array(wavesBytes));
