import type { Skill } from '@accomplish_ai/agent-core';

export type FilterType = 'all' | 'active' | 'inactive' | 'official';

export function getVisibleSkills(skills: Skill[]): Skill[] {
  return skills.filter((skill) => !skill.isHidden);
}

export function getFilterCounts(visibleSkills: Skill[]) {
  return {
    all: visibleSkills.length,
    active: visibleSkills.filter((skill) => skill.isEnabled).length,
    inactive: visibleSkills.filter((skill) => !skill.isEnabled).length,
    official: visibleSkills.filter((skill) => skill.source === 'official').length,
  };
}

export function getFilteredSkills(
  visibleSkills: Skill[],
  filter: FilterType,
  searchQuery: string,
): Skill[] {
  let result = visibleSkills;

  if (filter === 'active') {
    result = result.filter((skill) => skill.isEnabled);
  } else if (filter === 'inactive') {
    result = result.filter((skill) => !skill.isEnabled);
  } else if (filter === 'official') {
    result = result.filter((skill) => skill.source === 'official');
  }

  if (searchQuery.trim()) {
    const normalizedQuery = searchQuery.toLowerCase();
    result = result.filter(
      (skill) =>
        skill.name.toLowerCase().includes(normalizedQuery) ||
        skill.description.toLowerCase().includes(normalizedQuery) ||
        skill.command.toLowerCase().includes(normalizedQuery),
    );
  }

  return result;
}
