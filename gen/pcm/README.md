# PCM Samples

The gvsong engine includes the samples in this directory. These can be accessed in .sink scripts
using the `pcm` namespace.

For example, to use `002-snare1.wav`, put the value `pcm.snare1` in your PCM mapping:

```
...
{
  // PCM mapping (120 entries)
  pcm.snare1, // entry 001
  pcm.kick1,  // entry 002
  // ... 118 more entries ...
},
...
```

The sample can now be accessed in patterns by setting the instrument to `PCM`, and playing the note
corresponding to the index in the PCM table (starting at `001`):

```
`
// plays entry 001 (snare1)
00  001:PCM  ---:---  ---:---  ---:---  ---:---  ---:---
// plays entry 002 (kick1)
08  002:PCM  ---:---  ---:---  ---:---  ---:---  ---:---
10  END:---  ---:---  ---:---  ---:---  ---:---  ---:---
`
```

Do not confuse the wave index (`001-kick1.wav` starts with `001`) with the PCM mapping (entry `001`
is set to `pcm.snare1`). The wave index is ignored -- only the PCM mapping matters.
