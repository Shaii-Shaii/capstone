import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { GoogleAuthButton } from './GoogleAuthButton';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { signupDefaultValues } from '../../features/auth/validators/auth.schema';

export const SignupForm = ({
  schema,
  onSubmit,
  isLoading,
  activeAuthAction = '',
  buttonText = 'Sign up',
  submitError = '',
  onFieldEdit,
  resolvedTheme,
  onGooglePress,
}) => {
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: signupDefaultValues,
  });

  const passwordValue = watch('password');
  const roles = resolveThemeRoles(resolvedTheme);
  const isGoogleAvailable = typeof onGooglePress === 'function';
  const isSubmitLoading = isLoading && activeAuthAction === 'signup';
  const isGoogleLoading = isLoading && activeAuthAction === 'google';

  return (
    <View style={styles.container}>
      {submitError ? (
        <Text style={styles.submitErrorText}>
          {submitError}
        </Text>
      ) : null}

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppInput
            label="Email"
            value={value}
            onBlur={onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            error={errors.email?.message}
            placeholder="Your email"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
            style={styles.field}
            labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
            shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
            inputStyle={[styles.fieldInput, { color: roles.headingText }]}
          />
        )}
      />

      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordInput
            label="Password"
            value={value}
            onBlur={onBlur}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.password?.message}
            helperText={passwordValue || errors.password
              ? 'Use uppercase, lowercase, a number, and a special character.'
              : undefined}
            placeholder="Your password"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
            style={styles.field}
            labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
            shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
            inputStyle={[styles.fieldInput, { color: roles.headingText }]}
            helperTextStyle={[styles.helperText, { color: roles.bodyText }]}
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordInput
            label="Confirm password"
            value={value}
            onBlur={onBlur}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.confirmPassword?.message}
            placeholder="Confirm your password"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
            style={styles.field}
            labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
            shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
            inputStyle={[styles.fieldInput, { color: roles.headingText }]}
          />
        )}
      />

      <AppButton
        title={buttonText}
        onPress={handleSubmit((values) => {
          onFieldEdit?.();
          return onSubmit(values);
        })}
        loading={isSubmitLoading}
        disabled={isLoading}
        variant="outline"
        size="lg"
        style={styles.submitButton}
        textStyle={styles.submitButtonText}
        textColorOverride={roles.primaryActionText}
        backgroundColorOverride={roles.primaryActionBackground}
        borderColorOverride={roles.primaryActionBackground}
      />

      <View style={styles.altSection}>
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: roles.defaultCardBorder }]} />
          <Text style={[styles.dividerText, { color: roles.bodyText }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: roles.defaultCardBorder }]} />
        </View>

        <GoogleAuthButton
          mode="signup"
          disabled={!isGoogleAvailable || isLoading}
          loading={isGoogleLoading}
          onPress={onGooglePress}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  field: {
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
  },
  fieldShell: {
    borderRadius: 20,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  fieldInput: {
    fontSize: theme.typography.semantic.bodySm,
  },
  helperText: {
    fontSize: theme.typography.compact.caption,
  },
  submitErrorText: {
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textError,
  },
  altSection: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    minWidth: 24,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textTransform: 'lowercase',
  },
  submitButton: {
    minHeight: 52,
    borderRadius: 22,
    marginTop: theme.spacing.sm,
  },
  submitButtonText: {
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
});
