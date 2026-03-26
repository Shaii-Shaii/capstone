import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppTextLink } from '../ui/AppTextLink';
import { loginSchema } from '../../features/auth/validators/auth.schema';
import { theme } from '../../design-system/theme';

export const LoginForm = ({ onSubmit, isLoading, onForgotPassword, buttonText = "Log In" }) => {
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
    }
  });

  return (
    <View style={styles.container}>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppInput
            label="Email Address"
            placeholder="juan@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            variant="filled"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.email?.message}
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
            variant="filled"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.password?.message}
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
        onPress={handleSubmit(onSubmit)}
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
