import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeaderSurface } from './DashboardHeaderSurface';
import { DonorTopBar } from '../donor/DonorTopBar';
import { EmptyDataState } from '../ui/EmptyDataState';
import { StatusBanner } from '../ui/StatusBanner';
import { useAuth } from '../../providers/AuthProvider';
import { getDonorDonationHistory } from '../../features/donorDonations.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const HISTORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'event', label: 'Events' },
  { key: 'donation', label: 'Donations' },
  { key: 'appointment', label: 'Appointments' },
  { key: 'analysis', label: 'Hair Analysis' },
];

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatActivityDate = (value) => {
  const parsed = toDate(value);
  if (!parsed) return 'Date unavailable';
  return parsed.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const getMonthKey = (value) => {
  const parsed = toDate(value);
  if (!parsed) return 'earlier';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (value) => {
  const parsed = toDate(value);
  if (!parsed) return 'Earlier activity';
  return parsed.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
};

const groupHistoryByMonth = (items = []) => {
  const groups = [];
  const byKey = new Map();
  items.forEach((item) => {
    const value = item?.activity_date || item?.timestamp;
    const key = getMonthKey(value);
    if (!byKey.has(key)) {
      const group = { key, label: getMonthLabel(value), items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).items.push(item);
  });
  return groups;
};

const matchesSearch = (item, query) => {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return true;
  return [item?.title, item?.related_title, item?.status, item?.reference, item?.date_label]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
};

const getStatusColors = (status, roles) => {
  const normalized = String(status || '').toLowerCase();
  if (/cancel|reject|no show|not accepted/.test(normalized)) {
    return { text: '#A32121', background: '#FCE8E8' };
  }
  if (/complete|accepted|created|received/.test(normalized)) {
    return { text: '#177245', background: '#E4F5EB' };
  }
  return { text: roles.iconPrimaryColor, background: roles.iconPrimarySurface };
};

function HistoryTools({
  roles,
  query,
  onQueryChange,
  activeFilter,
  onFilterChange,
  filtersVisible,
  onToggleFilters,
}) {
  const filterReveal = React.useRef(new Animated.Value(filtersVisible ? 1 : 0)).current;

  React.useEffect(() => {
    const animation = Animated.timing(filterReveal, {
      toValue: filtersVisible ? 1 : 0,
      duration: filtersVisible ? 300 : 230,
      easing: filtersVisible
        ? Easing.out(Easing.cubic)
        : Easing.inOut(Easing.quad),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [filterReveal, filtersVisible]);

  const hasActiveFilter = activeFilter !== 'all';

  return (
    <View style={styles.tools}>
      <View style={styles.searchToolsRow}>
        <View style={[
          styles.searchBar,
          { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
        ]}>
          <MaterialCommunityIcons name="magnify" size={21} color={roles.metaText} />
          <TextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search activities"
            placeholderTextColor={roles.metaText}
            returnKeyType="search"
            accessibilityLabel="Search activity history"
            style={[styles.searchInput, { color: roles.headingText }]}
          />
          {query ? (
            <Pressable
              onPress={() => onQueryChange('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <MaterialCommunityIcons name="close-circle" size={19} color={roles.metaText} />
            </Pressable>
          ) : null}
        </View>

        <Pressable
          onPress={onToggleFilters}
          accessibilityRole="button"
          accessibilityLabel={filtersVisible ? 'Hide activity filters' : 'Show activity filters'}
          accessibilityState={{ expanded: filtersVisible }}
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: filtersVisible
                ? theme.colors.palette.wine700
                : '#FFF4F7',
              borderColor: theme.colors.palette.wine700,
              opacity: pressed ? 0.82 : 1,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
        >
          <View style={styles.filterButtonIcons}>
            <MaterialCommunityIcons
              name="filter-variant"
              size={21}
              color={filtersVisible ? '#FFE2A8' : theme.colors.palette.wine900}
            />
            <Animated.View
              style={{
                transform: [{
                  rotate: filterReveal.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                }],
              }}
            >
              <MaterialCommunityIcons
                name="chevron-down"
                size={14}
                color={filtersVisible ? '#FFE2A8' : theme.colors.palette.wine900}
              />
            </Animated.View>
          </View>
          {hasActiveFilter ? (
            <View
              style={[
                styles.filterActiveDot,
                {
                  backgroundColor: filtersVisible
                    ? '#FFE2A8'
                    : theme.colors.palette.wine700,
                  borderColor: filtersVisible
                    ? theme.colors.palette.wine700
                    : '#FFF4F7',
                },
              ]}
            />
          ) : null}
        </Pressable>
      </View>

      <Animated.View
        pointerEvents={filtersVisible ? 'auto' : 'none'}
        accessibilityElementsHidden={!filtersVisible}
        importantForAccessibility={filtersVisible ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.filterReveal,
          {
            height: filterReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 94] }),
            opacity: filterReveal,
            transform: [{
              translateY: filterReveal.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
            }],
          },
        ]}
      >
        <View style={styles.filterRow}>
          {HISTORY_FILTERS.map((filter) => {
            const selected = filter.key === activeFilter;
            return (
              <Pressable
                key={filter.key}
                onPress={() => onFilterChange(filter.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selected ? roles.primaryActionBackground : roles.defaultCardBackground,
                    borderColor: selected ? roles.primaryActionBackground : roles.defaultCardBorder,
                  },
                ]}
              >
                {selected ? (
                  <LinearGradient
                    pointerEvents="none"
                    colors={[theme.colors.palette.wine900, theme.colors.palette.wine600]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                ) : null}
                <Text style={[
                  styles.filterChipText,
                  { color: selected ? theme.colors.textOnBrand : roles.bodyText },
                ]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

function ActivityCard({ item, roles, onPress, index = 0 }) {
  const statusColors = getStatusColors(item?.status, roles);
  const entrance = React.useRef(new Animated.Value(0)).current;
  const actionLabel = item?.type === 'donation'
    ? 'View donation timeline'
    : item?.type === 'analysis'
      ? 'View analysis activity'
      : 'View activity timeline';

  React.useEffect(() => {
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 360,
      delay: Math.min(index * 70, 280),
      useNativeDriver: true,
    }).start();
  }, [entrance, index, item?.id]);

  return (
    <Animated.View
      style={[
        styles.activityCardMotion,
        {
          opacity: entrance,
          transform: [{
            translateY: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${item?.title || 'Activity'}. ${actionLabel}`}
        style={({ pressed }) => [
          styles.activityCard,
          {
            borderColor: roles.defaultCardBorder,
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.985 : 1 }],
          },
        ]}
      >
        <LinearGradient
          colors={[roles.defaultCardBackground, roles.iconPrimarySurface]}
          locations={[0.18, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.activityCardGradient}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[theme.colors.palette.wine700, theme.colors.palette.wine600]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cardAccent}
          />
          <View pointerEvents="none" style={styles.cardGlow} />

          <View style={styles.cardTopRow}>
            <View style={[styles.activityIcon, { backgroundColor: roles.defaultCardBackground }]}>
              <MaterialCommunityIcons
                name={item?.icon || 'history'}
                size={23}
                color={roles.iconPrimaryColor}
              />
            </View>
            <View style={styles.cardHeading}>
              <Text numberOfLines={2} style={[styles.cardTitle, { color: roles.headingText }]}>
                {item?.title || 'Donor activity'}
              </Text>
              {item?.related_title ? (
                <Text numberOfLines={1} style={[styles.cardRelated, { color: roles.bodyText }]}>
                  {item.related_title}
                </Text>
              ) : null}
            </View>
            <View style={[styles.cardChevron, { backgroundColor: roles.defaultCardBackground }]}>
              <MaterialCommunityIcons name="chevron-right" size={21} color={roles.iconPrimaryColor} />
            </View>
          </View>

          <View style={styles.cardMetaRow}>
            <View style={styles.cardDateRow}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={16} color={roles.metaText} />
              <Text style={[styles.cardDate, { color: roles.metaText }]}>
                {formatActivityDate(item?.activity_date || item?.timestamp)}
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: statusColors.background }]}>
              <Text numberOfLines={1} style={[styles.statusText, { color: statusColors.text }]}>
                {item?.status || 'Recorded'}
              </Text>
            </View>
          </View>

          <View style={[styles.cardFooter, { borderTopColor: roles.defaultCardBorder }]}>
            <View style={styles.cardActionRow}>
              <Text style={[styles.cardAction, { color: roles.iconPrimaryColor }]}>{actionLabel}</Text>
              <MaterialCommunityIcons name="arrow-right" size={15} color={roles.iconPrimaryColor} />
            </View>
            {item?.reference ? (
              <Text numberOfLines={1} style={[styles.reference, { color: roles.metaText }]}>
                {item.reference}
              </Text>
            ) : null}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function DonorDonationHistoryScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme, isLoading: isAuthLoading } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [historyItems, setHistoryItems] = React.useState([]);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('all');
  const [filtersVisible, setFiltersVisible] = React.useState(false);

  const filteredItems = React.useMemo(() => historyItems.filter((item) => (
    (activeFilter === 'all' || item?.type === activeFilter)
    && matchesSearch(item, searchQuery)
  )), [activeFilter, historyItems, searchQuery]);
  const historyGroups = React.useMemo(() => groupHistoryByMonth(filteredItems), [filteredItems]);

  const loadHistory = React.useCallback(async ({ silent = false } = {}) => {
    if (!user?.id || !profile?.user_id) {
      setHistoryItems([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await getDonorDonationHistory({
        userId: user.id,
        databaseUserId: profile.user_id,
      });
      setHistoryItems(result?.historyItems || []);
      if (result?.error) {
        console.warn('[DonorDonationHistoryScreen] loadHistory error:', result.error);
        setErrorMessage('Some activities could not be loaded. Pull down to try again.');
      }
    } catch (error) {
      console.warn('[DonorDonationHistoryScreen] loadHistory exception:', error);
      setHistoryItems([]);
      setErrorMessage('Your activity history could not be loaded. Pull down to try again.');
    } finally {
      if (silent) setIsRefreshing(false);
      else setIsLoading(false);
    }
  }, [profile?.user_id, user?.id]);

  React.useEffect(() => {
    if (!isAuthLoading) loadHistory();
  }, [isAuthLoading, loadHistory]);

  const openActivity = React.useCallback((item) => {
    if (!item?.id) return;
    router.push({
      pathname: '/donor/activity-history-details',
      params: { activityId: String(item.id) },
    });
  }, [router]);

  return (
    <DashboardLayout
      hideNav
      navItems={[]}
      navVariant="donor"
      screenVariant="default"
      onRefresh={() => loadHistory({ silent: true })}
      refreshing={isRefreshing}
      stickyContent={historyItems.length ? (
        <HistoryTools
          roles={roles}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          filtersVisible={filtersVisible}
          onToggleFilters={() => setFiltersVisible((current) => !current)}
        />
      ) : null}
      header={(
        <DashboardHeaderSurface>
          <DonorTopBar
            title="Activity History"
            subtitle="Activities you joined or completed"
            showBack
            showNotificationsAction={false}
            showLogoutAction={false}
            onBackPress={() => router.back()}
          />
        </DashboardHeaderSurface>
      )}
    >
      <View style={styles.page}>
        {errorMessage ? (
          <StatusBanner
            message={errorMessage}
            variant="error"
            presentation="floating"
            visible
            onDismiss={() => setErrorMessage('')}
          />
        ) : null}

        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={roles.primaryActionBackground} />
            <Text style={[styles.loadingText, { color: roles.metaText }]}>Loading your activities...</Text>
          </View>
        ) : historyItems.length ? (
          historyGroups.length ? (
            <View style={styles.list}>
              {historyGroups.map((group) => (
                <View key={group.key} style={styles.section}>
                  <View style={styles.sectionHeadingRow}>
                    <Text style={[styles.sectionTitle, { color: roles.headingText }]}>{group.label}</Text>
                    <View style={[styles.sectionRule, { backgroundColor: roles.defaultCardBorder }]} />
                  </View>
                  <View style={styles.cardList}>
                    {group.items.map((item, index) => (
                      <ActivityCard
                        key={item.id}
                        item={item}
                        roles={roles}
                        index={index}
                        onPress={() => openActivity(item)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.noResults}>
              <MaterialCommunityIcons name="magnify-close" size={36} color={roles.metaText} />
              <Text style={[styles.noResultsTitle, { color: roles.headingText }]}>No matching activities</Text>
              <Text style={[styles.noResultsText, { color: roles.metaText }]}>Try another search or category.</Text>
            </View>
          )
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <EmptyDataState
              variant="default"
              showCountBadge={false}
              title="No activity history yet"
              message="Events you join, completed Hair Analyses, donations, and finished appointments will appear here."
              style={styles.emptyState}
              illustrationStyle={styles.emptyIllustration}
              titleStyle={[styles.emptyTitle, { color: roles.headingText }]}
              messageStyle={[styles.emptyBody, { color: roles.metaText }]}
            />
          </View>
        )}
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  tools: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  searchToolsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    height: 50,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
  },
  filterButton: {
    position: 'relative',
    width: 50,
    height: 50,
    flexShrink: 0,
    borderWidth: 1.5,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  filterButtonIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  filterActiveDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  filterReveal: {
    width: '100%',
    overflow: 'hidden',
  },
  filterRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    paddingTop: 10,
  },
  filterChip: {
    flexGrow: 1,
    flexBasis: '29%',
    minHeight: 38,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  filterChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  loadingState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  list: {
    gap: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
  },
  section: {
    gap: 10,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  sectionRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  cardList: {
    gap: theme.spacing.md,
  },
  activityCardMotion: {
    width: '100%',
    borderRadius: 24,
    ...theme.shadows.soft,
  },
  activityCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  activityCardGradient: {
    position: 'relative',
    borderRadius: 23,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingLeft: theme.spacing.lg,
    gap: theme.spacing.md,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: 0,
    width: 4,
    borderTopRightRadius: theme.radius.pill,
    borderBottomRightRadius: theme.radius.pill,
  },
  cardGlow: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    top: -62,
    right: -38,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  activityIcon: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(110, 13, 34, 0.08)',
    ...theme.shadows.soft,
  },
  cardHeading: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
  },
  cardRelated: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  cardChevron: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  cardDateRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardDate: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  statusPill: {
    maxWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  statusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  cardFooter: {
    paddingTop: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  cardActionRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cardAction: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  reference: {
    flexShrink: 0,
    maxWidth: 120,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  noResults: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  noResultsTitle: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  noResultsText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  emptyCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 24,
    ...theme.shadows.soft,
  },
  emptyState: {
    width: '100%',
    minHeight: 320,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  emptyIllustration: {
    marginBottom: theme.spacing.xs,
  },
  emptyTitle: {
    fontSize: 24,
    lineHeight: 28,
  },
  emptyBody: {
    maxWidth: 300,
  },
});
