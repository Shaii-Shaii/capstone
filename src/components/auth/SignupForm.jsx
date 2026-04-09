import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { theme } from '../../design-system/theme';
import { signupDefaultValues } from '../../features/auth/validators/auth.schema';

export const SignupForm = ({
  schema,
  onSubmit,
  isLoading,
  buttonText = 'Create Account',
  submitError = '',
  onFieldEdit,
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
  const errorBorderColor = resolvedTheme?.primaryColor || theme.colors.borderError;
  const errorBackgroundColor = `${errorBorderColor}14`;
  const errorTextColor = resolvedTheme?.primaryTextColor || theme.colors.textError;
  const buttonGradient = [
    resolvedTheme?.primaryColor || theme.colors.brandPrimary,
    resolvedTheme?.tertiaryColor || theme.colors.heroTo,
  ];

  return (
    <View style={styles.container}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>Create Account</Text>
      </View>

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
        gradientColors={buttonGradient}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
  copyBlock: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  submitButton: {
    marginTop: theme.spacing.sm,
  },
});
