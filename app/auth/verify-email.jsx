import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ScreenContainer } from '../../src/components/ui/ScreenContainer';
import { VerifyEmailForm } from '../../src/components/auth/VerifyEmailForm';
import { verifyEmailSchema } from '../../src/features/auth/validators/auth.schema';
import { logout, verifyEmail, resendVerifyEmail } from '../../src/features/auth/services/auth.service';
import { syncPendingSignupDraft } from '../../src/features/auth/services/signupDraft.service';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

const RESEND_DELAY = 59;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { email, role } = params;
  const { refreshProfile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';

  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_DELAY);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    if (!email) {
      Alert.alert('Session Not Found', 'Please log in or sign up first.');
      router.replace('/auth/access');
    }
  }, [email, router]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  if (!email) return null;

  const routeAfterVerify = (nextRole = '') => {
    if (String(nextRole || role || '').trim().toLowerCase() === 'donor') {
      router.replace('/profile');
      return;
    }

    router.replace('/auth/access');
  };

  const handleVerify = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsVerifying(true);
    setStatusMessage('');
    const { session, role: verifiedRole, error } = await verifyEmail(email, data.otp);
    setIsVerifying(false);

    if (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatusMessage(error);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStatusMessage('Email verified. Preparing your donor profile...');

    if (session?.user?.id && email) {
      const syncResult = await syncPendingSignupDraft({
        userId: session.user.id,
        email,
        role: verifiedRole || role,
      });

      if (!syncResult.success) {
        setStatusMessage('Email verified. Redirecting to login...');
      }
    }

    const nextRole = verifiedRole || role;
    if (session?.user?.id && String(nextRole || '').trim().toLowerCase() === 'donor') {
      await refreshProfile(session.user.id);
    } else if (session) {
      await logout();
    }

    setTimeout(() => routeAfterVerify(nextRole), 900);
  };

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsResending(true);
    const { error } = await resendVerifyEmail(email);
    setIsResending(false);

    if (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setStatusMessage(error);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatusMessage('A new verification code has been sent.');
      setResendCountdown(RESEND_DELAY);
    }
  };

  return (
    <ScreenContainer
      scrollable
      safeArea
      variant="auth"
      contentStyle={[styles.screenContent, { backgroundColor: roles.defaultCardBackground }]}
    >
      <View style={[styles.glowTop, { backgroundColor: roles.iconPrimarySurface }]} />
      <View style={[styles.glowBottom, { backgroundColor: theme.colors.brandPrimaryMuted }]} />

      <View style={styles.verifyCanvas}>
        <View style={[styles.verifyCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={styles.headerBlock}>
            <View style={[styles.emailIcon, { backgroundColor: roles.iconPrimarySurface }]}>
              <MaterialCommunityIcons name="email-check-outline" size={34} color={roles.primaryActionBackground} />
            </View>
            <Text
              style={[
                styles.title,
                {
                  color: roles.headingText,
                  fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
                },
              ]}
            >
              Verify Your Email
            </Text>
            <Text style={[styles.subtitle, { color: roles.bodyText }]}>
              {'We have sent a 6-digit code to your email. Please enter it below to continue.'}
            </Text>
          </View>

          <VerifyEmailForm
            schema={verifyEmailSchema}
            emailContext={email}
            onSubmit={handleVerify}
            onResend={handleResend}
            isLoading={isVerifying}
            isResending={isResending}
            resendCountdown={resendCountdown}
            successMessage={statusMessage}
          />
        </View>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backLink, pressed ? styles.backBtnPressed : null]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <MaterialCommunityIcons name="content-cut" size={24} color={roles.primaryActionBackground} />
          <Text style={[styles.brandName, { color: roles.primaryActionBackground }]}>{brandName}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  verifyCanvas: {
    flex: 1,
    minHeight: 780,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.section,
  },
  verifyCard: {
    width: '100%',
    maxWidth: 480,
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.section,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 7,
    zIndex: 2,
  },
  glowTop: {
    position: 'absolute',
    top: -150,
    left: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    opacity: 0.32,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -160,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: 0.32,
  },
  emailIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: theme.spacing.section,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
    maxWidth: 320,
  },
  backLink: {
    marginTop: theme.spacing.section,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  backBtnPressed: {
    opacity: 0.7,
  },
});
