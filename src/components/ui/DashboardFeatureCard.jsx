import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const DashboardFeatureCard = ({
  title,
  description,
  badgeText,
  meta,
  ctaLabel,
  icon,
  variant = 'donor',
  width,
  onPress,
}) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const tintVariant = variant === 'patient' ? 'patientTint' : 'donorTint';
  const iconBackground = variant === 'patient' ? roles.iconSupportSurface : roles.iconPrimarySurface;
  const iconColor = variant === 'patient' ? roles.iconSupportColor : roles.iconPrimaryColor;
  const badgeBackground = variant === 'patient' ? roles.badgeBackground : roles.badgeStrongBackground;
  const badgeTextColor = variant === 'patient' ? roles.badgeText : roles.badgeStrongText;

  const handlePress = async () => {
    if (!onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={[styles.wrapper, { width }]}>
      <AppCard variant={tintVariant} radius="xl" padding="lg" style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.badgeWrap}>
            {icon ? (
              <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
                <AppIcon name={icon} size="sm" state="default" color={iconColor} />
              </View>
            ) : null}
            {badgeText ? (
              <View style={[styles.badge, { backgroundColor: badgeBackground }]}>
                <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeText}</Text>
              </View>
            ) : null}
          </View>
          {ctaLabel ? (
            <View style={styles.ctaWrap}>
              <Text style={[styles.ctaText, { color: resolvedTheme?.primaryColor || roles.headingText }]}>{ctaLabel}</Text>
              <AppIcon name="chevronRight" size="sm" state="default" color={resolvedTheme?.primaryColor || roles.headingText} />
            </View>
          ) : null}
        </View>

        <Text style={[styles.title, { color: roles.headingText }]}>{title}</Text>
        <Text style={[styles.description, { color: roles.bodyText }]}>{description}</Text>
        {meta ? <Text style={[styles.meta, { color: roles.metaText }]}>{meta}</Text> : null}
      </AppCard>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    minHeight: 152,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  badgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
    marginBottom: theme.spacing.xs,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  meta: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  ctaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
});
