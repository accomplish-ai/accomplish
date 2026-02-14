import type { Database } from 'better-sqlite3';
import type { OnboardingProgress } from '../../utils/onboarding-missions.js';
import { ONBOARDING_MISSIONS, calculateOnboardingProgress } from '../../utils/onboarding-missions.js';

export interface OnboardingProgressAPI {
  getProgress(): OnboardingProgress;
  completeMission(missionId: string): void;
  resetProgress(): void;
}

export function createOnboardingProgressRepository(db: Database): OnboardingProgressAPI {
  return {
    getProgress(): OnboardingProgress {
      const row = db
        .prepare(
          `SELECT completed_mission_ids, total_points, level 
           FROM onboarding_progress 
           WHERE id = 1`
        )
        .get() as {
        completed_mission_ids: string;
        total_points: number;
        level: number;
      } | undefined;

      if (!row) {
        return {
          completedMissionIds: [],
          totalPoints: 0,
          level: 1,
        };
      }

      return {
        completedMissionIds: JSON.parse(row.completed_mission_ids) as string[],
        totalPoints: row.total_points,
        level: row.level,
      };
    },

    completeMission(missionId: string): void {
      const progress = this.getProgress();
      
      // Avoid duplicate completions
      if (progress.completedMissionIds.includes(missionId)) {
        return;
      }

      const mission = ONBOARDING_MISSIONS.find(m => m.id === missionId);
      if (!mission) {
        console.warn(`[Onboarding] Unknown mission: ${missionId}`);
        return;
      }

      const newCompletedIds = [...progress.completedMissionIds, missionId];
      const newProgress = calculateOnboardingProgress(newCompletedIds);

      db.prepare(
        `UPDATE onboarding_progress 
         SET completed_mission_ids = ?, 
             total_points = ?, 
             level = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`
      ).run(
        JSON.stringify(newProgress.completedMissionIds),
        newProgress.totalPoints,
        newProgress.level
      );

      console.log(`[Onboarding] Mission completed: ${missionId} (+${mission.points} points)`);
    },

    resetProgress(): void {
      db.prepare(
        `UPDATE onboarding_progress 
         SET completed_mission_ids = '[]', 
             total_points = 0, 
             level = 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = 1`
      ).run();
    },
  };
}
