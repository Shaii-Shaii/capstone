import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../../design-system/theme';
import { appIconMap } from '../../constants/icons';
import { useAuth } from '../../providers/AuthProvider';

const ICON_STATE_COLORS = {
  default: theme.colors.textPrimary,
  muted: theme.colors.textSecondary,
  active: theme.colors.brandPrimary,
  disabled: theme.colors.textDisabled,
  success: theme.colors.brandPrimary,
  danger: theme.colors.textError,
  inverse: theme.colors.textInverse,
};

const ICON_SIZES = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 28,
};

export const AppIcon = ({
  name,
  color,
  size = 'md',
  state = 'default',
}) => {
  const { resolvedTheme } = useAuth();
  const iconName = appIconMap[name] || name || appIconMap.empty;
  const iconSize = ICON_SIZES[size] || ICON_SIZES.md;
  const themedStateColors = {
    default: resolvedTheme?.primaryTextColor || ICON_STATE_COLORS.default,
    muted: resolvedTheme?.secondaryTextColor || ICON_STATE_COLORS.muted,
    active: resolvedTheme?.primaryColor || ICON_STATE_COLORS.active,
    disabled: ICON_STATE_COLORS.disabled,
    success: resolvedTheme?.primaryColor || ICON_STATE_COLORS.success,
    danger: resolvedTheme?.primaryColor || ICON_STATE_COLORS.danger,
    inverse: ICON_STATE_COLORS.inverse,
  };
  const iconColor = color || themedStateColors[state] || themedStateColors.default;

  return <MaterialCommunityIcons name={iconName} size={iconSize} color={iconColor} />;
};
