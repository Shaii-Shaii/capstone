import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
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
    backgroundColor: theme.colors.brandPrimaryMuted,
    textColor: theme.colors.brandPrimary,
    iconState: 'success',
  },
  error: {
    backgroundColor: theme.colors.surfaceSoft,
    textColor: theme.colors.textError,
    iconState: 'danger',
  },
  info: {
    backgroundColor: theme.colors.surfaceSoft,
    textColor: theme.colors.textSecondary,
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
  autoDismissMs = 2200,
}) => {
  const { resolvedTheme } = useAuth();
  const insets = useSafeAreaInsets();
  const config = BANNER_VARIANTS[variant] || BANNER_VARIANTS.info;
  const resolvedBackgroundColor = variant === 'success'
    ? resolvedTheme?.secondaryColor || config.backgroundColor
    : config.backgroundColor;
  const resolvedTextColor = variant === 'success'
    ? resolvedTheme?.primaryColor || config.textColor
    : config.textColor;
  const scale = useSharedValue(variant === 'success' ? 0.98 : 1);
  const isVisible = visible ?? Boolean(message);
  const isFloating = presentation === 'floating';
  const [shouldRender, setShouldRender] = React.useState(isVisible);
  const [showContent, setShowContent] = React.useState(isVisible);

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
    if (!isFloating || !isVisible || !message || !autoDismissMs || !onDismiss) {
      return undefined;
    }

    const timer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [autoDismissMs, isFloating, isVisible, message, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!message) return null;

  const content = (
    <Animated.View
      entering={isFloating ? FadeInUp.duration(theme.motion.cardEnter) : FadeInDown.duration(theme.motion.cardEnter)}
      exiting={FadeOutDown.duration(theme.motion.normal)}
    >
      <Animated.View
        style={[
          styles.container,
          isFloating ? styles.floatingCard : null,
          { backgroundColor: resolvedBackgroundColor },
          style,
          animatedStyle,
        ]}
      >
        <View style={[styles.iconWrap, isFloating ? styles.iconWrapFloating : null]}>
          <AppIcon
            name={icon || (variant === 'success' ? 'success' : variant === 'error' ? 'error' : 'shield')}
            state={config.iconState}
          />
        </View>
        <View style={styles.copyWrap}>
          {title ? <Text style={[styles.title, { color: resolvedTextColor }]}>{title}</Text> : null}
          <Text style={[styles.message, { color: resolvedTextColor }]}>{message}</Text>
        </View>
      </Animated.View>
    </Animated.View>
  );

  if (!isFloating) {
    return content;
  }

  if (!shouldRender) return null;

  return (
    <Modal transparent visible={shouldRender} animationType="none" onRequestClose={onDismiss}>
      <View style={styles.modalRoot} pointerEvents="box-none">
        {showContent ? (
          <Animated.View
            entering={FadeIn.duration(theme.motion.normal)}
            exiting={FadeOut.duration(theme.motion.normal)}
            style={[styles.overlayFill, { paddingTop: Math.max(insets.top + 18, theme.spacing.xl) }]}
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
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
  },
  floatingCard: {
    width: '100%',
    maxWidth: theme.layout.authCardMaxWidth - theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.lg,
  },
  iconWrap: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFloating: {
    marginTop: 1,
  },
  copyWrap: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  message: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  modalRoot: {
    flex: 1,
  },
  overlayFill: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  floatingWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
});
