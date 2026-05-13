import React from 'react';
import { Pressable, View, StyleSheet, Text } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { loginSchema } from '../../features/auth/validators/auth.schema';
import { resolveThemeRoles, theme } from '../../design-system/theme';

export const LoginForm = ({
  onSubmit,
  isLoading,
  activeAuthAction = '',
  onForgotPassword,
  buttonText = 'Log in',
  submitError = '',
  onFieldEdit,
  onFieldFocus,
  autofillEmail = '',
  resolvedTheme,
}) => {
  const { control, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: {
      email: '',
      password: '',
    },
  });
  const roles = resolveThemeRoles(resolvedTheme);
  const isSubmitLoading = isLoading && activeAuthAction === 'login';

  React.useEffect(() => {
    if (!autofillEmail) return;
    setValue('email', autofillEmail, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    onFieldEdit?.();
  }, [autofillEmail, onFieldEdit, setValue]);

  return (
    <View style={styles.container}>
      {submitError ? (
        <Text style={styles.submitErrorText}>
          {submitError}
        </Text>
      ) : null}

      <View style={styles.fieldGroup}>
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppInput
              label="Email Address"
              placeholder="donor@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              autoComplete="email"
              onBlur={onBlur}
              onFocus={() => onFieldFocus?.('email')}
              onChangeText={(nextValue) => {
                onFieldEdit?.();
                onChange(nextValue);
              }}
              value={value}
              error={errors.email?.message}
              disabled={isLoading}
              style={styles.field}
              labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
              shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
              inputStyle={[styles.fieldInput, { color: roles.headingText }]}
            />
          )}
        />

        <View style={styles.passwordHeaderRow}>
          <Text style={[styles.fieldLabel, { color: roles.bodyText }]}>Password</Text>
          <Pressable
            onPress={onForgotPassword}
            style={({ pressed }) => [styles.forgotPasswordPressable, pressed ? styles.pressed : null]}
            accessibilityRole="button"
          >
            <Text style={[styles.forgotPasswordText, { color: roles.primaryActionBackground }]}>Forgot Password?</Text>
          </Pressable>
        </View>

        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <PasswordInput
              label=""
              placeholder="Password"
              textContentType="password"
              autoComplete="password"
              onBlur={onBlur}
              onFocus={() => onFieldFocus?.('password')}
              onChangeText={(nextValue) => {
                onFieldEdit?.();
                onChange(nextValue);
              }}
              value={value}
              error={errors.password?.message}
              disabled={isLoading}
              style={styles.field}
              labelStyle={[styles.fieldLabel, { color: roles.headingText }]}
              shellStyle={[styles.fieldShell, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}
              inputStyle={[styles.fieldInput, { color: roles.headingText }]}
            />
          )}
        />
      </View>

      <AppButton
        title={buttonText}
        onPress={handleSubmit((values) => {
          onFieldEdit?.();
          return onSubmit(values);
        })}
        loading={isSubmitLoading}
        disabled={isLoading}
        variant="outline"
        size="lg"
        enableHaptics={true}
        style={styles.submitBtn}
        textStyle={styles.submitBtnText}
        textColorOverride={roles.primaryActionText}
        backgroundColorOverride={roles.primaryActionBackground}
        borderColorOverride={roles.primaryActionBackground}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  fieldGroup: {
    gap: theme.spacing.sm,
  },
  field: {
    marginBottom: 0,
  },
  fieldLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  fieldShell: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
    shadowOpacity: 0,
    elevation: 0,
  },
  fieldInput: {
    fontSize: theme.typography.semantic.body,
  },
  submitErrorText: {
    marginBottom: theme.spacing.md,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textError,
  },
  passwordHeaderRow: {
    marginTop: theme.spacing.xs,
    marginBottom: -theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  forgotPasswordPressable: {
    minHeight: 28,
    justifyContent: 'center',
  },
  forgotPasswordText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  submitBtn: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
    marginTop: theme.spacing.sm,
  },
  submitBtnText: {
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
});
