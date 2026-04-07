import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../src/components/ui/ScreenContainer';
import { AppButton } from '../src/components/ui/AppButton';
import { AppIcon } from '../src/components/ui/AppIcon';
import { theme } from '../src/design-system/theme';
import donivraLogoNoText from '../src/assets/images/donivra_logo_no_text.png';

export default function LandingScreen() {
  const router = useRouter();

  const navigateWithHaptic = async (path) => {
    await Haptics.selectionAsync();
    router.push(path);
  };

  return (
    <ScreenContainer
      scrollable={false}
      safeArea
      variant="auth"
      heroColors={[theme.colors.dashboardDonorFrom, theme.colors.heroTo]}
      contentStyle={styles.screenContent}
    >
      <View style={styles.container}>
        <View style={styles.panel}>
          <View style={styles.visualSection}>
            <View style={styles.visualDotOne} />
            <View style={styles.visualDotTwo} />
            <View style={styles.visualDotThree} />
            <View style={styles.logoWrap}>
              <Image source={donivraLogoNoText} style={styles.logo} resizeMode="contain" />
            </View>
          </View>

          <View style={styles.contentSection}>
            <View style={styles.brandBlock}>
              <Text style={styles.brandName}>Donivra</Text>
              <Text style={styles.brandTag}>Hair donation and support</Text>
            </View>

            <View style={styles.copyBlock}>
              <Text style={styles.heroTitle}>Welcome to Donivra.</Text>
              <Text style={styles.heroSubtitle}>
                Create your account or log in to continue.
              </Text>
            </View>

            <View style={styles.actionStack}>
              <AppButton
                title="Sign Up"
                variant="primary"
                size="lg"
                leading={<AppIcon name="profile" state="inverse" />}
                onPress={() => navigateWithHaptic('/auth/signup')}
                enableHaptics={true}
              />
              <AppButton
                title="Log In"
                variant="secondary"
                size="lg"
                leading={<AppIcon name="profile" state="default" />}
                onPress={() => navigateWithHaptic('/auth/access')}
                enableHaptics={true}
              />
            </View>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  panel: {
    flex: 1,
    backgroundColor: theme.colors.surfaceCard,
    borderRadius: theme.radius.xxl,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xl,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.card,
  },
  visualSection: {
    flex: 0.52,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  visualDotOne: {
    position: 'absolute',
    top: 18,
    left: 6,
    width: 12,
    height: 12,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  visualDotTwo: {
    position: 'absolute',
    top: 36,
    right: 18,
    width: 10,
    height: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  visualDotThree: {
    position: 'absolute',
    bottom: 24,
    left: 34,
    width: 14,
    height: 14,
    borderRadius: theme.radius.full,
    borderWidth: 1.5,
    borderColor: theme.colors.borderMuted,
  },
  logoWrap: {
    width: 184,
    height: 184,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  logo: {
    width: 112,
    height: 112,
  },
  contentSection: {
    flex: 0.48,
    justifyContent: 'space-between',
    gap: theme.spacing.lg,
  },
  brandBlock: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 40,
    lineHeight: 44,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  brandTag: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  copyBlock: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  heroTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
  },
  heroSubtitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    maxWidth: 300,
  },
  actionStack: {
    width: '100%',
    gap: theme.spacing.sm,
  },
});
