# Homebrew cask for Accomplish

This directory contains a ready-to-use Homebrew cask formula for installing
Accomplish on macOS.

## For maintainers: publishing the tap

Homebrew casks live in a separate tap repository, not in the main app repo.
To enable `brew install --cask accomplish`:

1. Create a new public repository named `accomplish-ai/homebrew-accomplish`
   (the `homebrew-` prefix is required by Homebrew's tap convention).
2. Copy `accomplish.rb` from this directory to `Casks/accomplish.rb` in that
   new repo.
3. (Optional) Add a workflow that bumps `version` and `sha256` on every
   release — see the livecheck block in `accomplish.rb` and
   [brew bump-cask-pr](https://docs.brew.sh/Manpage#bump-cask-pr)
   for the automation pattern.
4. Users can then run:

   ```bash
   brew tap accomplish-ai/accomplish
   brew install --cask accomplish
   ```

Alternatively, the cask can be submitted to the central
[homebrew-cask](https://github.com/Homebrew/homebrew-cask) repository so users
get it without tapping. Note that homebrew-cask requires the app to be
[notarized by Apple](https://docs.brew.sh/Acceptable-Casks#notarized); until
Accomplish is notarized, a dedicated tap is the simpler path.

## What the cask does

- Downloads the correct DMG for the user's architecture (Apple Silicon or Intel).
- Verifies SHA256 integrity.
- Installs `Accomplish (formerly Openwork).app` into `/Applications`.
- On uninstall (`brew uninstall --zap`), removes app support, logs,
  preferences, and saved state directories.
- Prints a caveat with the `xattr -c` workaround for the "damaged" error
  caused by the unsigned bundle — this can be removed once the app is
  notarized.

## Verification performed

- Checked Ruby syntax with `ruby -c homebrew/accomplish.rb`. (Not run
  through `brew style --cask` yet because the cask is not in a tap
  repository; that check will run when the cask is submitted to a tap
  or to `homebrew-cask`.)
- SHA256 values computed locally against the current v0.3.8 release assets.
- `app` stanza string matches the bundle name inside the mounted DMG
  (`Accomplish (formerly Openwork).app`).
- Bundle identifier `ai.accomplish.desktop` confirmed via
  `/Applications/Accomplish (formerly Openwork).app/Contents/Info.plist`
  and used in the `zap` stanza for a clean uninstall.
- `zap` paths cross-referenced against the Electron `userData` directory
  (`APP_DATA_NAME = "Accomplish"` in `apps/desktop/src/main/index.ts`)
  and the legacy-directory list in
  `apps/desktop/src/main/store/legacyMigration.ts` so `brew uninstall --zap`
  does not leave behind user data from the Openwork-era installs.

Closes #820.
