import { colors } from './colors';
import { spacing } from './spacing';
import { typography } from './typography';
import { radius } from './radius';
import { shadows } from './shadows';

export const theme = {
  colors,
  spacing,
  typography,
  radius,
  shadows,

  layout: {
    screenPaddingX: spacing.screenX,
    screenPaddingY: spacing.screenY,
    screenPaddingXCompact: spacing.screenXCompact,
    screenPaddingYCompact: spacing.screenYCompact,
    shortScreenHeight: 760,
    compactScreenHeight: 700,
    authHeroMinHeight: 250,
    authHeroMinHeightCompact: 220,
    dashboardHeroMinHeight: 152,
    dashboardHeroMinHeightCompact: 140,
    contentMaxWidth: 560,
    cardGap: spacing.section,
    cardGapCompact: spacing.sectionCompact,
    dashboardHeaderCompactHeight: 188,
    dashboardHeaderExpandedHeight: 212,
    dashboardFloatingNavOffset: spacing.lg,
    dashboardFloatingNavOffsetCompact: spacing.md,
    dashboardFloatingNavLift: spacing.xs,
    dashboardFloatingNavGap: spacing.lg,
    dashboardShellTopGap: spacing.sm,
    dashboardShellTopGapCompact: spacing.xs,
    dashboardShellBottomGap: spacing.xxl,
    dashboardShellBottomGapCompact: spacing.xl,
    dashboardNavMaxWidth: 520,
    dashboardRailCardWidth: 312,
    dashboardRailCardWidthCompact: 284,
    dashboardRailCompactWidth: 198,
    dashboardRailCompactWidthCompact: 180,
    authCardMaxWidth: 520,
  },

  buttons: {
    heightMd: 52,
    heightLg: 58,
    heightMdCompact: 48,
    heightLgCompact: 54,
  },

  inputs: {
    minHeight: 56,
    minHeightCompact: 52,
    otpSize: 52,
  },

  motion: {
    fast: 140,
    normal: 220,
    slow: 340,
    stagger: 70,
    screenEnter: 420,
    cardEnter: 320,
    pressIn: 90,
    pressOut: 180,
    focus: 180,
    nav: 240,
    contentSwap: 260,
    shake: 45,
    spring: {
      damping: 16,
      stiffness: 220,
      mass: 0.7,
    },
  },
};
