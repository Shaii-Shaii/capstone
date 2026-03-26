import { Platform } from 'react-native';

const fontFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'System',
});

const fontFamilyDisplay = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia',
});

export const typography = {
  fontFamily,
  fontFamilyDisplay,

  sizes: {
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    h3: 24,
    h2: 30,
    h1: 36,
    title1: 44,
  },

  semantic: {
    caption: 12,
    label: 13,
    bodySm: 14,
    body: 15,
    bodyLg: 17,
    titleSm: 22,
    titleMd: 30,
    titleLg: 38,
    display: 46,
  },
  compact: {
    caption: 11,
    label: 12,
    bodySm: 13,
    body: 14,
    bodyLg: 16,
    titleSm: 20,
    titleMd: 26,
    titleLg: 32,
    display: 38,
  },

  weights: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },

  lineHeights: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.65,
  },
};
