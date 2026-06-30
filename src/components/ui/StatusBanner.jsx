import React from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '../../design-system/theme';
import { AppIcon } from './AppIcon';
import { useAuth } from '../../providers/AuthProvider';

const BANNER_VARIANTS = {
  success: {
    backgroundColor: '#FFFFFF',
    accentColor: '#1E7A42',
    iconBackground: '#E7F6EC',
    textColor: '#1E7A42',
    bodyColor: theme.colors.textPrimary,
    iconState: 'success',
  },
  error: {
    backgroundColor: '#FFFFFF',
    accentColor: theme.colors.textError,
    iconBackground: '#FDECEC',
    textColor: theme.colors.textError,
    bodyColor: theme.colors.textPrimary,
    iconState: 'danger',
  },
  info: {
    backgroundColor: '#FFFFFF',
    accentColor: theme.colors.brandSecondary,
    iconBackground: theme.colors.surfaceSoft,
    textColor: theme.colors.textPrimary,
    bodyColor: theme.colors.textSecondary,
    iconState: 'muted',
  },
};

export const StatusBanner = ({
  message,
  variant = 'info',
  icon,
  style,
  title,
  presentation = 'inline',
  visible,
  onDismiss,
  autoDismissMs = 3000,
}) => {
  const { resolvedTheme } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: viewportWidth } = useWindowDimensions();
  const config = BANNER_VARIANTS[variant] || BANNER_VARIANTS.info;
  const resolvedBackgroundColor = config.backgroundColor;
  const resolvedAccentColor = variant === 'success'
    ? resolvedTheme?.primaryColor || config.accentColor
    : config.accentColor;
  const resolvedTitleColor = variant === 'success'
    ? resolvedTheme?.primaryColor || config.textColor
    : config.textColor;
  const resolvedBodyColor = config.bodyColor || resolvedTitleColor;
  const scale = useSharedValue(variant === 'success' ? 0.98 : 1);
  const isFloating = presentation === 'floating';
  const floatingHorizontalPadding = theme.spacing.lg;
  const floatingMaxWidth = theme.layout.authCardMaxWidth - theme.spacing.lg;
  const effectiveViewportWidth = viewportWidth || theme.layout.authCardMaxWidth;
  const floatingCardWidth = Math.min(
    Math.max(effectiveViewportWidth - floatingHorizontalPadding * 2, 280),
    floatingMaxWidth
  );
  const [isLocallyDismissed, setIsLocallyDismissed] = React.useState(false);
  const isVisible = (visible ?? Boolean(message)) && !isLocallyDismissed;
  const [shouldRender, setShouldRender] = React.useState(isVisible);
  const [showContent, setShowContent] = React.useState(isVisible);

  React.useEffect(() => {
    setIsLocallyDismissed(false);
  }, [message, title, variant, visible]);

  React.useEffect(() => {
    if (variant !== 'success') return;
    scale.value = withSequence(
      withTiming(1.02, { duration: theme.motion.fast }),
      withTiming(1, { duration: theme.motion.normal })
    );
  }, [scale, variant]);

  React.useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      setShowContent(true);
      return undefined;
    }

    if (!shouldRender) return undefined;

    setShowContent(false);
    const timer = setTimeout(() => {
      setShouldRender(false);
    }, theme.motion.normal + 120);

    return () => clearTimeout(timer);
  }, [isVisible, shouldRender]);

  React.useEffect(() => {
    if (!isFloating || !isVisible || !message || !autoDismissMs) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setIsLocallyDismissed(true);
      onDismiss?.();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs, isFloating, isVisible, message, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!message) return null;

  const handleDismiss = () => {
    setIsLocallyDismissed(true);
    onDismiss?.();
  };

  const content = (
    <Animated.View
      entering={isFloating ? FadeInUp.duration(theme.motion.cardEnter) : FadeInDown.duration(theme.motion.cardEnter)}
      exiting={FadeOutDown.duration(theme.motion.normal)}
      style={isFloating ? { width: floatingCardWidth } : null}
    >
      <Animated.View
        style={[
          styles.container,
          isFloating ? styles.floatingCard : null,
          { backgroundColor: resolvedBackgroundColor, borderLeftColor: resolvedAccentColor },
          style,
          animatedStyle,
        ]}
      >
        <View
          style={[
            styles.iconWrap,
            isFloating ? styles.iconWrapFloating : null,
            { backgroundColor: config.iconBackground },
          ]}
        >
          <AppIcon
            name={icon || (variant === 'success' ? 'success' : variant === 'error' ? 'error' : 'shield')}
            color={resolvedAccentColor}
          />
        </View>
        <View style={styles.copyWrap}>
          <Text style={[styles.title, { color: resolvedTitleColor }]}>
            {title || (variant === 'success' ? 'Success' : variant === 'error' ? 'Needs attention' : 'Notice')}
          </Text>
          <Text
            style={[styles.message, { color: resolvedBodyColor }]}
            numberOfLines={isFloating ? 3 : undefined}
            ellipsizeMode="tail"
          >
            {message}
          </Text>
        </View>
        {isFloating ? (
          <Pressable onPress={handleDismiss} style={styles.closeButton} hitSlop={10}>
            <AppIcon name="close" size="sm" color={theme.colors.textSecondary} />
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );

  if (!isFloating) {
    return content;
  }

  if (!shouldRender) return null;

  return (
    <Modal transparent visible={shouldRender} animationType="none" onRequestClose={handleDismiss}>
      <View style={styles.modalRoot} pointerEvents="box-none">
        {showContent ? (
          <Animated.View
            entering={FadeIn.duration(theme.motion.normal)}
            exiting={FadeOut.duration(theme.motion.normal)}
            style={[
              styles.overlayFill,
              {
                paddingTop: Math.max(insets.top + theme.spacing.md, theme.spacing.xl),
                paddingHorizontal: floatingHorizontalPadding,
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.floatingWrap} pointerEvents="box-none">
              {content}
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderLeftWidth: 5,
  },
  floatingCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    paddingRight: theme.spacing.sm,
    ...theme.shadows.lg,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFloating: {
    marginTop: 0,
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingTop: 1,
  },
  title: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  message: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 19,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  modalRoot: {
    flex: 1,
  },
  overlayFill: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  floatingWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
