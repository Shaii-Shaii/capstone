import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { theme } from '../../design-system/theme';

export function ChatQuickSuggestions({ suggestions, onSelect, disabled }) {
  if (!suggestions?.length) return null;

  return (
    <>
      <Text style={styles.title}>Quick prompts</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {suggestions.map((suggestion) => (
          <Pressable
            key={suggestion}
            disabled={disabled}
            onPress={() => onSelect(suggestion)}
            style={({ pressed }) => [
              styles.chip,
              disabled ? styles.chipDisabled : null,
              pressed ? styles.chipPressed : null,
            ]}
          >
            <Text style={styles.chipText}>{suggestion}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  row: {
    gap: theme.spacing.xs,
    paddingBottom: 2,
    paddingRight: theme.spacing.xs,
  },
  chip: {
    minHeight: 34,
    maxWidth: 180,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: '#f8eef0',
    borderWidth: 1,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  chipDisabled: {
    opacity: 0.6,
  },
  chipPressed: {
    backgroundColor: '#f4e2e7',
    transform: [{ scale: 0.98 }],
  },
  chipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.medium,
  },
});
