import { Platform } from 'react-native';
import { colors } from './colors';

const shadow = (y, blur, opacity, elevation) =>
  Platform.select({
    ios: {
      shadowColor: colors.palette.codGray || colors.palette.black,
      shadowOffset: { width: 0, height: y },
      shadowOpacity: opacity,
      shadowRadius: blur,
    },
    android: {
      elevation,
      shadowColor: colors.palette.codGray || colors.palette.black,
    },
    default: {
      boxShadow: `0px ${y}px ${blur * 2}px rgba(8, 8, 8, ${opacity})`,
    },
  });

export const shadows = {
  none: {
    elevation: 0,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  soft: shadow(4, 8, 0.08, 2),
  sm: shadow(6, 10, 0.1, 3),
  md: shadow(10, 16, 0.12, 5),
  card: shadow(12, 18, 0.14, 6),
  lg: shadow(16, 24, 0.16, 8),
  hero: shadow(20, 28, 0.22, 10),
  pressed: shadow(3, 6, 0.06, 1),
};
