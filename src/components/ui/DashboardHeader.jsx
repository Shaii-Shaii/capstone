import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Pressable, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { theme } from '../../design-system/theme';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import { AppIcon } from './AppIcon';

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
    eyebrow: 'Donivra',
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
}) => {
  const { logout, isLoading } = useAuthActions();
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const config = HEADER_VARIANTS[variant] || HEADER_VARIANTS.hero;
  const [imageFailed, setImageFailed] = React.useState(false);

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
    <LinearGradient
      colors={config.colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, compact ? styles.containerCompact : null]}
    >
      <View style={styles.topRow}>
        <View style={styles.identityRow}>
          {avatarUri || avatarInitials ? (
            <View key={avatarUri || avatarInitials} style={[styles.avatar, compact ? styles.avatarCompact : null]}>
              {avatarUri && !imageFailed ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <Text style={styles.avatarText}>{avatarInitials.toUpperCase().slice(0, 2)}</Text>
              )}
            </View>
          ) : null}
          <View style={styles.textContainer}>
            <Text style={styles.eyebrow}>{config.eyebrow}</Text>
            <Text numberOfLines={1} style={[styles.title, compact ? styles.titleCompact : null]}>
              {title}
            </Text>
            {subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}
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

      {searchPlaceholder ? (
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
          <View style={styles.searchAction}>
            <AppIcon name="filter" size="sm" state="inverse" />
          </View>
        </Pressable>
      ) : null}

      {quickTools.length ? (
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

      {summary ? (
        <View style={[styles.summaryCard, compact ? styles.summaryCardCompact : null, { backgroundColor: config.summaryBg }]}>
          <Text numberOfLines={2} style={[styles.summaryText, { color: config.summaryText }]}>{summary}</Text>
        </View>
      ) : null}

    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 30,
    padding: theme.spacing.sm,
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
    backgroundColor: theme.colors.brandPrimary,
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
    backgroundColor: theme.colors.brandPrimary,
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
