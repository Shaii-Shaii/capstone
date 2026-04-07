import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../src/components/ui/ScreenContainer';
import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
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
      scrollable={true}
      safeArea
      variant="auth"
      heroColors={[theme.colors.dashboardDonorFrom, theme.colors.heroTo]}
      contentStyle={styles.screenContent}
    >
      <View style={styles.container}>
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.heroCard}>
          <View style={styles.logoWrap}>
            <Image source={donivraLogoNoText} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.brandName}>Donivra</Text>
          <Text style={styles.brandTag}>Hair donation and support</Text>
          <Text style={styles.heroTitle}>Welcome to Donivra.</Text>
          <Text style={styles.heroSubtitle}>
            Create one account, complete OTP verification, and then log in to continue.
          </Text>

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
        </AppCard>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: theme.spacing.md,
    justifyContent: 'flex-start',
  },
  container: {
    flex: 1,
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPaddingX,
  },
  heroCard: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    justifyContent: 'center',
    minHeight: 420,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    marginBottom: theme.spacing.xs,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    color: theme.colors.textPrimary,
  },
  brandTag: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
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
    maxWidth: 320,
  },
  actionStack: {
    width: '100%',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
});
