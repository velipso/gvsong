#!/usr/bin/env -S deno run --check=all --allow-read --allow-write
//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.fun
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import { main } from './cli/main.ts';
Deno.exit(await main(Deno.args));
