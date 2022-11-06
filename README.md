gvsong
======

Music engine for the Game Boy Advance written in gvasm assembly.  Includes a CLI tool for rendering
songs at high-resolution and generating test GBA ROMs.

Usage
=====

You'll need to install [deno](https://deno.land) on your operating system.

Then run:

```
# install the latest release of deno
deno upgrade

# install the latest release of gvsong
deno install --allow-read --allow-write -f -r \
  https://raw.githubusercontent.com/velipso/gvsong/main/gvsong.ts
```

If this is your first time running `deno install`, you will need to add the deno binary directory to
your path.

In order to upgrade, simply run the above command again -- it will redownload the latest version and
install it.

Run the tool via:

```
gvsong --help
```

Rendering a Demo
================

Try this:

```
gvsong render demo/song0.sink
```

This will render the song at high-resolution at `demo/song0.wav`.

Now, build a GBA ROM file:

```
gvsong gba demo/song0.sink
```

This will create `demo/song0.gba`, which uses the sound engine to play the same song.

Lastly, you can output the intermediate .gvsong file via:

```
gvsong make demo/song0.sink
```

This will create the binary `song0.gvsong`, which is what is loaded into memory by the GBA player.
