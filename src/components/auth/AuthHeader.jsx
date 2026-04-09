import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import { theme } from '../../design-system/theme';
import { AppTextLink } from '../ui/AppTextLink';

export const AuthHeader = ({
  title,
  subtitle,
  eyebrow,
  style,
  backLabel,
  onBackPress,
  minimal = false,
  resolvedTheme = null,
}) => {
  const logoUri = resolvedTheme?.logoIcon || '';
  const brandName = resolvedTheme?.brandName || '';
  const titleColor = resolvedTheme?.primaryTextColor || theme.colors.textPrimary;
  const subtitleColor = resolvedTheme?.secondaryTextColor || theme.colors.textSecondary;
  const pillColor = resolvedTheme?.secondaryColor || theme.colors.whiteOverlay;
  const pillTextColor = resolvedTheme?.tertiaryTextColor || theme.colors.textInverse;
  const borderColor = resolvedTheme?.secondaryColor || theme.colors.borderSubtle;
  const visualCardBackground = resolvedTheme?.primaryColor || theme.colors.heroFrom;

  return (
    <View style={[styles.container, style]}>
      {backLabel && onBackPress ? (
        <AppTextLink title={backLabel} variant="muted" onPress={onBackPress} style={styles.backLink} />
      ) : null}

      {minimal ? (
        logoUri ? (
          <View style={styles.minimalLogoWrap}>
            <View style={[styles.minimalLogoFrame, { borderColor }]}>
              <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="contain" />
            </View>
          </View>
        ) : null
      ) : (
        <View style={[styles.visualCard, { backgroundColor: visualCardBackground }]}>
          <View style={styles.visualTopRow}>
            <View style={styles.logoGroup}>
              {logoUri ? (
                <View style={[styles.logoFrame, { borderColor: pillColor }]}>
                  <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="contain" />
                </View>
              ) : null}
              <View style={styles.visualCopy}>
                {brandName ? (
                  <Text style={[styles.brandName, { color: theme.colors.textInverse, fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay }]}>{brandName}</Text>
                ) : null}
              </View>
            </View>

            {eyebrow ? (
              <View style={[styles.eyebrowPill, { backgroundColor: pillColor, borderColor: pillColor }]}>
                <Text style={[styles.eyebrowText, { color: pillTextColor, fontFamily: resolvedTheme?.fontFamily || theme.typography.fontFamily }]}>{eyebrow}</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

      <View style={styles.copyBlock}>
        <Text style={[styles.title, { color: titleColor, fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: subtitleColor, fontFamily: resolvedTheme?.fontFamily || theme.typography.fontFamily }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.xs,
  },
  backLink: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  visualCard: {
    borderRadius: 28,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  minimalLogoWrap: {
    alignItems: 'center',
  },
  minimalLogoFrame: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  visualTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  logoFrame: {
    width: 48,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  visualCopy: {
    flex: 1,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textInverse,
  },
  eyebrowPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.whiteOverlay,
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  eyebrowText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  copyBlock: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleLg,
    lineHeight: theme.typography.compact.titleLg * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
