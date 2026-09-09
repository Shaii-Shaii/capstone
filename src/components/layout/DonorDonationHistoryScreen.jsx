import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeaderSurface } from './DashboardHeaderSurface';
import { DonorTopBar } from '../donor/DonorTopBar';
import { EmptyDataState } from '../ui/EmptyDataState';
import { StatusBanner } from '../ui/StatusBanner';
import { useAuth } from '../../providers/AuthProvider';
import { getDonorDonationHistory } from '../../features/donorDonations.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const formatStatusLabel = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'Completed';

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const getDonationStatusTone = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  return {
    isCancelled: /cancel|reject|deny|fail|void|expire/.test(normalized),
    isCompleted: /complete|completed|success|approved|received|done|closed/.test(normalized),
  };
};

const toHistoryDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getHistoryDateKey = (value) => {
  const parsed = toHistoryDate(value);
  if (!parsed) return 'date-unavailable';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

const getHistorySectionLabel = (value) => {
  const parsed = toHistoryDate(value);
  if (!parsed) return 'Earlier activity';

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (parsed.toDateString() === today.toDateString()) return 'Today';
  if (parsed.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return parsed.toLocaleDateString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const groupHistoryByDate = (items = []) => {
  const groups = [];
  const groupByKey = new Map();

  items.forEach((item) => {
    const key = getHistoryDateKey(item?.timestamp);
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        key,
        label: getHistorySectionLabel(item?.timestamp),
        date: key === 'date-unavailable' ? '' : key,
        items: [],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  });

  return groups;
};

const HISTORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'event', label: 'Events' },
  { key: 'donation', label: 'Donations' },
  { key: 'analysis', label: 'Hair Analysis' },
  { key: 'certificate', label: 'Certificates' },
];

const matchesHistoryFilter = (item, filter) => {
  if (filter === 'all') return true;
  if (filter === 'donation') return item?.type === 'donation' || item?.type === 'timeline';
  return item?.type === filter;
};

const matchesHistorySearch = (item, query) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [item?.title, item?.description, item?.reference, item?.status, item?.date_label]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
};

