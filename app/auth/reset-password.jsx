import React from 'react';
import { View, StyleSheet, Alert, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { PasswordInput } from '../../src/components/ui/PasswordInput';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppTextLink } from '../../src/components/ui/AppTextLink';
import { resetPasswordSchema } from '../../src/features/auth/validators/auth.schema';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { theme } from '../../src/design-system/theme';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { updatePassword, isLoading } = useAuthActions();

  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onBlur',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const handlePasswordUpdate = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await updatePassword(data.password);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Your password has been securely updated.', [
        { text: 'OK', onPress: () => router.replace('/auth/access') },
      ]);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Could not update password. Your link may have expired.');
    }
  };

  return (
    <AuthScreenLayout>
      <AppTextLink title="Back" variant="muted" onPress={() => router.back()} />
      <AuthHeader
        title="Create a new password"
        subtitle="Choose a password that feels secure and easy to keep private."
        eyebrow="Password reset"
      />

      <View style={authLayoutStyles.formSection}>
        <View style={styles.passwordSection}>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <PasswordInput
                label="New Password"
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
              label="Confirm New Password"
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
          title="Update password"
          onPress={handleSubmit(handlePasswordUpdate)}
          loading={isLoading}
          size="lg"
          style={styles.submitBtn}
        />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  passwordSection: {
    marginBottom: theme.spacing.lg,
  },
  passwordHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textSecondary,
    marginTop: -theme.spacing.sm,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.normal,
  },
  submitBtn: {
    marginTop: theme.spacing.lg,
  },
});
