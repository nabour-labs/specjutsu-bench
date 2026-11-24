## Context

Workspaces symlink the bench's `node_modules`, and Vite resolves symlinks, so its stack frames point into the bench checkout by a path relative to the workspace.

## Goals / Non-Goals

**Goals:** the count of a run step doesn't depend on where the bench is checked out or how deep the temp directory is.

**Non-Goals:** normalising any other path.

## Decisions

- **Replace the bench checkout's path with `/bench`, absolute or `../`-relative.** The relative form is computed with `path.relative` from the workspace to the checkout, for the workspace and the checkout each as given and as its realpath, and replaced exactly. Rejected: a `(../)+<path>` pattern, which misses a relative path that shares a prefix with the workspace. Rejected: copying `node_modules` into each workspace, which makes the relative path stable but costs a large copy per script; and Vite's `preserveSymlinks`, which would change the fixture's own config.

## Risks / Trade-offs

- [A workspace inside the bench checkout] → Paths are replaced longest first, so the workspace path still wins.
