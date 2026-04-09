import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { theme } from '../../design-system/theme';
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
  const headerBackground = resolvedTheme?.primaryColor || config.colors[0];
  const summaryBackground = resolvedTheme?.secondaryColor || config.summaryBg;
  const summaryTextColor = resolvedTheme?.tertiaryTextColor || config.summaryText;
  const actionColor = resolvedTheme?.primaryColor || theme.colors.actionPrimary;
  const eyebrowText = resolvedTheme?.brandName || config.eyebrow;

  React.useEffect(() => {
    setImageFailed(false);
  }, [avatarUri]);

  const utilityItems = [
    ...utilityActions,
    {
      key: 'logout',
      icon: 'signOut',
      onPress: logout,
      loading: isLoading,
    },
  ];

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null, { backgroundColor: headerBackground }]}>
      <View style={styles.topRow}>
        <View style={styles.identityRow}>
          {shouldShowAvatar ? (
            <View key={avatarUri || avatarInitials} style={[styles.avatar, compact ? styles.avatarCompact : null]}>
              {avatarUri && !imageFailed ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => setImageFailed(true)}
                />
              ) : avatarInitials ? (
                <Text style={styles.avatarText}>{avatarInitials.toUpperCase().slice(0, 2)}</Text>
              ) : (
                <AppIcon name="profile" size="md" state="inverse" />
              )}
            </View>
          ) : null}
          <View style={styles.textContainer}>
            {!minimal && eyebrowText ? <Text style={styles.eyebrow}>{eyebrowText}</Text> : null}
            <Text numberOfLines={1} style={[styles.title, compact ? styles.titleCompact : null]}>
              {title}
            </Text>
            {!minimal && subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
        </View>

        <View style={styles.utilityRow}>
          {utilityItems.map((item) => (
            <Pressable
              key={item.key}
              onPress={item.loading ? undefined : item.onPress}
              style={({ pressed }) => [
                styles.utilityButton,
                item.loading ? styles.utilityButtonDisabled : null,
                pressed ? styles.utilityButtonPressed : null,
              ]}
            >
              <AppIcon
                name={item.icon}
                size="md"
                state="inverse"
              />
              {item.badge ? (
                <View style={styles.utilityBadge}>
                  <Text style={styles.utilityBadgeText}>{item.badge}</Text>
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
          <View style={styles.searchInput}>
            <AppIcon name="search" size="sm" state="muted" />
            <Text numberOfLines={1} style={styles.searchPlaceholder}>{searchPlaceholder}</Text>
          </View>
          <View style={[styles.searchAction, { backgroundColor: actionColor }]}>
            <AppIcon name="filter" size="sm" state="inverse" />
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
                pressed ? styles.quickToolPressed : null,
              ]}
            >
              <AppIcon name={item.icon} size="sm" state="inverse" />
              <Text style={styles.quickToolText}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {!minimal && summary ? (
        <View style={[styles.summaryCard, compact ? styles.summaryCardCompact : null, { backgroundColor: summaryBackground }]}>
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
    backgroundColor: theme.colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
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
    backgroundColor: theme.colors.actionPrimary,
    borderWidth: 1,
    borderColor: theme.colors.surfaceCard,
  },
  utilityBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.whiteOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  avatarCompact: {
    width: 34,
    height: 34,
  },
  avatarText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
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
    color: theme.colors.textHeroMuted,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    lineHeight: theme.typography.compact.bodyLg * theme.typography.lineHeights.snug,
    color: theme.colors.textInverse,
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
    color: theme.colors.textHeroSoft,
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
    backgroundColor: theme.colors.surfaceCard,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  searchPlaceholder: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
  searchAction: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.actionPrimary,
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
    backgroundColor: theme.colors.whiteOverlay,
  },
  quickToolPressed: {
    opacity: 0.9,
  },
  quickToolText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.textInverse,
  },
  summaryCard: {
    marginTop: theme.spacing.sm,
    borderRadius: 18,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
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
