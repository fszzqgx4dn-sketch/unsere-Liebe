
import { PromptCategory } from './types';

export const DAILY_CATEGORIES = [
  PromptCategory.RELATIONSHIP,
  PromptCategory.MEMORIES,
  PromptCategory.STORY,
  PromptCategory.POEM,
  PromptCategory.DATE_IDEA
];

export const MORE_CATEGORIES = [
  PromptCategory.CONTROVERSY,
  PromptCategory.SEXY,
  PromptCategory.FUNNY,
  PromptCategory.FUTURE,
  PromptCategory.MUSIC,
  PromptCategory.FAMILY,
  PromptCategory.GROWTH,
  PromptCategory.PAST
];

export const CATEGORY_COLORS: Record<PromptCategory, string> = {
  [PromptCategory.RELATIONSHIP]: '#6366f1', // indigo
  [PromptCategory.MEMORIES]: '#14b8a6',     // teal
  [PromptCategory.STORY]: '#f59e0b',        // amber
  [PromptCategory.POEM]: '#a855f7',         // purple
  [PromptCategory.DATE_IDEA]: '#ec4899',    // pink
  [PromptCategory.PROXIMITY]: '#f43f5e',    // rose
  [PromptCategory.CONTROVERSY]: '#f97316',  // orange
  [PromptCategory.SEXY]: '#ef4444',         // red
  [PromptCategory.FUNNY]: '#84cc16',        // lime
  [PromptCategory.FUTURE]: '#06b6d4',       // cyan
  [PromptCategory.MUSIC]: '#3b82f6',        // blue
  [PromptCategory.FAMILY]: '#10b981',       // emerald
  [PromptCategory.GROWTH]: '#fbbf24',       // yellow
  [PromptCategory.PAST]: '#71717a',         // zinc
};

export const COLORS = {
  background: '#0a0a0a',
  card: '#171717',
  text: '#ffffff',
  muted: '#a1a1aa',
  border: '#262626',
};
