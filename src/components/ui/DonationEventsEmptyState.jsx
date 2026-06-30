import React from 'react';
import { StyleSheet } from 'react-native';
import { EmptyDataState } from './EmptyDataState';
import { theme } from '../../design-system/theme';

export function DonationEventsEmptyState({
  title = 'No active donation drives',
  message = '',
  style,
}) {
  return (
    <EmptyDataState
      variant="analysis"
      title={title}
      message={message}
      style={[styles.container, style]}
      titleStyle={styles.title}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 340,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  title: {
    fontSize: 24,
    lineHeight: 28,
  },
});
