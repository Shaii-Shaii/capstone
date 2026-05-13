import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const TONE_MAP = {
  healthy: 'success',
  eligible: 'success',
  completed: 'success',
  pending: 'warning',
  pendingScan: 'warning',
  inProgress: 'info',
  needsCare: 'danger',
  error: 'danger',
};

export function StatusBadge({ label, tone = 'info', style, textStyle }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const resolvedTone = TONE_MAP[tone] || tone;
  const toneStyle = {
    success: {
      backgroundColor: 'rgba(25, 122, 77, 0.12)',
      borderColor: 'rgba(25, 122, 77, 0.22)',
      color: theme.colors.textSuccess,
    },
    warning: {
      backgroundColor: 'rgba(168, 97, 0, 0.12)',
      borderColor: 'rgba(168, 97, 0, 0.22)',
      color: theme.colors.textWarning,
    },
    danger: {
      backgroundColor: 'rgba(186, 31, 51, 0.1)',
      borderColor: 'rgba(186, 31, 51, 0.2)',
      color: theme.colors.textError,
    },
    info: {
      backgroundColor: roles.supportCardBackground,
      borderColor: roles.supportCardBorder,
      color: roles.bodyText,
    },
  }[resolvedTone] || {
    backgroundColor: roles.supportCardBackground,
    borderColor: roles.supportCardBorder,
    color: roles.bodyText,
  };

  return (
    <View style={[styles.badge, { backgroundColor: toneStyle.backgroundColor, borderColor: toneStyle.borderColor }, style]}>
      <Text style={[styles.text, { color: toneStyle.color }, textStyle]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    justifyContent: 'center',
  },
  text: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
});
