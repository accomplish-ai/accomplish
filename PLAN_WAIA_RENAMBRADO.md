# Plan de Transformación: Accomplish → WaIA

**Fecha:** 9 de febrero de 2026
**Estado:** Pendiente de Aprobación
**Sesión:** Plan de Acción Kiro Spec-Driven Development

---

## 📋 Resumen Ejecutivo

Este documento detalla el plan completo para:
1. **Renombrar la aplicación** de "Accomplish" a "WaIA"
2. **Verificar Google Gemini Flash 2.5 Lite** (ya está configurado)
3. **Crear instalador de escritorio**

---

## 🎯 TAREA 1: Renombrado Completo a "WaIA"

### 1.1 Estado Actual

El proyecto YA tiene configuraciones parciales de "WaIA":
- `apps/desktop/package.json`: `productName: "WaIA"`, `appId: "ai.waia.desktop"`
- Descripción en package.json: "WaIA - The AI-powered desktop assistant..."

**PERO** aún conserva muchos nombres "accomplish":
- Workspace package name: `accomplish`
- Desktop package: `@accomplish/desktop`
- Agent-core package: `@accomplish_ai/agent-core`
- READMEs y documentación
- Referencias en código

### 1.2 Inventario de Archivos a Modificar

#### CRÍTICOS - Configuración Core

```
📁 Root Level
├── package.json (name: "accomplish" → "waia")
├── README.md + traducciones (README.es.md, README.ja.md, etc.)
├── CLAUDE.md (descripción del proyecto)
└── .github/workflows/*.yml (referencias a accomplish)

📁 apps/desktop/
├── package.json (@accomplish/desktop → @waia/desktop)
├── scripts/patch-electron-name.cjs (APP_NAME constante)
├── src/main/index.ts (comentarios, referencias)
├── src/main/ipc/handlers.ts (comentarios)
├── src/preload/index.ts (window.accomplish namespace)
├── src/renderer/lib/accomplish.ts (wrapper IPC)
└── electron.build.config (producto ya está en WaIA ✅)

📁 packages/agent-core/
├── package.json (@accomplish_ai/agent-core → @waia/agent-core)
├── src/index.ts (exports, comentarios)
└── src/common/types/provider.ts (comentarios)

📁 packages/shared/
├── package.json (referencias a @accomplish/shared)
└── src/index.ts (exports)
```

#### UI/UX - Referencias Visibles

```
📁 apps/desktop/src/renderer/
├── components/Header.tsx
├── components/Sidebar.tsx
├── components/WelcomeScreen.tsx
├── components/Settings/*.tsx
├── pages/About.tsx
├── pages/Home.tsx
└── lib/accomplish.ts (IPC wrapper)
```

#### Otros Archivos

```
├── apps/desktop/e2e/specs/*.spec.ts (test references)
├── apps/desktop/__tests__/**/*.test.ts (unit tests)
├── apps/desktop/scripts/*.cjs (build scripts)
└── apps/desktop/resources/ (iconos, assets)
```

### 1.3 Orden Cronológico de Cambios

#### FASE 1: Preparación (Backup)

```bash
# 1. Crear branch de trabajo
git checkout -b feat/rebrand-to-waia
git push -u origin feat/rebrand-to-waia

# 2. Backup de archivos críticos
cp package.json package.json.backup
cp apps/desktop/package.json apps/desktop/package.json.backup
cp packages/agent-core/package.json packages/agent-core/package.json.backup
cp packages/shared/package.json packages/shared/package.json.backup
```

#### FASE 2: Root Package y Workspace

```bash
# Editar package.json root
{
  "name": "waia",  # era: "accomplish"
  "description": "WaIA - The AI-powered desktop assistant",
  "repository": {
    "url": "https://github.com/waia-ai/waia.git"  # Actualizar cuando cambie repo
  }
}

# Actualizar workspace dependencies
# En pnpm workspaces o package.json references
"@accomplish/desktop" → "@waia/desktop"
"@accomplish/shared" → "@waia/shared"
```

#### FASE 3: Desktop App

