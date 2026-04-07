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
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.panel}>
          <View style={styles.brandBlock}>
            <View style={styles.logoWrap}>
              <Image source={donivraLogoNoText} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>Donivra</Text>
              <Text style={styles.brandTag}>Hair donation and support</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Welcome to Donivra.</Text>
          <Text style={styles.heroSubtitle}>
            Create your account or log in to continue.
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
    paddingBottom: 0,
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.layout.screenPaddingX,
    paddingVertical: theme.spacing.lg,
  },
  panel: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    minHeight: 440,
    justifyContent: 'center',
  },
  brandBlock: {
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  brandCopy: {
    gap: 2,
  },
  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 34,
    lineHeight: 38,
    color: theme.colors.textPrimary,
  },
  brandTag: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
  heroTitle: {
    textAlign: 'left',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
  },
  heroSubtitle: {
    textAlign: 'left',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    maxWidth: 340,
  },
  actionStack: {
    width: '100%',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
});
