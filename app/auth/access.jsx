import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { LoginForm } from '../../src/components/auth/LoginForm';
import { AuthVoiceAssistant } from '../../src/components/auth/AuthVoiceAssistant';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../../src/design-system/theme';

export default function AccessScreen() {
  const router = useRouter();
  const {
    handleLogin,
    isLoading,
    activeAuthAction,
    loginError,
    clearLoginError,
    resolvedTheme,
  } = useRoleAuthFlow('access');

  const [imageFailed, setImageFailed] = useState(false);
  const [assistantStageMessage, setAssistantStageMessage] = useState('');
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const roles = resolveThemeRoles(resolvedTheme);
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
          Log in
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
          Enter your email and password to securely access your account.
        </Text>
      </View>

      {/* Login form */}
      <View style={authLayoutStyles.formSection}>
        <AuthVoiceAssistant
          screen="login"
          resolvedTheme={resolvedTheme}
          compact
          stageMessage={assistantStageMessage}
        />
        <LoginForm
          onSubmit={(data) => {
            setAssistantStageMessage('Good. I will check your login now. After login, I will help route you as a donor or patient.');
            return handleLogin(data);
          }}
          isLoading={isLoading}
          activeAuthAction={activeAuthAction}
          onForgotPassword={() => router.push('/auth/forgot-password')}
          buttonText="Log in"
          submitError={loginError}
          onFieldEdit={clearLoginError}
          onFieldFocus={(fieldName) => {
            if (fieldName === 'email') setAssistantStageMessage('Enter the email address connected to your Donivra account.');
            if (fieldName === 'password') setAssistantStageMessage('Now enter your account password. If you forgot it, use Forgot password before logging in.');
          }}
          resolvedTheme={resolvedTheme}
        />
      </View>

      <AuthFormFooter
        questionText="Don't have an account?"
        linkText="Register"
        onLinkPress={() => router.replace('/auth/signup')}
      />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  brandSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
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
    width: 42,
    height: 42,
  },
  brandName: {
    fontSize: 24,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  brandTagline: {
    fontSize: theme.typography.compact.bodySm,
    textAlign: 'center',
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    maxWidth: 260,
  },
});
