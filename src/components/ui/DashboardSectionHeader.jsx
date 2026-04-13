import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppTextLink } from './AppTextLink';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const DashboardSectionHeader = ({
  title,
  description,
  actionLabel,
  onActionPress,
  style,
}) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.copyWrap}>
        <Text style={[styles.title, { color: roles.headingText }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: roles.bodyText }]}>{description}</Text> : null}
      </View>
      {actionLabel && onActionPress ? (
        <AppTextLink title={actionLabel} variant="muted" onPress={onActionPress} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  copyWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
});
