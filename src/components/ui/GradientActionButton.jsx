import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { AppButton } from './AppButton';
import { theme } from '../../design-system/theme';

export const GRADIENT_ACTION_BORDER = ['#5f2f12', '#8e4f24', '#c8864f', '#ffe7ac', '#c8864f', '#8e4f24', '#5f2f12'];
export const GRADIENT_ACTION_FILL = ['#8a111d', '#740c15', '#5c0910'];
export const GRADIENT_ACTION_MUTED_FILL = ['#f7f2eb', '#f1ebe4'];

export function GradientActionButton({
  title,
  onPress,
  loading = false,
  success = false,
  disabled = false,
  textColor,
  fillColors = GRADIENT_ACTION_FILL,
  borderColors = GRADIENT_ACTION_BORDER,
  variant = 'outline',
  showShine = true,
  style,
  buttonStyle,
  textStyle,
  leading,
  trailing,
  size = 'sm',
  fullWidth = true,
}) {
  return (
    <LinearGradient
      colors={borderColors}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={[styles.gradientActionBorder, style]}
    >
      <LinearGradient
        colors={fillColors}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={styles.gradientActionFill}
      >
        {showShine ? (
          <LinearGradient
            colors={['rgba(255, 246, 222, 0)', 'rgba(255, 246, 222, 0.16)', 'rgba(255, 246, 222, 0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientActionDiagonalShine}
          />
        ) : null}
        <AppButton
          title={title}
          size={size}
          variant={variant}
          loading={loading}
          success={success}
          disabled={disabled}
          onPress={onPress}
          fullWidth={fullWidth}
          leading={leading}
          trailing={trailing}
          backgroundColorOverride="transparent"
          borderColorOverride="transparent"
          textColorOverride={textColor}
          style={[styles.gradientActionButton, buttonStyle]}
          textNumberOfLines={1}
          textAdjustsFontSizeToFit
          textMinimumFontScale={0.88}
          textStyle={[styles.gradientActionButtonText, textStyle]}
        />
      </LinearGradient>
    </LinearGradient>
  );
}

const styles = {
  gradientActionBorder: {
    borderRadius: 14,
    padding: 2,
    overflow: 'hidden',
    shadowColor: '#c8864f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 2,
  },
  gradientActionFill: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradientActionDiagonalShine: {
    position: 'absolute',
    top: -44,
    left: 18,
    width: 34,
    height: 150,
    transform: [{ rotate: '22deg' }],
  },
  gradientActionButton: {
    minHeight: 40,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 0,
    marginTop: 0,
  },
  gradientActionButtonText: {
    textAlign: 'center',
  },
};
