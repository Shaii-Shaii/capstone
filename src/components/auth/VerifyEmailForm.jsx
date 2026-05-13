import React from 'react';
import { Pressable, View, StyleSheet, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OtpInput } from '../ui/OtpInput';
import { AppButton } from '../ui/AppButton';
import { theme } from '../../design-system/theme';

const formatCountdown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

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
        title="Verify & Continue"
        onPress={handleSubmit(onSubmit)}
        loading={isLoading}
        disabled={isLoading || isResending}
        size="lg"
        style={styles.submitBtn}
        textStyle={styles.submitBtnText}
      />

      <View style={styles.resendRow}>
        <Text style={styles.resendText}>{'Did not receive the code? '}</Text>
        <Pressable
          onPress={onResend}
          disabled={resendCountdown > 0 || isLoading || isResending}
          style={({ pressed }) => [styles.resendPressable, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.resendLink,
              resendCountdown > 0 || isLoading || isResending ? styles.resendDisabled : null,
            ]}
          >
            Resend Code
            {resendCountdown > 0 ? (
              <Text style={styles.resendCountdown}> ({formatCountdown(resendCountdown)})</Text>
            ) : null}
          </Text>
        </Pressable>
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
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
    marginBottom: theme.spacing.section,
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
    minHeight: 48,
    borderRadius: theme.radius.lg,
    marginBottom: theme.spacing.lg,
  },
  submitBtnText: {
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    paddingBottom: theme.spacing.sm,
  },
  resendText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  resendPressable: {
    minHeight: 28,
    justifyContent: 'center',
  },
  resendLink: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.actionTextLink,
    fontWeight: theme.typography.weights.semibold,
  },
  resendDisabled: {
    color: theme.colors.textSecondary,
  },
  resendCountdown: {
    color: theme.colors.textMuted,
    fontWeight: theme.typography.weights.regular,
  },
  pressed: {
    opacity: 0.72,
  },
});
