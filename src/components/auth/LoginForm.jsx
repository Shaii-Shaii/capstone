import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppTextLink } from '../ui/AppTextLink';
import { GoogleAuthButton } from './GoogleAuthButton';
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
  resolvedTheme,
  onGooglePress,
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
  const isGoogleAvailable = typeof onGooglePress === 'function';
  const isSubmitLoading = isLoading && activeAuthAction === 'login';
  const isGoogleLoading = isLoading && activeAuthAction === 'google';

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
              label="Email"
              placeholder="Your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              onBlur={onBlur}
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
              label="Password"
              placeholder="Your password"
              textContentType="password"
              autoComplete="password"
              onBlur={onBlur}
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

      <View style={styles.altSection}>
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: roles.defaultCardBorder }]} />
          <Text style={[styles.dividerText, { color: roles.bodyText }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: roles.defaultCardBorder }]} />
        </View>

        <GoogleAuthButton
          mode="continue"
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
  fieldGroup: {
    gap: 0,
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
    marginTop: -4,
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
});
