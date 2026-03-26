import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { AppCard } from '../ui/AppCard';
import { AppIcon } from '../ui/AppIcon';
import { theme } from '../../design-system/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const AuthPathCard = ({ title, description, onPress, style, badgeText, role = 'donor' }) => {
  const scale = useSharedValue(1);
  const isDonor = role === 'donor';
  const gradientColors = isDonor
    ? [theme.colors.donorCardFrom, theme.colors.surfaceSoft]
    : [theme.colors.patientCardFrom, theme.colors.surfaceCardMuted];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = async () => {
    await Haptics.selectionAsync();
    onPress?.();
  };

  return (
    <Animated.View entering={FadeInDown.duration(theme.motion.cardEnter)} style={[styles.wrapper, style]}>
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={() => {
          scale.value = withSpring(0.985, theme.motion.spring);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, theme.motion.spring);
        }}
        style={animatedStyle}
      >
        <AppCard variant="elevated" radius="xl" padding="none" style={styles.card}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.surface}
          >
            <View style={[styles.accentBar, isDonor ? styles.accentDonor : styles.accentPatient]} />
            <View style={styles.content}>
              <View style={styles.row}>
                <View style={styles.leading}>
                  <View style={[styles.iconWrap, isDonor ? styles.iconWrapDonor : styles.iconWrapPatient]}>
                    <AppIcon
                      name={isDonor ? 'donations' : 'support'}
                      size="md"
                      state={isDonor ? 'active' : 'muted'}
                    />
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.description}>{description}</Text>
                  </View>
                </View>

                <View style={styles.trailing}>
                  {badgeText ? (
                    <View style={[styles.badge, isDonor ? styles.badgeDonor : styles.badgePatient]}>
                      <Text style={[styles.badgeText, isDonor ? styles.badgeTextDonor : styles.badgeTextPatient]}>
                        {badgeText}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.arrowWrap}>
                    <AppIcon name="chevronRight" size="sm" state={isDonor ? 'active' : 'muted'} />
                  </View>
                </View>
              </View>
            </View>
          </LinearGradient>
        </AppCard>
      </AnimatedPressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    overflow: 'hidden',
  },
  surface: {
    flexDirection: 'row',
  },
  accentBar: {
    width: 5,
  },
  accentDonor: {
    backgroundColor: theme.colors.brandPrimary,
  },
  accentPatient: {
    backgroundColor: theme.colors.brandSecondary,
  },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  leading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDonor: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  iconWrapPatient: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  trailing: {
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
  },
  badgeDonor: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  badgePatient: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  badgeTextDonor: {
    color: theme.colors.brandPrimary,
  },
  badgeTextPatient: {
    color: theme.colors.textSecondary,
  },
  arrowWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.backgroundPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
