import React from 'react';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppCard } from '../ui/AppCard';
import { AppIcon } from '../ui/AppIcon';
import { theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const AuthPathCard = ({ title, description, onPress, style, badgeText, role = 'donor' }) => {
  const { resolvedTheme } = useAuth();
  const scale = useSharedValue(1);
  const isDonor = role === 'donor';
  const surfaceBackground = resolvedTheme?.backgroundColor || (isDonor ? theme.colors.donorCardTo : theme.colors.patientCardTo);
  const accentColor = resolvedTheme?.primaryColor || (isDonor ? theme.colors.brandPrimary : theme.colors.brandSecondary);
  const softAccentColor = resolvedTheme?.secondaryColor || (isDonor ? theme.colors.brandPrimaryMuted : theme.colors.surfaceSoft);

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
          <View style={[styles.surface, { backgroundColor: surfaceBackground }]}>
            <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
            <View style={styles.content}>
              <View style={styles.row}>
                <View style={styles.leading}>
                  <View style={[styles.iconWrap, { backgroundColor: softAccentColor }]}>
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
                    <View style={[styles.badge, { backgroundColor: softAccentColor }]}>
                      <Text style={[styles.badgeText, { color: accentColor }]}>
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
          </View>
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
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
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
