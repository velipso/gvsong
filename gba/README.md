Building Instructions
=====================

The empty ROM is checked into the repo as `cli/rom.json`.  In order to create a demo ROM, the
messages and `song.gvsong` is simply concatenated at the end of the data to produce `song.gba`.

You can build `rom.json` by first installing [gvasm](https://github.com/velipso/gvasm).

NOTE: Make sure you are using the `v2` branch of gvasm.  At the time of writing, this is still in
beta, so you will need to [switch to the branch manually](https://github.com/velipso/gvasm/tree/v2).

Now you can make `rom.json` via `./gen-rom.ts` in the root of the repo.
