import React from 'react';
import { View, Text, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const AppLogoHeader = ({
  title,
  subtitle,
  eyebrow = '',
  showLogo = true,
  variant = 'authHero',
  align = 'center',
  style,
}) => {
  const { resolvedTheme } = useAuth();
  const { width, height } = useWindowDimensions();
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const isCompact = variant === 'compact';
  const isAuthCard = variant === 'authCard';
  const isNarrow = width < 390;
  const titleColor = isCompact || isAuthCard
    ? (resolvedTheme?.primaryTextColor || theme.colors.textPrimary)
    : theme.colors.textInverse;
  const subtitleColor = isCompact || isAuthCard
    ? (resolvedTheme?.secondaryTextColor || theme.colors.textSecondary)
    : theme.colors.textHeroMuted;
  const logoUri = resolvedTheme?.logoIcon || '';
  const eyebrowLabel = eyebrow || resolvedTheme?.brandName || '';
  const cardBackground = resolvedTheme?.primaryColor || (isCompact || isAuthCard ? theme.colors.surfaceCard : theme.colors.heroFrom);

  return (
    <View style={[styles.container, align === 'left' ? styles.leftAligned : null, style]}>
      {showLogo && (logoUri || eyebrowLabel) ? (
        <View
          style={[
            styles.logoWrap,
            { backgroundColor: cardBackground },
            isCompact ? styles.logoWrapCompact : null,
            isAuthCard ? styles.logoWrapAuthCard : null,
            isAuthCard && isCompactScreen ? styles.logoWrapAuthCardCompact : null,
            isNarrow ? styles.logoWrapNarrow : null,
          ]}
        >
          {eyebrowLabel ? (
            <View style={styles.logoPill}>
              <Text style={styles.logoPillText}>{eyebrowLabel}</Text>
            </View>
          ) : null}
          {logoUri ? (
            <View
              style={[
                styles.logoFrame,
                isCompact ? styles.logoFrameCompact : null,
                isAuthCard ? styles.logoFrameAuthCard : null,
                isAuthCard && isCompactScreen ? styles.logoFrameAuthCardCompact : null,
              ]}
            >
              <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="contain" />
            </View>
          ) : null}
          {!isCompact && logoUri ? <View style={styles.logoGlow} /> : null}
        </View>
      ) : null}

      {title ? (
        <Text
          style={[
            styles.title,
            isAuthCard ? styles.titleAuthCard : null,
            isAuthCard && isCompactScreen ? styles.titleAuthCardCompact : null,
            isNarrow ? styles.titleNarrow : null,
            { color: titleColor },
            align === 'left' ? styles.leftText : null,
          ]}
        >
          {title}
        </Text>
      ) : null}

      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            isAuthCard ? styles.subtitleAuthCard : null,
            isAuthCard && isCompactScreen ? styles.subtitleAuthCardCompact : null,
            isNarrow ? styles.subtitleNarrow : null,
            { color: subtitleColor },
            align === 'left' ? styles.leftText : null,
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    marginBottom: theme.spacing.lg,
  },
  leftAligned: {
    alignItems: 'flex-start',
  },
  logoWrap: {
    minWidth: 176,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
    ...theme.shadows.hero,
  },
  logoWrapCompact: {
    minWidth: 144,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  logoWrapAuthCard: {
    width: '100%',
    minWidth: 0,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    alignItems: 'flex-start',
    borderRadius: 28,
  },
  logoWrapAuthCardCompact: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  logoWrapNarrow: {
    width: '100%',
    minWidth: 0,
  },
  logoPill: {
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.whiteOverlay,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  logoPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
    letterSpacing: 0.4,
  },
  logoFrame: {
    width: 112,
    height: 112,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.whiteOverlay,
    backgroundColor: theme.colors.backgroundCanvas,
  },
  logoFrameCompact: {
    width: 84,
    height: 84,
  },
  logoFrameAuthCard: {
    width: 58,
    height: 58,
    marginTop: theme.spacing.sm,
  },
  logoFrameAuthCardCompact: {
    width: 50,
    height: 50,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoGlow: {
    marginTop: theme.spacing.md,
    alignSelf: 'center',
    width: 54,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentStrong,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleLg,
    lineHeight: theme.typography.semantic.titleLg * theme.typography.lineHeights.tight,
    color: theme.colors.textInverse,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  titleNarrow: {
    fontSize: theme.typography.semantic.titleMd,
  },
  titleAuthCard: {
    fontSize: theme.typography.semantic.titleMd,
    lineHeight: theme.typography.semantic.titleMd * theme.typography.lineHeights.tight,
    marginBottom: theme.spacing.xs,
  },
  titleAuthCardCompact: {
    fontSize: theme.typography.compact.titleMd,
    lineHeight: theme.typography.compact.titleMd * theme.typography.lineHeights.tight,
  },
  subtitle: {
    maxWidth: 440,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
    textAlign: 'center',
  },
  subtitleNarrow: {
    fontSize: theme.typography.semantic.bodySm,
  },
  subtitleAuthCard: {
    maxWidth: 330,
    fontSize: theme.typography.semantic.bodySm,
  },
  subtitleAuthCardCompact: {
    maxWidth: 300,
    fontSize: theme.typography.compact.bodySm,
  },
  leftText: {
    textAlign: 'left',
  },
});
