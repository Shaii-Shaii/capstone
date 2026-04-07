import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { LoginForm } from '../../src/components/auth/LoginForm';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';

export default function DonorLoginScreen() {
  const router = useRouter();
  const { config, handleLogin, isLoading } = useRoleAuthFlow('donor');

  return (
    <AuthScreenLayout role="donor">
      <AuthHeader
        title={config.login.title}
        subtitle={config.login.subtitle}
        eyebrow={config.login.eyebrow}
        role="donor"
        backLabel="Back to access"
        onBackPress={() => router.back()}
      />

      <View style={authLayoutStyles.formSection}>
        <LoginForm
          onSubmit={handleLogin}
          isLoading={isLoading}
          onForgotPassword={() => router.push('/auth/forgot-password')}
          buttonText={config.login.buttonText}
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
