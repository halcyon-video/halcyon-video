# Release screenshots

One picture per release, named for its tag: `v0.9.0.jpg`.

`.github/workflows/announce.yml` looks here **first** when it announces a
release to Discord, Mastodon, Bluesky and X. If it finds `<tag>.jpg` it uses
it; if it does not, it logs a warning and falls back to a generic wide view of
the store from `docs/screenshots/`.

That fallback exists so a release can never be blocked by a missing image — it
is not the goal. **A generic photo of the store shows nothing about what
shipped.** If a release adds VR walk mode, the announcement has to show VR walk
mode, or the post is doing no work: people scroll past a wall of text, and they
scroll past a picture they have already seen.

## The hosted changelog

Everything in this directory is also published as the project's changelog
website, beside the browser demo at `<site>/changelog/`, with one page per
release (`<site>/changelog/<tag>/`). The Discord release post links that page.
`.github/workflows/deploy-demo.yml` builds it with
`tools/build-changelog-site.mjs` from:

- `<tag>.md`: the written notes, shown in full;
- `<tag>.jpg`: the headline shot, at the top of the page;
- `<tag>/*.jpg`: every further shot, in a gallery in file-name order, with an
  optional `<tag>/<name>.txt` beside a shot as its caption;
- the release's `CHANGELOG.md` entry, under "Every change".

So a release page shows the right pictures only if they are committed here
before the tag is pushed. One shot per headline change is the target.

Preview locally: `node tools/build-changelog-site.mjs --out scratch/changelog`.

## Cutting one

Take the shot in a clone that has the screenshot harness, framed on the single
change the release is named for, then save it here as `<tag>.jpg` and commit it
**before** pushing the tag — the workflow reads the tagged tree.

Rules for the image:

- **1600x900, JPEG, under 1,000,000 bytes.** Bluesky rejects a blob over a
  megabyte outright; a full-size PNG is roughly three. The announcer drops an
  oversize image rather than failing, so an overweight file means a silently
  pictureless post.
- **Shoot from a clone with no `public/user-assets/`.** Those drop-ins carry
  real-world brand marks and reference-derived art that must never appear in
  anything published. This is the project's standing screenshot rule and it has
  no exceptions.
- **Show the feature, not the furniture.** A wide framing that happens to
  contain the change is weaker than a framing that is about it.
