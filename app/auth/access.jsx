import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AuthPathCard } from '../../src/components/auth/AuthPathCard';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { theme } from '../../src/design-system/theme';

export default function AccessScreen() {
  const router = useRouter();

  return (
    <AuthScreenLayout role="donor">
      <AuthHeader
        title="Choose your account access"
        subtitle="Continue as a donor or patient using the route that matches your StrandShare account."
        eyebrow="Account access"
        role="access"
        backLabel="Back to home"
        onBackPress={() => router.replace('/')}
      />

      <View style={[authLayoutStyles.formSection, styles.cardsContainer]}>
        <AuthPathCard
          title="Log in as Donor"
          description="Manage donation progress, appointment steps, and giving updates in one place."
          badgeText="Donor"
          role="donor"
          onPress={() => router.push('/donor/login')}
        />

        <AuthPathCard
          title="Log in as Patient"
          description="Review requests, support updates, and care resources with a calmer mobile flow."
          badgeText="Patient"
          role="patient"
          onPress={() => router.push('/patient/login')}
        />
      </View>

      <AuthFormFooter
        questionText="Need a new account first?"
        linkText="Start from landing"
        onLinkPress={() => router.replace('/')}
      />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  cardsContainer: {
    marginTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
});
