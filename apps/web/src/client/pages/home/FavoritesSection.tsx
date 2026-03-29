import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X } from '@phosphor-icons/react';
import { springs } from '@/lib/animations';
import type { StoredFavorite } from '@accomplish_ai/agent-core';
import { FAVORITES_PREVIEW_COUNT } from './useHomePage';

interface FavoritesSectionProps {
  favoritesList: StoredFavorite[];
  displayedFavorites: StoredFavorite[];
  hasMoreFavorites: boolean;
  showAllFavorites: boolean;
  onSetPrompt: (prompt: string) => void;
  onRemoveFavorite: (taskId: string) => void;
  onShowAll: () => void;
}

export function FavoritesSection({
  favoritesList,
  displayedFavorites,
  hasMoreFavorites,
  showAllFavorites,
  onSetPrompt,
  onRemoveFavorite,
  onShowAll,
}: FavoritesSectionProps) {
  const { t } = useTranslation('home');
  const removeFavoriteLabel = t('favorites.remove');

  return (
    <div
      id="favorites"
      data-testid="favorites-section"
      className="flex flex-col gap-3 w-full scroll-mt-4"
    >
      <h2 className="font-apparat text-[22px] font-light tracking-[-0.66px] text-foreground text-center">
        {t('favorites.title')}
      </h2>
      {favoritesList.length > 0 ? (
        <>
          <div className="grid grid-cols-3 gap-4 w-full">
            <AnimatePresence>
              {displayedFavorites.map((fav) => (
                <motion.div
                  key={fav.taskId}
                  role="button"
                  tabIndex={0}
                  data-testid="favorite-item"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={springs.gentle}
                  whileTap={{ scale: 0.98 }}
                  layout
                  onClick={() => onSetPrompt(fav.prompt)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) {
                      return;
                    }
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSetPrompt(fav.prompt);
                    }
                  }}
                  className="group flex flex-col justify-between rounded-[4px] border border-border hover:border-muted-foreground/40 active:border-muted-foreground/40 bg-accent pl-3 pr-4 py-3 text-left min-h-[80px] transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between w-full">
                    <p className="font-sans text-[14px] leading-[18px] tracking-[-0.28px] text-foreground line-clamp-2 w-[120px]">
                      {fav.summary || fav.prompt.slice(0, 60)}
                      {(fav.summary || fav.prompt).length > 60 ? '…' : ''}
                    </p>
                    <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-all duration-200 translate-y-1 group-hover:translate-y-0 group-active:translate-y-0">
                      <button
                        type="button"
                        data-testid="favorite-remove"
                        data-fav-remove
                        onClick={(e) => {
                          e.stopPropagation();
                          void onRemoveFavorite(fav.taskId);
                        }}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
                        title={removeFavoriteLabel}
                        aria-label={removeFavoriteLabel}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {hasMoreFavorites && !showAllFavorites && (
            <button
              type="button"
              data-testid="favorites-show-all"
              onClick={onShowAll}
              className="text-center text-[13px] leading-[15px] tracking-[-0.13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {t('favorites.showAll', { count: favoritesList.length })}
            </button>
          )}
        </>
      ) : (
        <p className="text-center text-[13px] leading-[15px] tracking-[-0.13px] text-muted-foreground">
          {t('favorites.empty')}
        </p>
      )}
    </div>
  );
}

export { FAVORITES_PREVIEW_COUNT };
