
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
  [PromptCategory.RELATIONSHIP]: '#818cf8', // vibrant indigo
  [PromptCategory.MEMORIES]: '#2dd4bf',     // vibrant teal
  [PromptCategory.STORY]: '#fbbf24',        // vibrant amber
  [PromptCategory.POEM]: '#c084fc',         // vibrant purple
  [PromptCategory.DATE_IDEA]: '#f472b6',    // vibrant pink
  [PromptCategory.PROXIMITY]: '#fb7185',    // vibrant rose
  [PromptCategory.CONTROVERSY]: '#fb923c',  // vibrant orange
  [PromptCategory.SEXY]: '#f87171',         // vibrant red
  [PromptCategory.FUNNY]: '#a3e635',        // vibrant lime
  [PromptCategory.FUTURE]: '#22d3ee',       // vibrant cyan
  [PromptCategory.MUSIC]: '#60a5fa',        // vibrant blue
  [PromptCategory.FAMILY]: '#34d399',       // vibrant emerald
  [PromptCategory.GROWTH]: '#fcd34d',       // vibrant yellow
  [PromptCategory.PAST]: '#a1a1aa',         // vibrant zinc
};

export const COLORS = {
  background: '#0a0a0a',
  card: '#121212',
  text: '#ffffff',
  muted: '#71717a',
  border: '#1f1f1f',
  accent: '#6366f1',
  danger: '#f43f5e',
};
