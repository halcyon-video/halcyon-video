# Contributing

Short version: **the source is open, the development is not. This project does
not accept pull requests.**

That is a deliberate choice, not an oversight, and it is not a judgement about
you or your patch. Halcyon Video is one person's product — built for one
living room, run 24/7 on one TV, and shared because it turned out well. Every
fixture in it exists because someone stood in front of it and said "that's
wrong". Keeping that judgement in one head is what makes it feel like a store
instead of a feature list. (SQLite runs the same way, and for the same reason.)

The GPL guarantees the part that matters: you have the code, and you can do
whatever you like with it — including take it somewhere I wouldn't. If you want
this project to go a different direction, **fork it**. That's not a brush-off;
it's the actual answer, and the license exists to make it a real one.

## What *is* welcome

- **Bug reports.** Especially with the F8 feedback capture: press F8 in the app
  and it saves the exact camera pose, the settings that were live, and a
  screenshot, so a report can be replayed shot-for-shot instead of guessed at.
- **Questions.** How something works, how to point it at your server, whether
  a thing is possible. Answering questions is not the same as taking patches,
  and I'm happy to do the first.
- **Showing me your store.** Screenshots of the app wearing someone else's
  brand are the best possible thing to get.

## What happens to pull requests

They get closed with a link to this file. Please don't take it personally, and
please don't spend an evening on a patch expecting it to land — that's the
outcome I'd most like to prevent, which is why this file is blunt.

## One hard rule, whatever the channel

**Do not send third-party brand assets.** No logos, wordmarks, vector traces,
typefaces, rental-wrap scans, or store photography belonging to a real chain —
not in an issue, not in an attachment, not "just for reference". This
repository ships none and never will; that's the whole reason the brand system
is a drop-in folder (`public/user-assets/`, git-ignored by design) instead of
something committed. Your recreation of the store you grew up in belongs on
your machine, and it will fit the seams exactly.

## If you're forking

The scene is modular on purpose: `src/three-scene.ts` is the spine
(renderer, render-on-demand loop, mode state) and every feature lives in a
`store-*.ts` module that takes the scene as its first parameter. New feature =
new module; new art = a file in an art slot (`public/user-assets/` — run
`node tools/list-slots.mjs` for the manifest); new fixture = a registry entry
plus a config placement. Performance is the prime directive: the app idles for
days, so no per-frame allocations, dispose GPU resources, instance repeats.
`npm run build` must pass (tsc + line budgets + signage-config validation)
before anything is real.
