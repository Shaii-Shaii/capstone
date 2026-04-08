import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OtpInput } from '../ui/OtpInput';
import { AppButton } from '../ui/AppButton';
import { AppTextLink } from '../ui/AppTextLink';
import { theme } from '../../design-system/theme';

export const VerifyEmailForm = ({ schema, emailContext, onSubmit, onResend, isLoading, isResending, resendCountdown = 0, successMessage }) => {
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      otp: '',
    }
  });

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>
        Code sent to <Text style={styles.emailText}>{emailContext}</Text>
      </Text>
      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}

      <Controller
        control={control}
        name="otp"
        render={({ field: { onChange, value } }) => (
          <View style={styles.otpContainer}>
            <OtpInput
              length={6}
              value={value}
              onChange={onChange}
              error={!!errors.otp}
              success={Boolean(successMessage && !errors.otp && successMessage.toLowerCase().includes('verified'))}
            />
            {errors.otp && (
              <Text style={styles.errorText}>{errors.otp.message}</Text>
            )}
          </View>
        )}
      />

      <AppButton
        title="Verify"
        onPress={handleSubmit(onSubmit)}
        loading={isLoading}
        disabled={isLoading || isResending}
        size="lg"
        style={styles.submitBtn}
      />

      <View style={styles.resendRow}>
        <AppTextLink
          title={resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend Code'}
          onPress={onResend}
          disabled={resendCountdown > 0 || isLoading || isResending}
          variant="muted"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.normal,
  },
  emailText: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  successText: {
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.actionPrimary,
    fontWeight: theme.typography.weights.medium,
  },
  otpContainer: {
    marginBottom: theme.spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textError,
    marginTop: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  submitBtn: {
    marginBottom: theme.spacing.md,
  },
  resendRow: {
    alignItems: 'center',
    paddingBottom: theme.spacing.sm,
  },
});
