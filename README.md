
## Moving the public base

Do this only in an authorized cutover window, with the daily pipeline idle.
The mirror rollout leaves `publicBaseUrl` on GitHub. Never hand-edit episode URLs.

1. Back up `feed.config.json`, `data/episodes.json`, and `feed.xml` outside the repo; record the previous base and HEAD.
2. Run `node feed-generator.cjs set-base --url https://pulse-podcast.7islands.network --dry-run`. Check self-hosted and untouched counts.
3. Run the same command without `--dry-run`. Inspect the diff: only self-hosted audioUrl values, config, feed links/image, lastBuildDate and new-feed-url may change. IDs/guids, titles, addedAt and external URLs must not change.
4. Deploy before pushing: `node ~/Applications/pulse/scripts/podcast-mirror.cjs --feed-repo "$PWD"` (uses the pipeline Cloudflare token; only public files are staged).
5. Sweep every self-hosted enclosure on the new host: require HTTP 200 and an audio Content-Type, not just the latest MP3.
6. Commit and push the reviewed cutover result. This also publishes GitHub Pages in parallel.
7. Verify both `/feed.xml` endpoints: HTTP 200, same item count, latest episode exactly once, all self-hosted URLs on the new base, stable guids. Verify the publish guard with `--dry-run`.
8. Roll back using `set-base --url <previous-base>`, deploy, sweep, commit and push; verify both feeds again. Retain the backups. Never retire GitHub Pages as part of this procedure.
