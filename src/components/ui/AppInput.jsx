import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../../design-system/theme';

const AnimatedView = Animated.createAnimatedComponent(View);

const INPUT_VARIANTS = {
  default: {
    backgroundColor: theme.colors.surfaceCard,
    borderColor: theme.colors.borderSubtle,
  },
  filled: {
    backgroundColor: theme.colors.surfaceSoft,
    borderColor: theme.colors.transparent,
  },
};

export const AppInput = ({
  label,
  required = false,
  error,
  helperText,
  variant = 'default',
  disabled = false,
  style,
  inputStyle,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const config = INPUT_VARIANTS[variant] || INPUT_VARIANTS.default;
  const focusProgress = useSharedValue(0);
  const statusProgress = useSharedValue(error ? 1 : 0);
  const shakeX = useSharedValue(0);

  const shellStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? interpolateColor(statusProgress.value, [0, 1], [theme.colors.borderFocus, theme.colors.borderError])
      : interpolateColor(focusProgress.value, [0, 1], [config.borderColor, theme.colors.borderFocus]),
    shadowOpacity: focusProgress.value * 0.18,
    transform: [{ translateX: shakeX.value }, { scale: 1 - focusProgress.value * 0.002 }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: error
      ? theme.colors.textError
      : interpolateColor(focusProgress.value, [0, 1], [theme.colors.textPrimary, theme.colors.brandPrimary]),
    transform: [{ translateY: focusProgress.value * -1 }],
  }));

  React.useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, { duration: theme.motion.focus });
    statusProgress.value = withTiming(error ? 1 : 0, { duration: theme.motion.focus });
  }, [config.borderColor, error, focusProgress, isFocused, statusProgress]);

  React.useEffect(() => {
    if (!error) return;
    shakeX.value = withSequence(
      withTiming(-6, { duration: theme.motion.shake }),
      withTiming(6, { duration: theme.motion.shake }),
      withTiming(-4, { duration: theme.motion.shake }),
      withTiming(4, { duration: theme.motion.shake }),
      withTiming(0, { duration: theme.motion.shake })
    );
  }, [error, shakeX]);

  return (
    <AnimatedView style={[styles.container, style]}>
      {label ? (
        <Animated.Text style={[styles.label, labelStyle]}>
          {label}
          {required ? <Text style={styles.requiredMark}> *</Text> : null}
        </Animated.Text>
      ) : null}
      <AnimatedView
        style={[
          styles.inputShell,
          shellStyle,
          {
            backgroundColor: disabled ? theme.colors.surfaceDisabled : config.backgroundColor,
          },
          disabled && styles.disabledShell,
          isFocused && styles.focusedShell,
        ]}
      >
        <TextInput
          style={[
            styles.input,
            {
              color: disabled ? theme.colors.textDisabled : theme.colors.textPrimary,
            },
            inputStyle,
          ]}
          placeholderTextColor={theme.colors.textMuted}
          editable={!disabled}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
      </AnimatedView>
      {error ? (
        <Animated.Text style={styles.errorText}>
          {error}
        </Animated.Text>
      ) : helperText ? (
        <Animated.Text style={styles.helperText}>
          {helperText}
        </Animated.Text>
      ) : null}
    </AnimatedView>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: theme.spacing.sm,
    minHeight: 82,
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  requiredMark: {
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.bold,
  },
  inputShell: {
    minHeight: theme.inputs.minHeightCompact,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    justifyContent: 'center',
  },
  focusedShell: {
    ...theme.shadows.soft,
  },
  disabledShell: {
    borderColor: theme.colors.borderDisabled,
  },
  input: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    paddingHorizontal: theme.spacing.inputPaddingXCompact,
    paddingVertical: theme.spacing.inputPaddingYCompact,
  },
  helperText: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },
});
