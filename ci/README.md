# Activating GitHub Actions

The two workflows in `github-workflows/` are the CI and release definitions for
this repository. They live here instead of `.github/workflows/` because the
credential that published this repository is a GitHub **OAuth App** token with
the `repo` scope, and GitHub refuses to let OAuth Apps create or update
workflow files without the `workflow` scope:

```text
! [remote rejected] main -> main (refusing to allow an OAuth App to create or
update workflow .github/workflows/ci.yml without `workflow` scope)
```

Until they are moved, no workflow runs. The plugin itself is unaffected: local
verification (`npm ci && npm test && npm run build`) passes.

## Activate (one minute, web UI)

1. Open <https://github.com/ban-sky/dsh-workbuddy/actions>.
2. Click **New workflow** → **set up a workflow yourself**, name it `ci.yml`,
   and paste the contents of [`github-workflows/ci.yml`](./github-workflows/ci.yml).
3. Repeat for `release.yml` with [`github-workflows/release.yml`](./github-workflows/release.yml).
4. Commit both files on `main`. The CI run starts automatically; the release
   workflow triggers when a `v*` tag matching `package.json` is pushed.

## Alternative: let a workflow-scoped credential push them

Re-authorize the publishing app with the `workflow` scope (or use a fine-grained
PAT with **Contents: write** and **Workflows: write**), then:

```sh
git add .github/workflows
git commit -m "ci: activate GitHub Actions"
git push
```

After activation, this `ci/` directory can be deleted.
