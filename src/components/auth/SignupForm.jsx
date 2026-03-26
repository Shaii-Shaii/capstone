import React from 'react';
import { View, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { theme } from '../../design-system/theme';

export const SignupForm = ({ schema, onSubmit, isLoading, buttonText = "Sign Up" }) => {
  const { width } = useWindowDimensions();
  const isWide = width >= 390;
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    }
  });

  return (
    <View style={styles.container}>
      <View style={[styles.nameRow, isWide ? styles.nameRowWide : null]}>
        <Controller
          control={control}
          name="firstName"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="First Name"
              placeholder="Juan"
              variant="filled"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.firstName?.message}
              style={styles.nameField}
            />
          )}
        />

        <Controller
          control={control}
          name="lastName"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="Last Name"
              placeholder="Dela Cruz"
              variant="filled"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.lastName?.message}
              style={styles.nameField}
            />
          )}
        />
      </View>

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
        name="phone"
        render={({ field: { onChange, onBlur, value } }) => (
          <AppInput
            label="Mobile Number"
            placeholder="09123456789"
            keyboardType="phone-pad"
            variant="filled"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            error={errors.phone?.message}
          />
        )}
      />

      <View style={styles.passwordSection}>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              label="Password"
              placeholder="Create a strong password"
              variant="filled"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
              error={errors.password?.message}
            />
          )}
        />
        <Text style={styles.passwordHint}>
          Must be at least 8 characters and include uppercase, lowercase, numbers, and symbols.
        </Text>
      </View>

      <Controller
        control={control}
        name="confirmPassword"
        render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              label="Confirm Password"
              placeholder="Retype password"
              variant="filled"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            error={errors.confirmPassword?.message}
          />
        )}
      />

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
  nameRow: {
    gap: theme.spacing.xs,
  },
  nameRowWide: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  nameField: {
    flex: 1,
  },
  passwordSection: {
    marginBottom: theme.spacing.xs,
  },
  passwordHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    marginTop: -4,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.normal,
  },
  submitBtn: {
    marginTop: theme.spacing.sm,
  },
});
