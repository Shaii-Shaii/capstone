import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { theme } from '../../design-system/theme';

export function ChatQuickSuggestions({ suggestions, onSelect, disabled }) {
  if (!suggestions?.length) return null;

  return (
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
          <Text style={styles.chipText} numberOfLines={1}>{suggestion}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  chip: {
    maxWidth: 200,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipPressed: {
    backgroundColor: '#f4e2e7',
    transform: [{ scale: 0.97 }],
  },
  chipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.medium,
  },
});
