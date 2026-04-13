import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export function DonorTopBar({
  title,
  subtitle = '',
  avatarInitials = '',
  avatarUri = '',
  unreadCount = 0,
  onProfilePress,
  onNotificationsPress,
  onLogoutPress,
  isLoggingOut = false,
  style,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [avatarUri]);

  const openLogoutModal = React.useCallback(() => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(true);
  }, [isLoggingOut]);

  const closeLogoutModal = React.useCallback(() => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(false);
  }, [isLoggingOut]);

  const confirmLogout = React.useCallback(() => {
    setIsLogoutModalOpen(false);
    onLogoutPress?.();
  }, [onLogoutPress]);

  return (
    <>
      <View style={[styles.headerRow, style]}>
        <Pressable onPress={onProfilePress} style={styles.headerIdentity}>
          <View style={[styles.headerAvatar, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
            {avatarUri && !imageFailed ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.headerAvatarImage}
                resizeMode="cover"
                onError={() => setImageFailed(true)}
              />
            ) : avatarInitials ? (
              <Text style={[styles.headerAvatarText, { color: roles.headingText }]}>{avatarInitials}</Text>
            ) : (
              <AppIcon name="profile" size="md" state="default" color={roles.headingText} />
            )}
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

        <View style={styles.headerActions}>
          <Pressable
            onPress={onNotificationsPress}
            style={[styles.headerIconButton, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
          >
            <AppIcon name="notifications" size="md" state="default" color={roles.headingText} />
            {unreadCount ? (
              <View style={[styles.headerBadge, { backgroundColor: roles.primaryActionBackground }]}>
                <Text style={[styles.headerBadgeText, { color: roles.primaryActionText }]}>
                  {Math.min(unreadCount, 99)}
                </Text>
              </View>
            ) : null}
          </Pressable>

          <Pressable
            onPress={openLogoutModal}
            disabled={isLoggingOut}
            style={[styles.headerIconButton, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
          >
            <AppIcon name="signOut" size="md" state="default" color={roles.headingText} />
          </Pressable>
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
              <AppButton title="Log out" fullWidth={false} onPress={confirmLogout} loading={isLoggingOut} />
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
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  headerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  headerAvatarText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
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
    gap: theme.spacing.xs,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerBadge: {
    position: 'absolute',
    top: -3,
    right: -2,
    minWidth: 14,
    height: 14,
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
