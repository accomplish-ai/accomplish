export interface OnboardingMission {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'setup' | 'tasks' | 'skills' | 'advanced';
  estimatedMinutes: number;
  points: number;
  prerequisiteIds?: string[];
  completed: boolean;
  actionType?: 'provider-setup' | 'run-task' | 'create-skill' | 'enable-skill' | 'settings';
  actionData?: Record<string, any>;
}

export const ONBOARDING_MISSIONS: Omit<OnboardingMission, 'completed'>[] = [
  {
    id: 'connect-provider',
    title: 'Connect Your First Provider',
    description: 'Connect an AI provider (OpenAI, Anthropic, Google, etc.) to start using Accomplish',
    icon: '🔗',
    category: 'setup',
    estimatedMinutes: 3,
    points: 10,
    actionType: 'provider-setup',
  },
  {
    id: 'run-first-task',
    title: 'Run Your First Task',
    description: 'Ask Accomplish to help you with something - try file organization or research',
    icon: '🚀',
    category: 'tasks',
    estimatedMinutes: 5,
    points: 15,
    prerequisiteIds: ['connect-provider'],
    actionType: 'run-task',
  },
  {
    id: 'explore-task-history',
    title: 'Explore Task History',
    description: 'View your completed tasks and see how Accomplish tracked its work',
    icon: '📜',
    category: 'tasks',
    estimatedMinutes: 2,
    points: 5,
    prerequisiteIds: ['run-first-task'],
  },
  {
    id: 'enable-skill',
    title: 'Enable a Skill',
    description: 'Browse the skills library and enable a skill that matches your workflow',
    icon: '⚡',
    category: 'skills',
    estimatedMinutes: 3,
    points: 10,
    actionType: 'enable-skill',
  },
  {
    id: 'use-skill',
    title: 'Use a Skill',
    description: 'Run a task using one of your enabled skills',
    icon: '✨',
    category: 'skills',
    estimatedMinutes: 5,
    points: 15,
    prerequisiteIds: ['enable-skill'],
    actionType: 'run-task',
    actionData: { usesSkill: true },
  },
  {
    id: 'customize-appearance',
    title: 'Customize Appearance',
    description: 'Set your preferred theme (light, dark, or system)',
    icon: '🎨',
    category: 'setup',
    estimatedMinutes: 1,
    points: 5,
    actionType: 'settings',
    actionData: { tab: 'appearance' },
  },
  {
    id: 'create-custom-skill',
    title: 'Create a Custom Skill',
    description: 'Design your own skill tailored to your specific workflow',
    icon: '🛠️',
    category: 'skills',
    estimatedMinutes: 10,
    points: 25,
    prerequisiteIds: ['use-skill'],
    actionType: 'create-skill',
  },
  {
    id: 'configure-safety',
    title: 'Configure Safety Settings',
    description: 'Adjust safety levels and dry-run mode to match your preferences',
    icon: '🛡️',
    category: 'advanced',
    estimatedMinutes: 3,
    points: 10,
    actionType: 'settings',
    actionData: { tab: 'advanced' },
  },
  {
    id: 'explore-connectors',
    title: 'Explore Connectors',
    description: 'Check out available connectors to integrate with other services',
    icon: '🔌',
    category: 'advanced',
    estimatedMinutes: 5,
    points: 15,
    actionType: 'settings',
    actionData: { tab: 'connectors' },
  },
  {
    id: 'complete-10-tasks',
    title: 'Complete 10 Tasks',
    description: 'Build momentum by completing 10 tasks with Accomplish',
    icon: '🏆',
    category: 'tasks',
    estimatedMinutes: 30,
    points: 50,
    prerequisiteIds: ['run-first-task'],
  },
];

export interface OnboardingProgress {
  completedMissionIds: string[];
  totalPoints: number;
  level: number;
}

export function calculateOnboardingProgress(completedMissionIds: string[]): OnboardingProgress {
  const completedSet = new Set(completedMissionIds);
  const totalPoints = ONBOARDING_MISSIONS
    .filter(m => completedSet.has(m.id))
    .reduce((sum, m) => sum + m.points, 0);
  
  // Level up every 50 points
  const level = Math.floor(totalPoints / 50) + 1;
  
  return {
    completedMissionIds,
    totalPoints,
    level,
  };
}

export function getAvailableMissions(completedMissionIds: string[]): OnboardingMission[] {
  const completedSet = new Set(completedMissionIds);
  
  return ONBOARDING_MISSIONS
    .filter(mission => {
      // Filter out already completed missions
      if (completedSet.has(mission.id)) {
        return false;
      }
      
      // Check if prerequisites are met
      if (mission.prerequisiteIds && mission.prerequisiteIds.length > 0) {
        return mission.prerequisiteIds.every(prereqId => completedSet.has(prereqId));
      }
      
      return true;
    })
    .map(mission => ({ ...mission, completed: false }));
}

export function getAllMissionsWithStatus(completedMissionIds: string[]): OnboardingMission[] {
  const completedSet = new Set(completedMissionIds);
  
  return ONBOARDING_MISSIONS.map(mission => ({
    ...mission,
    completed: completedSet.has(mission.id),
  }));
}

export function getMissionsByCategory(
  category: OnboardingMission['category'],
  completedMissionIds: string[]
): OnboardingMission[] {
  const completedSet = new Set(completedMissionIds);
  
  return ONBOARDING_MISSIONS
    .filter(m => m.category === category)
    .map(mission => ({ ...mission, completed: completedSet.has(mission.id) }));
}
