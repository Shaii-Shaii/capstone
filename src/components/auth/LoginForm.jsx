import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppTextLink } from '../ui/AppTextLink';
import { AppIcon } from '../ui/AppIcon';
import { loginSchema } from '../../features/auth/validators/auth.schema';
import { theme, resolveThemeRoles } from '../../design-system/theme';

export const LoginForm = ({
  onSubmit,
  isLoading,
  onForgotPassword,
  buttonText = 'Login',
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
  const showGoogleOption = true;
  const isGoogleAvailable = typeof onGooglePress === 'function';

  return (
    <View style={styles.container}>
      {submitError ? (
        <View style={styles.submitErrorWrap}>
          <View style={styles.submitErrorContent}>
            <View style={styles.submitErrorIconWrap}>
              <AppIcon name="error" state="danger" size="sm" />
            </View>
            <Text style={[styles.submitErrorText, { color: theme.colors.textError }]}>
              {submitError}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.fieldGroup}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="Email"
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              variant="filled"
              onBlur={onBlur}
              onChangeText={(nextValue) => {
                onFieldEdit?.();
                onChange(nextValue);
              }}
              value={value}
              error={errors.email?.message}
              disabled={isLoading}
            />
          )}
        />

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              textContentType="password"
              autoComplete="password"
              variant="filled"
              onBlur={onBlur}
              onChangeText={(nextValue) => {
                onFieldEdit?.();
                onChange(nextValue);
              }}
              value={value}
              error={errors.password?.message}
              disabled={isLoading}
            />
          )}
        />
      </View>

      <View style={styles.metaRow}>
        <AppTextLink
          title="Forgot password?"
          onPress={onForgotPassword}
          style={styles.forgotPasswordLink}
          textStyle={styles.forgotPasswordText}
          variant="muted"
        />
      </View>

      {showGoogleOption ? (
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
                backgroundColor: roles.pageBackground,
                borderColor: roles.defaultCardBorder,
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
      ) : null}

      <AppButton
        title={buttonText}
        onPress={handleSubmit((values) => {
          onFieldEdit?.();
          return onSubmit(values);
        })}
        loading={isLoading}
        size="lg"
        enableHaptics={true}
        style={styles.submitBtn}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  fieldGroup: {
    gap: theme.spacing.xs,
  },
  submitErrorWrap: {
    marginBottom: theme.spacing.xs,
  },
  submitErrorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  submitErrorIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitErrorText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    fontWeight: theme.typography.weights.medium,
  },
  metaRow: {
    alignItems: 'flex-end',
    marginTop: -2,
  },
  forgotPasswordLink: {
    paddingVertical: theme.spacing.xs,
  },
  forgotPasswordText: {
    fontSize: theme.typography.semantic.bodySm,
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
  submitBtn: {
    marginTop: theme.spacing.sm,
  },
});
