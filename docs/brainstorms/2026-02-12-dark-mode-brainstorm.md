# Dark Mode: System / Light / Dark Theme Switching

**Date:** 2026-02-12
**Status:** Brainstorm complete

## What We're Building

A three-way theme preference (System, Light, Dark) in the Settings dialog that persists across sessions. When set to "System", the app follows the OS preference in real-time. The `dark` class is toggled on `<html>` to activate Tailwind's dark mode and shadcn/ui built-in `dark:` variant classes.

## Why This Approach

**Lightweight class toggle over React context provider.** The app already uses CSS custom properties (HSL values) consumed by Tailwind. Adding a `.dark` selector with alternate values is all that's needed for the CSS layer. shadcn/ui components already ship with `dark:` variant classes that are currently inert — they activate automatically once `darkMode: 'class'` is set in Tailwind config and `.dark` is on the root element. No new dependencies or React providers required.

## Key Decisions

1. **Toggle location:** Settings dialog only (consistent with existing debug mode toggle pattern)
2. **Approach:** Simple class toggle on `<html>` — no ThemeProvider/context
3. **System mode:** Real-time sync via `matchMedia('prefers-color-scheme: dark')` listener
4. **Dark palette:** Start by deriving from the existing light palette (invert/adjust HSL values), iterate with frontend designer
5. **Hardcoded colors:** Convert `bg-[#hex]` values in provider cards and other components to CSS variables so they adapt per theme
6. **Persistence:** Follow the existing settings pipeline (DB migration → repository → IPC → preload → renderer API)

## Scope

### In scope
- `darkMode: 'class'` in Tailwind config
- Dark theme CSS variables in `globals.css` under `.dark` selector
- New `theme` setting (`'system' | 'light' | 'dark'`) persisted in `app_settings` table
- DB migration (v008) adding `theme` column
- IPC handler pair + preload bridge + renderer API for theme preference
- Theme initialization on app load (read preference, apply class, set up system listener)
- Three-way toggle UI in SettingsDialog
- Audit and convert hardcoded hex colors to CSS variables
- Convert hardcoded `warning.subtle` / `success.subtle` in Tailwind config to CSS variables

### Out of scope
- Theme-aware Framer Motion animations
- Per-component theme overrides
- Custom theme editor / color picker
- Theme API exposed to MCP tools or agent-core

## Open Questions

- Exact dark palette HSL values (will iterate after initial implementation)
- Whether the debug/execution log panel (already using dark `zinc-*` colors) needs adjustment in dark mode

## Technical Notes

### Existing infrastructure that helps
- CSS variables already defined in `:root` with HSL values
- shadcn/ui components already have `dark:` classes (currently inert)
- `cn()` utility (clsx + tailwind-merge) already in use
- Settings pipeline pattern established (debug mode is the template)
- `AppSettings` interface and repository ready for extension

### Files that will change
- `apps/desktop/tailwind.config.ts` — add `darkMode: 'class'`
- `apps/desktop/src/renderer/styles/globals.css` — add `.dark { ... }` variables
- `packages/agent-core/src/storage/migrations/` — new v008 migration
- `packages/agent-core/src/storage/repositories/appSettings.ts` — theme getter/setter
- `packages/agent-core/src/common/types/` — extend AppSettings type
- `apps/desktop/src/main/ipc/handlers.ts` — theme IPC handlers
- `apps/desktop/src/preload/index.ts` — expose theme methods
- `apps/desktop/src/renderer/lib/accomplish.ts` — typed API
- `apps/desktop/src/renderer/components/layout/SettingsDialog.tsx` — theme toggle UI
- `apps/desktop/src/renderer/main.tsx` or a new `theme.ts` util — initialization logic
- Various components with hardcoded hex colors — convert to CSS variables
