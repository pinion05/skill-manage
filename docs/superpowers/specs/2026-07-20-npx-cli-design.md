# npx CLI Distribution Design

## Goal

Publish Skill Atlas as the public npm package `skill-manage` so a user can run it without cloning the repository:

```bash
npx skill-manage
```

The command starts the existing read-only Astro server on loopback, opens the browser, prints the URL, and remains attached until the user presses `Ctrl+C`.

## Chosen Distribution

Use the public npm registry with a package executable named `skill-manage`.

Alternatives considered:

1. `npx github:pinion05/skill-manage`: requires the longer GitHub locator and private-repository authentication.
2. Native executable releases: add cross-platform build and release complexity before it is needed.

The npm package name is currently available. Version `0.1.0` is the first release. The package uses the MIT license and requires Node.js `>=22.12.0`, matching Astro 7.1.1.

## CLI Contract

### Default

```bash
npx skill-manage
```

1. Find the first available TCP port from `4321` through `4420` on `127.0.0.1`.
2. Spawn the packaged `dist/server/entry.mjs` with `HOST=127.0.0.1` and the selected `PORT`.
3. Poll the loopback URL until the server responds or the child exits.
4. Print the URL and `Ctrl+C` shutdown instruction.
5. Open the default browser.
6. Forward `SIGINT` and `SIGTERM` to the server and exit with the child status.

The CLI never accepts a public bind host. Skill Atlas retains its loopback Host and same-origin POST protections.

### Options

```text
--port <number>  Use one explicit port from 1 through 65535.
--no-open        Start without opening a browser.
--help, -h       Print usage and exit successfully.
--version, -v    Print package version and exit successfully.
```

Unknown flags, missing option values, non-integer ports, and occupied explicit ports exit with status `2` and a concise actionable message. If all default candidate ports are occupied, startup exits with status `1`.

### Browser launch

- macOS: `open <url>`
- Linux: `xdg-open <url>`
- Windows: `cmd /c start "" <url>`

Browser-launch failure is non-fatal: the running URL remains printed for manual opening. Browser helper stdio is ignored and the helper is unreferenced after launch.

## Process and Failure Handling

The CLI is a small dependency-free ESM executable at `bin/skill-manage.mjs`.

- Resolve package files relative to `import.meta.url`, not the invocation directory.
- Check that `dist/server/entry.mjs` exists before spawning and report a broken package if absent.
- Use `node:net` to test port availability on `127.0.0.1`.
- Use `node:child_process.spawn` without a shell for the server and browser helpers.
- Wait up to 20 seconds for an HTTP response.
- If the server exits before readiness, propagate its nonzero status.
- On shutdown, send the original signal once and use a short forced-kill fallback only if the child does not exit.
- Do not daemonize; the npx process owns server lifetime.

## npm Package Shape

`package.json` changes:

- remove `private: true`
- retain `name: "skill-manage"`, `version: "0.1.0"`, `type: "module"`
- add canonical npm mapping `bin.skill-manage = "bin/skill-manage.mjs"`
- add `files = ["bin", "dist", "README.md", "LICENSE"]`
- add `engines.node = ">=22.12.0"`
- add MIT license, repository, homepage, bugs, keywords, and public publish config
- add `prepack` that runs the complete verification/build pipeline

The tarball contains the executable, production server/client output, README, license, and npm-generated package metadata. It excludes source, tests, local paths, `.env`, node_modules, worktrees, and development documents.

Runtime dependencies remain normal package dependencies because the standalone Astro entry imports Astro/adapter transitive runtime modules.

## Documentation

README begins with the npx quick start, then retains source-development instructions separately. Document all four CLI options, Node version, localhost-only behavior, initial scan cost, and `Ctrl+C` shutdown.

Add an MIT `LICENSE` file naming ParkMyeongCheol as the copyright holder.

## Testing

### Automated CLI tests

Create `src/cli.test.ts` using child processes against the real executable.

- `--help` exits `0` and includes usage/options.
- `--version` exits `0` and prints `0.1.0`.
- invalid/unknown arguments exit `2` with the expected message.
- an occupied explicit port exits `2` and does not start the app.

Argument-only paths must not require a production build, so tests remain runnable before `dist` exists.

### Package smoke

1. Run `npm run verify`.
2. Run `npm pack` to create the exact release tarball.
3. Inspect tarball contents and reject source/tests/secrets.
4. In a fresh temporary directory, execute the tarball with:

```bash
npx --yes /absolute/path/skill-manage-0.1.0.tgz --no-open --port <free-port>
```

5. Wait for the URL, request `/` and `/api/inventory?mode=official`, verify HTTP 200, then send `SIGINT` and confirm clean exit.
6. Run `npm publish --dry-run` before the real publish.

## Publication

Publishing is an explicit final external action. The local npm session is currently unauthenticated. After implementation and tarball smoke pass, initiate npm web login, verify `npm whoami`, publish `skill-manage@0.1.0` publicly, then verify:

```bash
npm view skill-manage@0.1.0
npx --yes skill-manage@0.1.0 --help
```

Push the release commit to GitHub after tests pass. Do not create or publish a second package name if the registry name changes ownership during implementation; stop and report that conflict.
