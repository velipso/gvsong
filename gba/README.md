Building Instructions
=====================

The empty ROM is checked into the repo as `main.bin`.  In order to create a demo ROM, the filename
and `song.gvsong` is simply concatenated at the end of `main.bin` to produce `song.gba`.

You can build `main.bin` by using [gvasm](https://github.com/velipso/gvasm).

NOTE: Make sure you are using the `v2` branch of gvasm.  At the time of writing, this is still in
beta, so you will need to [switch to the branch manually](https://github.com/velipso/gvasm/tree/v2).

Now you can make `main.bin` via:

```
gvasm make gba/main.gvasm -o gba/main.bin
```
