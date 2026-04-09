import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const LINK_VARIANTS = {
  primary: {
    color: theme.colors.actionTextLink,
    pressedColor: theme.colors.actionPrimaryPressed,
  },
  muted: {
    color: theme.colors.textSecondary,
    pressedColor: theme.colors.textPrimary,
  },
  danger: {
    color: theme.colors.textError,
    pressedColor: theme.colors.actionDangerPressed,
  },
};

export const AppTextLink = ({ title, onPress, variant = 'primary', disabled = false, style, textStyle }) => {
  const { resolvedTheme } = useAuth();
  const palette = LINK_VARIANTS[variant] || LINK_VARIANTS.primary;
  const resolvedPalette = {
    primary: {
      color: resolvedTheme?.primaryColor || palette.color,
      pressedColor: resolvedTheme?.tertiaryTextColor || palette.pressedColor,
    },
    muted: {
      color: resolvedTheme?.secondaryTextColor || palette.color,
      pressedColor: resolvedTheme?.primaryTextColor || palette.pressedColor,
    },
    danger: {
      color: theme.colors.textError,
      pressedColor: theme.colors.actionDangerPressed,
    },
  }[variant] || palette;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.container,
        pressed && !disabled ? styles.pressedContainer : null,
        style,
      ]}
    >
      {({ pressed }) => (
        <Text
          style={[
            styles.text,
            {
              color: disabled
                ? theme.colors.textDisabled
                : pressed
                  ? resolvedPalette.pressedColor
                  : resolvedPalette.color,
            },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xs,
  },
  pressedContainer: {
    opacity: 0.84,
  },
  text: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
});
