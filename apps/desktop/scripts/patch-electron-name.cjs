/**
 * Patches the Electron.app Info.plist for development:
 * - Shows "Accomplish" instead of "Electron" in macOS Cmd+Tab and Dock
 * - Registers the "accomplish://" URL scheme so OAuth callbacks route to the running dev instance
 */
const fs = require('fs');
const path = require('path');

const APP_NAME = 'Accomplish';
const URL_SCHEME = 'accomplish';

// Only run on macOS
if (process.platform !== 'darwin') {
  console.log('[patch-electron-name] Skipping on non-macOS platform');
  process.exit(0);
}

const electronPath = path.join(
  __dirname,
  '../node_modules/electron/dist/Electron.app/Contents/Info.plist'
);

if (!fs.existsSync(electronPath)) {
  console.error('[patch-electron-name] Electron Info.plist not found:', electronPath);
  process.exit(1);
}

let plist = fs.readFileSync(electronPath, 'utf8');

// Check if already patched (both name and URL scheme)
if (plist.includes(`<string>${APP_NAME}</string>`) && plist.includes(`<string>${URL_SCHEME}</string>`)) {
  console.log(`[patch-electron-name] Already patched to "${APP_NAME}" with "${URL_SCHEME}://" scheme`);
  process.exit(0);
}

// Replace CFBundleDisplayName and CFBundleName
plist = plist.replace(
  /<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/,
  `<key>CFBundleDisplayName</key>\n\t<string>${APP_NAME}</string>`
);

plist = plist.replace(
  /<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/,
  `<key>CFBundleName</key>\n\t<string>${APP_NAME}</string>`
);

// Add CFBundleURLTypes for the accomplish:// protocol (if not already present)
if (!plist.includes('CFBundleURLTypes')) {
  const urlTypesEntry = `\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>${APP_NAME} URL</string>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>${URL_SCHEME}</string>
\t\t\t</array>
\t\t</dict>
\t</array>`;

  // Insert before the closing </dict></plist>
  plist = plist.replace(
    /(<\/dict>\s*<\/plist>)/,
    `${urlTypesEntry}\n$1`
  );
}

fs.writeFileSync(electronPath, plist);
console.log(`[patch-electron-name] Patched Electron.app: name="${APP_NAME}", URL scheme="${URL_SCHEME}://"`);
