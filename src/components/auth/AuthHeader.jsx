import React from 'react';
import { View, StyleSheet, Text, Image, Pressable } from 'react-native';
import { resolveBrandLogoSource, theme, resolveThemeRoles } from '../../design-system/theme';
import { AppIcon } from '../ui/AppIcon';

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
    <View style={[styles.container, style]}>
      {onBackPress ? (
        <Pressable onPress={onBackPress} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
          <View style={styles.backIconShell}>
            <AppIcon name="arrowLeft" size="sm" state={iconState} />
          </View>
        </Pressable>
      ) : null}

      {minimal ? (
        <View style={styles.minimalIdentityShell}>
          <View style={styles.identityRow}>
            {logoSource ? (
              <Image source={logoSource} style={styles.logoImageMinimal} resizeMode="contain" onError={() => setImageFailed(true)} />
            ) : null}

            <View style={styles.identityCopy}>
              <Text style={[styles.brandName, { color: titleColor, fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay }]}>
                {brandName}
              </Text>
            </View>
          </View>
        </View>
      ) : (
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
      )}

      <View style={styles.copyBlock}>
        <Text style={[styles.title, { color: titleColor, fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: subtitleColor, fontFamily: resolvedTheme?.fontFamily || theme.typography.fontFamily }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.sm,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  backButtonPressed: {
    opacity: 0.76,
  },
  backIconShell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minimalIdentityShell: {
    marginBottom: theme.spacing.sm,
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
    width: 42,
    height: 42,
  },
  brandName: {
    fontSize: theme.typography.compact.bodyLg,
    lineHeight: theme.typography.compact.bodyLg * theme.typography.lineHeights.tight,
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
  title: {
    fontSize: theme.typography.compact.titleLg,
    lineHeight: theme.typography.compact.titleLg * theme.typography.lineHeights.tight,
  },
  subtitle: {
    maxWidth: 320,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
});
