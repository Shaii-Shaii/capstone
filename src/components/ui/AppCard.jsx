import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const CARD_VARIANTS = {
  default: {
    backgroundColor: theme.colors.surfaceCard,
    borderColor: theme.colors.borderSubtle,
    shadow: theme.shadows.card,
    gradient: null,
  },
  elevated: {
    backgroundColor: theme.colors.surfaceCard,
    borderColor: theme.colors.borderMuted,
    shadow: theme.shadows.lg,
    gradient: null,
  },
  soft: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.borderMuted,
    shadow: theme.shadows.soft,
    gradient: null,
  },
  outline: {
    backgroundColor: theme.colors.surfaceCard,
    borderColor: theme.colors.borderStrong,
    shadow: theme.shadows.none,
    gradient: null,
  },
  hero: {
    backgroundColor: theme.colors.surfaceHero,
    borderColor: theme.colors.whiteOverlay,
    shadow: theme.shadows.hero,
    gradient: [theme.colors.heroFrom, theme.colors.heroTo],
  },
  donorTint: {
    backgroundColor: theme.colors.surfaceCard,
    borderColor: theme.colors.brandPrimaryMuted,
    shadow: theme.shadows.card,
    gradient: [theme.colors.donorCardFrom, theme.colors.donorCardTo],
  },
  patientTint: {
    backgroundColor: theme.colors.surfaceCard,
    borderColor: theme.colors.borderMuted,
    shadow: theme.shadows.card,
    gradient: [theme.colors.patientCardFrom, theme.colors.patientCardTo],
  },
};

export const AppCard = ({
  children,
  variant = 'default',
  padding = 'md',
  radius = 'lg',
  style,
  contentStyle,
  enteringDelay = 0,
}) => {
  const { resolvedTheme } = useAuth();
  const config = CARD_VARIANTS[variant] || CARD_VARIANTS.default;
  const tintedBackgroundColor = resolvedTheme?.secondaryColor || resolvedTheme?.backgroundColor || config.backgroundColor;
  const backgroundColor = variant === 'soft'
    ? theme.colors.surfaceSoft
    : variant === 'hero' || variant === 'donorTint' || variant === 'patientTint'
      ? tintedBackgroundColor
      : resolvedTheme?.backgroundColor || config.backgroundColor;
  const borderColor = resolvedTheme?.secondaryColor || config.borderColor;
  const resolvedPadding =
    padding === 'none'
      ? 0
      : padding === 'lg'
      ? theme.spacing.cardPaddingLg
      : padding === 'sm'
        ? theme.spacing.lg
        : padding === 'xs'
          ? theme.spacing.cardPaddingDense
          : theme.spacing.cardPadding;
  const cardStyles = [
    styles.card,
    {
      borderRadius: theme.radius[radius] || theme.radius.lg,
      padding: resolvedPadding,
      backgroundColor,
      borderColor,
    },
    config.shadow,
    style,
  ];

  return (
    <View style={cardStyles}>
      <View style={contentStyle}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
});
