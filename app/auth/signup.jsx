import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthTabBar } from '../../src/components/auth/AuthTabBar';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { SignupForm } from '../../src/components/auth/SignupForm';
import { unifiedSignupSchema } from '../../src/features/auth/validators/auth.schema';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../../src/design-system/theme';

export default function SignupScreen() {
  const router = useRouter();
  const {
    config,
    handleSignup,
    handleGoogleAuth,
    isLoading,
    activeAuthAction,
    signupError,
    clearSignupError,
    resolvedTheme,
  } = useRoleAuthFlow('signup');

  const [imageFailed, setImageFailed] = useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const tagline = resolvedTheme?.brandTagline || 'Hair donation, reimagined.';

  return (
    <AuthScreenLayout role="access" resolvedTheme={resolvedTheme}>
      {/* Brand Identity */}
      <View style={styles.brandSection}>
        <View
          style={[
            styles.logoContainer,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}
        >
          <Image
            source={logoSource}
            style={styles.logoImage}
            resizeMode="contain"
            onError={() => setImageFailed(true)}
          />
        </View>

        <Text
          style={[
            styles.brandName,
            {
              color: roles.headingText,
              fontFamily:
                resolvedTheme?.secondaryFontFamily ||
                theme.typography.fontFamilyDisplay,
            },
          ]}
        >
          {brandName}
        </Text>

        <Text
          style={[
            styles.brandTagline,
            {
              color: roles.bodyText,
              fontFamily: resolvedTheme?.fontFamily || theme.typography.fontFamily,
            },
          ]}
        >
          {tagline}
        </Text>
      </View>

      {/* Login | Register tabs */}
      <AuthTabBar activeTab="signup" resolvedTheme={resolvedTheme} />

      {/* Signup form */}
      <View style={authLayoutStyles.formSection}>
        <SignupForm
          schema={unifiedSignupSchema}
          onSubmit={handleSignup}
          isLoading={isLoading}
          activeAuthAction={activeAuthAction}
          buttonText={config.signup.buttonText}
          submitError={signupError}
          onFieldEdit={clearSignupError}
          resolvedTheme={resolvedTheme}
          onGooglePress={handleGoogleAuth}
        />
      </View>

      <AuthFormFooter
        questionText={config.signup.footerQuestion}
        linkText={config.signup.footerLink}
        onLinkPress={() => router.replace('/auth/access')}
      />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  brandSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
    paddingTop: theme.spacing.lg,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  logoImage: {
    width: 52,
    height: 52,
  },
  brandName: {
    fontSize: 22,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
    letterSpacing: -0.3,
  },
  brandTagline: {
    fontSize: theme.typography.compact.bodySm,
    textAlign: 'center',
  },
});
