import type { Skill, SkillSource } from '../../common/types/skills.js';
import { getDatabase } from '../database.js';

interface SkillRow {
  id: string;
  name: string;
  command: string;
  description: string;
  source: string;
  is_enabled: number;
  is_verified: number;
  is_hidden: number;
  file_path: string;
  github_url: string | null;
  updated_at: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    command: row.command,
    description: row.description,
    source: row.source as SkillSource,
    isEnabled: row.is_enabled === 1,
    isVerified: row.is_verified === 1,
    isHidden: row.is_hidden === 1,
    filePath: row.file_path,
    githubUrl: row.github_url || undefined,
    updatedAt: row.updated_at,
  };
}

export function getAllSkills(): Skill[] {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM skills ORDER BY name').all() as SkillRow[];
  return rows.map(rowToSkill);
}

export function getEnabledSkills(): Skill[] {
  const db = getDatabase();
  const rows = db
    .prepare('SELECT * FROM skills WHERE is_enabled = 1 ORDER BY name')
    .all() as SkillRow[];
  return rows.map(rowToSkill);
}

export function getSkillById(id: string): Skill | null {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as SkillRow | undefined;
  return row ? rowToSkill(row) : null;
}

export function upsertSkill(skill: Skill): void {
  const db = getDatabase();
  db.prepare(
    `
    INSERT INTO skills (id, name, command, description, source, is_enabled, is_verified, is_hidden, file_path, github_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      command = excluded.command,
      description = excluded.description,
      is_enabled = excluded.is_enabled,
      is_verified = excluded.is_verified,
      is_hidden = excluded.is_hidden,
      file_path = excluded.file_path,
      github_url = excluded.github_url,
      updated_at = excluded.updated_at
  `,
  ).run(
    skill.id,
    skill.name,
    skill.command,
    skill.description,
    skill.source,
    skill.isEnabled ? 1 : 0,
    skill.isVerified ? 1 : 0,
    skill.isHidden ? 1 : 0,
    skill.filePath,
    skill.githubUrl || null,
    skill.updatedAt,
  );
}

export function setSkillEnabled(id: string, enabled: boolean): void {
  const db = getDatabase();
  db.prepare('UPDATE skills SET is_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
}

export function deleteSkill(id: string): void {
  const db = getDatabase();
  db.prepare('DELETE FROM skills WHERE id = ?').run(id);
}

export function clearAllSkills(): void {
  const db = getDatabase();
  db.prepare('DELETE FROM skills').run();
}