```bash
# apps/desktop/package.json
{
  "name": "@waia/desktop",  # era: "@accomplish/desktop"
  "description": "WaIA - AI-powered desktop assistant",
  "dependencies": {
    "@accomplish/shared": "workspace:*",  # → "@waia/shared"
    "@accomplish/core": "workspace:*",    # Verificar si existe este paquete
  }
}

# Actualizar imports en código TypeScript
# Find and replace en todos los archivos .ts/.tsx:
# Import statements: @accomplish/ → @waia/
```

#### FASE 4: Agent-Core Package

```bash
# packages/agent-core/package.json
{
  "name": "@waia/agent-core",  # era: "@accomplish_ai/agent-core"
  "description": "Core logic for WaIA - OpenCode adapter, storage, providers...",
  "publishConfig": {
    "name": "@waia/agent-core"
  },
  "repository": {
    "url": "https://github.com/waia-ai/waia.git",
    "directory": "packages/agent-core"
  }
}

# ⚠️ IMPORTANTE: Crear paquete de transición para backward compatibility
# O mantener @accomplish_ai/agent-core como deprecated alias
```

#### FASE 5: Shared Package

```bash
# packages/shared/package.json
{
  "name": "@waia/shared",  # era: "@accomplish/shared"
  "description": "Shared TypeScript types for WaIA"
}
```

#### FASE 6: Código Fuente (Imports y Namespaces)

```bash
# Actualizar imports en todos los archivos TypeScript
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i 's/@accomplish\//@waia\//g'

# ⚠️ PRESERVAR: window.accomplish en preload
# Este es un namespace público que puede romper apps
# Considerar: window.waia como nuevo nombre, mantener alias

# apps/desktop/src/preload/index.ts
// Mantener por compatibilidad o crear alias:
// window.accomplish = window.waia
```

#### FASE 7: Documentación

```bash
# Actualizar README.md y todos los archivos de documentación
# Reemplazar: Accomplish → WaIA, accomplish → waia

# Archivos a modificar:
- README.md
- README.es.md
- README.zh-CN.md
- README.ja.md
- README.ar.md
- README.id.md
- README.tr.md
- CLAUDE.md
- CONTRIBUTING.md (si existe)
```

### 1.4 Impacto en Datos del Usuario

#### Base de Datos SQLite
```typescript
// ✅ SIN IMPACTO DIRECTO
// Las tablas no contienen hardcoded "accomplish"
// migrations/*.ts: Usan nombres genéricos
```

#### Directorio de Configuración (UserData)
```typescript
// ⚠️ MIGRACIÓN NECESARIA
// macOS: ~/Library/Application Support/Accomplish → ~/Library/Application Support/WaIA
// Windows: %APPDATA%/Accomplish → %APPDATA%/WaIA
// Linux: ~/.config/Accomplish → ~/.config/WaIA

// Solución: Script de migración en primera ejecución
// apps/desktop/src/main/migrations/user-data.ts
```

#### Migration Script
```typescript
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export function migrateUserData() {
  const oldPath = path.join(app.getPath('home'), '.accomplish');
  const newPath = app.getPath('userData');

  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.copySync(oldPath, newPath);
    console.log('Migrated user data from Accomplish to WaIA');
  }
}
```

### 1.5 Riesgos y Mitigaciones

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| Breaking changes en @accomplish_ai/agent-core | ALTO | Mantener paquete deprecated, documentar migración |
| Usuarios pierden configuración | MEDIO | Script de migración automática con backup |
| CI/CD se rompe | MEDIO | Actualizar workflows antes de merge |
| Electron signing no funciona | BAJO | Verificar appId en certificado |
| Imports rotos en código | BAJO | TypeScript strict mode para detectar |

---

## 🎯 TAREA 2: Google Gemini Flash 2.5 Lite

### 2.1 Estado Actual: ✅ YA CONFIGURADO

El modelo `gemini-2.5-flash-lite` ya está definido en:

**Archivo:** `packages/agent-core/src/common/types/provider.ts`

