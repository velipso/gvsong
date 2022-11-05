gvsong
======

Music engine for the Game Boy Advance written in gvasm assembly.  Includes a CLI tool for rendering
songs at high-resolution.

CLI Usage
=========

You'll need to install [deno](https://deno.land) on your operating system.

Then run:

```
# install the latest release of deno
deno upgrade

# install the latest release of gvasm
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
