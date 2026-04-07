import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { VerifyEmailForm } from '../../src/components/auth/VerifyEmailForm';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AuthScreenLayout } from '../../src/components/auth/AuthScreenLayout';
import { AppTextLink } from '../../src/components/ui/AppTextLink';
import { FormProgressStepper } from '../../src/components/ui/FormProgressStepper';
import { verifyEmailSchema } from '../../src/features/auth/validators/auth.schema';
import { logout, verifyEmail, resendVerifyEmail } from '../../src/features/auth/services/auth.service';
import { syncPendingSignupDraft } from '../../src/features/auth/services/signupDraft.service';
import { theme } from '../../src/design-system/theme';

const RESEND_DELAY = 30;
const SIGNUP_STEPS = [
  { key: 'personal', label: 'Personal Details', shortLabel: 'Personal' },
  { key: 'address', label: 'Address Details', shortLabel: 'Address' },
  { key: 'patient', label: 'Patient', shortLabel: 'Patient' },
  { key: 'photo', label: 'Profile Photo', shortLabel: 'Photo' },
  { key: 'confirm', label: 'Confirm', shortLabel: 'Confirm' },
  { key: 'verify', label: 'OTP Verification', shortLabel: 'Verify' },
];

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { email, role } = params;

  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_DELAY);
  const [verified, setVerified] = useState(false);
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
    setVerified(true);
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
      <AppTextLink title="Back" variant="muted" onPress={() => router.back()} />
      <AuthHeader
        title="Verify your email"
        subtitle="Enter the 6-digit code to continue."
        eyebrow="Email confirmation"
      />

      <FormProgressStepper
        steps={SIGNUP_STEPS}
        currentStep={5}
        style={styles.stepper}
      />

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

      {verified ? <Text style={styles.readyText}>Your account is ready.</Text> : null}
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    marginTop: theme.spacing.md,
    width: '100%',
  },
  stepper: {
    marginTop: theme.spacing.sm,
  },
  readyText: {
    marginTop: theme.spacing.md,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
});
