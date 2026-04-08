import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { theme } from '../../design-system/theme';
import { signupDefaultValues } from '../../features/auth/validators/auth.schema';

export const SignupForm = ({ schema, onSubmit, isLoading, buttonText = 'Create Account' }) => {
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

  return (
    <View style={styles.container}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>Create Account</Text>
      </View>

      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppInput
            label="Email"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            error={errors.email?.message}
            placeholder="Enter your email"
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
            onChangeText={onChange}
            onBlur={onBlur}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.password?.message}
            helperText={passwordValue || errors.password
              ? 'Use uppercase, lowercase, a number, and a special character.'
              : undefined}
            placeholder="Create a password"
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
            onChangeText={onChange}
            onBlur={onBlur}
            textContentType="newPassword"
            autoComplete="password-new"
            error={errors.confirmPassword?.message}
            placeholder="Re-enter your password"
          />
        )}
      />

      <AppButton
        title={buttonText}
        onPress={handleSubmit(onSubmit)}
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
