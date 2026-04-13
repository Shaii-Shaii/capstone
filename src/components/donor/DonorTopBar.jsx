import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/AppIcon';
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

  React.useEffect(() => {
    setImageFailed(false);
  }, [avatarUri]);

  return (
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
          onPress={onLogoutPress}
          disabled={isLoggingOut}
          style={[styles.headerIconButton, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
        >
          <AppIcon name="signOut" size="md" state="default" color={roles.headingText} />
        </Pressable>
      </View>
    </View>
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
});
