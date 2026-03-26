import React, { useRef, useState, useEffect } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { theme } from '../../design-system/theme';

const AnimatedView = Animated.createAnimatedComponent(View);

const OtpCell = ({
  cellValue,
  isFocused,
  error,
  success,
  disabled,
  inputRef,
  onFocus,
  onBlur,
  onChangeText,
  onKeyPress,
}) => {
  const emphasis = useSharedValue(isFocused ? 1 : cellValue ? 0.7 : 0);

  useEffect(() => {
    emphasis.value = withSpring(isFocused ? 1 : cellValue ? 0.7 : 0, theme.motion.spring);
  }, [cellValue, emphasis, isFocused]);

  const cellStyle = useAnimatedStyle(() => ({
    borderColor: success
      ? theme.colors.brandPrimary
      : error
        ? theme.colors.borderError
        : interpolateColor(
            emphasis.value,
            [0, 0.7, 1],
            [theme.colors.borderSubtle, theme.colors.borderStrong, theme.colors.borderFocus]
          ),
    backgroundColor: success
      ? theme.colors.brandPrimaryMuted
      : disabled
        ? theme.colors.surfaceDisabled
        : interpolateColor(
            emphasis.value,
            [0, 0.7, 1],
            [theme.colors.surfaceCard, theme.colors.surfaceSoft, theme.colors.surfaceSoft]
          ),
    transform: [
      { scale: 1 + emphasis.value * 0.035 },
      { translateY: emphasis.value * -2 },
    ],
    shadowOpacity: emphasis.value * 0.14,
  }));

  return (
    <AnimatedView style={[styles.cell, cellStyle]}>
      <TextInput
        ref={inputRef}
        style={[
          styles.input,
          success ? styles.inputSuccess : null,
          disabled ? styles.inputDisabled : null,
        ]}
        value={cellValue || ''}
        onFocus={onFocus}
        onBlur={onBlur}
        onChangeText={onChangeText}
        onKeyPress={onKeyPress}
        keyboardType="number-pad"
        maxLength={1}
        editable={!disabled}
        selectTextOnFocus={!disabled}
      />
    </AnimatedView>
  );
};

export const OtpInput = ({
  length = 6,
  value,
  onChange,
  error,
  disabled = false,
  success = false,
  style,
}) => {
  const [internalCode, setInternalCode] = useState(value || '');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRefs = useRef([]);
  const shakeX = useSharedValue(0);
  const successScale = useSharedValue(1);

  useEffect(() => {
    if (value !== undefined) {
      setInternalCode(value);
    }
  }, [value]);

  useEffect(() => {
    if (!error) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    shakeX.value = withSequence(
      withTiming(-9, { duration: theme.motion.shake }),
      withTiming(9, { duration: theme.motion.shake }),
      withTiming(-7, { duration: theme.motion.shake }),
      withTiming(7, { duration: theme.motion.shake }),
      withTiming(0, { duration: theme.motion.shake })
    );
  }, [error, shakeX]);

  useEffect(() => {
    if (!success) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    successScale.value = withSequence(
      withTiming(1.05, { duration: 140 }),
      withTiming(1, { duration: 170 })
    );
  }, [success, successScale]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { scale: successScale.value }],
  }));

  const handleChange = async (text, index) => {
    const cleanText = text.replace(/[^0-9]/g, '');

    if (cleanText.length > 1) {
      const newCode = cleanText.substring(0, length);
      setInternalCode(newCode);
      onChange?.(newCode);
      const focusIndex = Math.min(newCode.length, length - 1);
      inputRefs.current[focusIndex]?.focus();
      return;
    }

    const newCodeArr = internalCode.padEnd(length, ' ').split('');
    newCodeArr[index] = cleanText || ' ';
    const newCode = newCodeArr.join('').replace(/\s+$/g, '');

    setInternalCode(newCode);
    onChange?.(newCode);

    if (cleanText && index < length - 1) {
      await Haptics.selectionAsync();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e, index) => {
    if (e.nativeEvent.key === 'Backspace' && !internalCode[index] && index > 0) {
      const newCodeArr = internalCode.padEnd(length, ' ').split('');
      newCodeArr[index - 1] = ' ';
      const newCode = newCodeArr.join('').replace(/\s+$/g, '');
      setInternalCode(newCode);
      onChange?.(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <AnimatedView style={[styles.container, containerStyle, style]}>
      {Array(length)
        .fill(0)
        .map((_, index) => (
          <OtpCell
            key={index}
            cellValue={internalCode[index]}
            isFocused={focusedIndex === index}
            error={error}
            success={success}
            disabled={disabled}
            inputRef={(ref) => {
              inputRefs.current[index] = ref;
            }}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(-1)}
            onChangeText={(text) => handleChange(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
          />
        ))}
    </AnimatedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  cell: {
    flex: 1,
    minWidth: 44,
    height: theme.inputs.otpSize,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceCard,
    ...theme.shadows.soft,
  },
  input: {
    width: '100%',
    height: '100%',
    fontSize: theme.typography.semantic.bodyLg,
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
    color: theme.colors.textPrimary,
  },
  inputSuccess: {
    color: theme.colors.brandPrimary,
  },
  inputDisabled: {
    color: theme.colors.textDisabled,
  },
});
