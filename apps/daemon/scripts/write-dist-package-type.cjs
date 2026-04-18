/**
 * Post-build step: mark the daemon bundle in `dist/` as CommonJS.
 *
 * The daemon is compiled by tsup as CJS (see tsup.config.ts) but saved
 * as `dist/index.js`. When the packaged `.app` is launched and Node
 * walks up the filesystem looking for the nearest `package.json` for
 * its module-type decision, it can find `apps/desktop/package.json`
 * with `"type": "module"` — and crash the daemon on the first
 * `require(...)` call.
 *
 * Writing `dist/package.json` with `{"type":"commonjs"}` next to the
 * bundle stops Node's ancestor walk at the daemon's own directory and
 * guarantees CJS semantics regardless of install location.
 *
 * A standalone script is used instead of an inline `node -e` in the
 * package.json "build" command because pnpm passes scripts to pwsh on
 * Windows runners, and the nested backslash/double-quote escaping
 * required to inline a JSON string through both shells breaks with
 * `SyntaxError: Invalid or unexpected token`.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'dist', 'package.json');
fs.writeFileSync(target, '{"type":"commonjs"}\n');
