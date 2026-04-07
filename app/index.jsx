import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../src/components/ui/ScreenContainer';
import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
import { AppIcon } from '../src/components/ui/AppIcon';
import { AppTextLink } from '../src/components/ui/AppTextLink';
import { theme } from '../src/design-system/theme';
import donivraLogoNoText from '../src/assets/images/donivra_logo_no_text.png';

const roleCards = [
  {
    key: 'donor',
    icon: 'heart',
    title: 'Donate Hair',
    description: 'Create a donor account and continue to your donation dashboard.',
    route: '/donor/signup',
    buttonLabel: 'Sign Up as Donor',
    buttonVariant: 'primary',
    iconState: 'inverse',
  },
  {
    key: 'patient',
    icon: 'support',
    title: 'Request Support',
    description: 'Create a patient account and continue to your support dashboard.',
    route: '/patient/signup',
    buttonLabel: 'Sign Up as Patient',
    buttonVariant: 'secondary',
    iconState: 'default',
  },
];

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
          <Text style={styles.heroTitle}>A clear start for donors and patients.</Text>
          <Text style={styles.heroSubtitle}>
            Continue with signup, verify your account, and go directly to your dashboard.
          </Text>
        </AppCard>

        <View style={styles.roleStack}>
          {roleCards.map((item) => (
            <AppCard key={item.key} variant="elevated" radius="xl" padding="lg">
              <View style={styles.roleHeader}>
                <View style={styles.roleIconWrap}>
                  <AppIcon name={item.icon} size="sm" state="active" />
                </View>
                <View style={styles.roleCopy}>
                  <Text style={styles.roleTitle}>{item.title}</Text>
                  <Text style={styles.roleDescription}>{item.description}</Text>
                </View>
              </View>

              <AppButton
                title={item.buttonLabel}
                variant={item.buttonVariant}
                size="lg"
                leading={<AppIcon name={item.icon} state={item.iconState} />}
                onPress={() => navigateWithHaptic(item.route)}
                enableHaptics={true}
              />
            </AppCard>
          ))}
        </View>

        <View style={styles.accountActionWrap}>
          <Text style={styles.accountActionLabel}>Already have an account?</Text>
          <AppTextLink
            title="Log in"
            onPress={() => navigateWithHaptic('/auth/access')}
            textStyle={styles.accountActionTitle}
          />
        </View>
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
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
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
  roleStack: {
    gap: theme.spacing.sm,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  roleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  roleCopy: {
    flex: 1,
    gap: 2,
  },
  roleTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  roleDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  accountActionWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: theme.spacing.sm,
  },
  accountActionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.medium,
  },
  accountActionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.actionTextLink,
  },
});
