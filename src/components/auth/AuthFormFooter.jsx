import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../design-system/theme';
import { AppTextLink } from '../ui/AppTextLink';
import { useAuth } from '../../providers/AuthProvider';

export const AuthFormFooter = ({ questionText, linkText, onLinkPress, style }) => {
  const { resolvedTheme } = useAuth();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.questionText, { color: resolvedTheme?.secondaryTextColor || theme.colors.textSecondary }]}>
        {questionText}
      </Text>
      <AppTextLink title={linkText} onPress={onLinkPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.xl,
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
    paddingTop: theme.spacing.md,
  },
  questionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
});