function DonationHistoryRow({ item, roles, showDivider = true }) {
  const { isCancelled, isCompleted } = getDonationStatusTone(item?.status);
  const statusLabel = isCancelled
    ? 'Cancelled'
    : isCompleted
      ? 'Completed'
      : formatStatusLabel(item?.status);
  const statusColor = isCancelled
    ? '#A32121'
    : roles.iconPrimaryColor;

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: roles.defaultCardBorder,
          borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
        <MaterialCommunityIcons
          name={item?.icon || 'history'}
          size={24}
          color={roles.iconPrimaryColor}
        />
      </View>

      <View style={styles.rowCopy}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={[styles.rowTitle, { color: roles.headingText }]}>
            {item?.title || 'Activity update'}
          </Text>
          <Text numberOfLines={1} style={[styles.rowStatus, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>

        {item?.description ? (
          <Text numberOfLines={1} style={[styles.rowDescription, { color: roles.bodyText }]}>
            {item.description}
          </Text>
        ) : null}

        {item?.reference ? (
          <Text numberOfLines={1} style={[styles.referenceText, { color: roles.metaText }]}>
            {item.reference}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function HistorySearchControls({
  roles,
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  showFilters,
  onToggleFilters,
}) {
  const filterIsActive = showFilters || activeFilter !== 'all';

  return (
    <View style={styles.stickyTools}>
      <View style={styles.searchTools}>
        <View style={[
          styles.searchBar,
          {
            backgroundColor: roles.defaultCardBackground,
            borderColor: roles.defaultCardBorder,
          },
        ]}>
          <MaterialCommunityIcons name="magnify" size={21} color={roles.metaText} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search activity"
            placeholderTextColor={roles.metaText}
            returnKeyType="search"
            style={[styles.searchInput, { color: roles.headingText }]}
            accessibilityLabel="Search activity history"
          />
          {searchQuery ? (
            <Pressable
              onPress={() => onSearchChange('')}
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
          accessibilityLabel="Filter activity history"
          accessibilityState={{ expanded: showFilters }}
          style={[
            styles.filterButton,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: filterIsActive ? roles.iconPrimaryColor : roles.defaultCardBorder,
            },
          ]}
        >
          <MaterialCommunityIcons name="filter-variant" size={21} color={roles.iconPrimaryColor} />
          <Text style={[styles.filterButtonText, { color: roles.headingText }]}>Filter</Text>
        </Pressable>
      </View>

      {showFilters ? (
        <View style={styles.filterOptions}>
          {HISTORY_FILTERS.map((filter) => {
            const selected = activeFilter === filter.key;
            return (
              <Pressable
                key={filter.key}
                onPress={() => onFilterChange(filter.key)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: selected ? roles.iconPrimarySurface : roles.defaultCardBackground,
                    borderColor: selected ? roles.iconPrimaryColor : roles.defaultCardBorder,
                  },
                ]}
              >
                <Text style={[
                  styles.filterChipText,
                  { color: selected ? roles.iconPrimaryColor : roles.bodyText },
                ]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
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
  const [showFilters, setShowFilters] = React.useState(false);
  const filteredHistoryItems = React.useMemo(() => (
    historyItems.filter((item) => (
      matchesHistoryFilter(item, activeFilter) && matchesHistorySearch(item, searchQuery)
    ))
  ), [activeFilter, historyItems, searchQuery]);
  const historyGroups = React.useMemo(
    () => groupHistoryByDate(filteredHistoryItems),
    [filteredHistoryItems]
  );

  const loadHistory = React.useCallback(async ({ silent = false } = {}) => {
    if (!user?.id || !profile?.user_id) {
      setHistoryItems([]);
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    if (silent) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage('');

    try {
      const result = await getDonorDonationHistory({
        userId: user.id,
        databaseUserId: profile.user_id,
      });

      setHistoryItems(result?.historyItems || result?.donationHistory || []);

      if (result?.error) {
        // Keep the technical detail out of the UI, but preserve it for debugging.
        console.warn('[DonorDonationHistoryScreen] loadHistory error:', result.error);
        setErrorMessage('Some activity updates could not be loaded. Pull down to try again.');
      }
    } catch (err) {
      setHistoryItems([]);
      setErrorMessage('Your activity history could not be loaded. Pull down to try again.');
      console.warn('[DonorDonationHistoryScreen] loadHistory exception:', err);
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    }
  }, [profile?.user_id, user?.id]);

  React.useEffect(() => {
    if (isAuthLoading) return;
    loadHistory();
  }, [isAuthLoading, loadHistory]);

  return (
    <DashboardLayout
      hideNav
      navItems={[]}
      navVariant="donor"
      screenVariant="default"
      onRefresh={() => loadHistory({ silent: true })}
      refreshing={isRefreshing}
      stickyContent={historyItems.length ? (
        <HistorySearchControls
          roles={roles}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters((current) => !current)}
        />
      ) : null}
      header={(
        <DashboardHeaderSurface>
          <DonorTopBar
            title="History"
            subtitle="Your donor activity"
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
            <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
            <Text style={[styles.loadingText, { color: roles.metaText }]}>
              Loading your activity history...
            </Text>
          </View>
        ) : historyItems.length ? (
          <View style={styles.list}>
            {historyGroups.length ? (
              historyGroups.map((group) => (
                <View key={group.key} style={styles.section}>
                  <View style={styles.sectionHeading}>
                    <Text style={[styles.sectionTitle, { color: roles.headingText }]}>{group.label}</Text>
                    {group.date ? (
                      <Text style={[styles.sectionDate, { color: roles.metaText }]}>{group.date}</Text>
                    ) : null}
                  </View>
                  <View style={styles.sectionRows}>
                    {group.items.map((item, index) => (
                      <DonationHistoryRow
                        key={item.id || `${group.key}-${index}`}
                        item={item}
                        roles={roles}
                        showDivider={index < group.items.length - 1}
                      />
                    ))}
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.noResults}>
                <MaterialCommunityIcons name="magnify-close" size={34} color={roles.metaText} />
                <Text style={[styles.noResultsTitle, { color: roles.headingText }]}>No matching activity</Text>
                <Text style={[styles.noResultsText, { color: roles.metaText }]}>Try another search or filter.</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
            <EmptyDataState
              variant="default"
              showCountBadge={false}
              title="No activity history yet"
              message="Event attendance, Hair Analysis, donation updates, and certificates will appear here."
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
    gap: theme.spacing.sm,
  },
  loadingState: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  list: {
    gap: theme.spacing.lg,
  },
  stickyTools: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: 'transparent',
  },
  searchTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  searchBar: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: 'transparent',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
  },
  filterButton: {
    height: 48,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'transparent',
  },
  filterButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    backgroundColor: 'transparent',
  },
  filterChip: {
    minHeight: 36,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  noResults: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
  section: {
    gap: theme.spacing.xs,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  sectionDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  sectionRows: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minHeight: 68,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.snug,
  },
  rowStatus: {
    flexShrink: 0,
    maxWidth: 94,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  referenceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  emptyState: {
    width: '100%',
    minHeight: 300,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
  },
  rowDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  emptyCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: 24,
    ...theme.shadows.soft,
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
