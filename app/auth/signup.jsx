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
      <View style={[styles.topBar, { backgroundColor: roles.defaultCardBackground }]}>
        <View style={styles.topBrand}>
          <SignupBrandLogo resolvedTheme={resolvedTheme} />
          <Text style={[styles.topBrandText, { color: roles.primaryActionBackground }]}>{brandName}</Text>
        </View>
      </View>

      <View style={styles.signupCanvas}>
        <View style={[styles.signupCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <View style={[styles.cardAccent, { backgroundColor: roles.primaryActionBackground }]} />

          <View style={styles.brandSection}>
            <View style={[styles.logoContainer, { backgroundColor: roles.iconPrimarySurface, borderColor: roles.defaultCardBorder }]}>
              <SignupBrandLogo resolvedTheme={resolvedTheme} size="lg" />
            </View>

            <Text
              style={[
                styles.brandName,
                {
                  color: roles.headingText,
                  fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
                },
              ]}
            >
              Join {brandName}
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
              {'Start your journey of making every strand count. We are glad you are here.'}
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

      <View style={[styles.footer, { backgroundColor: roles.supportCardBackground }]}>
        <Text style={[styles.footerBrand, { color: roles.primaryActionBackground }]}>{brandName}</Text>
        <Text style={[styles.footerText, { color: roles.bodyText }]}>Every strand counts.</Text>
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
  topBar: {
    width: '100%',
    minHeight: 64,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  topBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexShrink: 1,
  },
  topBrandText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    fontWeight: theme.typography.weights.bold,
  },
  signupCanvas: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.section,
  },
  signupCard: {
    width: '100%',
    maxWidth: 430,
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xxxl,
    paddingBottom: theme.spacing.xl,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 26,
    elevation: 6,
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
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
  brandName: {
    fontSize: 32,
    lineHeight: 40,
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
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  footerBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  footerText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
});