```typescript
{
  id: 'google',
  name: 'Google AI',
  requiresApiKey: true,
  apiKeyEnvVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
  models: [
    {
      id: 'gemini-2.5-flash-lite',
      displayName: 'Gemini 2.5 Flash Lite',
      provider: 'google',
      fullId: 'google/gemini-2.5-flash-lite',
      contextWindow: 1048576,    // ~1M tokens
      maxOutputTokens: 65535,    // ~64K tokens
      supportsVision: true,
    },
    // ... más modelos
  ]
}
```

### 2.2 Verificación Requerida

```bash
# 1. Verificar que aparece en UI selector
grep -r "gemini-2.5-flash-lite" apps/desktop/src/

# 2. Confirmar configuración en model-display.ts
grep -i "gemini.*2\.5.*flash" packages/agent-core/src/common/constants/model-display.ts

# 3. Test de funcionalidad
# - Abrir app
# - Settings > AI Provider
# - Seleccionar Google AI
# - Verificar que "Gemini 2.5 Flash Lite" aparece en lista
```

### 2.3 Compatibilidad con Z.AI

**✅ TOTALMENTE COMPATIBLE**

El formato `google/gemini-2.5-flash-lite` es compatible con:
- Z.AI API router
- OpenCode CLI
- Sistema de providers actual

**No requiere cambios adicionales.**

### 2.4 Acciones Requeridas

| Acción | Estado | Comando |
|--------|--------|---------|
| Verificar modelo en provider.ts | ✅ Completo | Ya definido |
| Verificar aparece en UI | ⏳ Pendiente | `pnpm dev` y verificar manualmente |
| Test con API key | ⏳ Pendiente | Requiere Google API key |
| Documentar para usuarios | ⏳ Pendiente | Actualizar README |

---

## 🎯 TAREA 3: Instalación en Escritorio

### 3.1 Build Configuration Actual

**Archivo:** `apps/desktop/package.json` (build section)

```json
{
  "build": {
    "appId": "ai.waia.desktop",
    "productName": "WaIA",
    "artifactName": "WaIA-${version}-${os}-${arch}.${ext}",
    "directories": {
      "output": "release",
      "buildResources": "resources"
    },
    "mac": {
      "category": "public.app-category.productivity",
      "target": ["dmg", "zip"],
      "icon": "resources/icon.png"
    },
    "win": {
      "target": ["nsis"],
      "icon": "resources/icon.ico"
    },
    "nsis": {
      "shortcutName": "WaIA",
      "oneClick": true,
      "createDesktopShortcut": true
    }
  }
}
```

### 3.2 Comandos de Build

#### Desarrollo
```bash
cd /home/jivagrisma/Escritorio/accomplish
pnpm install
pnpm dev                # Modo desarrollo con hot reload
pnpm dev:clean          # Desarrollo limpio (borra datos)
```

#### Build para Producción

```bash
# Build completo del monorepo
pnpm build

# Build solo desktop
pnpm build:desktop

# Empaquetado para distribución
cd apps/desktop
pnpm run package        # Build + empaquetado (macOS)
pnpm run package:win    # Build + empaquetado (Windows)
```

### 3.3 Archivos Generados

```
apps/desktop/release/
├── WaIA-0.3.8-mac-arm64.dmg       # macOS Apple Silicon
├── WaIA-0.3.8-mac-x64.dmg         # macOS Intel
├── WaIA-Setup-0.3.8.exe           # Windows installer
└── WaIA-0.3.8-x86_64.AppImage     # Linux (si está configurado)
```

### 3.4 Instalación Local

#### macOS
```bash
# Montar DMG y arrastrar a Applications
open release/WaIA-0.3.8-mac-arm64.dmg

# O instalar desde línea de comandos
sudo cp -r /Volumes/WaIA/WaIA.app /Applications/
```

#### Windows
```bash
# Ejecutar installer
./release/WaIA-Setup-0.3.8.exe

# O extraer portable (si existe)
./release/WaIA-0.3.8-win-portable.exe
```

#### Linux
```bash
# Hacer ejecutable AppImage
chmod +x release/WaIA-0.3.8-x86_64.AppImage
./release/WaIA-0.3.8-x86_64.AppImage

# O instalar DEB
sudo dpkg -i release/waia_0.3.8_amd64.deb
```

