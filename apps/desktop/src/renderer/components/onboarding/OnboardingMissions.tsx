import { useEffect, useState } from 'react';
import { getAccomplish } from '../../lib/accomplish';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { CheckCircle2, Circle, Lock, Trophy, Zap, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';

interface OnboardingMission {
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

interface OnboardingProgress {
  completedMissionIds: string[];
  totalPoints: number;
  level: number;
}

// Import mission definitions from core package
const MISSIONS: Omit<OnboardingMission, 'completed'>[] = [
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

const CATEGORY_COLORS = {
  setup: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  tasks: 'bg-green-500/10 text-green-700 dark:text-green-300',
  skills: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',
  advanced: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
};

const CATEGORY_LABELS = {
  setup: 'Setup',
  tasks: 'Tasks',
  skills: 'Skills',
  advanced: 'Advanced',
};

function isLocked(mission: OnboardingMission, completedIds: string[]): boolean {
  if (!mission.prerequisiteIds || mission.prerequisiteIds.length === 0) {
    return false;
  }
  return !mission.prerequisiteIds.every(prereqId => completedIds.includes(prereqId));
}

export function OnboardingMissions() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [missions, setMissions] = useState<OnboardingMission[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      const accomplish = getAccomplish();
      const progressData = await accomplish.getOnboardingProgress();
      setProgress(progressData);

      // Merge progress with mission definitions
      const missionsWithStatus = MISSIONS.map(m => ({
        ...m,
        completed: progressData.completedMissionIds.includes(m.id),
      }));

      setMissions(missionsWithStatus);
    } catch (error) {
      console.error('Failed to load onboarding progress:', error);
    }
  };

  const handleCompleteMission = async (missionId: string) => {
    try {
      const accomplish = getAccomplish();
      await accomplish.completeMission(missionId);
      await loadProgress();
    } catch (error) {
      console.error('Failed to complete mission:', error);
    }
  };

  if (!progress) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading missions...</div>
      </div>
    );
  }

  const totalMissions = MISSIONS.length;
  const completedCount = progress.completedMissionIds.length;
  const progressPercentage = (completedCount / totalMissions) * 100;
  const pointsToNextLevel = progress.level * 50;
  const pointsInLevel = progress.totalPoints % 50;
  const levelProgress = (pointsInLevel / 50) * 100;

  const categories = ['all', 'setup', 'tasks', 'skills', 'advanced'];
  const filteredMissions =
    selectedCategory === 'all'
      ? missions
      : missions.filter(m => m.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header with progress */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Onboarding Missions</h2>
            <p className="text-sm text-muted-foreground">
              Complete missions to level up and master Accomplish
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <span className="text-2xl font-bold">Level {progress.level}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {pointsInLevel}/{pointsToNextLevel % 50 || 50} XP
              </div>
            </div>
          </div>
        </div>

        {/* Level progress bar */}
        <div className="space-y-1">
          <Progress value={levelProgress} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.totalPoints} total points</span>
            <span>
              {completedCount}/{totalMissions} missions
            </span>
          </div>
        </div>

        {/* Overall progress */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-8 w-8 text-primary" />
                <div>
                  <div className="font-semibold">
                    {completedCount === totalMissions ? 'All Missions Complete!' : 'Keep Going!'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {completedCount === totalMissions
                      ? 'You\'ve mastered Accomplish'
                      : `${totalMissions - completedCount} missions remaining`}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">
                  {Math.round(progressPercentage)}%
                </div>
                <div className="text-xs text-muted-foreground">Complete</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === 'all' ? 'All' : CATEGORY_LABELS[cat as keyof typeof CATEGORY_LABELS]}
          </Button>
        ))}
      </div>

      {/* Mission cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredMissions.map(mission => {
          const locked = isLocked(mission, progress.completedMissionIds);
          
          return (
            <Card
              key={mission.id}
              className={cn(
                'transition-all hover:shadow-md',
                mission.completed && 'opacity-75',
                locked && 'opacity-50'
              )}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{mission.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">{mission.title}</CardTitle>
                        {mission.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : locked ? (
                          <Lock className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <CardDescription className="mt-1">{mission.description}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={CATEGORY_COLORS[mission.category]} variant="secondary">
                      {CATEGORY_LABELS[mission.category]}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {mission.estimatedMinutes} min
                    </Badge>
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {mission.points} XP
                    </Badge>
                  </div>
                  {!mission.completed && !locked && (
                    <Button size="sm" onClick={() => handleCompleteMission(mission.id)}>
                      Mark Complete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredMissions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No missions in this category
        </div>
      )}
    </div>
  );
}
