import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { theme } from '../../design-system/theme';
import { appIconMap } from '../../constants/icons';

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
  const iconName = appIconMap[name] || name || appIconMap.empty;
  const iconSize = ICON_SIZES[size] || ICON_SIZES.md;
  const iconColor = color || ICON_STATE_COLORS[state] || ICON_STATE_COLORS.default;

  return <MaterialCommunityIcons name={iconName} size={iconSize} color={iconColor} />;
};
