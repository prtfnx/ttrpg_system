# Editor workspace

Audience: contributors using VS Code, Pylance, Pyright, Rust Analyzer, or the
repository tasks.

Status: current.

Last source audit: 2026-07-29

## Open the workspace

Open `ttrpg_system.code-workspace` from the repository root. The workspace has
four named leaf folders:

| Folder | Path | Main editor owner |
| --- | --- | --- |
| `web-ui` | `apps/web-ui` | TypeScript, ESLint, Stylelint, and Vitest |
| `server` | `apps/server` | Python, Pylance, Ruff, and pytest |
| `rust-core` | `packages/rust-core` | Rust Analyzer and wasm-pack |
| `core-table` | `packages/core-table` | Python, Pylance, Ruff, and pytest |

The repository root is intentionally not a fifth workspace folder. Adding it
would overlap every leaf, duplicate file watching and search results, and let
Pylance discover the same Python source through more than one workspace.

Repository-level scripts remain available through workspace tasks. Those tasks
use named-folder variables such as `${workspaceFolder:server}` and set their
working directory explicitly.

## Python environment and analysis

The editor configuration expects the repository environment at
`.venv311`. Both Python leaf folders point to:

```text
../../.venv311/Scripts/python.exe
```

Python analysis has three scopes:

- `pyrightconfig.json` checks `apps/server` and `packages/core-table` together
  for repository-wide verification.
- `apps/server/pyrightconfig.json` extends the root policy and limits the
  server workspace to server files, with `core-table` on its import path.
- `packages/core-table/pyrightconfig.json` extends the root policy and limits
  the package workspace to package source and tests, with the server on its
  import path for current compatibility tests.

The leaf configurations prevent each Pylance language server from analyzing
both Python projects as its own workspace. The root configuration remains the
single cross-project CLI contract.

Run the same pinned Pyright version used for the current diagnostic baseline:

```powershell
pnpm.cmd dlx pyright@1.1.411 --project apps/server/pyrightconfig.json
pnpm.cmd dlx pyright@1.1.411 --project packages/core-table/pyrightconfig.json
pnpm.cmd dlx pyright@1.1.411 --project pyrightconfig.json
```

Pyright uses basic mode with selected type problems promoted to warnings.
Pylint is disabled in the workspace; Ruff remains the Python lint command.

## Workspace tasks

The workspace descriptor owns tasks that must remain available without adding
the repository root to Explorer:

- Vite development from `web-ui`;
- FastAPI development and Python setup from the repository scripts;
- full, development, and WASM-only builds;
- Node and browser wasm-pack tests from `rust-core`.

Debug configurations resolve `${workspaceFolder}` from the active file. This
keeps current-file and pytest debugging inside the correct Python leaf.

## When VS Code reports duplicate or stale problems

1. Confirm that the open workspace is `ttrpg_system.code-workspace`.
2. Do not add the repository root as another workspace folder.
3. Confirm that the Python interpreter is `.venv311\Scripts\python.exe`.
4. Reload the VS Code window after changing workspace folders or Pyright
   configuration.
5. Run the three Pyright commands above. If they are clean but the Problems
   panel is stale, restart the Pylance language server.

Do not suppress a diagnostic only to clear the Problems panel. Change the
source or type contract when the warning represents a real mismatch. Disable a
rule only when the repository intentionally does not enforce that category and
the root `pyrightconfig.json` records that decision.
