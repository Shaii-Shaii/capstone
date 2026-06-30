import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AppTextLink } from './AppTextLink';
import { SectionTitleRow } from './SectionTitleRow';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const DashboardSectionHeader = ({
  title,
  description,
  actionLabel,
  onActionPress,
  icon = 'file-document-outline',
  style,
  showAccent = true,
}) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.copyWrap}>
        <SectionTitleRow
          title={title}
          icon={icon}
          iconSize="sm"
          color={roles.headingText}
          iconColor={roles.metaText}
          accentColor={roles.primaryActionBackground}
          showAccent={showAccent}
          titleStyle={styles.title}
        />
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
    paddingHorizontal: theme.spacing.md,
  },
  copyWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
    lineHeight: theme.typography.compact.titleSm * theme.typography.lineHeights.snug,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
});
