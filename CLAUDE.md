# CLAUDE.md

Guidance for Claude Code (and other AI assistants) working in this repository.

## Current state of the repository

**This repository is empty apart from documentation.** As of the latest commit
it contains only:

```
.
├── README.md    # two lines: the repo name and "Game 1.T"
└── CLAUDE.md    # this file
```

There is no application source, no build system, no package manifest
(`package.json`, `Package.swift`, `*.xcodeproj`, `pubspec.yaml`, …), no tests,
and no CI configuration. Do not assume any of these exist — verify before
referencing them.

## What this project is meant to be

The repository is named `iphone-game-` and the README says "Game 1.T", so the
intent is an iPhone game. **The platform and tech stack have not been chosen
yet.** Nothing in the repo commits to Swift/SpriteKit, Unity, Godot, React
Native, or a web-based approach.

If you are asked to add code and the stack is still unspecified, ask the user
which stack they want before scaffolding. Picking one silently locks in a
decision that is expensive to reverse and is the user's call, not yours.

## Working conventions

### Branching and commits

- The default branch is `main`.
- Do all work on the feature branch you were assigned; never push directly to
  `main` without explicit permission.
- Push with `git push -u origin <branch-name>`.
- Do not open a pull request unless the user explicitly asks for one.

### Keeping this file accurate

This file describes a repository that is currently a blank slate. **The first
substantive code change should also update this file.** At minimum, once code
lands, replace the sections above with:

- the chosen stack and minimum target iOS version,
- the real directory layout and what lives where,
- the exact commands to build, run on simulator/device, and test,
- lint/format tooling and how to invoke it,
- any project-specific conventions worth knowing (asset pipeline, scene or
  entity organization, state management, naming rules).

An out-of-date CLAUDE.md is worse than none — it makes assistants confidently
wrong. Prefer deleting a stale claim over leaving it in place.

### Verify, don't assume

Because there is so little here, resist pattern-matching to a "typical" iOS
game repo. Before editing or referencing a file, confirm it exists. Before
running a build or test command, confirm the tooling is actually present in the
environment.
