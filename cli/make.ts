//
// gvsong - Builds and renders songs designed for Game Boy Advance
// by Sean Connelly (@velipso), https://sean.cm
// Project Home: https://github.com/velipso/gvsong
// SPDX-License-Identifier: 0BSD
//

import * as sink from './sink.ts';
import { Path } from './deps.ts';
import { IEnvelope, Song } from './song.ts';

export interface IMakeArgs {
  input: string;
  output: string;
}

export interface IFileSystemContext {
  cwd: string;
  path: Path;
  fileType(filename: string): Promise<sink.fstype>;
  readTextFile(filename: string): Promise<string>;
  readBinaryFile(filename: string): Promise<Uint8Array>;
  log(str: string): void;
}

export function defaultFileSystemContext(): IFileSystemContext {
  return {
    cwd: Deno.cwd(),
    path: new Path(),
    fileType: async (file: string) => {
      const st = await Deno.stat(file);
      if (st !== null) {
        if (st.isFile) {
          return sink.fstype.FILE;
        } else if (st.isDirectory) {
          return sink.fstype.DIR;
        }
      }
      return sink.fstype.NONE;
    },
    readTextFile: Deno.readTextFile,
    readBinaryFile: Deno.readFile,
    log: (str) => console.log(str),
  };
}

export async function makeFromFile(input: string, fs: IFileSystemContext): Promise<Uint8Array> {
  const scr = sink.scr_new(
    {
      f_fstype: async (scr: sink.scr, filename: string): Promise<sink.fstype> => {
        return await fs.fileType(filename);
      },
      f_fsread: async (scr: sink.scr, file: string): Promise<boolean> => {
        try {
          const data = await fs.readBinaryFile(file);
          let text = '';
          for (const b of data) {
            text += String.fromCharCode(b);
          }
          await sink.scr_write(scr, text);
          return true;
        } catch (e) {
          return false;
        }
      },
    },
    fs.cwd,
    fs.path.posix,
    false,
  );
  sink.scr_addpath(scr, '.');

  sink.scr_incbody(scr, 'gvsong', `
    declare gvsong 'github.com/velipso/gvsong'
    var SUS = 'sus', REL = 'rel', LOOP = 'loop'
    enum sq1, sq2, sq3, sq4, sq5, sq6, sq7, sq8, tri, saw, sin, rnd
  `);

  if (!await sink.scr_loadfile(scr, input)) {
    const sinkErr = sink.scr_geterr(scr);
    if (sinkErr) {
      throw new Error(sinkErr);
    }
    throw new Error('Failed to run script');
  }

  const ctx = sink.ctx_new(scr, {
    f_say: async (_ctx, str) => {
      fs.log(str);
      return sink.NIL;
    },
    f_warn: async () => sink.NIL,
    f_ask: async () => sink.NIL,
    f_xlookup: () => {
      throw new Error('Not implemented');
    },
    f_xexport: () => {
      throw new Error('Not implemented');
    },
  });

  const song = new Song();
  let loadedSong = false;
  sink.ctx_native(
    ctx,
    'github.com/velipso/gvsong',
    null,
    async (ctx: sink.ctx, args: sink.val[]): Promise<sink.val> => {
      if (loadedSong) {
        throw new Error('Cannot define multiple songs');
      }
      loadedSong = true;
      if (args.length !== 4) {
        throw new Error(
          'Expecting 4 arguments: gvsong <instruments>, <pcm>, <sequences>, <patterns>');
      }

      const insts = args[0];
      if (!Array.isArray(insts)) {
        throw new Error('Expecting argument 1 to be a list of instruments');
      }
      if (insts.length >= 64) {
        throw new Error('Cannot have more than 64 instruments');
      }
      let i = 1;
      for (const inst of insts) {
        if (!Array.isArray(inst) || inst.length !== 3) {
          throw new Error(`Expecting {<wave>, <volumeEnv>, <pitchEnv>} for instrument ${i}`);
        }
        const [wave, volume, pitch] = inst;
        if (typeof wave !== 'number') {
          throw new Error(`Invalid wave for instrument ${i}: ${wave}`);
        }
        if (!Array.isArray(volume)) {
          throw new Error(`Invalid volume envelope for instrument ${i}: ${volume}`);
        }
        if (!Array.isArray(pitch)) {
          throw new Error(`Invalid pitch envelope for instrument ${i}: ${pitch}`);
        }
        song.addInstrument(wave, volume as IEnvelope, pitch as IEnvelope);
        i++;
      }

      const pcm = args[1];
      if (!Array.isArray(pcm) || pcm.length !== 120) {
        throw new Error('Expecting argument 2 to be a list of 120 PCM sample mappings');
      }
      if (pcm.some((p) => typeof p !== 'number')) {
        throw new Error('Expecting argument 2 to be a list of numbers');
      }
      song.setPCMMapping(pcm as number[]);

      const pats = args[3];
      if (!Array.isArray(pats) || pats.some((p) => typeof p !== 'string')) {
        throw new Error('Expecting argument 4 to be a list of patterns (strings)');
      }
      song.setPatterns(pats as string[]);

      const seqs = args[2];
      if (!Array.isArray(seqs)) {
        throw new Error('Expecting argument 3 to be a list of sequences');
      }
      for (let i = 0; i < seqs.length; i++) {
        const seq = seqs[i];
        if (!Array.isArray(seq)) {
          throw new Error(`Expecting sequence ${i} to be an array of pattern indexes`);
        }
      }
      song.setSequences(seqs as (number | 'loop')[][]);

      return sink.NIL;
    }
  );

  const run = await sink.ctx_run(ctx);
  if (run !== sink.run.PASS) {
    const sinkErr = sink.ctx_geterr(ctx);
    if (sinkErr) {
      throw new Error(sinkErr);
    }
    throw new Error('Failed to run script');
  }

  if (!loadedSong) {
    throw new Error('Song not exported via `gvsong`');
  }

  return song.toArray();
}

export async function make({ input, output }: IMakeArgs): Promise<number> {
  const data = await makeFromFile(input, defaultFileSystemContext());
  await Deno.writeFile(output, data);
  return 0;
}
