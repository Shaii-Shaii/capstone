import React, { useState } from 'react';
import { View, StyleSheet, Text, Pressable } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AppInput } from '../../src/components/ui/AppInput';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppTextLink } from '../../src/components/ui/AppTextLink';
import { forgotPasswordSchema } from '../../src/features/auth/validators/auth.schema';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';
import { useAuth } from '../../src/providers/AuthProvider';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { sendPasswordReset, isLoading } = useAuthActions();
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [emailSent, setEmailSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [sendError, setSendError] = useState('');

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  const handleSendReset = async (data) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSendError('');
    const result = await sendPasswordReset(data.email);
    if (result.success) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmittedEmail(data.email);
      setEmailSent(true);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSendError(result.error || 'Failed to process your request. Please try again.');
    }
  };

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
              name={emailSent ? 'email-check-outline' : 'lock-open-outline'}
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
          {emailSent ? 'Check your inbox' : 'Forgot password?'}
        </Text>
        <Text style={[styles.subtitle, { color: roles.bodyText }]}>
          {emailSent
            ? `We sent a reset link to ${submittedEmail}. Check your inbox and follow the instructions.`
            : 'Enter your registered email and we\'ll send you a link to reset your password.'}
        </Text>
      </View>

      {!emailSent ? (
        <View style={authLayoutStyles.formSection}>
          {sendError ? (
            <Text style={[styles.errorText, { color: theme.colors.textError }]}>
              {sendError}
            </Text>
          ) : null}

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <AppInput
                label="Email address"
                placeholder="your@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                variant="filled"
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
                error={errors.email?.message}
              />
            )}
          />

          <AppButton
            title="Send reset link"
            onPress={handleSubmit(handleSendReset)}
            loading={isLoading}
            size="lg"
            style={styles.submitBtn}
          />

          <View style={styles.footerRow}>
            <AppTextLink
              title="Back to login"
              variant="muted"
              onPress={() => router.replace('/auth/access')}
            />
          </View>
        </View>
      ) : (
        <View style={styles.successActions}>
          <AppButton
            title="Back to login"
            onPress={() => router.replace('/auth/access')}
            size="lg"
          />
          <AppButton
            title="Resend email"
            variant="secondary"
            onPress={() => setEmailSent(false)}
            size="lg"
            style={styles.resendBtn}
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
  footerRow: {
    marginTop: theme.spacing.xl,
    alignItems: 'center',
  },
  successActions: {
    gap: theme.spacing.md,
  },
  resendBtn: {
    marginTop: 0,
  },
  errorText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
});
