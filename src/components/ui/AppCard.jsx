import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme, resolveThemeRoles } from '../../design-system/theme';
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
  const roles = resolveThemeRoles(resolvedTheme);
  const variantConfig = {
    default: {
      backgroundColor: roles.defaultCardBackground,
      borderColor: roles.defaultCardBorder,
      shadow: CARD_VARIANTS.default.shadow,
    },
    elevated: {
      backgroundColor: roles.defaultCardBackground,
      borderColor: roles.supportCardBorder,
      shadow: CARD_VARIANTS.elevated.shadow,
    },
    soft: {
      backgroundColor: roles.supportCardBackground,
      borderColor: roles.supportCardBorder,
      shadow: CARD_VARIANTS.soft.shadow,
    },
    outline: {
      backgroundColor: roles.pageBackground,
      borderColor: roles.defaultCardBorder,
      shadow: CARD_VARIANTS.outline.shadow,
    },
    hero: {
      backgroundColor: roles.heroBackground,
      borderColor: roles.heroBorder,
      shadow: CARD_VARIANTS.hero.shadow,
    },
    donorTint: {
      backgroundColor: roles.supportCardBackground,
      borderColor: roles.supportCardBorder,
      shadow: CARD_VARIANTS.donorTint.shadow,
    },
    patientTint: {
      backgroundColor: roles.accentCardBackground,
      borderColor: roles.accentCardBorder,
      shadow: CARD_VARIANTS.patientTint.shadow,
    },
  };
  const config = variantConfig[variant] || variantConfig.default;
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
      backgroundColor: config.backgroundColor,
      borderColor: config.borderColor,
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
