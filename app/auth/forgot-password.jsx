import React, { useState } from 'react';
import { View, StyleSheet, Alert, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AppInput } from '../../src/components/ui/AppInput';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppTextLink } from '../../src/components/ui/AppTextLink';
import { forgotPasswordSchema } from '../../src/features/auth/validators/auth.schema';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { theme } from '../../src/design-system/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { sendPasswordReset, isLoading } = useAuthActions();
  const [emailSent, setEmailSent] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  const handleSendReset = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await sendPasswordReset(data.email);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEmailSent(true);
      Alert.alert('Check your email', 'If an account exists, a secure reset link has been sent to your inbox.');
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to process your request.');
    }
  };

  return (
    <AuthScreenLayout>
      <AppTextLink title="Back" variant="muted" onPress={() => router.back()} />
      <AuthHeader
        title="Reset your password"
        subtitle="Enter your email to receive a reset link."
        eyebrow="Password recovery"
      />

      {!emailSent ? (
        <View style={authLayoutStyles.formSection}>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <AppInput
                label="Email Address"
                placeholder="juan@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                variant="filled"
                helperText="Use your registered email."
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.email?.message}
              />
            )}
          />

          <AppButton
            title="Send reset link"
            onPress={handleSubmit(handleSendReset)}
            loading={isLoading}
            size="lg"
            style={styles.submitBtn}
          />
        </View>
      ) : (
        <View style={styles.successContainer}>
          <View style={styles.successBadge}>
            <Text style={styles.successBadgeText}>Email sent</Text>
          </View>
          <Text style={styles.successBody}>
            If your account exists, check your inbox for the reset link.
          </Text>
          <AppButton
            title="Back to login"
            variant="secondary"
            onPress={() => router.replace('/auth/access')}
          />
        </View>
      )}

      <View style={styles.footerRow}>
        <AppTextLink
          title="Back to login"
          variant="muted"
          onPress={() => router.replace('/auth/access')}
        />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  submitBtn: {
    marginTop: theme.spacing.lg,
  },
  successContainer: {
    marginTop: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  successBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  successBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  successBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  footerRow: {
    marginTop: theme.spacing.xl,
  },
});
