import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Pressable, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { VerifyEmailForm } from '../../src/components/auth/VerifyEmailForm';
import { AuthScreenLayout } from '../../src/components/auth/AuthScreenLayout';
import { verifyEmailSchema } from '../../src/features/auth/validators/auth.schema';
import { logout, verifyEmail, resendVerifyEmail } from '../../src/features/auth/services/auth.service';
import { syncPendingSignupDraft } from '../../src/features/auth/services/signupDraft.service';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

const RESEND_DELAY = 30;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { email, role } = params;
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

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

  const routeAfterVerify = () => {
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
    setStatusMessage('Email verified. Redirecting to login...');

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

    if (session) {
      await logout();
    }

    setTimeout(() => routeAfterVerify(), 900);
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
    <AuthScreenLayout>
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backBtn, pressed ? styles.backBtnPressed : null]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <View
          style={[
            styles.backIconShell,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={18}
            color={roles.headingText}
          />
        </View>
        <Text style={[styles.backBtnText, { color: roles.bodyText }]}>Back</Text>
      </Pressable>

      {/* Illustration */}
      <View style={styles.illustrationSection}>
        <View
          style={[
            styles.iconCircleOuter,
            { backgroundColor: roles.supportCardBackground },
          ]}
        >
          <View
            style={[
              styles.iconCircleInner,
              { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
            ]}
          >
            <MaterialCommunityIcons
              name="email-check-outline"
              size={36}
              color={roles.primaryActionBackground}
            />
          </View>
        </View>
      </View>

      {/* Header text */}
      <View style={styles.headerBlock}>
        <Text
          style={[
            styles.title,
            {
              color: roles.headingText,
              fontFamily:
                resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
            },
          ]}
        >
          Enter Code
        </Text>
        <Text style={[styles.subtitle, { color: roles.bodyText }]}>
          A code has been sent to your email
        </Text>
      </View>

      {/* OTP form */}
      <View style={styles.formContainer}>
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
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xxl,
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  backIconShell: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.medium,
  },
  illustrationSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  iconCircleOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    textAlign: 'center',
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  formContainer: {
    width: '100%',
  },
});
