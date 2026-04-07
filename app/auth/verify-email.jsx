import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
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
  const shakeX = useSharedValue(0);
  const pulseScale = useSharedValue(1);

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

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const successStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: verified ? 1 : 0,
  }));

  if (!email) return null;

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 45 }),
      withTiming(10, { duration: 45 }),
      withTiming(-8, { duration: 45 }),
      withTiming(8, { duration: 45 }),
      withTiming(0, { duration: 45 })
    );
  };

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
      triggerShake();
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setVerified(true);
    setStatusMessage('Email verified. Finishing your account details...');

    if (session?.user?.id && email) {
      const syncResult = await syncPendingSignupDraft({
        userId: session.user.id,
        email,
        role: verifiedRole || role,
      });

      if (!syncResult.success) {
        setStatusMessage('Email verified. Your account is ready, but some address details may need to be completed later.');
      }
    }

    if (session) {
      await logout();
    }

    pulseScale.value = withSequence(
      withTiming(1.08, { duration: 160 }),
      withTiming(1, { duration: 180 }),
      withTiming(1.04, { duration: 140 }),
      withTiming(1, { duration: 160 })
    );

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
      triggerShake();
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
        subtitle="Enter the 6-digit code to continue securely."
        eyebrow="Email confirmation"
      />

      <FormProgressStepper
        steps={SIGNUP_STEPS}
        currentStep={5}
        style={styles.stepper}
      />

      <Animated.View entering={FadeInDown.duration(420)}>
        <Animated.View style={shakeStyle}>
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
        </Animated.View>
      </Animated.View>

      {verified ? (
        <Animated.View style={[styles.successWrap, successStyle]}>
          <View style={styles.successCircle}>
            <Text style={styles.successMark}>OK</Text>
          </View>
        </Animated.View>
      ) : null}
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
  successWrap: {
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  successCircle: {
    width: 62,
    height: 62,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successMark: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
    letterSpacing: 0.8,
  },
});
