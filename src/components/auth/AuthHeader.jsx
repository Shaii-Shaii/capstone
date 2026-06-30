import React from 'react';
import { View, StyleSheet, Text, Image, Pressable } from 'react-native';
import { resolveBrandLogoSource, theme, resolveThemeRoles } from '../../design-system/theme';
import { AppIcon } from '../ui/AppIcon';

export const AuthHeader = ({
  title,
  subtitle,
  eyebrow,
  style,
  onBackPress,
  minimal = false,
  resolvedTheme = null,
}) => {
  const [imageFailed, setImageFailed] = React.useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const roles = resolveThemeRoles(resolvedTheme);
  const titleColor = roles.headingText;
  const subtitleColor = roles.bodyText;
  const badgeBackground = roles.badgeBackground;
  const badgeTextColor = roles.badgeText;
  const iconState = 'default';

  React.useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    <View style={[styles.container, minimal ? styles.containerMinimal : null, style]}>
      {onBackPress ? (
        <Pressable
          onPress={onBackPress}
          style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
        >
          <View style={[styles.backIconShell, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <AppIcon name="arrowLeft" size="sm" state={iconState} />
          </View>
        </Pressable>
      ) : null}

      {!minimal ? (
        <View style={styles.visualRow}>
          <View style={styles.identityRow}>
            {logoSource ? (
              <Image source={logoSource} style={styles.logoImageRegular} resizeMode="contain" onError={() => setImageFailed(true)} />
            ) : null}

            <View style={styles.identityCopy}>
              <Text style={[styles.brandName, { color: titleColor, fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay }]}>
                {brandName}
              </Text>
            </View>
          </View>

          {eyebrow ? (
            <View style={[styles.eyebrowPill, { backgroundColor: badgeBackground }]}>
              <Text style={[styles.eyebrowText, { color: badgeTextColor, fontFamily: resolvedTheme?.fontFamily || theme.typography.fontFamily }]}>
                {eyebrow}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {minimal ? (
        <View style={styles.minimalIdentityShell}>
          {logoSource ? (
            <Image source={logoSource} style={styles.logoImageMinimal} resizeMode="contain" onError={() => setImageFailed(true)} />
          ) : null}
          <Text style={[styles.brandName, styles.brandNameMinimal, { color: titleColor, fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay }]}>
            {brandName}
          </Text>
        </View>
      ) : null}

      <View style={[styles.copyBlock, minimal ? styles.copyBlockMinimal : null]}>
        <Text style={[styles.title, minimal ? styles.titleMinimal : null, { color: titleColor, fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, minimal ? styles.subtitleMinimal : null, { color: subtitleColor, fontFamily: resolvedTheme?.fontFamily || theme.typography.fontFamily }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.lg,
  },
  containerMinimal: {
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  backButtonPressed: {
    opacity: 0.76,
  },
  backIconShell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  minimalIdentityShell: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  visualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    width: '100%',
  },
  identityCopy: {
    justifyContent: 'center',
  },
  logoImageRegular: {
    width: 46,
    height: 46,
  },
  logoImageMinimal: {
    width: 72,
    height: 72,
  },
  brandName: {
    fontSize: theme.typography.compact.bodyLg,
    lineHeight: theme.typography.compact.bodyLg * theme.typography.lineHeights.tight,
  },
  brandNameMinimal: {
    fontSize: theme.typography.compact.titleSm,
    lineHeight: theme.typography.compact.titleSm * theme.typography.lineHeights.tight,
  },
  eyebrowPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  eyebrowText: {
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  copyBlock: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  copyBlockMinimal: {
    width: '100%',
    alignItems: 'center',
    marginTop: 0,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.compact.titleLg,
    lineHeight: theme.typography.compact.titleLg * theme.typography.lineHeights.tight,
  },
  titleMinimal: {
    textAlign: 'center',
    fontSize: 28,
    lineHeight: 34,
  },
  subtitle: {
    maxWidth: 320,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  subtitleMinimal: {
    textAlign: 'center',
    maxWidth: 280,
    fontSize: theme.typography.compact.bodySm,
  },
});
