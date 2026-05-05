import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { SignupForm } from '../../src/components/auth/SignupForm';
import { AuthVoiceAssistant } from '../../src/components/auth/AuthVoiceAssistant';
import { unifiedSignupSchema } from '../../src/features/auth/validators/auth.schema';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../../src/design-system/theme';

export default function SignupScreen() {
  const router = useRouter();
  const {
    config,
    handleSignup,
    isLoading,
    activeAuthAction,
    signupError,
    clearSignupError,
    resolvedTheme,
  } = useRoleAuthFlow('signup');

  const [imageFailed, setImageFailed] = useState(false);
  const [assistantStageMessage, setAssistantStageMessage] = useState('');
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';

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
          Create Account
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
          Create a new account to get started with {brandName}.
        </Text>
      </View>

      {/* Signup form */}
      <View style={authLayoutStyles.formSection}>
        <AuthVoiceAssistant
          screen="signup"
          resolvedTheme={resolvedTheme}
          compact
          stageMessage={assistantStageMessage}
        />
        <SignupForm
          schema={unifiedSignupSchema}
          onSubmit={(data) => {
            setAssistantStageMessage('Good. I will send your signup request now. If it succeeds, the next step is to check your email and enter the OTP.');
            return handleSignup(data);
          }}
          isLoading={isLoading}
          activeAuthAction={activeAuthAction}
          buttonText={config.signup.buttonText}
          submitError={signupError}
          onFieldEdit={clearSignupError}
          onFieldFocus={(fieldName) => {
            if (fieldName === 'email') setAssistantStageMessage('Enter the email address you want to use for your Donivra account.');
            if (fieldName === 'password') setAssistantStageMessage('Now enter a strong password with uppercase, lowercase, a number, and a special character.');
            if (fieldName === 'confirmPassword') setAssistantStageMessage('Confirm your password by typing the same password again.');
          }}
          resolvedTheme={resolvedTheme}
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
