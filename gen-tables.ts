#!/usr/bin/env -S deno run --check=all --allow-read --allow-write
//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

//
// This script will generate the lookup tables used by the rest of the library
//

const dutyCount = 8;
const lowpassTable = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];
const maxPhaseBits = 11;
const maxPhase = 1 << maxPhaseBits;
const maxRndSample = 1 << 15;

function generateOscillator(
  duty: number,
  square: number,
  sine: number,
  saw: number,
  triangle: number,
  lowpass: number
) {
  // duty      0 - 1
  // square    0 - 1
  // sine      0 - 1
  // saw       0 - 1
  // triangle  0 - 1
  // lowpass   0 - 9
  const real = Array.from({length: 1024}).map(() => 0);
  const imag = Array.from({length: 1024}).map(() => 0);
  if (duty < 0.5) {
    duty = 1 - duty
  }
  // v1: https://www.desmos.com/calculator/jztbyinfbz  (equal area square wave)
  // v2: https://www.desmos.com/calculator/adyrewgqco  (max amplitude square wave)
  const max = 1024 * Math.pow(2, -lowpass);
  for (let n = 1; n < max; n++) {
    const n_pi = n * Math.PI;
    const pi_factor = 2 / n_pi;
    const b_sine = n === 1 ? 1 : 0;
    const a_square = pi_factor * Math.sin(duty * 2 * n_pi);
    const sinterm = Math.sin(duty * n_pi);
    const b_square = pi_factor * 2 * sinterm * sinterm;
    const b_saw = pi_factor * ((n % 2) === 1 ? 1 : -1);
    const b_triangle = ((n % 2) == 1)
      ? 2 * (pi_factor * pi_factor) * (
        (Math.floor((n - 1) / 2) % 2) === 1 ? -1 : 1
      )
      : 0;
    real[n] = square * a_square;
    imag[n] =
      square * b_square +
      sine * b_sine +
      saw * b_saw +
      triangle * b_triangle;
  }
  real[0] = (2 * duty - 1) * square
  return {real, imag}
}

function addWave(
  d: number[],
  name: string,
  duty: number,
  square: number,
  sine: number,
  saw: number,
  triangle: number
) {
  for (const lowpass of lowpassTable) {
    console.log(name, lowpass);
    const {real, imag} =
      generateOscillator(duty, square, sine, saw, triangle, lowpass);
    for (let x = 0; x < maxPhase; x++) {
      let v = 0;
      const xp = x * Math.PI * 2 / maxPhase;
      for (let i = 0; i < real.length; i++){
        v += imag[i] * Math.sin(xp * i) + real[i] * Math.cos(xp * i);
      }
      d.push(v);
    }
  }
}

function whisky1(i0: number){
  const z0 = Math.imul(i0, 1831267127) ^ i0;
  const z1 = Math.imul(z0, 3915839201) ^ (z0 >>> 20);
  const z2 = Math.imul(z1, 1561867961) ^ (z1 >>> 24);
  return z2 < 0 ? z2 + 4294967296 : z2;
}

const waves: number[] = [];
for (let duty = 0; duty < dutyCount; duty++){
  addWave(waves, `sq${duty + 1}`, (duty + 1) / (2 * dutyCount), 1, 0, 0, 0);
}
addWave(waves, 'tri', 0, 0, 0, 0, 1);
addWave(waves, 'saw', 0, 0, 0, 1, 0);
addWave(waves, 'sin', 0, 0, 1, 0, 0);
console.log('rnd');
for (let i = 0; i < maxRndSample; i++){
  const r = whisky1(i + 1) / 4294967295;
  waves.push(r * 2 - 1);
}

const cliOutput = new URL('./cli/tables.json', import.meta.url).pathname;
console.log(`Writing tables to: ${cliOutput}`);
await Deno.writeTextFile(cliOutput, JSON.stringify(waves));

const wavesBytes: number[] = [];
for (const v of waves){
  const v2 = Math.min(32767, Math.max(-32768, Math.round(v * (v < 0 ? 16384 : 16383))));
  const v3 = v2 < 0 ? v2 + 65536 : v2;
  wavesBytes.push(v3 & 0xff);
  wavesBytes.push((v3 >> 8) & 0xff);
}
const gbaOutput = new URL('./gba/tables.bin', import.meta.url).pathname;
console.log(`Writing tables to: ${gbaOutput}`);
await Deno.writeFile(gbaOutput, new Uint8Array(wavesBytes));