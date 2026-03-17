interface BuildCreateSkillPromptParams {
  name: string;
  description: string;
  skillsBasePath: string;
  platform?: string;
}

function trimTrailingSeparator(value: string): string {
  // Preserve filesystem roots.
  if (/^[A-Za-z]:[\\/]$/.test(value)) {
    return value;
  }

  if (/^[\\/]+$/.test(value)) {
    return value[0];
  }

  return value.replace(/[\\/]+$/, '');
}

function normalizeBasePath(basePath: string, platform?: string): string {
  const trimmed = trimTrailingSeparator(basePath.trim());
  if (platform === 'win32') {
    return trimmed.replace(/\//g, '\\');
  }
  if (platform === 'darwin' || platform === 'linux') {
    return trimmed.replace(/\\/g, '/');
  }
  return trimmed;
}

export function buildCreateSkillPrompt({
  name,
  description,
  skillsBasePath,
  platform,
}: BuildCreateSkillPromptParams): string {
  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const normalizedBasePath = normalizeBasePath(skillsBasePath, platform);

  return [
    '/skill-creator',
    '',
    'Create one custom skill with these inputs:',
    `- Name: ${JSON.stringify(trimmedName)}`,
    `- Description: ${JSON.stringify(trimmedDescription)}`,
    '',
    'Deterministic write contract (mandatory):',
    `1. Use this exact base directory: \`${normalizedBasePath}\``,
    '2. Create exactly one new subdirectory under that base directory for this skill.',
    "3. Choose the subdirectory name from context; keep it safe on macOS and Windows (letters, numbers, '-' and '_').",
    '4. Write exactly one file named `SKILL.md` in that subdirectory.',
    `5. Do not create skill files outside \`${normalizedBasePath}\``,
    '6. If the subdirectory already exists, choose a different name; do not overwrite unrelated skills.',
    '',
    'Verification (mandatory):',
    '1. Read the created `SKILL.md` after writing.',
    '2. Confirm frontmatter contains non-empty name and description.',
    '3. End your final message with exactly: Created skill at: <absolute path to SKILL.md>',
  ].join('\n');
}
