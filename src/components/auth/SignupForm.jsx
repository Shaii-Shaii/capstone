import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
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
  onFieldFocus,
  resolvedTheme,
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
  const isSubmitLoading = isLoading && activeAuthAction === 'signup';

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
            label=""
            value={value}
            leftIcon="email"
            onBlur={onBlur}
            onFocus={() => onFieldFocus?.('email')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            error={errors.email?.message}
            placeholder="Email address"
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
            label=""
            value={value}
            leftIcon="lock"
            onBlur={onBlur}
            onFocus={() => onFieldFocus?.('password')}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.password?.message}
            helperText={passwordValue || errors.password
              ? 'Use uppercase, lowercase, a number, and a special character.'
              : undefined}
            placeholder="Password"
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
            label=""
            value={value}
            leftIcon="lock-check"
            onBlur={onBlur}
            onFocus={() => onFieldFocus?.('confirmPassword')}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.confirmPassword?.message}
            placeholder="Confirm Password"
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  field: {
    marginBottom: theme.spacing.sm,
  },
  fieldLabel: {
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
  },
  fieldShell: {
    borderRadius: 22,
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
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
