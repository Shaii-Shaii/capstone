import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppTextLink } from '../ui/AppTextLink';
import { loginSchema } from '../../features/auth/validators/auth.schema';
import { resolveThemeRoles, theme } from '../../design-system/theme';

export const LoginForm = ({
  onSubmit,
  isLoading,
  activeAuthAction = '',
  onForgotPassword,
  buttonText = 'Log in',
  submitError = '',
  onFieldEdit,
  onFieldFocus,
  resolvedTheme,
}) => {
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
    },
  });
  const roles = resolveThemeRoles(resolvedTheme);
  const isSubmitLoading = isLoading && activeAuthAction === 'login';

  return (
    <View style={styles.container}>
      {submitError ? (
        <Text style={styles.submitErrorText}>
          {submitError}
        </Text>
      ) : null}

      <View style={styles.fieldGroup}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label=""
              placeholder="Email address"
              leftIcon="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              onBlur={onBlur}
              onFocus={() => onFieldFocus?.('email')}
              onChangeText={(nextValue) => {
                onFieldEdit?.();
                onChange(nextValue);
              }}
              value={value}
              error={errors.email?.message}
              disabled={isLoading}
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
              placeholder="Password"
              leftIcon="lock"
              textContentType="password"
              autoComplete="password"
              onBlur={onBlur}
              onFocus={() => onFieldFocus?.('password')}
              onChangeText={(nextValue) => {
                onFieldEdit?.();
                onChange(nextValue);
              }}
              value={value}
              error={errors.password?.message}
              disabled={isLoading}
              style={styles.field}
              labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
              shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
              inputStyle={[styles.fieldInput, { color: roles.headingText }]}
            />
          )}
        />
      </View>

      <View style={styles.metaRow}>
        <AppTextLink
          title="Forgot password?"
          onPress={onForgotPassword}
          style={styles.forgotPasswordLink}
          textStyle={[styles.forgotPasswordText, { color: roles.bodyText }]}
          variant="muted"
        />
      </View>

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
        enableHaptics={true}
        style={styles.submitBtn}
        textStyle={styles.submitBtnText}
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
  fieldGroup: {
    gap: 0,
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
  submitErrorText: {
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textError,
  },
  metaRow: {
    alignItems: 'flex-end',
    marginTop: -theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  forgotPasswordLink: {
    paddingVertical: theme.spacing.xs,
  },
  forgotPasswordText: {
    fontSize: theme.typography.compact.bodySm,
  },
  submitBtn: {
    minHeight: 52,
    borderRadius: 22,
  },
  submitBtnText: {
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
});
