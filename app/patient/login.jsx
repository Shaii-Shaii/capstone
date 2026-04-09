import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { LoginForm } from '../../src/components/auth/LoginForm';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';

export default function PatientLoginScreen() {
  const router = useRouter();
  const { config, handleLogin, isLoading, loginError, clearLoginError, resolvedTheme } = useRoleAuthFlow('patient');

  return (
    <AuthScreenLayout role="patient" resolvedTheme={resolvedTheme}>
      <AuthHeader
        title={config.login.title}
        subtitle={config.login.subtitle}
        eyebrow={config.login.eyebrow}
        role="patient"
        backLabel="Back to access"
        onBackPress={() => router.back()}
        resolvedTheme={resolvedTheme}
      />

      <View style={authLayoutStyles.formSection}>
        <LoginForm
          onSubmit={handleLogin}
          isLoading={isLoading}
          onForgotPassword={() => router.push('/auth/forgot-password')}
          buttonText={config.login.buttonText}
          submitError={loginError}
          onFieldEdit={clearLoginError}
          resolvedTheme={resolvedTheme}
        />
      </View>

      <AuthFormFooter
        questionText={config.login.footerQuestion}
        linkText={config.login.footerLink}
        onLinkPress={() => router.replace('/auth/signup')}
      />
    </AuthScreenLayout>
  );
}
