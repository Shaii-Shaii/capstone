import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeaderSurface } from './DashboardHeaderSurface';
import { DonorTopBar } from '../donor/DonorTopBar';
import { StatusBanner } from '../ui/StatusBanner';
import { useAuth } from '../../providers/AuthProvider';
import { getDonorActivityHistoryItem } from '../../features/donorDonations.service';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const formatDate = (value, withTime = false) => {
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleString('en-PH', withTime ? {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  } : {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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

function DetailAction({ icon, label, roles, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.detailAction,
        {
          backgroundColor: roles.primaryActionBackground,
          opacity: pressed ? 0.86 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={20} color={theme.colors.textOnBrand} />
      <Text style={styles.detailActionText}>{label}</Text>
      <MaterialCommunityIcons name="arrow-right" size={20} color={theme.colors.textOnBrand} />
    </Pressable>
  );
}

function ActivityTimeline({ activity, roles }) {
  const timeline = activity?.timeline || [];
  return (
    <View style={[styles.timelineCard, {
      backgroundColor: roles.defaultCardBackground,
      borderColor: roles.defaultCardBorder,
    }]}>
      <View style={styles.timelineHeading}>
        <View style={[styles.timelineHeadingIcon, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="timeline-check-outline" size={22} color={roles.iconPrimaryColor} />
        </View>
        <View style={styles.timelineHeadingCopy}>
          <Text style={[styles.timelineTitle, { color: roles.headingText }]}>Activity timeline</Text>
          <Text style={[styles.timelineSubtitle, { color: roles.metaText }]}>Only recorded steps are shown</Text>
        </View>
      </View>

      {timeline.length ? (
        <View style={styles.timelineList}>
          {timeline.map((entry, index) => {
            const isLast = index === timeline.length - 1;
            const isCurrent = entry?.isCurrent === true || (activity?.isOngoing && isLast);
            const isProblem = /cancel|reject|no show|not accepted/.test(
              `${entry?.title || ''} ${entry?.status || ''}`.toLowerCase()
            );
            const dotColor = isProblem ? '#A32121' : roles.primaryActionBackground;
            return (
              <View key={entry?.key || `${entry?.title}-${entry?.timestamp}`} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View style={[
                    styles.timelineDot,
                    {
                      backgroundColor: isCurrent ? roles.defaultCardBackground : dotColor,
                      borderColor: dotColor,
                    },
                  ]}>
                    {isCurrent ? (
                      <View style={[styles.currentDot, { backgroundColor: dotColor }]} />
                    ) : (
                      <MaterialCommunityIcons name={isProblem ? 'close' : 'check'} size={13} color="#FFFFFF" />
                    )}
                  </View>
                  {!isLast ? <View style={[styles.timelineLine, { backgroundColor: roles.defaultCardBorder }]} /> : null}
                </View>
                <View style={[styles.timelineCopy, !isLast && styles.timelineCopyWithSpacing]}>
                  <View style={styles.timelineItemTitleRow}>
                    <Text style={[styles.timelineItemTitle, { color: roles.headingText }]}>{entry.title}</Text>
                    {isCurrent ? (
                      <View style={[styles.currentPill, { backgroundColor: roles.iconPrimarySurface }]}>
                        <Text style={[styles.currentPillText, { color: roles.iconPrimaryColor }]}>Current</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.timelineTime, { color: roles.metaText }]}>
                    {formatDate(entry.timestamp, true)}
                  </Text>
                  {entry?.description ? (
                    <Text style={[styles.timelineDescription, { color: roles.bodyText }]}>{entry.description}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.timelineEmpty, { color: roles.metaText }]}>No timestamped steps are available for this activity.</Text>
      )}
    </View>
  );
}

export function DonorActivityDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const activityId = Array.isArray(params.activityId) ? params.activityId[0] : params.activityId;
  const { user, profile, resolvedTheme, isLoading: isAuthLoading } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [activity, setActivity] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const loadActivity = React.useCallback(async ({ silent = false } = {}) => {
    if (!user?.id || !profile?.user_id || !activityId) {
      if (!isAuthLoading) {
        setErrorMessage('This activity could not be found.');
        setIsLoading(false);
      }
      return;
    }
    if (silent) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await getDonorActivityHistoryItem({
        userId: user.id,
        databaseUserId: profile.user_id,
        activityId,
      });
      setActivity(result.activity || null);
      if (!result.activity) setErrorMessage('This activity is no longer available.');
      else if (result.error) setErrorMessage('Some timeline details could not be loaded.');
    } catch (error) {
      console.warn('[DonorActivityDetailsScreen] loadActivity exception:', error);
      setErrorMessage('This activity could not be loaded. Pull down to try again.');
    } finally {
      if (silent) setIsRefreshing(false);
      else setIsLoading(false);
    }
  }, [activityId, isAuthLoading, profile?.user_id, user?.id]);

  React.useEffect(() => {
    if (!isAuthLoading) loadActivity();
  }, [isAuthLoading, loadActivity]);

  const statusColors = getStatusColors(activity?.status, roles);

  return (
    <DashboardLayout
      hideNav
      navItems={[]}
      navVariant="donor"
      screenVariant="default"
      onRefresh={() => loadActivity({ silent: true })}
      refreshing={isRefreshing}
      header={(
        <DashboardHeaderSurface>
          <DonorTopBar
            title="Activity Details"
            subtitle="Recorded donor activity"
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
            <Text style={[styles.loadingText, { color: roles.metaText }]}>Loading activity...</Text>
          </View>
        ) : activity ? (
          <>
            <View style={[styles.summaryCard, {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            }]}>
              <View style={styles.summaryTop}>
                <View style={[styles.summaryIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                  <MaterialCommunityIcons name={activity.icon || 'history'} size={28} color={roles.iconPrimaryColor} />
                </View>
                <View style={styles.summaryHeading}>
                  <Text style={[styles.summaryTitle, { color: roles.headingText }]}>{activity.title}</Text>
                  {activity.related_title ? (
                    <Text style={[styles.summaryRelated, { color: roles.bodyText }]}>{activity.related_title}</Text>
                  ) : null}
                </View>
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: roles.defaultCardBorder }]} />
              <View style={styles.summaryMeta}>
                <View style={styles.summaryMetaCopy}>
                  <Text style={[styles.metaLabel, { color: roles.metaText }]}>Activity date</Text>
                  <Text style={[styles.metaValue, { color: roles.headingText }]}>
                    {formatDate(activity.activity_date || activity.timestamp)}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: statusColors.background }]}>
                  <Text style={[styles.statusText, { color: statusColors.text }]}>{activity.status}</Text>
                </View>
              </View>
              {activity.reference ? (
                <View style={[styles.referenceRow, { backgroundColor: roles.iconPrimarySurface }]}>
                  <MaterialCommunityIcons name="identifier" size={18} color={roles.iconPrimaryColor} />
                  <Text style={[styles.referenceText, { color: roles.iconPrimaryColor }]}>{activity.reference}</Text>
                </View>
              ) : null}
            </View>

            <ActivityTimeline activity={activity} roles={roles} />

            {activity.type === 'analysis' && activity.screening_id ? (
              <DetailAction
                icon="creation-outline"
                label="View saved Hair Analysis"
                roles={roles}
                onPress={() => router.push({
                  pathname: '/donor/hair-check-details',
                  params: { screeningId: String(activity.screening_id) },
                })}
              />
            ) : null}
            {activity.certificate_id ? (
              <DetailAction
                icon="certificate-outline"
                label="View donation certificate"
                roles={roles}
                onPress={() => router.push({
                  pathname: '/donor/achievements',
                  params: { certificateId: String(activity.certificate_id) },
                })}
              />
            ) : null}
          </>
        ) : null}
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
    gap: theme.spacing.md,
  },
  loadingState: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.soft,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  summaryIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryHeading: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  summaryTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: theme.typography.weights.bold,
  },
  summaryRelated: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
  },
  summaryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  summaryMetaCopy: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  metaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  statusPill: {
    maxWidth: 150,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
  },
  statusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  referenceRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
  },
  referenceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  timelineCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  timelineHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  timelineHeadingIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineHeadingCopy: {
    flex: 1,
    gap: 2,
  },
  timelineTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  timelineSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  timelineList: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.md,
  },
  timelineRail: {
    width: 26,
    alignItems: 'center',
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 54,
  },
  timelineCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  timelineCopyWithSpacing: {
    paddingBottom: theme.spacing.lg,
  },
  timelineItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  timelineItemTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  currentPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  currentPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  timelineTime: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  timelineDescription: {
    marginTop: 6,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  timelineEmpty: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    textAlign: 'center',
    paddingVertical: theme.spacing.lg,
  },
  detailAction: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  detailActionText: {
    flex: 1,
    color: theme.colors.textOnBrand,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
});
