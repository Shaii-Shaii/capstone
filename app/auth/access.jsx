import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthScreenLayout, authLayoutStyles } from '../../src/components/auth/AuthScreenLayout';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { AuthFormFooter } from '../../src/components/auth/AuthFormFooter';
import { LoginForm } from '../../src/components/auth/LoginForm';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { theme } from '../../src/design-system/theme';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';

const accessHighlights = [
  {
    key: 'redirect',
    icon: 'success',
    title: 'Automatic role routing',
    description: 'We check your saved account role after sign in and open the correct dashboard for you.',
  },
  {
    key: 'secure',
    icon: 'shield',
    title: 'One secure login',
    description: 'Use the same email and password you created during donor or patient signup.',
  },
];

export default function AccessScreen() {
  const router = useRouter();
  const { config, handleLogin, isLoading } = useRoleAuthFlow('access');

  return (
    <AuthScreenLayout role="donor">
      <AuthHeader
        title={config.login.title}
        subtitle={config.login.subtitle}
        eyebrow={config.login.eyebrow}
        role="access"
        backLabel="Back to home"
        onBackPress={() => router.replace('/')}
      />

      <AppCard variant="soft" radius="xl" padding="xs" style={styles.infoCard}>
        <View style={styles.highlightList}>
          {accessHighlights.map((item) => (
            <View key={item.key} style={styles.highlightItem}>
              <View style={styles.highlightIconWrap}>
                <AppIcon name={item.icon} size="sm" state="active" />
              </View>
              <View style={styles.highlightCopy}>
                <Text style={styles.highlightTitle}>{item.title}</Text>
                <Text style={styles.highlightDescription}>{item.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </AppCard>

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
        onLinkPress={() => router.replace('/')}
      />
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  infoCard: {
    marginTop: theme.spacing.sm,
  },
  highlightList: {
    gap: theme.spacing.sm,
  },
  highlightItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  highlightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
    marginTop: 2,
  },
  highlightCopy: {
    flex: 1,
    gap: 2,
  },
  highlightTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  highlightDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
