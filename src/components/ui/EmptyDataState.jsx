import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export function EmptyStateIllustration({
  size = 188,
  count = '0',
  showCountBadge = true,
  style,
  variant = 'default',
}) {
  const width = size;
  const height = Math.round(size * (variant === 'analysis' ? 0.82 : 0.78));
  const fileMotion = useSharedValue(0);
  const badgeMotion = useSharedValue(0);

  React.useEffect(() => {
    fileMotion.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.quad) })
      ),
      -1,
      false
    );

    badgeMotion.value = withDelay(
      260,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1350, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 1350, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [badgeMotion, fileMotion]);

  const fileAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: variant === 'analysis' ? -3 * fileMotion.value : -4 * fileMotion.value },
      { rotate: `${variant === 'analysis' ? (-0.75 + 1.5 * fileMotion.value) : (-1 + 2 * fileMotion.value)}deg` },
      { scale: 1 + (variant === 'analysis' ? 0.01 : 0.012) * fileMotion.value },
    ],
  }));

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 0.88 + 0.12 * badgeMotion.value,
    transform: [
      { translateY: -2 * badgeMotion.value },
      { scale: 1 + 0.035 * badgeMotion.value },
    ],
  }));

  if (variant === 'analysis') {
    return (
      <View style={[styles.illustrationWrap, styles.analysisIllustrationWrap, { width, height }, style]} pointerEvents="none">
        <Animated.View style={[styles.illustrationLayer, { width, height }, fileAnimatedStyle]}>
          <Svg width={width} height={height} viewBox="-8 -10 256 216" style={styles.illustrationLayer}>
            <Circle cx="120" cy="102" r="80" fill="#f1f3f8" opacity="0.84" />
            <Circle cx="120" cy="102" r="98" fill="none" stroke="#e8ebf0" strokeWidth="18" opacity="0.68" />

            <Rect x="16" y="86" width="208" height="26" rx="13" fill="#eef2f7" opacity="0.9" />
            <Rect x="132" y="90" width="84" height="18" rx="9" fill="#eef2f7" opacity="0.72" />
            <Circle cx="42" cy="78" r="5.5" fill="#d8cfcf" opacity="0.86" />
            <Circle cx="42" cy="144" r="4.5" fill="#d8cfcf" opacity="0.76" />

            <G opacity="0.94">
              <Rect x="72" y="38" width="92" height="126" rx="18" fill="#ffffff" stroke="#c8bebd" strokeWidth="2.6" />
              <Circle cx="118" cy="31" r="18" fill="#ffffff" stroke="#c8bebd" strokeWidth="2.6" />
              <Path
                d="M93 53 C93 47 98 42 104 42 H132 C138 42 143 47 143 53 V64 H93 Z"
                fill="#f7f4f3"
                stroke="#c8bebd"
                strokeWidth="2.3"
              />
              <Line x1="106" y1="77" x2="144" y2="77" stroke="#d9d2d2" strokeWidth="3" strokeLinecap="round" />
              <Line x1="106" y1="95" x2="144" y2="95" stroke="#d9d2d2" strokeWidth="3" strokeLinecap="round" />
              <Line x1="106" y1="113" x2="144" y2="113" stroke="#d9d2d2" strokeWidth="3" strokeLinecap="round" />

              <Circle cx="94" cy="76" r="6.2" fill="#d8d0d0" opacity="0.82" />
              <Circle cx="94" cy="95" r="6.2" fill="#d8d0d0" opacity="0.82" />
              <Circle cx="94" cy="113" r="6.2" fill="#d8d0d0" opacity="0.82" />
            </G>
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.illustrationLayer, { width, height }, badgeAnimatedStyle]}>
          <Svg width={width} height={height} viewBox="-8 -10 256 216" style={styles.illustrationLayer}>
            <Circle cx="166" cy="130" r="38" fill="#ffffff" fillOpacity="0.8" stroke="#c8bebd" strokeWidth="2.6" />
            <Circle cx="166" cy="130" r="24" fill="none" stroke="#dcd4d4" strokeWidth="2.4" />
            <Line x1="191" y1="155" x2="207" y2="172" stroke="#c8bebd" strokeWidth="6.2" strokeLinecap="round" />
            <Path
              d="M153 112 C146 120 143 130 145 141"
              fill="none"
              stroke="#e1dada"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.illustrationWrap, { width, height }, style]} pointerEvents="none">
      <Svg width={width} height={height} viewBox="0 0 240 188" style={styles.illustrationLayer}>
        <Rect x="9" y="8" width="222" height="34" rx="17" fill="#eef1f4" opacity="0.82" />
        <Rect x="9" y="84" width="222" height="34" rx="17" fill="#eef1f4" opacity="0.82" />
        <Rect x="9" y="150" width="222" height="30" rx="15" fill="#eef1f4" opacity="0.82" />
        <Circle cx="210" cy="78" r="18" fill="#eef1f4" opacity="0.86" />
        <Circle cx="42" cy="132" r="13" fill="#eef1f4" opacity="0.76" />
      </Svg>

      {showCountBadge ? (
        <Animated.View style={[styles.illustrationLayer, { width, height }, badgeAnimatedStyle]}>
          <Svg width={width} height={height} viewBox="0 0 240 188">
            <Path
              d="M130 10 H178 C184 10 189 15 189 21 V50 C189 56 184 61 178 61 H151 L140 76 V61 H130 C124 61 119 56 119 50 V21 C119 15 124 10 130 10 Z"
              fill="#e6ebef"
              stroke="#cfd5da"
              strokeWidth="2.5"
            />
            <SvgText
              x="154"
              y="47"
              textAnchor="middle"
              fontSize="38"
              fontWeight="800"
              fill="#cfd5da"
            >
              {count}
            </SvgText>
          </Svg>
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.illustrationLayer, { width, height }, fileAnimatedStyle]}>
        <Svg width={width} height={height} viewBox="0 0 240 188">
          <G rotation="-8" originX="116" originY="102">
            <Path
              d="M54 72 C52 63 58 55 67 54 L172 40 C181 39 189 45 191 54 L205 126 C207 136 201 144 191 146 L83 160 C75 161 67 156 65 147 Z"
              fill="#e2e7eb"
              stroke="#cfd5da"
              strokeWidth="2.5"
            />
            <Path
              d="M78 160 L48 163 C40 164 35 158 37 150 L50 83 L65 147 C67 156 75 161 83 160 Z"
              fill="#dfe5e9"
              stroke="#cfd5da"
              strokeWidth="2.5"
            />
            <Line x1="70" y1="72" x2="158" y2="59" stroke="#cbd2d8" strokeWidth="2.4" strokeLinecap="round" />
            <Line x1="73" y1="88" x2="116" y2="82" stroke="#cbd2d8" strokeWidth="2.4" strokeLinecap="round" />
            <Rect x="151" y="93" width="38" height="11" rx="5.5" fill="#f6f8fa" stroke="#cfd5da" strokeWidth="2.2" />
            <Rect x="154" y="113" width="38" height="13" rx="6.5" fill="#f6f8fa" stroke="#cfd5da" strokeWidth="2.2" />
          </G>

          <Path
            d="M145 117 C141 130 139 145 144 160 C149 175 164 164 156 154 C149 146 136 155 141 169"
            fill="none"
            stroke="#cfd5da"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <Path
            d="M181 112 C198 123 198 148 178 154 C154 161 150 129 170 125 C185 122 190 143 174 144"
            fill="none"
            stroke="#cfd5da"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export function EmptyDataState({
  title = 'Empty file',
  message = '',
  count = '0',
  showCountBadge = true,
  compact = false,
  style,
  illustrationStyle,
  titleStyle,
  messageStyle,
  variant = 'default',
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const headingFont = resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay;
  const bodyFont = resolvedTheme?.fontFamily || theme.typography.fontFamily;
  const illustrationSize = variant === 'analysis'
    ? (compact ? 160 : 204)
    : (compact ? 148 : 188);

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null, style]}>
      <EmptyStateIllustration
        size={illustrationSize}
        count={count}
        showCountBadge={variant === 'analysis' ? false : showCountBadge}
        style={illustrationStyle}
        variant={variant}
      />
      <Text
        style={[
          styles.title,
          compact ? styles.titleCompact : null,
          { color: roles.headingText, fontFamily: headingFont },
          titleStyle,
        ]}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            styles.message,
            compact ? styles.messageCompact : null,
            { color: roles.bodyText, fontFamily: bodyFont },
            messageStyle,
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
  },
  containerCompact: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  illustrationWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  analysisIllustrationWrap: {
    marginBottom: theme.spacing.lg,
  },
  illustrationLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.titleMd * theme.typography.lineHeights.tight,
  },
  titleCompact: {
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
  },
  message: {
    marginTop: theme.spacing.xs,
    maxWidth: 300,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    textAlign: 'center',
  },
  messageCompact: {
    maxWidth: 250,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
});
