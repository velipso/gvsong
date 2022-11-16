Building Instructions
=====================

The empty ROM is checked into the repo as `cli/rom.json`.  In order to create a demo ROM, the
messages and `song.gvsong` is simply concatenated at the end of the data to produce `song.gba`.

You can build `rom.json` by first installing [gvasm](https://github.com/velipso/gvasm).

Now you can make `rom.json` via `./gen/rom.ts` in the root of the repo.
