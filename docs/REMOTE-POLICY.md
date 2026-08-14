# Remote policy

This repository is local-only until a human decides otherwise.

- Do not run `gh repo create`.
- Do not `git remote add origin` pointing at a public GitHub URL.
- Do not flip visibility on `nstranquist/nicos-flags`.
- Do not push.

`git remote -v` should print nothing, or only a note remote that is not a
public product URL.

When a human is ready to publish: secret scan, denylist grep from
`~/dev/nicos-flags/docs/flag-eval-extract.md`, signed-out README review,
then create a **new** public repository. Do not reuse the private operator
remote.