### 3.5 Crear Acceso Directo en Escritorio

#### Script Automático (Linux)
```bash
#!/bin/bash
# install-shortcut.sh

APP_PATH="/home/jivagrisma/Escritorio/accomplish/apps/desktop/release/WaIA-0.3.8-x86_64.AppImage"
DESKTOP_PATH="/home/jivagrisma/Escritorio/WaIA.desktop"

cat > "$DESKTOP_PATH" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=WaIA
Comment=AI-powered desktop assistant
Exec=$APP_PATH
Icon=/home/jivagrisma/Escritorio/accomplish/apps/desktop/resources/icon.png
Terminal=false
Categories=Utility;Productivity;
EOF

chmod +x "$DESKTOP_PATH"
```

---

## 📋 Plan de Acción Paso a Paso

### Paso 1: Verificación Previa (Recomendado antes de cambios)

```bash
# 1. Verificar estado actual del código
git status
git log --oneline -5

# 2. Run tests para asegurar funcionalidad
pnpm test
pnpm typecheck
pnpm lint

# 3. Verificar Gemini 2.5 Flash Lite en código
grep -r "gemini-2.5-flash-lite" packages/agent-core/src/

# 4. Iniciar app en modo dev
pnpm dev
# → Verificar que la app funciona
# → Ir a Settings > AI Provider
# → Buscar "Gemini 2.5 Flash Lite"
```

### Paso 2: Crear Branch y Backup

```bash
# Crear branch de trabajo
git checkout -b feat/rebrand-to-waia

# Crear backups
cp package.json package.json.backup
cp apps/desktop/package.json apps/desktop/package.json.backup
cp packages/agent-core/package.json packages/agent-core/package.json.backup
cp packages/shared/package.json packages/shared/package.json.backup

# Commit backups (opcional)
git add *.backup
git commit -m "chore: add backups before rebrand to WaIA"
```

### Paso 3: Modificar Root Package

```bash
# Editar package.json root
# Cambiar:
# - name: "accomplish" → "waia"
# - description manteniendo "WaIA"
# - repository URL (cuando se cambie el repo)
```

### Paso 4: Modificar Desktop Package

```bash
# Editar apps/desktop/package.json
# Cambiar:
# - name: "@accomplish/desktop" → "@waia/desktop"
# - Actualizar dependencies: @accomplish/shared → @waia/shared
```

### Paso 5: Modificar Agent-Core Package

```bash
# Editar packages/agent-core/package.json
# Cambiar:
# - name: "@accomplish_ai/agent-core" → "@waia/agent-core"
# - publishConfig.name: "@waia/agent-core"
```

### Paso 6: Modificar Shared Package

```bash
# Editar packages/shared/package.json
# Cambiar:
# - name: "@accomplish/shared" → "@waia/shared"
```

### Paso 7: Actualizar Imports en Código

```bash
# Buscar todos los imports de @accomplish/
grep -r "@accomplish/" --include="*.ts" --include="*.tsx" .

# Reemplazar en archivos TypeScript
# Usar find + sed o editor con find-and-replace
find . -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i 's/@accomplish\/shared/@waia\/shared/g'
find . -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i 's/@accomplish\/desktop/@waia\/desktop/g'
find . -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i 's/@accomplish\/core/@waia\/core/g'
find . -name "*.ts" -o -name "*.tsx" | \
  xargs sed -i 's/@accomplish_ai\/agent-core/@waia\/agent-core/g'
```

### Paso 8: Actualizar Documentación

```bash
# Editar README.md
# Reemplazar: Accomplish → WaIA (case-sensitive)
# Reemplazar: accomplish → waia

# Editar otros READMEs
# README.es.md, README.ja.md, README.zh-CN.md, etc.

# Editar CLAUDE.md
# Actualizar descripción del proyecto
```

### Paso 9: Actualizar Scripts y Configuraciones

```bash
# Editar apps/desktop/scripts/patch-electron-name.cjs
# Cambiar APP_NAME constante si es necesario

# Verificar tsconfig.json paths
# Buscar: "@accomplish/*" → "@waia/*"
```

