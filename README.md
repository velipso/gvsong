gvsong
======

Music engine for the Game Boy Advance written in [gvasm](https://github.com/velipso/gvasm) assembly.
Includes a CLI tool for rendering songs at high-resolution and generating test GBA ROMs.

Install
=======

You'll need to install [deno](https://deno.land) on your operating system.

Then run:

```bash
# install the latest release of deno
deno upgrade

# install the latest release of gvsong
deno install -g --allow-read --allow-write -f -r \
  https://raw.githubusercontent.com/velipso/gvsong/main/gvsong.ts
```

If this is your first time running `deno install`, you will need to add the deno binary directory to
your path.  See the page on [deno install](https://deno.land/manual@v1.27.2/tools/script_installer)
for more information.

In order to upgrade, simply run the above command again -- it will redownload the latest version and
install it.

Run the tool via:

```bash
gvsong --help
```

Usage
=====

```bash
gvsong render demo/song0.sink
```

This will create `demo/song0.wav`, which is a high-resolution version of the song, useful for
testing and soundtracks.

```bash
gvsong gba demo/song0.sink
```

This will create `demo/song0.gba`, which can be loaded in an emulator or flash cart.  It uses the
sound engine to play the same song.

```bash
gvsong image demo/song0.sink
```

This will create `demo/song0.png`, which draws the notes to a piano roll.

```bash
gvsong make demo/song0.sink
```

This will create the binary `demo/song0.gvsong`, which can be embedded in a game using the sound
engine.

Song Source Format
==================

Source files use a modified version of the [sink](https://github.com/velipso/sink) scripting
language.  [Read this tutorial](https://github.com/velipso/gvasm/blob/v2/docs/assembler/script.md)
for more information on the sink language.

That being said, writing a basic song doesn't require much knowledge of sink.  A song will have
the basic structure:

```
include 'gvsong'

gvsong {
  // instruments
}, {
  // PCM mapping
}, {
  // sequences
}, {
  // patterns
}
```

An instrument defines a wave type (square, triangle, etc), volume envelope, and pitch envelope.  A
song can have up to 64 instruments.

A special PCM instrument exists in order to play samples directly (like kick or snare drum samples).
The PCM mapping will map the 120 notes available to a PCM sample index.  Use zero to set the entry
to silence.

A sequence is just a list of pattern numbers, and a loop point.  This defines what order the
patterns are played back.  A song can have up to 255 sequences.

Patterns are the basic building block of a song, and define the notes played back on each channel,
and any effects.  A song can have up to 65535 patterns.

Instruments
-----------

An instrument consists of a wave type, volume envelope, and pitch envelope.

A wave type can be:

| Type       | Description             |
|------------|-------------------------|
| `wave.rnd` | Random noise            |
| `wave.sq1` | Square wave (1/16 duty) |
| `wave.sq2` | Square wave (2/16 duty) |
| `wave.sq3` | Square wave (3/16 duty) |
| `wave.sq4` | Square wave (4/16 duty) |
| `wave.sq5` | Square wave (5/16 duty) |
| `wave.sq6` | Square wave (6/16 duty) |
| `wave.sq7` | Square wave (7/16 duty) |
| `wave.sq8` | Square wave (8/16 duty) |
| `wave.tri` | Triangle wave           |
| `wave.saw` | Saw wave                |
| `wave.sin` | Sine wave               |
| `wave.ds1` | Distorted triangle wave |
| `wave.ds2` | Distorted square wave   |

An envelope is a list of values per frame, with optional `LOOP` and `EXIT` markers.

The volume envelope values should range from 0 to 16.

The pitch envelope values should range from -128 to 127.  There are 16 steps between notes, so
bending up a perfect fifth would be 112 (7 * 16).

Example:

```
include 'gvsong'

gvsong {
  // instruments
  { // I01 Square 50% duty

    // wave:
    wave.sq8,

    // volume envelope:
    {16, 15, 14, 13, LOOP, 12, 11, EXIT, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1},

    // pitch envelope:
    {0, 0, 0, 0, 0, 0, 0, 0, LOOP, 0, 1, 2, 1, 0, -1, -2, -1, EXIT, 0}
  },
  { // I02 Hat
    wave.rnd,
    {16, 14, 12, 10, 8, 6, 4, 2},
    {}
  }
}, {
  ...
```

When a note is played, an envelope will march through the values once per frame.  The `LOOP` and
`EXIT` locations aren't values -- they are markers.

If the note is held down long enough, when the `EXIT` location is passed over, the envelope will
loop back to the `LOOP` location.

For example, the square wave will use the volume envelope: 16, 15, 14, 13, 12, 11, 12, 11, 12, ...
and keep repeating (12, 11) until the note is released.  Once released, the envelope will continue
over the `EXIT` without looping.

One thing to notice is that instruments start counting at `I01` (ranging from `I01` to `I64`,
decimal).  This is because there is a special instrument `I00` that mutes the channel.

PCM Mapping
-----------

The PCM map will allow you map a note to a PCM sample.  There are 120 slots available (`001`-`120`).

[Check the PCM directory](./gen/pcm) for a list of samples included in gvsong.

```
include 'gvsong'

gvsong {
  // instruments
}, {
  // PCM mapping
  pcm.kick1,  // 001
  pcm.snare1, // 002
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,       // 003-012
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 013-024
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 025-036
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 037-048
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 049-060
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 061-072
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 073-084
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 085-096
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 097-108
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0  // 109-120
}, {
  ...
```

Once a sample has been mapped, it can be played back by selecting the `PCM` instrument, and playing
the appropriate note (ex: `002`).

```
...
30  002:PCM  ---:---  ---:---  ---:---  ---:---  ---:---
...
```

Sequences
---------

A sequence is a list of pattern indexes, with optional `LOOP` and `EXIT` markers, like envelopes.

For example:

```
include 'gvsong'

gvsong {
  // instruments
}, {
  // PCM mapping
}, {
  // sequences
  {0, 1, 2, LOOP, 3, 4},
  {0, LOOP, 1, 2, EXIT, 3, 4}
}, {
  ...
```

This song defines two sequences.  The first sequence plays patterns 0, 1, 2, 3, 4, 3, 4, 3, 4, ...
continuing with (3, 4) forever.  The second sequence plays 0, 1, 2, 1, 2, ... continuing with (1, 2)
forever.

The `EXIT` sequence will never play in a game, but it will play when rendering to a .wav or .png
file.

Most songs have a single sequence, but for video games it might be useful to have slightly different
sequences for different situations.

Patterns
--------

Patterns define the note and effect data played back per channel.

Songs have 6 monophonic channels.  Any channel can use any instrument, and operate independently of
each other, with identical features.

It's easiest to start with an example:

```
  ...
}, {
  // patterns
`
//
// Pattern 0 - Setup
//
00  ---:I01  ---:I02  ---:I01  ---:---  ---:---  ---:---
00  END:060  ---:---  ---:---  ---:---  ---:---  ---:---
`,
`
//
// Pattern 1
//
00  C-4:---  ---:---  ---:E-5  ---:---  ---:---  ---:---
00  C-5:B16  ---:---  ---:---  ---:---  ---:---  ---:---
04  ---:---  C-5:---  ---:OFF  ---:---  ---:---  ---:---
05  ---:---  C-6:---  ---:---  ---:---  ---:---  ---:---
06  ---:---  C-7:---  ---:---  ---:---  ---:---  ---:---
07  ---:---  C-8:---  ---:---  ---:---  ---:---  ---:---
08  ---:---  C-9:---  ---:F-5  ---:---  ---:---  ---:---
0C  ---:---  ---:---  ---:OFF  ---:---  ---:---  ---:---
10  END:---  OFF:END  ---:---  ---:---  ---:---  ---:---
`
}
```

First, notice that patterns are multiline strings enclosed in backticks (\`), and separated by
commas.

Patterns can contain comments using `//` just like regular source code, and empty lines are ignored.

A pattern is a list of timestamps, notes, and effects in columns.  The columns are separated by two
spaces between channels.

### Timestamps

The first column is the timestamp, written in extended hexadecimal, measuring sixteenth notes.

Patterns *must* start with timestamp `00`.

Timestamps can increase irregularly, which might seem strange.  For example, Pattern 1 above has
multiple instructions at time `00`.  This alleviates the need to jam instructions on a single
line -- it's okay to have multiple rows.

Also notice that there is a run `04`, `05`, `06`, `07`, `08` of sixteenth notes, but the next
command is at `0C`, skipping rows `09`, `0A`, and `0B`.

Rows that do nothing (full of `---:---`) will be removed automatically to save space, so feel free
to use them if you want to space things out in source code.

Timestamps are always two characters.  The first character is the beat, and the second character is
the sixteenth note in that beat.

In order to allow more than 16 beats in a pattern, the timestamp extends hexadecimal to allow more
letters for the first character.

For example, `00` is the first beat, `F0` is the 16th beat, `G0` is the 17th beat, `H0` is the 18th
beat, etc, up to `ZF` for the 36th beat, last sixteenth note.

### Channel Instructions

After the timestamp is six instructions, one for each channel.

An instruction is divided into the note and the effect, in the format `note:effect`.

The note can range from `C-0` to `B-9`, and use `#` or `b` for sharps and flats.  For example,
`F#5` is F#, octave 5.  Tuning is based on `A-4` set to 440Hz.

Notes can also be expressed as a three digit decimal number, from `001` (`C-0`) to `120` (`B-9`).
It's easiest to use this format when playing back PCM samples.

The note field can also contain special values: `---` for no event, `OFF` for note off (triggering
release), `000` for note stop (skipping release), and `END` for pattern end.

The effect field can have the following commands.  All parameters are in decimal.

| Command | Description                              |
|---------|------------------------------------------|
| `---`   | No effect                                |
| `Vxx`   | Set volume `V00`-`V64`                   |
| `Dxx`   | Set delay `D00`-`D64` (frames)           |
| `Ixx`   | Set instrument `I00`-`I64`               |
| `PCM`   | Set instrument to PCM                    |
| `Bxx`   | Start bend `B00`-`B64` (sixteenth notes) |
| `xxx`   | Set tempo `045`-`202` (beats per min)    |
| `END`   | End pattern                              |

#### Volume

Using `V00` will mute the channel.  `V64` is maximum volume.  Channels are initialized to 50%
volume, `V32`.

#### Delay

Delay is useful for creating echo effects.  The delay is measured in frames, so tempo will not
affect it.  Delay will postpone note on, note off, note stop, and bend commands.  Use `D00` to
disable delay.

#### Instrument

Instruments `I01`-`I64` are defined by the song.  Instrument `I00` is a special instrument that
mutes the channel.

The `PCM` instrument is special, and will use the PCM mapping to convert notes to samples.

#### Bending

Notes can be bent using `B00`-`B64`.

Note bending is unique in that it doesn't trigger a new note; instead, it initiates a bend so that
the channel reaches the destination note in the specified number of sixteenth notes.

For example:

```
00  C-4:---  ---:---  ---:---  ---:---  ---:---  ---:---
00  C-5:B08  ---:---  ---:---  ---:---  ---:---  ---:---
10  C-4:B02  ---:---  ---:---  ---:---  ---:---  ---:---
...
```

`C-4` will trigger at the start of the pattern, and begin bending upwards immediately.  After a half
a beat (at time `08`), it will arrive at `C-5`.  It will hold `C-5` until `10`, when it begins
bending downwards.  At `12` it will arrive back at `C-4`, and hold there. (until `OFF` or another
note trigger).

#### Tempo

The tempo ranges from `045` to `202`.

However, many tempos are not possible, so instead the song will pick the closest available tempo.

The actual tempos available are:

| | | | | | | | |
|-|-|-|-|-|-|-|-|
| 44.99 | 65.00 |  84.96 | 104.95 | 124.97 | 144.93 | 164.77 | 184.78 |
| 47.51 | 67.46 |  87.54 | 107.57 | 127.44 | 147.40 | 167.44 | 187.46 |
| 49.99 | 70.01 |  89.98 | 110.08 | 130.00 | 149.97 | 170.19 | 190.22 |
| 52.47 | 72.46 |  92.56 | 112.48 | 132.66 | 152.62 | 172.46 | 192.34 |
| 54.98 | 74.98 |  94.93 | 114.98 | 135.09 | 154.91 | 174.79 | 195.24 |
| 57.49 | 77.45 |  97.44 | 117.59 | 137.60 | 157.26 | 177.80 | 197.48 |
| 60.02 | 79.97 | 100.08 | 120.04 | 139.83 | 160.18 | 180.28 | 199.76 |
| 62.49 | 82.52 | 102.45 | 122.60 | 142.53 | 162.70 | 182.18 | 202.11 |

The exact formula is: `983040 / (19 * Math.round(393216 / (19 * (i + 18))))` for `i` ranging from
0 to 63.

So if you want a tempo of 120, use the effect `120`, and the song will playback at
120.04396141164978 beats per minute.

### Pattern END

The note or effect can contain `END`, which signifies the end of the pattern.  The `END` row does
not consume any time, and will immediately process the commands at the top of the next pattern in
the sequence.

Only one `END` instruction needs to exist, but it's fine to have multiple `END` on the same line.

Be aware it is possible to create an infinite loop jumping between patterns without any note data,
so don't do that! :-)
