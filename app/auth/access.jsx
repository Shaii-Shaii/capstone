import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenContainer } from '../../src/components/ui/ScreenContainer';
import { LoginForm } from '../../src/components/auth/LoginForm';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

function SocialLoginButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
  roles,
}) {
  const isInactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.socialButton,
        {
          backgroundColor: roles.defaultCardBackground,
          borderColor: roles.defaultCardBorder,
        },
        pressed && !isInactive ? styles.pressed : null,
        isInactive ? styles.disabledButton : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={roles.headingText} />
      ) : (
        <>
          <MaterialCommunityIcons name={icon} size={22} color={roles.headingText} />
          <Text style={[styles.socialButtonText, { color: roles.headingText }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export default function AccessScreen() {
  const router = useRouter();
  const {
    handleLogin,
    handleGoogleAuth,
    isLoading,
    activeAuthAction,
    loginError,
    clearLoginError,
    resolvedTheme,
  } = useRoleAuthFlow('access');

  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const isGoogleLoading = isLoading && activeAuthAction === 'google';

  return (
    <ScreenContainer
      scrollable
      safeArea
      variant="auth"
      contentStyle={[styles.screenContent, { backgroundColor: roles.pageBackground }]}
    >
      <View style={styles.loginCanvas}>
        <View style={[styles.loginCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={styles.brandHeader}>
            <View style={styles.brandRow}>
              <MaterialCommunityIcons name="content-cut" size={28} color={roles.primaryActionBackground} />
              <Text style={[styles.brandText, { color: roles.primaryActionBackground }]}>{brandName}</Text>
            </View>

            <Text
              style={[
                styles.title,
                {
                  color: roles.headingText,
                  fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
                },
              ]}
            >
              Welcome Back
            </Text>
            <Text
              style={[
                styles.subtitle,
                {
                  color: roles.bodyText,
                  fontFamily: resolvedTheme?.fontFamily || theme.typography.fontFamily,
                },
              ]}
            >
              Securely access your donation portal.
            </Text>
          </View>

          <LoginForm
            onSubmit={(data) => handleLogin(data)}
            isLoading={isLoading}
            activeAuthAction={activeAuthAction}
            onForgotPassword={() => router.push('/auth/forgot-password')}
            buttonText="Log In"
            submitError={loginError}
            onFieldEdit={clearLoginError}
            onFieldFocus={() => {}}
            resolvedTheme={resolvedTheme}
          />

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: roles.supportCardBorder }]} />
            <Text style={[styles.dividerText, { color: roles.bodyText }]}>Or continue with</Text>
            <View style={[styles.dividerLine, { backgroundColor: roles.supportCardBorder }]} />
          </View>

          <View style={styles.socialStack}>
            <SocialLoginButton
              label="Google"
              icon="google"
              onPress={handleGoogleAuth}
              disabled={isLoading}
              loading={isGoogleLoading}
              roles={roles}
            />
          </View>

          <View style={styles.signupRow}>
            <Text style={[styles.signupText, { color: roles.bodyText }]}>{'Do not have an account? '}</Text>
            <Pressable onPress={() => router.replace('/auth/signup')} style={({ pressed }) => (pressed ? styles.pressed : null)}>
              <Text style={[styles.signupLink, { color: roles.primaryActionBackground }]}>Sign Up</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  loginCanvas: {
    flex: 1,
    minHeight: 760,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.section,
  },
  loginCard: {
    width: '100%',
    maxWidth: 440,
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.xl,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
    elevation: 6,
  },
  brandHeader: {
    alignItems: 'center',
    marginBottom: theme.spacing.section,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  brandText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.heading,
    fontWeight: theme.typography.weights.bold,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.normal,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginVertical: theme.spacing.lg,
  },
  dividerLine: {
    height: 1,
    flex: 1,
  },
  dividerText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  socialStack: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.section,
  },
  socialButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  socialButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  signupText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
  },
  signupLink: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  pressed: {
    opacity: 0.72,
  },
  disabledButton: {
    opacity: 0.68,
  },
});