### Paso 10: Crear Script de Migración de Datos

```bash
# Crear: apps/desktop/src/main/migrations/user-data-migration.ts
# Implementar migración de ~/Library/Application Support/Accomplish
#                           → ~/Library/Application Support/WaIA
```

### Paso 11: Testing

```bash
# Limpiar node_modules y reinstalar
rm -rf node_modules apps/desktop/node_modules packages/*/node_modules
pnpm install

# Type check
pnpm typecheck

# Build
pnpm build

# Run tests
pnpm test

# Ejecutar app en modo dev
pnpm dev
```

### Paso 12: Build de Instalador

```bash
# Build para plataforma actual
pnpm build:desktop

# Empaquetar (macOS)
cd apps/desktop
pnpm run package

# Verificar output
ls -la release/
```

### Paso 13: Instalar y Verificar

```bash
# Instalar desde paquete generado
# macOS:
open release/WaIA-*.dmg

# Linux:
chmod +x release/WaIA-*.AppImage
./release/WaIA-*.AppImage

# Verificar:
# 1. App abre correctamente
# 2. Nombre muestra "WaIA"
# 3. Settings funcionan
# 4. Google Gemini 2.5 Flash Lite aparece en lista
```

### Paso 14: Commit y Merge

```bash
# Commit cambios
git add .
git commit -m "feat: rebrand Accomplish to WaIA

- Rename packages: @accomplish/* → @waia/*
- Update documentation references
- Add user data migration script
- Update build configuration

BREAKING CHANGE: Package names changed.
Old @accomplish_ai/agent-core deprecated, use @waia/agent-core"

# Push y crear PR
git push origin feat/rebrand-to-waia
```

---

## 🧪 Checklist de Verificación

### Pre-Ejecución
- [ ] Backup completo del proyecto
- [ ] Tests pasando: `pnpm test`
- [ ] Typecheck exitoso: `pnpm typecheck`
- [ ] Branch creado: `feat/rebrand-to-waia`

### Durante Ejecución
- [ ] Root package.json actualizado
- [ ] Desktop package.json actualizado
- [ ] Agent-core package.json actualizado
- [ ] Shared package.json actualizado
- [ ] Todos los imports actualizados
- [ ] Documentación actualizada
- [ ] Scripts actualizados
- [ ] Migration script creado

### Post-Ejecución
- [ ] `pnpm install` exitoso
- [ ] `pnpm build` exitoso
- [ ] `pnpm dev` funciona
- [ ] `pnpm test` pasa
- [ ] Gemini 2.5 Flash Lite visible en UI
- [ ] Instalador creado
- [ ] App instala y funciona correctamente

### Verificación Gemini 2.5 Flash Lite
- [ ] Modelo aparece en Settings > AI Provider > Google AI
- [ ] Modelo es seleccionable
- [ ] API key de Google funciona
- [ ] Modelo genera respuestas correctamente

---

## ⚠️ Notas Importantes

1. **@accomplish_ai/agent-core**: Este paquete está publicado en npm. Cambiar el nombre requiere:
   - Publicar nuevo paquete @waia/agent-core
   - Deprecar @accomplish_ai/agent-core
   - Documentar migración para usuarios

2. **window.accomplish**: Este namespace en preload es público. Considerar:
   - Mantenerlo por compatibilidad
   - O crear alias: `window.waia = window.accomplish`

3. **Datos del usuario**: Implementar migración automática para no perder:
   - API keys configuradas
   - Historial de tareas
   - Settings personalizados

4. **Repo GitHub**: Si el repo cambia de accomplish-ai/accomplish a waia-ai/waia:
   - Actualizar repository URLs
   - Actualizar CLAUDE.md
   - Configurar redirecciones

---

## 📞 Siguientes Pasos

1. **Aprobar este plan** - Revisar y confirmar estrategia
2. **Ejecutar Paso 1** - Verificación previa
3. **Confirmar resultados** - Antes de continuar
4. **Proceder con Pasos 2-14** - Ejecución secuencial

---

**Fin del Plan de Acción**
