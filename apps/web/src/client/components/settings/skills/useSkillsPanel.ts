import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Skill } from '@accomplish_ai/agent-core';
import { createLogger } from '@/lib/logger';
import {
  type FilterType,
  getFilterCounts,
  getFilteredSkills,
  getVisibleSkills,
} from './skillsFiltering';

export type { FilterType } from './skillsFiltering';

export interface UseSkillsPanelResult {
  loading: boolean;
  searchQuery: string;
  filter: FilterType;
  isAtBottom: boolean;
  isResyncing: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  filterCounts: { all: number; active: number; inactive: number; official: number };
  filteredSkills: Skill[];
  setFilter: (f: FilterType) => void;
  handleToggle: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  handleEdit: (filePath: string) => Promise<void>;
  handleShowInFolder: (filePath: string) => Promise<void>;
  handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleResync: () => Promise<void>;
  checkScrollPosition: () => void;
}

const logger = createLogger('SkillsPanel');

export function useSkillsPanel(refreshTrigger?: number): UseSkillsPanelResult {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [isAtBottom, setIsAtBottom] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleSkills = useMemo(() => getVisibleSkills(skills), [skills]);
  const filterCounts = useMemo(() => getFilterCounts(visibleSkills), [visibleSkills]);
  const filteredSkills = useMemo(
    () => getFilteredSkills(visibleSkills, filter, searchQuery),
    [visibleSkills, filter, searchQuery],
  );

  const checkScrollPosition = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const threshold = 5;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setIsAtBottom(atBottom);
  }, []);

  useEffect(() => {
    checkScrollPosition();
  }, [filteredSkills, checkScrollPosition]);

  useEffect(() => {
    let isCurrent = true;

    if (!window.accomplish) {
      logger.error('Accomplish API not available');
      setLoading(false);
      return;
    }
    window.accomplish
      .getSkills()
      .then((nextSkills) => {
        if (isCurrent) {
          setSkills(nextSkills);
        }
      })
      .catch((err: unknown) => logger.error('Failed to load skills:', err))
      .finally(() => {
        if (isCurrent) {
          setLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [refreshTrigger]);

  const handleToggle = useCallback(
    async (id: string) => {
      const skill = skills.find((s) => s.id === id);
      if (!skill || !window.accomplish) {
        return;
      }
      try {
        await window.accomplish.setSkillEnabled(id, !skill.isEnabled);
        setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, isEnabled: !s.isEnabled } : s)));
      } catch (err) {
        logger.error('Failed to toggle skill:', err);
      }
    },
    [skills],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const skill = skills.find((s) => s.id === id);
      if (!skill || !window.accomplish) {
        return;
      }
      if (skill.source === 'official') {
        logger.warn('Cannot delete official skills');
        return;
      }
      try {
        await window.accomplish.deleteSkill(id);
        setSkills((prev) => prev.filter((s) => s.id !== id));
      } catch (err) {
        logger.error('Failed to delete skill:', err);
      }
    },
    [skills],
  );

  const handleEdit = useCallback(async (filePath: string) => {
    if (!window.accomplish) {
      return;
    }
    try {
      await window.accomplish.openSkillInEditor(filePath);
    } catch (err) {
      logger.error('Failed to open skill in editor:', err);
    }
  }, []);

  const handleShowInFolder = useCallback(async (filePath: string) => {
    if (!window.accomplish) {
      return;
    }
    try {
      await window.accomplish.showSkillInFolder(filePath);
    } catch (err) {
      logger.error('Failed to show skill in folder:', err);
    }
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  const handleResync = useCallback(async () => {
    if (!window.accomplish || isResyncing) {
      return;
    }
    setIsResyncing(true);
    try {
      const [updatedSkills] = await Promise.all([
        window.accomplish.resyncSkills(),
        new Promise((resolve) => setTimeout(resolve, 600)),
      ]);
      setSkills(updatedSkills);
    } catch (err) {
      logger.error('Failed to resync skills:', err);
    } finally {
      setIsResyncing(false);
    }
  }, [isResyncing]);

  return {
    loading,
    searchQuery,
    filter,
    isAtBottom,
    isResyncing,
    scrollRef,
    filterCounts,
    filteredSkills,
    setFilter,
    handleToggle,
    handleDelete,
    handleEdit,
    handleShowInFolder,
    handleSearchChange,
    handleResync,
    checkScrollPosition,
  };
}
