/**
 * Single source of truth for the Node.js version bundled with the packaged
 * Electron app, plus per-platform download metadata.
 *
 * Consumed by:
 *   - scripts/download-nodejs.cjs  (fetch + verify the per-platform archive)
 *   - scripts/after-pack.cjs       (locate the extracted node-vX.Y.Z-<platform>-<arch>
 *                                    directory that electron-builder copies into the
 *                                    packaged app)
 *
 * Keep this module as the ONLY place the version string lives in packaging
 * scripts. A mismatch between the downloader and the after-pack hook causes
 * packaging to silently copy a stale or missing Node binary.
 *
 * SHA256 values come from https://nodejs.org/dist/v<NODE_VERSION>/SHASUMS256.txt
 * and must match the exact tarball filename.
 */

'use strict';

const NODE_VERSION = '22.22.2';

const PLATFORMS = [
  {
    name: 'darwin-x64',
    file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    extract: 'tar',
    sha256: '12a6abb9c2902cf48a21120da13f87fde1ed1b71a13330712949e8db818708ba',
  },
  {
    name: 'darwin-arm64',
    file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    extract: 'tar',
    sha256: 'db4b275b83736df67533529a18cc55de2549a8329ace6c7bcc68f8d22d3c9000',
  },
  {
    name: 'linux-x64',
    file: `node-v${NODE_VERSION}-linux-x64.tar.gz`,
    extract: 'tar',
    sha256: '978978a635eef872fa68beae09f0aad0bbbae6757e444da80b570964a97e62a3',
  },
  {
    name: 'linux-arm64',
    file: `node-v${NODE_VERSION}-linux-arm64.tar.gz`,
    extract: 'tar',
    sha256: 'b2f3a96f31486bfc365192ad65ced14833ad2a3c2e1bcefec4846902f264fa28',
  },
  {
    name: 'win32-x64',
    file: `node-v${NODE_VERSION}-win-x64.zip`,
    extract: 'zip',
    sha256: '7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c',
  },
];

module.exports = { NODE_VERSION, PLATFORMS };
