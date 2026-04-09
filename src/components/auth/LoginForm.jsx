import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppTextLink } from '../ui/AppTextLink';
import { loginSchema } from '../../features/auth/validators/auth.schema';
import { theme } from '../../design-system/theme';

export const LoginForm = ({
  onSubmit,
  isLoading,
  onForgotPassword,
  buttonText = 'Log In',
  submitError = '',
  onFieldEdit,
  resolvedTheme,
}) => {
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
    }
  });

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
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
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
            placeholder="Password"
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

      <View style={styles.forgotPasswordContainer}>
        <AppTextLink 
          title="Forgot Password?" 
          onPress={onForgotPassword} 
          style={styles.forgotPasswordLink} 
          textStyle={styles.forgotPasswordText}
          variant="muted"
        />
      </View>

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
    gap: 2,
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
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginTop: -4,
    marginBottom: theme.spacing.xs,
  },
  forgotPasswordLink: {
    paddingVertical: theme.spacing.xs,
  },
  forgotPasswordText: {
    fontSize: theme.typography.semantic.bodySm,
  },
  submitBtn: {
    marginTop: theme.spacing.sm,
  },
});
