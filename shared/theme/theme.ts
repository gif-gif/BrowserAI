import { STORAGE_KEYS } from '../constants/storage-keys';
import type { ResolvedAppearance } from './appearance';

export const THEMES = [
  { id: 'blue', color: '#0b57d0', hover: '#0842a0', soft: '#e8f0fe', focus: 'rgba(11, 87, 208, .25)' },
  { id: 'indigo', color: '#4f46e5', hover: '#3730a3', soft: '#eef2ff', focus: 'rgba(79, 70, 229, .25)' },
  { id: 'violet', color: '#7c3aed', hover: '#5b21b6', soft: '#f5f3ff', focus: 'rgba(124, 58, 237, .25)' },
  { id: 'purple', color: '#9333ea', hover: '#6b21a8', soft: '#faf5ff', focus: 'rgba(147, 51, 234, .25)' },
  { id: 'fuchsia', color: '#a21caf', hover: '#701a75', soft: '#fdf4ff', focus: 'rgba(162, 28, 175, .25)' },
  { id: 'pink', color: '#be185d', hover: '#9d174d', soft: '#fdf2f8', focus: 'rgba(190, 24, 93, .25)' },
  { id: 'red', color: '#c5221f', hover: '#991b1b', soft: '#fef2f2', focus: 'rgba(197, 34, 31, .25)' },
  { id: 'orange', color: '#c2410c', hover: '#9a3412', soft: '#fff7ed', focus: 'rgba(194, 65, 12, .25)' },
  { id: 'amber', color: '#9a5b00', hover: '#744300', soft: '#fffbeb', focus: 'rgba(154, 91, 0, .25)' },
  { id: 'green', color: '#188038', hover: '#12612c', soft: '#ecfdf3', focus: 'rgba(24, 128, 56, .25)' },
  { id: 'teal', color: '#0f766e', hover: '#115e59', soft: '#f0fdfa', focus: 'rgba(15, 118, 110, .25)' },
  { id: 'sky', color: '#0369a1', hover: '#075985', soft: '#f0f9ff', focus: 'rgba(3, 105, 161, .25)' },
  { id: 'cyan', color: '#0e7490', hover: '#155e75', soft: '#ecfeff', focus: 'rgba(14, 116, 144, .25)' },
  { id: 'emerald', color: '#047857', hover: '#065f46', soft: '#ecfdf5', focus: 'rgba(4, 120, 87, .25)' },
  { id: 'lime', color: '#4d7c0f', hover: '#3f6212', soft: '#f7fee7', focus: 'rgba(77, 124, 15, .25)' },
  { id: 'olive', color: '#66710b', hover: '#4d5707', soft: '#fafce8', focus: 'rgba(102, 113, 11, .25)' },
  { id: 'gold', color: '#8a6500', hover: '#6b4e00', soft: '#fffbea', focus: 'rgba(138, 101, 0, .25)' },
  { id: 'brown', color: '#795548', hover: '#5d4037', soft: '#efebe9', focus: 'rgba(121, 85, 72, .25)' },
  { id: 'coral', color: '#b8473a', hover: '#8f342b', soft: '#fff3f0', focus: 'rgba(184, 71, 58, .25)' },
  { id: 'navy', color: '#1e3a8a', hover: '#172554', soft: '#eff6ff', focus: 'rgba(30, 58, 138, .25)' },
  { id: 'slate', color: '#475569', hover: '#334155', soft: '#f1f5f9', focus: 'rgba(71, 85, 105, .25)' },
] as const;

export type ThemeId = typeof THEMES[number]['id'];
export type ThemeDefinition = typeof THEMES[number];

export const DEFAULT_THEME: ThemeId = 'blue';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function getTheme(themeId: ThemeId): ThemeDefinition {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}

export interface ThemeTokens {
  color: string;
  hover: string;
  soft: string;
  focus: string;
}

/**
 * Accent tokens for the light or dark palette. The swatch colors are tuned for light surfaces; on dark ones the
 * accent is lifted toward white so text and icons stay readable, and the soft fill is mixed into the dark surface.
 */
export function getThemeTokens(theme: ThemeDefinition, appearance: ResolvedAppearance): ThemeTokens {
  if (appearance === 'light') return { color: theme.color, hover: theme.hover, soft: theme.soft, focus: theme.focus };
  return {
    color: `color-mix(in srgb, ${theme.color} 58%, white)`,
    hover: `color-mix(in srgb, ${theme.color} 44%, white)`,
    soft: `color-mix(in srgb, ${theme.color} 30%, #1e1f22)`,
    focus: `color-mix(in srgb, ${theme.color} 55%, transparent)`,
  };
}

export async function loadThemePreference(): Promise<ThemeId> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.get) return DEFAULT_THEME;
  const stored = await browser.storage.local.get(STORAGE_KEYS.themePreference);
  const value = stored[STORAGE_KEYS.themePreference];
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export async function saveThemePreference(themeId: ThemeId): Promise<void> {
  if (typeof browser === 'undefined' || !browser.storage?.local?.set) return;
  await browser.storage.local.set({ [STORAGE_KEYS.themePreference]: themeId });
}
