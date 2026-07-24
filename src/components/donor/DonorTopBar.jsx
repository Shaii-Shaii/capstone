import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { AppIcon } from '../ui/AppIcon';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';

export function DonorTopBar({
  title,
  subtitle = '',
  unreadCount = 0,
  showBack = false,
  showFeedbackAction,
  showProfileAction = true,
  showNotificationsAction = true,
  showLogoutAction = false,
  onBackPress,
  onFeedbackPress,
  onProfilePress,
  onNotificationsPress,
  onLogoutPress,
  isLoggingOut = false,
  style,
}) {
  const { resolvedTheme } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { logout: fallbackLogout, isLoading: isFallbackLoggingOut } = useAuthActions();
  const roles = resolveThemeRoles(resolvedTheme);
  const [logoFailed, setLogoFailed] = React.useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);
  const effectiveIsLoggingOut = Boolean(isLoggingOut || (!onLogoutPress && isFallbackLoggingOut));
  const appLogoSource = resolveBrandLogoSource(resolvedTheme, logoFailed);
  const headerIconColor = roles.primaryActionText || '#ffffff';
  const shouldShowFeedbackAction = showFeedbackAction ?? String(pathname || '').startsWith('/donor');

  React.useEffect(() => {
    setLogoFailed(false);
  }, [resolvedTheme?.logoIcon]);

  const openLogoutModal = React.useCallback(() => {
    if (effectiveIsLoggingOut) return;
    setIsLogoutModalOpen(true);
  }, [effectiveIsLoggingOut]);

  const closeLogoutModal = React.useCallback(() => {
    if (effectiveIsLoggingOut) return;
    setIsLogoutModalOpen(false);
  }, [effectiveIsLoggingOut]);

  const confirmLogout = React.useCallback(async () => {
    setIsLogoutModalOpen(false);
    if (onLogoutPress) {
      const result = await onLogoutPress();
      if (result?.success && !result?.error) {
        router.replace('/auth/access');
      }
      return;
    }

    const result = await fallbackLogout();
    if (result?.success && !result?.error) {
      router.replace('/auth/access');
    }
  }, [fallbackLogout, onLogoutPress, router]);

  const handleFeedbackPress = React.useCallback(() => {
    if (onFeedbackPress) {
      onFeedbackPress();
      return;
    }
    router.navigate('/donor/feedback');
  }, [onFeedbackPress, router]);

  return (
    <>
      <View style={[styles.headerRow, style]}>
        {showBack ? (
          <Pressable
            onPress={onBackPress}
            disabled={!onBackPress}
            style={styles.headerIdentity}
          >
            <View style={styles.headerBackButton}>
              <AppIcon name="arrowLeft" size="md" state="default" color={roles.headingText} />
            </View>
            <View style={styles.headerCopy}>
              <Text numberOfLines={1} style={[styles.headerTitle, { color: roles.headingText }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text numberOfLines={1} style={[styles.headerSubtitle, { color: roles.metaText }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ) : (
          <View style={styles.headerIdentity}>
            <View
              style={[
                styles.brandLogoWrap,
                { backgroundColor: resolvedTheme?.backgroundColor || roles.pageBackground },
              ]}
            >
              {appLogoSource && !logoFailed ? (
                <Image
                  source={appLogoSource}
                  style={styles.brandLogoImage}
                  resizeMode="contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <AppIcon name="profile" size="md" state="default" color={headerIconColor} />
              )}
            </View>
          </View>
        )}

        <View style={styles.headerActions}>
          {shouldShowFeedbackAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open feedback"
              onPress={handleFeedbackPress}
              style={styles.headerIconButton}
            >
              <AppIcon name="feedback" size="md" state="default" color={headerIconColor} />
            </Pressable>
          ) : null}

          {showNotificationsAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
              onPress={onNotificationsPress}
              style={styles.headerIconButton}
            >
              <AppIcon name="notifications" size="md" state="default" color={headerIconColor} />
              {unreadCount ? (
                <View style={[styles.headerBadge, { backgroundColor: roles.primaryActionBackground }]}>
                  <Text style={[styles.headerBadgeText, { color: roles.primaryActionText }]}>
                    {Math.min(unreadCount, 99)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {showProfileAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              onPress={onProfilePress}
              disabled={!onProfilePress}
              style={styles.headerIconButton}
            >
              <AppIcon name="profile" size="md" state="default" color={headerIconColor} />
            </Pressable>
          ) : null}

          {showLogoutAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Log out"
              onPress={openLogoutModal}
              disabled={effectiveIsLoggingOut}
              style={[styles.headerIconButton, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
            >
              <AppIcon name="signOut" size="md" state="default" color={roles.headingText} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <Modal transparent visible={isLogoutModalOpen} animationType="fade" onRequestClose={closeLogoutModal}>
        <View style={styles.logoutModalOverlay}>
          <Pressable style={styles.logoutModalBackdrop} onPress={closeLogoutModal} />
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.logoutModalCard}>
            <Text style={styles.logoutModalTitle}>Log out?</Text>
            <Text style={styles.logoutModalBody}>Are you sure you want to log out?</Text>
            <View style={styles.logoutModalActions}>
              <AppButton title="Cancel" variant="outline" fullWidth={false} onPress={closeLogoutModal} />
              <AppButton title="Log out" fullWidth={false} onPress={confirmLogout} loading={effectiveIsLoggingOut} />
            </View>
          </AppCard>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  headerBackButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  brandLogoWrap: {
    width: 34,
    height: 34,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogoImage: {
    width: 24,
    height: 24,
  },
  headerCopy: {
    flex: 1,
    gap: 1,
  },
  headerTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  headerSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  headerIconButton: {
    width: 24,
    height: 24,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  headerBadge: {
    position: 'absolute',
    top: -2,
    right: -1,
    minWidth: 16,
    height: 16,
    borderRadius: theme.radius.full,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
  },
  logoutModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  logoutModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  logoutModalCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  logoutModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  logoutModalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  logoutModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
});
