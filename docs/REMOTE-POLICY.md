# Remote policy

This repository is local-only until a human decides otherwise.

- Do not run `gh repo create`.
- Do not `git remote add origin` pointing at a public GitHub URL.
- Do not flip visibility on `nstranquist/nicos-flags`.
- Do not push.

`git remote -v` should print nothing, or only a note remote that is not a
public product URL.

Local gate before any human push:

```sh
make publish-ready
```

That target runs `make verify`, the denylist, and gitleaks. It does not
create remotes.

When a human is ready to publish: re-run `make publish-ready`, signed-out
README review, then create a **new** public repository. Do not reuse the
private operator remote.
