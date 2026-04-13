import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { signupDefaultValues } from '../../features/auth/validators/auth.schema';

export const SignupForm = ({
  schema,
  onSubmit,
  isLoading,
  buttonText = 'Create Account',
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
  const errorBorderColor = resolvedTheme?.primaryColor || theme.colors.borderError;
  const errorBackgroundColor = resolvedTheme?.secondaryColor || theme.colors.surfaceSoft;
  const errorTextColor = resolvedTheme?.primaryTextColor || theme.colors.textError;

  return (
    <View style={styles.container}>
      {submitError ? (
        <View style={[styles.submitErrorWrap, { borderColor: errorBorderColor, backgroundColor: errorBackgroundColor }]}>
          <Text style={[styles.submitErrorText, { color: errorTextColor }]}>
            {submitError}
          </Text>
        </View>
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
            placeholder="Enter your email"
            variant="filled"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
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
            placeholder="Create a password"
            variant="filled"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
          />
        )}
      />

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
          <PasswordInput
            label="Re-enter Password"
            value={value}
            onBlur={onBlur}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.confirmPassword?.message}
            placeholder="Re-enter your password"
            variant="filled"
            disabled={isLoading}
            onChangeText={(nextValue) => {
              onFieldEdit?.();
              onChange(nextValue);
            }}
          />
        )}
      />

      <View style={styles.altSection}>
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: roles.defaultCardBorder }]} />
          <Text style={[styles.dividerText, { color: resolvedTheme?.secondaryTextColor || theme.colors.textMuted }]}>
            or continue with
          </Text>
          <View style={[styles.dividerLine, { backgroundColor: roles.defaultCardBorder }]} />
        </View>

        <Pressable
          disabled={!isGoogleAvailable || isLoading}
          onPress={onGooglePress}
          style={({ pressed }) => [
            styles.googleButton,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.supportCardBorder,
            },
            pressed && isGoogleAvailable && !isLoading ? styles.googleButtonPressed : null,
            (!isGoogleAvailable || isLoading) ? styles.googleButtonDisabled : null,
          ]}
        >
          <View style={styles.googleBadge}>
            <AppIcon name="google" state="default" size="md" />
          </View>
          <Text style={[styles.googleButtonText, { color: roles.headingText }]}>Continue with Google</Text>
        </Pressable>
      </View>

      <AppButton
        title={buttonText}
        onPress={handleSubmit((values) => {
          onFieldEdit?.();
          return onSubmit(values);
        })}
        loading={isLoading}
        disabled={isLoading}
        size="lg"
        style={styles.submitButton}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: theme.spacing.xs,
  },
  submitErrorWrap: {
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  submitErrorText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    fontWeight: theme.typography.weights.medium,
  },
  altSection: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
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
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textTransform: 'lowercase',
  },
  googleButton: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  googleButtonPressed: {
    opacity: 0.82,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleBadge: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  googleButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  submitButton: {
    marginTop: theme.spacing.sm,
  },
});
