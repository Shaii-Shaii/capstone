import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../design-system/theme';

export const FormProgressStepper = ({ steps = [], currentStep = 0, style }) => {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const activeIndex = Math.max(0, Math.min(currentStep, Math.max(safeSteps.length - 1, 0)));

  return (
    <View style={[styles.container, style]}>
      <View style={styles.trackRow}>
        {safeSteps.map((step, index) => {
          const isCompleted = index < activeIndex;
          const isActive = index === activeIndex;

          return (
            <React.Fragment key={step.key || step.label || index}>
              <View style={styles.nodeWrap}>
                <View style={[
                  styles.node,
                  isCompleted ? styles.nodeCompleted : null,
                  isActive ? styles.nodeActive : null,
                ]}>
                  <Text style={[
                    styles.nodeText,
                    isCompleted || isActive ? styles.nodeTextActive : null,
                  ]}>
                    {index + 1}
                  </Text>
                </View>
                <Text numberOfLines={1} style={[
                  styles.label,
                  isActive ? styles.labelActive : null,
                ]}>
                  {step.shortLabel || step.label || `Step ${index + 1}`}
                </Text>
              </View>

              {index < safeSteps.length - 1 ? (
                <View style={styles.connectorWrap}>
                  <View style={[styles.connector, index < activeIndex ? styles.connectorCompleted : null]} />
                </View>
              ) : null}
            </React.Fragment>
          );
        })}
      </View>

      {safeSteps[activeIndex] ? (
        <Text style={styles.caption}>
          Step {activeIndex + 1} of {safeSteps.length}: {safeSteps[activeIndex].label}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  nodeWrap: {
    width: 56,
    alignItems: 'center',
    gap: 6,
  },
  node: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  nodeCompleted: {
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
  },
  nodeActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  nodeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
  },
  nodeTextActive: {
    color: theme.colors.brandPrimary,
  },
  label: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  labelActive: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  connectorWrap: {
    flex: 1,
    paddingTop: 13,
  },
  connector: {
    height: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderSubtle,
  },
  connectorCompleted: {
    backgroundColor: theme.colors.brandPrimary,
  },
  caption: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
});
