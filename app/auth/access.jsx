import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { LoginForm } from '../../src/components/auth/LoginForm';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';

export default function AccessScreen() {
  const router = useRouter();
  const { handleLogin, isLoading, loginError, clearLoginError, resolvedTheme } = useRoleAuthFlow('access');

  return (
    <AuthScreenLayout role="access" resolvedTheme={resolvedTheme}>
      <AuthHeader
        title={"Let's sign you in."}
        subtitle={"Welcome back. You've been missed."}
        backLabel="Back"
        onBackPress={() => router.replace('/')}
        minimal={true}
        resolvedTheme={resolvedTheme}
      />

      <View style={authLayoutStyles.formSection}>
        <LoginForm
          onSubmit={handleLogin}
          isLoading={isLoading}
          onForgotPassword={() => router.push('/auth/forgot-password')}
          buttonText="Login"
          submitError={loginError}
          onFieldEdit={clearLoginError}
          resolvedTheme={resolvedTheme}
        />
      </View>

      <AuthFormFooter
        questionText={"Don't have an account?"}
        linkText="Register"
        onLinkPress={() => router.replace('/auth/signup')}
      />
    </AuthScreenLayout>
  );
}
