import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const DashboardInfoCard = ({
  title,
  description,
  meta,
  icon,
  badgeText,
  variant = 'default',
  width,
  onPress,
}) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const tintVariant = variant === 'patient' ? 'patientTint' : variant === 'donor' ? 'donorTint' : 'elevated';
  const iconBackground = variant === 'patient'
    ? roles.iconSupportSurface
    : variant === 'donor'
      ? roles.iconPrimarySurface
      : roles.iconAccentSurface;
  const iconColor = variant === 'patient'
    ? roles.iconSupportColor
    : variant === 'donor'
      ? roles.iconPrimaryColor
      : roles.iconAccentColor;
  const badgeBackground = variant === 'donor' ? roles.badgeStrongBackground : roles.badgeBackground;
  const badgeTextColor = variant === 'donor' ? roles.badgeStrongText : roles.badgeText;

  const handlePress = async () => {
    if (!onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={{ width }}>
      <AppCard variant={tintVariant} radius="xl" padding="xs">
        <View style={styles.topRow}>
          <View style={[styles.iconWrap, { backgroundColor: iconBackground }]}>
            {icon ? <AppIcon name={icon} state="default" color={iconColor} /> : <AppIcon name="empty" state="default" color={roles.metaText} />}
          </View>
          {badgeText ? (
            <View style={[styles.badge, { backgroundColor: badgeBackground }]}>
              <Text style={[styles.badgeText, { color: badgeTextColor }]}>{badgeText}</Text>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    marginBottom: 2,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  meta: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
});
