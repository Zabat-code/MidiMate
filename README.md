# MidiMate

A web piano application built with Vite (vanilla JS, no UI framework) and Vitest
for tests. It combines a piano keyboard, MIDI playback, a falling-notes roll, a
musical staff, a synthesizer, and in-browser video recording.

## Status

**Work in progress.** The project is functional (build passes, tests pass), but
it is still under active development. APIs and UI may change.

## Getting started

- Double-click `start_piano_app.bat` (installs dependencies if missing and starts
  `npm run dev`).
- Or manually:
  - `npm install`
  - `npm run dev` (the browser opens automatically)
- Tests: `npm test`
- Build: `npm run build`

> Note: the bundled `.npmrc` sets `include=dev` so devDependencies install even
> when `NODE_ENV=production`. Do not remove that line.

## Project layout

```
src/
  audio.js        Audio graph (lazy AudioContext)
  config.js       Default settings
  controls/       Keyboard, transport, drawer, tracks, playback
  humanize.js     Timing humanization
  i18.js          UI strings (internationalization)
  midi.js         MIDI loading/parsing
  onboarding.js   First-run tour
  playlist.js     Playlist management
  recording.js    In-browser video export
  report.js       Session reporting
  theory.js       Note naming / music theory helpers
  ui/             Canvas rendering (keys, roll, staff)
```

## License

MIT with a Non-Commercial restriction. See [LICENSE](./LICENSE).
You may use, modify, and share this software for **non-commercial** purposes
only. Commercial use requires explicit written permission from the copyright
holder.
