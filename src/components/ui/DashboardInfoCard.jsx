import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';
import { theme } from '../../design-system/theme';

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
  const tintVariant = variant === 'patient' ? 'patientTint' : variant === 'donor' ? 'donorTint' : 'elevated';
  const iconState = variant === 'patient' ? 'muted' : 'active';

  const handlePress = async () => {
    if (!onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable onPress={handlePress} style={{ width }}>
      <AppCard variant={tintVariant} radius="xl" padding="xs">
        <View style={styles.topRow}>
          <View style={styles.iconWrap}>
            {icon ? <AppIcon name={icon} state={iconState} /> : <AppIcon name="empty" state="muted" />}
          </View>
          {badgeText ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
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
    backgroundColor: theme.colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  meta: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
  },
});
