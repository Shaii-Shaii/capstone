import React from 'react';
import { View, Text, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { theme, resolveBrandLogoSource, resolveThemeRoles } from '../../design-system/theme';
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
  const roles = resolveThemeRoles(resolvedTheme);
  const { width, height } = useWindowDimensions();
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const isCompact = variant === 'compact';
  const isAuthCard = variant === 'authCard';
  const isNarrow = width < 390;
  const [imageFailed, setImageFailed] = React.useState(false);
  const titleColor = isCompact || isAuthCard
    ? roles.headingText
    : roles.heroHeadingText;
  const subtitleColor = isCompact || isAuthCard
    ? roles.bodyText
    : roles.heroBodyText;
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const eyebrowLabel = eyebrow || resolvedTheme?.brandName || '';
  const cardBackground = isCompact || isAuthCard ? roles.defaultCardBackground : roles.heroBackground;
  const cardBorder = isCompact || isAuthCard ? roles.defaultCardBorder : roles.heroBorder;
  const pillBackground = isCompact || isAuthCard ? roles.badgeBackground : roles.headerUtilityBackground;
  const pillTextColor = isCompact || isAuthCard ? roles.badgeText : roles.headerUtilityText;

  React.useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    <View style={[styles.container, align === 'left' ? styles.leftAligned : null, style]}>
      {showLogo && (logoSource || eyebrowLabel) ? (
        <View
          style={[
            styles.logoWrap,
            { backgroundColor: cardBackground, borderColor: cardBorder },
            isCompact ? styles.logoWrapCompact : null,
            isAuthCard ? styles.logoWrapAuthCard : null,
            isAuthCard && isCompactScreen ? styles.logoWrapAuthCardCompact : null,
            isNarrow ? styles.logoWrapNarrow : null,
          ]}
        >
          {eyebrowLabel ? (
            <View style={[styles.logoPill, { backgroundColor: pillBackground, borderColor: cardBorder }]}>
              <Text style={[styles.logoPillText, { color: pillTextColor }]}>{eyebrowLabel}</Text>
            </View>
          ) : null}
          {logoSource ? (
            <View
              style={[
                styles.logoFrame,
                { borderColor: cardBorder, backgroundColor: roles.pageBackground },
                isCompact ? styles.logoFrameCompact : null,
                isAuthCard ? styles.logoFrameAuthCard : null,
                isAuthCard && isCompactScreen ? styles.logoFrameAuthCardCompact : null,
              ]}
            >
              <Image source={logoSource} style={styles.logoImage} resizeMode="contain" onError={() => setImageFailed(true)} />
            </View>
          ) : null}
          {!isCompact && logoSource ? <View style={[styles.logoGlow, { backgroundColor: roles.primaryActionBackground }]} /> : null}
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
    borderWidth: 1,
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
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  logoPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.label,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.4,
  },
  logoFrame: {
    width: 112,
    height: 112,
    marginTop: theme.spacing.md,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    borderWidth: 2,
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
