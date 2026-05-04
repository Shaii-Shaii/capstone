import React from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { PasswordInput } from '../../src/components/ui/PasswordInput';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppTextLink } from '../../src/components/ui/AppTextLink';
import { resetPasswordSchema } from '../../src/features/auth/validators/auth.schema';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const resetUrl = Linking.useURL();
  const { updatePassword, getCurrentSessionStatus, recoverSessionFromAuthUrl, isLoading } = useAuthActions();
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [isCheckingSession, setIsCheckingSession] = React.useState(true);
  const [hasResetSession, setHasResetSession] = React.useState(false);
  const [succeeded, setSucceeded] = React.useState(false);
  const [updateError, setUpdateError] = React.useState('');

  React.useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const initialUrl = resetUrl || await Linking.getInitialURL();
      if (initialUrl) {
        await recoverSessionFromAuthUrl(initialUrl);
      }

      const result = await getCurrentSessionStatus();
      if (!mounted) return;
      setHasResetSession(Boolean(result.success && result.session));
      setIsCheckingSession(false);
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, [getCurrentSessionStatus, recoverSessionFromAuthUrl, resetUrl]);

  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onBlur',
    defaultValues: { password: '', confirmPassword: '' },
  });

  const handlePasswordUpdate = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUpdateError('');
    const result = await updatePassword(data.password);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSucceeded(true);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setUpdateError(result.error || 'Could not update password. Your link may have expired.');
    }
  };

  const iconName = succeeded
    ? 'check-circle-outline'
    : hasResetSession
    ? 'lock-reset'
    : 'lock-alert-outline';

  return (
    <AuthScreenLayout>
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [styles.backBtn, pressed ? styles.backBtnPressed : null]}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <View
          style={[
            styles.backIconShell,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color={roles.headingText} />
        </View>
        <Text style={[styles.backBtnText, { color: roles.bodyText }]}>Back</Text>
      </Pressable>

      {/* Illustration */}
      <View style={styles.illustrationSection}>
        <View style={[styles.iconCircleOuter, { backgroundColor: roles.supportCardBackground }]}>
          <View
            style={[
              styles.iconCircleInner,
              {
                backgroundColor: roles.defaultCardBackground,
                borderColor: roles.defaultCardBorder,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={iconName}
              size={36}
              color={roles.primaryActionBackground}
            />
          </View>
        </View>
      </View>

      {/* Header */}
      <View style={styles.headerBlock}>
        <Text
          style={[
            styles.title,
            {
              color: roles.headingText,
              fontFamily:
                resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
            },
          ]}
        >
          {succeeded
            ? 'Password updated'
            : isCheckingSession
            ? 'Checking link...'
            : hasResetSession
            ? 'Enter new password'
            : 'Link expired'}
        </Text>
        <Text style={[styles.subtitle, { color: roles.bodyText }]}>
          {succeeded
            ? 'Your password has been updated. You can now log in with your new password.'
            : isCheckingSession
            ? 'Please wait while we verify your reset link.'
            : hasResetSession
            ? 'Choose a strong password. Must include uppercase, lowercase, a number, and a special character.'
            : 'This reset link is invalid or has expired. Request a new one from the login screen.'}
        </Text>
      </View>

      {/* Content */}
      {isCheckingSession ? (
        <View style={styles.centerRow}>
          <Text style={[styles.infoText, { color: roles.bodyText }]}>Verifying...</Text>
        </View>
      ) : succeeded ? (
        <AppButton
          title="Go to login"
          onPress={() => router.replace('/auth/access')}
          size="lg"
        />
      ) : hasResetSession ? (
        <View style={authLayoutStyles.formSection}>
          {updateError ? (
            <Text style={[styles.errorText, { color: theme.colors.textError }]}>
              {updateError}
            </Text>
          ) : null}

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <PasswordInput
                label="New password"
                placeholder="Create a strong password"
                variant="filled"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.password?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <PasswordInput
                label="Confirm new password"
                placeholder="Retype your password"
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
      ) : (
        <View style={styles.expiredActions}>
          <AppButton
            title="Request new reset link"
            onPress={() => router.replace('/auth/forgot-password')}
            size="lg"
          />
          <AppTextLink
            title="Back to login"
            variant="muted"
            onPress={() => router.replace('/auth/access')}
            style={styles.backToLoginLink}
          />
        </View>
      )}
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xxl,
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  backIconShell: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.medium,
  },
  illustrationSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  iconCircleOuter: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  headerBlock: {
    marginBottom: theme.spacing.xxl,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  submitBtn: {
    marginTop: theme.spacing.md,
  },
  centerRow: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  infoText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
  },
  expiredActions: {
    gap: theme.spacing.xl,
    alignItems: 'center',
  },
  backToLoginLink: {
    marginTop: theme.spacing.sm,
  },
  errorText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
});
