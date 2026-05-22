import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../src/components/ui/ScreenContainer';
import { SignupForm } from '../../src/components/auth/SignupForm';
import { unifiedSignupSchema } from '../../src/features/auth/validators/auth.schema';
import { useRoleAuthFlow } from '../../src/hooks/useRoleAuthFlow';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../../src/design-system/theme';

function SignupBrandLogo({ resolvedTheme, size = 'sm' }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);

  React.useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    <Image
      source={logoSource}
      style={size === 'lg' ? styles.logoLarge : styles.logoSmall}
      resizeMode="contain"
      onError={() => setImageFailed(true)}
    />
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const {
    handleSignup,
    isLoading,
    activeAuthAction,
    signupError,
    clearSignupError,
    resolvedTheme,
  } = useRoleAuthFlow('signup');

  const assistantEmail = '';
  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';

  return (
    <ScreenContainer
      scrollable
      safeArea
      variant="auth"
      contentStyle={[styles.screenContent, { backgroundColor: roles.pageBackground }]}
    >
      <View style={styles.signupCanvas}>
        <View style={styles.signupContent}>
          <View style={styles.brandSection}>
            <View style={styles.brandRow}>
              <View style={[styles.logoContainer, { backgroundColor: roles.iconPrimarySurface, borderColor: roles.defaultCardBorder }]}>
                <SignupBrandLogo resolvedTheme={resolvedTheme} />
              </View>
              <Text style={[styles.brandWordmark, { color: roles.primaryActionBackground }]}>{brandName}</Text>
            </View>

            <Text
              style={[
                styles.brandTitle,
                {
                  color: roles.headingText,
                  fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
                },
              ]}
            >
              Create account
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
              {'Start tracking your hair donation journey.'}
            </Text>
          </View>

          <SignupForm
            schema={unifiedSignupSchema}
            onSubmit={(data) => handleSignup(data)}
            isLoading={isLoading}
            activeAuthAction={activeAuthAction}
            buttonText="Create Account"
            submitError={signupError}
            onFieldEdit={clearSignupError}
            autofillEmail={assistantEmail}
            onFieldFocus={() => {}}
            resolvedTheme={resolvedTheme}
          />

          <View style={[styles.loginBlock, { borderTopColor: roles.defaultCardBorder }]}>
            <Text style={[styles.loginText, { color: roles.bodyText }]}>
              Already have an account?{' '}
            </Text>
            <Pressable onPress={() => router.replace('/auth/access')}>
              <Text style={[styles.loginLink, { color: roles.primaryActionBackground }]}>Log In</Text>
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
  signupCanvas: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.section,
  },
  signupContent: {
    width: '100%',
    maxWidth: 430,
    paddingHorizontal: theme.spacing.xs,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  logoContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  logoSmall: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  logoLarge: {
    width: 56,
    height: 56,
  },
  brandWordmark: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  brandTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  brandTagline: {
    fontSize: theme.typography.semantic.body,
    textAlign: 'center',
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
    maxWidth: 320,
  },
  loginBlock: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  loginText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  loginLink: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
});
