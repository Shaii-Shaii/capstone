import React from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../providers/AuthProvider';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import hairLockImage from '../../assets/images/loading_hair_lock.png';

const HAIR_WIDTH = 156;
const HAIR_HEIGHT = 238;
const CUT_Y = 96;
const SCISSOR_WIDTH = 176;
const SCISSOR_HEIGHT = 108;
const PIVOT_X = 72;
const PIVOT_Y = 58;

export function DonivraLoadingOverlay({ visible, label = 'Loading...' }) {
  const { height } = useWindowDimensions();
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const isCompact = height < theme.layout.compactScreenHeight;
  const sway = React.useRef(new Animated.Value(0)).current;
  const scissorX = React.useRef(new Animated.Value(-78)).current;
  const scissorY = React.useRef(new Animated.Value(1)).current;
  const bladeOpen = React.useRef(new Animated.Value(1)).current;
  const bottomDrop = React.useRef(new Animated.Value(0)).current;
  const cutFlash = React.useRef(new Animated.Value(0)).current;
  const cutGap = React.useRef(new Animated.Value(0)).current;
  const dotPhase = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!visible) return undefined;

    sway.setValue(0);
    scissorX.setValue(-78);
    scissorY.setValue(1);
    bladeOpen.setValue(1);
    bottomDrop.setValue(0);
    cutFlash.setValue(0);
    cutGap.setValue(0);
    dotPhase.setValue(0);

    const swayAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, {
          toValue: 1,
          duration: 980,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sway, {
          toValue: 0,
          duration: 980,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const dotAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPhase, {
          toValue: 3,
          duration: 1120,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(dotPhase, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    const cutCycle = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scissorX, { toValue: -78, duration: 0, useNativeDriver: true }),
          Animated.timing(scissorY, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(bladeOpen, { toValue: 1, duration: 0, useNativeDriver: true }),
          Animated.timing(bottomDrop, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(cutFlash, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(cutGap, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.delay(90),
        Animated.parallel([
          Animated.timing(scissorX, {
            toValue: -4,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(scissorY, {
            toValue: -2,
            duration: 400,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(bladeOpen, {
            toValue: 0,
            duration: 135,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scissorX, {
            toValue: 10,
            duration: 135,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(cutFlash, {
            toValue: 1,
            duration: 80,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(cutGap, {
            toValue: 1,
            duration: 105,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(bottomDrop, {
            toValue: 1,
            duration: 430,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(cutFlash, {
            toValue: 0,
            duration: 240,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(bladeOpen, {
            toValue: 1,
            duration: 250,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scissorX, {
            toValue: 56,
            duration: 270,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scissorY, {
            toValue: 1,
            duration: 270,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(180),
      ]),
    );

    swayAnim.start();
    dotAnim.start();
    cutCycle.start();

    return () => {
      swayAnim.stop();
      dotAnim.stop();
      cutCycle.stop();
    };
  }, [bladeOpen, bottomDrop, cutFlash, cutGap, dotPhase, scissorX, scissorY, sway, visible]);

  if (!visible) return null;

  const message = getLoadingMessage(label);

  const strandRotate = sway.interpolate({
    inputRange: [0, 1],
    outputRange: ['-3deg', '4deg'],
  });
  const strandTranslateX = sway.interpolate({
    inputRange: [0, 1],
    outputRange: [-2, 3],
  });
  const upperBladeRotate = bladeOpen.interpolate({
    inputRange: [0, 1],
    outputRange: ['-8deg', '-28deg'],
  });
  const lowerBladeRotate = bladeOpen.interpolate({
    inputRange: [0, 1],
    outputRange: ['8deg', '26deg'],
  });
  const bottomTranslateX = bottomDrop.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 7, 18],
  });
  const bottomTranslateY = bottomDrop.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0, 10, 34],
  });
  const bottomRotate = bottomDrop.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '18deg'],
  });
  const bottomOpacity = bottomDrop.interpolate({
    inputRange: [0, 0.68, 1],
    outputRange: [1, 0.9, 0.64],
  });
  const flashScale = cutFlash.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1.08],
  });
  const gapScale = cutGap.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 1],
  });
  const gapOpacity = cutGap.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0, 0.95, 0.6],
  });

  const dotStyles = [0, 1, 2].map((dotIndex) => ({
    opacity: dotPhase.interpolate({
      inputRange: [0, 1, 2, 3],
      outputRange: [
        dotIndex === 0 ? 1 : 0.35,
        dotIndex === 1 ? 1 : 0.35,
        dotIndex === 2 ? 1 : 0.35,
        dotIndex === 0 ? 1 : 0.35,
      ],
    }),
    transform: [{
      scale: dotPhase.interpolate({
        inputRange: [0, 1, 2, 3],
        outputRange: [
          dotIndex === 0 ? 1.25 : 0.75,
          dotIndex === 1 ? 1.25 : 0.75,
          dotIndex === 2 ? 1.25 : 0.75,
          dotIndex === 0 ? 1.25 : 0.75,
        ],
      }),
    }],
  }));

  return (
    <View
      style={[styles.overlay, { backgroundColor: roles.pageBackground || theme.colors.backgroundCanvas }]}
      pointerEvents="auto"
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.content, isCompact ? styles.contentCompact : null]}>
        <View style={[styles.stage, isCompact ? styles.stageCompact : null]}>
          <View style={[styles.artGroup, isCompact ? styles.artGroupCompact : null]}>
            <Animated.View
              style={[
                styles.hairWrap,
                {
                  transform: [
                    { translateX: strandTranslateX },
                    { rotate: strandRotate },
                  ],
                },
              ]}
            >
              <View style={styles.hairTopClip}>
                <HairLockArt />
              </View>

              <Animated.View
                style={[
                  styles.hairBottomWrap,
                  {
                    opacity: bottomOpacity,
                    transform: [
                      { translateX: bottomTranslateX },
                      { translateY: bottomTranslateY },
                      { rotate: bottomRotate },
                    ],
                  },
                ]}
              >
                <View style={styles.hairBottomClip}>
                  <View style={styles.hairBottomOffset}>
                    <HairLockArt />
                  </View>
                </View>
              </Animated.View>
            </Animated.View>

            <Animated.View
              style={[
                styles.cutGap,
                {
                  opacity: gapOpacity,
                  transform: [{ scaleX: gapScale }],
                },
              ]}
            />

            <Animated.View
              style={[
                styles.flashWrap,
                {
                  opacity: cutFlash,
                  transform: [{ scale: flashScale }],
                },
              ]}
            >
              <SnipSpark />
            </Animated.View>

            <Animated.View
              style={[
                styles.scissorWrap,
                {
                  transform: [
                    { translateX: scissorX },
                    { translateY: scissorY },
                    { rotate: '-5deg' },
                  ],
                },
              ]}
            >
              <ScissorArt upperBladeRotate={upperBladeRotate} lowerBladeRotate={lowerBladeRotate} />
            </Animated.View>
          </View>
        </View>

        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        <View style={styles.dotRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {dotStyles.map((dotStyle, index) => (
            <Animated.View key={index} style={[styles.dot, dotStyle]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function getLoadingMessage(label) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('google')) return 'Connecting your Google account securely...';
  if ((normalized.includes('creat') || normalized.includes('sign up')) && normalized.includes('account')) return 'Preparing your account...';
  if (normalized.includes('login') || normalized.includes('logging') || normalized.includes('session')) return 'Checking your secure session...';
  if (normalized.includes('reset') || normalized.includes('link')) return 'Sending reset instructions...';
  if (normalized.includes('verify') || normalized.includes('verifying')) return 'Confirming your email...';
  if (normalized.includes('resend') || normalized.includes('code')) return 'Sending a new verification code...';
  if (normalized.includes('profile') || normalized.includes('preparing')) return 'Preparing your profile...';
  return label;
}

function HairLockArt() {
  return <Image source={hairLockImage} style={styles.hairImage} resizeMode="contain" />;
}

function ScissorArt({ upperBladeRotate, lowerBladeRotate }) {
  return (
    <View style={styles.scissorArt}>
      <View style={styles.handleArmUpper} />
      <View style={styles.handleArmUpperShine} />
      <View style={styles.handleArmLower} />
      <View style={styles.handleArmLowerShine} />

      <View style={[styles.handleRing, styles.handleRingUpper]}>
        <View style={styles.handleHole} />
      </View>
      <View style={[styles.handleRing, styles.handleRingLower]}>
        <View style={styles.handleHole} />
      </View>

      <Animated.View style={[styles.bladePlane, { transform: [{ rotate: upperBladeRotate }] }]}>
        <LinearGradient
          colors={['#f6fbff', '#b8c6cf', '#596c78']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.bladeUpper}
        />
        <View style={styles.bladeUpperTip} />
        <View style={styles.bladeShineUpper} />
      </Animated.View>

      <Animated.View style={[styles.bladePlane, { transform: [{ rotate: lowerBladeRotate }] }]}>
        <LinearGradient
          colors={['#eef5f9', '#a8b7c1', '#4e606b']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.bladeLower}
        />
        <View style={styles.bladeLowerTip} />
        <View style={styles.bladeShineLower} />
      </Animated.View>

      <View style={styles.pivotOuter}>
        <View style={styles.pivotInner}>
          <View style={styles.pivotDot} />
        </View>
      </View>
    </View>
  );
}

function SnipSpark() {
  return (
    <View style={styles.spark}>
      <View style={[styles.sparkLine, styles.sparkLineVertical]} />
      <View style={[styles.sparkLine, styles.sparkLineHorizontal]} />
      <View style={[styles.sparkLine, styles.sparkLineDiagA]} />
      <View style={[styles.sparkLine, styles.sparkLineDiagB]} />
      <View style={styles.sparkCore} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundCanvas,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  contentCompact: {
    transform: [{ translateY: -8 }],
  },
  stage: {
    width: 158,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  stageCompact: {
    width: 140,
    height: 116,
    marginBottom: theme.spacing.xs,
  },
  artGroup: {
    width: 270,
    height: 252,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 0.4 }],
  },
  artGroupCompact: {
    transform: [{ scale: 0.36 }],
  },
  hairWrap: {
    position: 'absolute',
    left: 79,
    top: 2,
    width: HAIR_WIDTH,
    height: HAIR_HEIGHT,
  },
  hairTopClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: HAIR_WIDTH,
    height: CUT_Y,
    overflow: 'hidden',
  },
  hairBottomWrap: {
    position: 'absolute',
    left: 0,
    top: CUT_Y,
    width: HAIR_WIDTH,
    height: HAIR_HEIGHT - CUT_Y,
  },
  hairBottomClip: {
    width: HAIR_WIDTH,
    height: HAIR_HEIGHT - CUT_Y,
    overflow: 'hidden',
  },
  hairBottomOffset: {
    position: 'absolute',
    left: 0,
    top: -CUT_Y,
    width: HAIR_WIDTH,
    height: HAIR_HEIGHT,
  },
  hairImage: {
    width: HAIR_WIDTH,
    height: HAIR_HEIGHT,
  },
  cutGap: {
    position: 'absolute',
    left: 116,
    top: CUT_Y + 2,
    width: 76,
    height: 8,
    borderRadius: 6,
    backgroundColor: '#fff8f4',
    borderWidth: 1,
    borderColor: 'rgba(146, 41, 74, 0.08)',
  },
  flashWrap: {
    position: 'absolute',
    left: 137,
    top: CUT_Y - 24,
    width: 48,
    height: 48,
  },
  scissorWrap: {
    position: 'absolute',
    left: -4,
    top: 54,
    width: SCISSOR_WIDTH,
    height: SCISSOR_HEIGHT,
  },
  scissorArt: {
    width: SCISSOR_WIDTH,
    height: SCISSOR_HEIGHT,
  },
  handleRing: {
    position: 'absolute',
    width: 52,
    height: 36,
    borderRadius: 22,
    borderWidth: 9,
    borderColor: '#b88917',
    backgroundColor: '#fff8ed',
    shadowColor: '#5f3b09',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  handleRingUpper: {
    left: 2,
    top: 16,
    transform: [{ rotate: '-18deg' }],
  },
  handleRingLower: {
    left: 5,
    top: 67,
    transform: [{ rotate: '17deg' }],
  },
  handleHole: {
    flex: 1,
    margin: 1,
    borderRadius: 18,
    backgroundColor: '#fffaf2',
  },
  handleArmUpper: {
    position: 'absolute',
    left: 37,
    top: 42,
    width: 43,
    height: 12,
    borderRadius: 7,
    backgroundColor: '#bf8e21',
    transform: [{ rotate: '30deg' }],
  },
  handleArmUpperShine: {
    position: 'absolute',
    left: 39,
    top: 44,
    width: 38,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 230, 156, 0.36)',
    transform: [{ rotate: '30deg' }],
  },
  handleArmLower: {
    position: 'absolute',
    left: 38,
    top: 61,
    width: 43,
    height: 12,
    borderRadius: 7,
    backgroundColor: '#a97a15',
    transform: [{ rotate: '-25deg' }],
  },
  handleArmLowerShine: {
    position: 'absolute',
    left: 41,
    top: 63,
    width: 35,
    height: 4,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 225, 140, 0.26)',
    transform: [{ rotate: '-25deg' }],
  },
  bladePlane: {
    position: 'absolute',
    left: PIVOT_X - 4,
    top: PIVOT_Y - 9,
    width: 112,
    height: 18,
  },
  bladeUpper: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 96,
    height: 10,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  bladeLower: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 96,
    height: 10,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  bladeUpperTip: {
    position: 'absolute',
    left: 94,
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 18,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#596c78',
  },
  bladeLowerTip: {
    position: 'absolute',
    left: 94,
    top: 0,
    width: 0,
    height: 0,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 18,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#4e606b',
  },
  bladeShineUpper: {
    position: 'absolute',
    left: 8,
    top: 5,
    width: 70,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.64)',
  },
  bladeShineLower: {
    position: 'absolute',
    left: 8,
    top: 11,
    width: 70,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
  },
  pivotOuter: {
    position: 'absolute',
    left: PIVOT_X - 12,
    top: PIVOT_Y - 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#744d12',
  },
  pivotInner: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d4a13c',
  },
  pivotDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#781c34',
  },
  spark: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkLine: {
    position: 'absolute',
    borderRadius: 99,
    backgroundColor: '#f0bb32',
  },
  sparkLineVertical: {
    width: 5,
    height: 34,
  },
  sparkLineHorizontal: {
    width: 34,
    height: 5,
  },
  sparkLineDiagA: {
    width: 4,
    height: 28,
    transform: [{ rotate: '45deg' }],
  },
  sparkLineDiagB: {
    width: 4,
    height: 28,
    transform: [{ rotate: '-45deg' }],
  },
  sparkCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff7d0',
  },
  message: {
    maxWidth: 300,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyMd,
    lineHeight: theme.typography.semantic.bodyMd * theme.typography.lineHeights.relaxed,
    letterSpacing: 0,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.brandPrimary,
    textAlign: 'center',
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: theme.spacing.sm,
    minHeight: 14,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: theme.colors.brandPrimary,
  },
});
