import React from 'react';
import { Alert, View, Text, StyleSheet, useWindowDimensions, Pressable, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import { AppIcon } from './AppIcon';
import { useAuth } from '../../providers/AuthProvider';

const HEADER_VARIANTS = {
  donor: {
    colors: [theme.colors.dashboardDonorFrom, theme.colors.dashboardDonorTo],
    eyebrow: 'Donor dashboard',
    summaryBg: theme.colors.whiteOverlay,
    summaryText: theme.colors.textHeroSoft,
  },
  patient: {
    colors: [theme.colors.dashboardPatientFrom, theme.colors.dashboardPatientTo],
    eyebrow: 'Patient dashboard',
    summaryBg: theme.colors.whiteOverlay,
    summaryText: theme.colors.textHeroSoft,
  },
  hero: {
    colors: [theme.colors.heroFrom, theme.colors.heroTo],
    eyebrow: '',
    summaryBg: theme.colors.whiteOverlay,
    summaryText: theme.colors.textHeroSoft,
  },
};

export const DashboardHeader = ({
  title,
  subtitle,
  avatarInitials,
  avatarUri,
  summary,
  utilityActions = [],
  quickTools = [],
  searchPlaceholder,
  onSearchPress,
  variant = 'hero',
  minimal = false,
  showAvatar,
}) => {
  const { logout, isLoading } = useAuthActions();
  const { resolvedTheme } = useAuth();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const config = HEADER_VARIANTS[variant] || HEADER_VARIANTS.hero;
  const [imageFailed, setImageFailed] = React.useState(false);
  const shouldShowAvatar = showAvatar ?? !minimal;
  const roles = resolveThemeRoles(resolvedTheme);
  const headerBackground = roles.heroBackground || config.colors[0];
  const summaryBackground = roles.headerUtilityBackground || config.summaryBg;
  const summaryTextColor = roles.heroBodyText || config.summaryText;
  const actionColor = roles.headerSearchAccentBackground || resolvedTheme?.primaryColor || theme.colors.actionPrimary;
  const actionTextColor = roles.headerSearchAccentText;
  const eyebrowText = resolvedTheme?.brandName || config.eyebrow;

  React.useEffect(() => {
    setImageFailed(false);
  }, [avatarUri]);

  const handleLogoutPress = React.useCallback(() => {
    if (isLoading) return;

    Alert.alert(
      'Log out?',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => {
            logout();
          },
        },
      ]
    );
  }, [isLoading, logout]);

  const utilityItems = [
    ...utilityActions,
    {
      key: 'logout',
      icon: 'signOut',
      onPress: handleLogoutPress,
      loading: isLoading,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        compact ? styles.containerCompact : null,
        {
          backgroundColor: headerBackground,
          borderColor: roles.heroBorder,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.identityRow}>
          {shouldShowAvatar ? (
            <View
              key={avatarUri || avatarInitials}
              style={[
                styles.avatar,
                compact ? styles.avatarCompact : null,
                {
                  backgroundColor: roles.headerUtilityBackground,
                  borderColor: roles.heroBorder,
                },
              ]}
            >
              {avatarUri && !imageFailed ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => setImageFailed(true)}
                />
              ) : avatarInitials ? (
                <Text style={[styles.avatarText, { color: roles.headerUtilityText }]}>{avatarInitials.toUpperCase().slice(0, 2)}</Text>
              ) : (
                <AppIcon name="profile" size="md" state="default" color={roles.headerUtilityText} />
              )}
            </View>
          ) : null}
          <View style={styles.textContainer}>
            {!minimal && eyebrowText ? <Text style={[styles.eyebrow, { color: roles.heroMetaText }]}>{eyebrowText}</Text> : null}
            <Text numberOfLines={1} style={[styles.title, compact ? styles.titleCompact : null, { color: roles.heroHeadingText }]}>
              {title}
            </Text>
            {!minimal && subtitle ? <Text numberOfLines={1} style={[styles.subtitle, { color: roles.heroBodyText }]}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.utilityRow}>
          {utilityItems.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.loading ? undefined : item.onPress}
              style={({ pressed }) => [
                styles.utilityButton,
                {
                  backgroundColor: roles.headerUtilityBackground,
                  borderColor: roles.heroBorder,
                },
                item.loading ? styles.utilityButtonDisabled : null,
                pressed ? styles.utilityButtonPressed : null,
              ]}
            >
              <AppIcon name={item.icon} size="md" state="default" color={roles.headerUtilityText} />
              {item.badge ? (
                <View
                  style={[
                    styles.utilityBadge,
                    {
                      backgroundColor: roles.primaryActionBackground,
                      borderColor: roles.pageBackground,
                    },
                  ]}
                >
                  <Text style={[styles.utilityBadgeText, { color: roles.primaryActionText }]}>{item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>

      {!minimal && searchPlaceholder ? (
        <Pressable
          onPress={async () => {
            await Haptics.selectionAsync();
            onSearchPress?.();
          }}
          style={({ pressed }) => [
            styles.searchRow,
            compact ? styles.searchRowCompact : null,
            pressed ? styles.searchRowPressed : null,
          ]}
        >
          <View
            style={[
              styles.searchInput,
              {
                backgroundColor: roles.headerSearchBackground,
                borderColor: roles.defaultCardBorder,
              },
            ]}
          >
            <AppIcon name="search" size="sm" state="default" color={roles.metaText} />
            <Text numberOfLines={1} style={[styles.searchPlaceholder, { color: roles.headerSearchText }]}>{searchPlaceholder}</Text>
          </View>
          <View style={[styles.searchAction, { backgroundColor: actionColor }]}>
            <AppIcon name="filter" size="sm" state="default" color={actionTextColor} />
          </View>
        </Pressable>
      ) : null}

      {!minimal && quickTools.length ? (
        <View style={styles.quickToolRow}>
          {quickTools.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.onPress}
              style={({ pressed }) => [
                styles.quickTool,
                {
                  backgroundColor: roles.headerUtilityBackground,
                  borderColor: roles.heroBorder,
                },
                pressed ? styles.quickToolPressed : null,
              ]}
            >
              <AppIcon name={item.icon} size="sm" state="default" color={roles.headerUtilityText} />
              <Text style={[styles.quickToolText, { color: roles.headerUtilityText }]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!minimal && summary ? (
        <View
          style={[
            styles.summaryCard,
            compact ? styles.summaryCardCompact : null,
            {
              backgroundColor: summaryBackground,
              borderColor: roles.heroBorder,
            },
          ]}
        >
          <Text numberOfLines={2} style={[styles.summaryText, { color: summaryTextColor }]}>{summary}</Text>
        </View>
      ) : null}

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 30,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.heroFrom,
    borderWidth: 1,
    ...theme.shadows.hero,
  },
  containerCompact: {
    padding: theme.spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  utilityButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  utilityButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  utilityButtonDisabled: {
    opacity: 0.6,
  },
  utilityBadge: {
    position: 'absolute',
    top: -3,
    right: -2,
    minWidth: 13,
    height: 13,
    borderRadius: theme.radius.full,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  utilityBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  avatarCompact: {
    width: 34,
    height: 34,
  },
  avatarText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.full,
  },
  textContainer: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    lineHeight: theme.typography.compact.bodyLg * theme.typography.lineHeights.snug,
  },
  titleCompact: {
    fontSize: theme.typography.compact.body,
    lineHeight: theme.typography.compact.body * theme.typography.lineHeights.snug,
  },
  subtitle: {
    maxWidth: 188,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.normal,
  },
  searchRow: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  searchRowCompact: {
    marginTop: theme.spacing.xs,
  },
  searchRowPressed: {
    opacity: 0.92,
  },
  searchInput: {
    flex: 1,
    minHeight: 38,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  searchAction: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickToolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  quickTool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  quickToolPressed: {
    opacity: 0.9,
  },
  quickToolText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.medium,
  },
  summaryCard: {
    marginTop: theme.spacing.sm,
    borderRadius: 18,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderWidth: 1,
  },
  summaryCardCompact: {
    marginTop: theme.spacing.xs,
    paddingVertical: 7,
  },
  summaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
});
