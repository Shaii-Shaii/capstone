import React from 'react';
import { Pressable, View, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { OtpInput } from '../ui/OtpInput';
import { AppButton } from '../ui/AppButton';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const formatCountdown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
};

const VERIFY_BORDER_GRAD = [
  '#5f2f12',
  '#8e4f24',
  '#c8864f',
  '#ffe7ac',
  '#c8864f',
  '#8e4f24',
  '#5f2f12',
];

const VERIFY_FILL_GRAD = [
  '#8a111d',
  '#740c15',
  '#5c0910',
];

export const VerifyEmailForm = ({
  schema,
  emailContext,
  onSubmit,
  onValidationError,
  onResend,
  isLoading,
  isResending,
  resendCountdown = 0,
  successMessage,
  resolvedTheme,
}) => {
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      otp: '',
    }
  });
  const roles = resolveThemeRoles(resolvedTheme);
  const handleVerifySubmit = handleSubmit(
    onSubmit,
    (formErrors) => {
      const firstErrorMessage = formErrors?.otp?.message || 'Please enter a valid 6-digit code.';
      onValidationError?.(firstErrorMessage);
    }
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.subtitle, { color: roles.headingText }]}>
        Code sent to <Text style={[styles.emailText, { color: theme.colors.actionTextLink }]}>{emailContext}</Text>
      </Text>

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
          </View>
        )}
      />

      <LinearGradient
        colors={VERIFY_BORDER_GRAD}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.submitGradientBorder}
      >
        <LinearGradient
          colors={VERIFY_FILL_GRAD}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={styles.submitGradientFill}
        >
          <LinearGradient
            colors={[
              'rgba(255, 246, 222, 0)',
              'rgba(255, 246, 222, 0.18)',
              'rgba(255, 246, 222, 0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.submitDiagonalShine}
          />
          <AppButton
            title="Verify & Continue"
            onPress={handleVerifySubmit}
            loading={isLoading}
            disabled={isLoading || isResending}
            size="lg"
            variant="outline"
            style={styles.submitBtn}
            textStyle={styles.submitBtnText}
            backgroundColorOverride="transparent"
            borderColorOverride="transparent"
            textColorOverride={roles.primaryActionText}
          />
        </LinearGradient>
      </LinearGradient>

      <View style={styles.resendRow}>
        <Text style={[styles.resendText, { color: roles.headingText }]}>{'Did not receive the code? '}</Text>
        <Pressable
          onPress={onResend}
          disabled={resendCountdown > 0 || isLoading || isResending}
          style={({ pressed }) => [styles.resendPressable, pressed ? styles.pressed : null]}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.resendLink,
              { color: theme.colors.actionTextLink },
              resendCountdown > 0 || isLoading || isResending ? styles.resendDisabled : null,
            ]}
          >
            Resend Code
            {resendCountdown > 0 ? (
              <Text style={[styles.resendCountdown, { color: theme.colors.actionTextLink }]}> ({formatCountdown(resendCountdown)})</Text>
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
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  emailText: {
    fontWeight: theme.typography.weights.bold,
  },
  successText: {
    marginTop: -theme.spacing.sm,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.medium,
  },
  otpContainer: {
    marginBottom: theme.spacing.section,
    alignItems: 'center',
  },
  submitBtn: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 0,
    marginBottom: 0,
  },
  submitBtnText: {
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.4,
  },
  submitGradientBorder: {
    marginBottom: theme.spacing.lg,
    borderRadius: 16,
    padding: 3,
    overflow: 'hidden',
    shadowColor: '#c8864f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  submitGradientFill: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  submitDiagonalShine: {
    position: 'absolute',
    top: -54,
    left: 20,
    width: 40,
    height: 190,
    transform: [{ rotate: '22deg' }],
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
  },
  resendPressable: {
    minHeight: 28,
    justifyContent: 'center',
  },
  resendLink: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  resendDisabled: {
    opacity: 0.72,
  },
  resendCountdown: {
    opacity: 0.8,
    fontWeight: theme.typography.weights.regular,
  },
  pressed: {
    opacity: 0.72,
  },
});
