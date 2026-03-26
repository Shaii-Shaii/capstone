import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { SignupForm } from '../../src/components/auth/SignupForm';
import { patientSignupSchema } from '../../src/features/auth/validators/auth.schema';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';

export default function PatientSignupScreen() {
  const router = useRouter();
  const { config, handleSignup, isLoading } = useRoleAuthFlow('patient');

  return (
    <AuthScreenLayout role="patient">
      <AuthHeader
        title={config.signup.title}
        subtitle={config.signup.subtitle}
        eyebrow={config.signup.eyebrow}
        role="patient"
        backLabel="Back to access"
        onBackPress={() => router.back()}
      />

      <View style={authLayoutStyles.formSection}>
        <SignupForm
          schema={patientSignupSchema}
          onSubmit={handleSignup}
          isLoading={isLoading}
          buttonText={config.signup.buttonText}
        />
      </View>

      <AuthFormFooter
        questionText={config.signup.footerQuestion}
        linkText={config.signup.footerLink}
        onLinkPress={() => router.replace(config.routes.login)}
      />
    </AuthScreenLayout>
  );
}
