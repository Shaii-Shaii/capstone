import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppIcon } from './AppIcon';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const SectionTitleRow = ({
  title,
  icon = 'file-document-outline',
  iconSize = 'sm',
  style,
  titleStyle,
  color,
  iconColor,
  accentColor,
  showAccent = true,
  numberOfLines = 1,
}) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const resolvedAccentColor = accentColor || roles.primaryActionBackground;
  const resolvedIconColor = iconColor || roles.metaText || resolvedAccentColor;
  const resolvedTitleColor = color || roles.headingText;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.markRow}>
        <AppIcon name={icon} size={iconSize} color={resolvedIconColor} />
        {showAccent ? <View style={[styles.accentLine, { backgroundColor: resolvedAccentColor }]} /> : null}
      </View>
      <Text numberOfLines={numberOfLines} style={[styles.title, { color: resolvedTitleColor }, titleStyle]}>
        {title}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexShrink: 0,
  },
  accentLine: {
    width: 3,
    height: 16,
    borderRadius: theme.radius.full,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
  },
});
