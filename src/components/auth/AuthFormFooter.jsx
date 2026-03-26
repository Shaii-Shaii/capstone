import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../design-system/theme';
import { AppTextLink } from '../ui/AppTextLink';

export const AuthFormFooter = ({ questionText, linkText, onLinkPress, style }) => {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.questionText}>{questionText}</Text>
      <AppTextLink title={linkText} onPress={onLinkPress} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  questionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  }
});
