import React, { useState } from 'react';
import { View, TextInput, StyleSheet, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../../design-system/theme';
import { AppIcon } from './AppIcon';

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const PasswordInput = ({
  label = 'Password',
  error,
  helperText,
  variant = 'default',
  disabled = false,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(true);
  const isFilled = variant === 'filled';
  const focusProgress = useSharedValue(0);
  const statusProgress = useSharedValue(error ? 1 : 0);
  const toggleScale = useSharedValue(1);
  const shakeX = useSharedValue(0);

  const shellStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? interpolateColor(statusProgress.value, [0, 1], [theme.colors.borderFocus, theme.colors.borderError])
      : interpolateColor(
          focusProgress.value,
          [0, 1],
          [isFilled ? theme.colors.transparent : theme.colors.borderSubtle, theme.colors.borderFocus]
        ),
    shadowOpacity: focusProgress.value * 0.18,
    transform: [{ translateX: shakeX.value }],
  }));

  const toggleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: toggleScale.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: error
      ? theme.colors.textError
      : interpolateColor(focusProgress.value, [0, 1], [theme.colors.textPrimary, theme.colors.brandPrimary]),
  }));

  React.useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, { duration: theme.motion.focus });
    statusProgress.value = withTiming(error ? 1 : 0, { duration: theme.motion.focus });
  }, [error, focusProgress, isFocused, statusProgress]);

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

  const handleToggle = async () => {
    if (disabled) return;
    toggleScale.value = withSpring(0.92, theme.motion.spring, () => {
      toggleScale.value = withSpring(1, theme.motion.spring);
    });
    await Haptics.selectionAsync();
    setIsSecure((prev) => !prev);
  };

  return (
    <AnimatedView style={[styles.container, style]}>
      {label ? (
        <Animated.Text style={[styles.label, labelStyle]}>
          {label}
        </Animated.Text>
      ) : null}
      <AnimatedView
        style={[
          styles.inputContainer,
          shellStyle,
          {
            backgroundColor: disabled
              ? theme.colors.surfaceDisabled
              : isFilled
                ? theme.colors.surfaceSoft
                : theme.colors.surfaceCard,
          },
          isFocused ? styles.inputFocused : null,
        ]}
      >
        <TextInput
          style={[
            styles.input,
            { color: disabled ? theme.colors.textDisabled : theme.colors.textPrimary },
          ]}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={isSecure}
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
        <AnimatedPressable onPress={handleToggle} style={toggleStyle}>
          <View style={styles.toggleIconWrap}>
            <AppIcon name={isSecure ? 'eye' : 'eyeOff'} size="sm" state="muted" />
          </View>
        </AnimatedPressable>
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
  inputContainer: {
    minHeight: theme.inputs.minHeightCompact,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.xl,
  },
  inputFocused: {
    ...theme.shadows.soft,
  },
  input: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    paddingHorizontal: theme.spacing.inputPaddingXCompact,
    paddingVertical: theme.spacing.inputPaddingYCompact,
  },
  toggleIconWrap: {
    width: 40,
    height: 40,
    marginRight: theme.spacing.xs,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
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
