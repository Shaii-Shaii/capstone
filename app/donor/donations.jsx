import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DonorHairSubmissionScreen } from '../../src/components/layout/DonorHairSubmissionScreen';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { HairLogDetailModal } from '../../src/components/hair/HairLogDetailModal';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchHairSubmissionsByUserId } from '../../src/features/hairSubmission.api';
import { buildProfileCompletionMeta } from '../../src/features/profile/services/profile.service';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const toLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getMonthLabel = (date) => (
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)
);

const getWeekRangeLabel = (date) => {
  const current = new Date(date);
  const day = current.getDay();
  const start = new Date(current);
  start.setDate(current.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const formatter = new Intl.DateTimeFormat('en-US', { day: 'numeric' });
  return `${formatter.format(start)}-${formatter.format(end)}`;
};

const clampLevel = (value, fallback = 5) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(10, parsed));
};

const inferLevelsFromCondition = (condition = '') => {
  const normalized = String(condition || '').toLowerCase();

  if (normalized.includes('healthy') || normalized.includes('good')) {
    return { shine: 8, frizz: 2, dryness: 2, oiliness: 2, damage: 1 };
  }

  if (normalized.includes('dry') || normalized.includes('damaged')) {
    return { shine: 3, frizz: 7, dryness: 8, oiliness: 2, damage: 8 };
  }

  if (normalized.includes('oily')) {
    return { shine: 6, frizz: 3, dryness: 2, oiliness: 8, damage: 3 };
  }

  return { shine: 5, frizz: 4, dryness: 4, oiliness: 4, damage: 4 };
};

const getScoreFromScreening = (screening = null) => {
  if (!screening) return 0;
  const inferred = inferLevelsFromCondition(screening.detected_condition);
  const shine = clampLevel(screening.shine_level, inferred.shine);
  const frizz = clampLevel(screening.frizz_level, inferred.frizz);
  const dryness = clampLevel(screening.dryness_level, inferred.dryness);
  const oiliness = clampLevel(screening.oiliness_level, inferred.oiliness);
  const damage = clampLevel(screening.damage_level, inferred.damage);

  const positiveTotal = shine + (10 - frizz) + (10 - dryness) + (10 - oiliness) + (10 - damage);
  return Math.round((positiveTotal / 50) * 100);
};

const getLengthLabel = (screening = null) => {
  const cm = Number(screening?.estimated_length);
  if (!Number.isFinite(cm) || cm <= 0) return 'N/A';
  const inches = cm / 2.54;
  return `${inches.toFixed(1)}"`;
};

const getMoistureLabel = (screening = null) => {
  if (!screening) return 'Unknown';
  const inferred = inferLevelsFromCondition(screening.detected_condition);
  const dryness = clampLevel(screening.dryness_level, inferred.dryness);
  const oiliness = clampLevel(screening.oiliness_level, inferred.oiliness);
  const moistureBalance = 10 - Math.abs(dryness - oiliness);
  if (moistureBalance >= 7) return 'Balanced';
  if (moistureBalance >= 4) return 'Medium';
  return 'Low';
};

const buildMonthCells = (cursorDate, highlightedDateKeys = new Set(), selectedDateKey = '') => {
  const start = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - start.getDay());

  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(gridStart);
    current.setDate(gridStart.getDate() + index);
    const key = toLocalDateKey(current);
    cells.push({
      key,
      date: current,
      day: current.getDate(),
      isCurrentMonth: current.getMonth() === cursorDate.getMonth(),
      isToday: key === toLocalDateKey(new Date()),
      isSelected: key === selectedDateKey,
      hasLog: highlightedDateKeys.has(key),
    });
  }

  return cells;
};

const buildTrendSeries = (screenings = [], range = 'month') => {
  const now = new Date();

  if (range === 'week') {
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(now.getDate() - offset);
      days.push(date);
    }

    return days.map((dayDate) => {
      const dayStart = new Date(dayDate);
      const dayEnd = new Date(dayDate);
      dayEnd.setDate(dayDate.getDate() + 1);

      const dailyScores = screenings
        .filter((item) => {
          const ts = new Date(item.created_at || 0).getTime();
          return ts >= dayStart.getTime() && ts < dayEnd.getTime();
        })
        .map((item) => getScoreFromScreening(item));

      const avg = dailyScores.length
        ? Math.round(dailyScores.reduce((sum, value) => sum + value, 0) / dailyScores.length)
        : 0;

      return {
        key: toLocalDateKey(dayDate),
        label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(dayDate).slice(0, 1),
        score: avg,
        hasData: dailyScores.length > 0,
      };
    });
  }

  const months = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    months.push(new Date(now.getFullYear(), now.getMonth() - offset, 1));
  }

  return months.map((monthDate) => {
    const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1).getTime();
    const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).getTime();
    const monthlyScores = screenings
      .filter((item) => {
        const ts = new Date(item.created_at || 0).getTime();
        return ts >= monthStart && ts < monthEnd;
      })
      .map((item) => getScoreFromScreening(item));

    const avg = monthlyScores.length
      ? Math.round(monthlyScores.reduce((sum, value) => sum + value, 0) / monthlyScores.length)
      : 0;

    return {
      key: `${monthDate.getFullYear()}-${monthDate.getMonth()}`,
      label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monthDate),
      score: avg,
      hasData: monthlyScores.length > 0,
    };
  });
};

function HairAnalysisHomeModule() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [submissions, setSubmissions] = React.useState([]);
  const [monthCursor, setMonthCursor] = React.useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = React.useState('');
  const [trendRange, setTrendRange] = React.useState('month');
  const [logDetailDateKey, setLogDetailDateKey] = React.useState('');
  const [logDetailEntries, setLogDetailEntries] = React.useState([]);

  const { unreadCount } = useNotifications({
    role: 'donor',
    userId: user?.id,
    userEmail: user?.email || '',
    mode: 'badge',
    liveUpdates: true,
  });

  const profileCompletionMeta = React.useMemo(() => buildProfileCompletionMeta({
    photo_path: profile?.photo_path || profile?.avatar_url || '',
    first_name: profile?.first_name || '',
    last_name: profile?.last_name || '',
    birthdate: profile?.birthdate || '',
    gender: profile?.gender || '',
    contact_number: profile?.contact_number || profile?.phone || '',
    street: profile?.street || '',
    barangay: profile?.barangay || '',
    city: profile?.city || '',
    province: profile?.province || '',
    region: profile?.region || '',
    country: profile?.country || 'Philippines',
  }), [
    profile?.avatar_url,
    profile?.barangay,
    profile?.birthdate,
    profile?.city,
    profile?.contact_number,
    profile?.country,
    profile?.first_name,
    profile?.gender,
    profile?.last_name,
    profile?.phone,
    profile?.photo_path,
    profile?.province,
    profile?.region,
    profile?.street,
  ]);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!user?.id) {
        if (mounted) {
          setSubmissions([]);
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError('');
      const result = await fetchHairSubmissionsByUserId(user.id, 120);

      if (!mounted) return;

      if (result.error) {
        setError(result.error.message || 'Could not load hair analysis history.');
      }

      const normalized = Array.isArray(result.data) ? result.data : [];
      setSubmissions(normalized);
      setIsLoading(false);
    };

    load();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const screenings = React.useMemo(() => (
    submissions
      .flatMap((submission) => (submission.ai_screenings || []).map((screening) => ({
        ...screening,
        submission,
      })))
      .filter((item) => item.created_at)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
  ), [submissions]);

  const screeningsByDate = React.useMemo(() => {
    const grouped = new Map();
    screenings.forEach((entry) => {
      const key = toLocalDateKey(entry.created_at);
      if (!key) return;
      const current = grouped.get(key) || [];
      current.push(entry);
      grouped.set(key, current);
    });
    return grouped;
  }, [screenings]);

  React.useEffect(() => {
    if (selectedDateKey) return;

    const todayKey = toLocalDateKey(new Date());
    if (screeningsByDate.has(todayKey)) {
      setSelectedDateKey(todayKey);
      return;
    }

    const latest = screenings[0];
    if (latest?.created_at) {
      const latestKey = toLocalDateKey(latest.created_at);
      setSelectedDateKey(latestKey);
      setMonthCursor(new Date(latest.created_at));
    }
  }, [screenings, screeningsByDate, selectedDateKey]);

  const latestScreening = screenings[0] || null;
  const selectedDayScreening = (screeningsByDate.get(selectedDateKey) || [])[0] || latestScreening;
  const trendSeries = React.useMemo(() => buildTrendSeries(screenings, trendRange), [screenings, trendRange]);
  const trendAverage = React.useMemo(() => {
    const scored = trendSeries.filter((item) => item.hasData);
    if (!scored.length) return 0;
    return Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length);
  }, [trendSeries]);
  const trendRangeLabel = trendRange === 'week' ? 'Last 7 Days' : 'Last 6 Months';
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const isProfileComplete = profileCompletionMeta.isComplete;
  const isFirstHairCheck = screenings.length === 0;

  const highlightedDateKeys = React.useMemo(() => new Set(screenings.map((item) => toLocalDateKey(item.created_at))), [screenings]);
  const monthCells = React.useMemo(
    () => buildMonthCells(monthCursor, highlightedDateKeys, selectedDateKey),
    [highlightedDateKeys, monthCursor, selectedDateKey]
  );

  const todayCondition = selectedDayScreening?.detected_condition || latestScreening?.detected_condition || 'No result yet';
  const healthScore = getScoreFromScreening(selectedDayScreening || latestScreening);
  const lengthLabel = getLengthLabel(selectedDayScreening || latestScreening);
  const textureLabel = selectedDayScreening?.detected_texture || latestScreening?.detected_texture || 'N/A';
  const scalpLabel = todayCondition || 'N/A';
  const moistureLabel = getMoistureLabel(selectedDayScreening || latestScreening);

  const handleBack = () => {
    if (router.canGoBack?.()) {
      router.back();
      return;
    }
    router.replace('/donor/home');
  };

  const handleStartAnalysis = () => {
    router.push('/donor/donations?mode=scan');
  };

  const handlePrimaryAction = () => {
    if (!isProfileComplete) {
      router.navigate('/profile');
      return;
    }

    handleStartAnalysis();
  };

  const handleNavPress = (item) => {
    if (!item?.route) return;
    router.replace(item.route);
  };

  const openLogDetailsForDate = (dateKey) => {
    const entries = screeningsByDate.get(dateKey) || [];
    if (!entries.length) return;
    setLogDetailDateKey(dateKey);
    setLogDetailEntries(entries.map((entry) => ({
      screening: entry,
      submission: entry.submission,
      recommendations: entry.submission?.recommendations || [],
      images: (entry.submission?.submission_details || []).flatMap((detail) => detail.images || []),
    })));
  };

  const closeLogDetails = () => {
    setLogDetailDateKey('');
    setLogDetailEntries([]);
  };

  const header = (
    <View style={[styles.headerRow, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}>
      <Pressable onPress={handleBack} style={[styles.iconBtn, { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground }]}>
        <AppIcon name="arrow-left" color={roles.headingText} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: roles.headingText }]}>{brandName}</Text>
      <Pressable
        onPress={() => router.push('/donor/notifications')}
        style={[styles.iconBtn, { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground }]}
      >
        <AppIcon name="notifications" color={roles.headingText} />
        {unreadCount > 0 ? (
          <View style={[styles.badge, { backgroundColor: roles.primaryActionBackground }]}>
            <Text style={[styles.badgeText, { color: roles.primaryActionText }]}>{Math.min(unreadCount, 99)}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );

  if (isLoading) {
    return (
      <DashboardLayout
        header={header}
        navItems={donorDashboardNavItems}
        activeNavKey="checkhair"
        onNavPress={handleNavPress}
        navVariant="donor"
        screenVariant="default"
        showSupportChat={false}
      >
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={roles.primaryActionBackground} />
          <Text style={[styles.centerStateText, { color: roles.bodyText }]}>Loading hair analysis...</Text>
        </View>
      </DashboardLayout>
    );
  }

  const primaryActionTitle = !isProfileComplete
    ? 'Complete Profile First'
    : isFirstHairCheck
      ? 'Start First Hair Check'
      : 'Start Hair Analysis';
  const primaryActionIcon = !isProfileComplete ? 'profile' : 'camera';
  const overlayTitle = !isProfileComplete
    ? 'Complete your account first'
    : 'Ready for your first check?';
  const overlayMessage = !isProfileComplete
    ? 'Finish your donor profile before starting your first hair check.'
    : "Start your hair health journey with a quick analysis of your hair's current condition.";
  const overlayIcon = !isProfileComplete ? 'account-alert-outline' : 'chart-line';

  return (
    <DashboardLayout
      header={header}
      navItems={donorDashboardNavItems}
      activeNavKey="checkhair"
      onNavPress={handleNavPress}
      navVariant="donor"
      screenVariant="default"
      showSupportChat={false}
    >
      <View style={styles.container}>
        <View style={styles.titleBlock}>
          <Text style={[styles.displayTitle, { color: roles.headingText }]}>Hair Analysis</Text>
          <Text style={[styles.subtitle, { color: roles.bodyText }]}>
            Track your hair growth and health progress for your upcoming donation.
          </Text>
        </View>

        {error ? (
          <View style={[styles.errorCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}>
            <Text style={[styles.errorText, { color: roles.bodyText }]}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.topGrid}>
          <View style={[styles.card, styles.calendarCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardTitle, { color: roles.headingText }]}>My Hair Log</Text>
              <View style={styles.monthControl}>
                <Pressable
                  onPress={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  style={[styles.monthArrow, { backgroundColor: roles.pageBackground }]}
                >
                  <AppIcon name="chevron-left" color={roles.headingText} />
                </Pressable>
                <Text style={[styles.monthLabel, { color: roles.bodyText }]}>{getMonthLabel(monthCursor)}</Text>
                <Pressable
                  onPress={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  style={[styles.monthArrow, { backgroundColor: roles.pageBackground }]}
                >
                  <AppIcon name="chevron-right" color={roles.headingText} />
                </Pressable>
              </View>
            </View>

            <View style={styles.weekHeaderRow}>
              {WEEKDAY_LABELS.map((label, index) => (
                <Text key={`weekday-${index}-${label}`} style={[styles.weekdayLabel, { color: roles.metaText }]}>{label}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {monthCells.map((cell) => (
                <Pressable
                  key={cell.key}
                  onPress={() => {
                    setSelectedDateKey(cell.key);
                    setMonthCursor(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                    if (cell.hasLog) {
                      openLogDetailsForDate(cell.key);
                    }
                  }}
                  style={[
                    styles.dayCell,
                    cell.isSelected ? { backgroundColor: roles.primaryActionBackground } : null,
                    !cell.isCurrentMonth ? styles.dayCellMuted : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: cell.isSelected ? roles.primaryActionText : roles.headingText },
                      !cell.isCurrentMonth ? { color: roles.metaText } : null,
                    ]}
                  >
                    {cell.day}
                  </Text>
                  {cell.hasLog ? (
                    <View
                      style={[
                        styles.dayDot,
                        {
                          backgroundColor: cell.isSelected ? roles.primaryActionText : roles.primaryActionBackground,
                        },
                      ]}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={[styles.card, styles.conditionCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}>
              <Text style={[styles.cardTitle, { color: roles.headingText }]}>Current Condition</Text>
              <View style={styles.healthRow}>
                <View style={[styles.scoreCircle, { borderColor: roles.primaryActionBackground }]}>
                  <Text style={[styles.scoreValue, { color: roles.primaryActionBackground }]}>{healthScore}</Text>
                </View>
                <View style={styles.healthMeta}>
                  <Text style={[styles.healthMetaLabel, { color: roles.metaText }]}>Health Score</Text>
                  <Text style={[styles.healthMetaValue, { color: roles.primaryActionBackground }]} numberOfLines={1}>
                    {todayCondition}
                  </Text>
                  <Text style={[styles.healthMetaRange, { color: roles.bodyText }]}>
                    Week {getWeekRangeLabel(new Date())}
                  </Text>
                </View>
              </View>
              <View style={styles.metricsGrid}>
                <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                  <Text style={[styles.metricKey, { color: roles.metaText }]}>Length</Text>
                  <Text style={[styles.metricValue, { color: roles.headingText }]}>{lengthLabel}</Text>
                </View>
                <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                  <Text style={[styles.metricKey, { color: roles.metaText }]}>Texture</Text>
                  <Text style={[styles.metricValue, { color: roles.headingText }]}>{textureLabel}</Text>
                </View>
                <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                  <Text style={[styles.metricKey, { color: roles.metaText }]}>Scalp</Text>
                  <Text numberOfLines={1} style={[styles.metricValue, { color: roles.headingText }]}>{scalpLabel}</Text>
                </View>
                <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                  <Text style={[styles.metricKey, { color: roles.metaText }]}>Moisture</Text>
                  <Text style={[styles.metricValue, { color: roles.headingText }]}>{moistureLabel}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.trendCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}>
          <View style={styles.trendHeader}>
            <View style={styles.trendTitleBlock}>
              <Text style={[styles.cardTitle, { color: roles.headingText }]}>Health Trend</Text>
              <Text style={[styles.trendSubtitle, { color: roles.metaText }]}>{trendRangeLabel}</Text>
            </View>
            <View style={[styles.trendFilter, { backgroundColor: roles.pageBackground }]}>
              {['week', 'month'].map((range) => {
                const isActive = trendRange === range;
                return (
                  <Pressable
                    key={range}
                    onPress={() => setTrendRange(range)}
                    style={[
                      styles.trendFilterOption,
                      isActive ? { backgroundColor: roles.primaryActionBackground } : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.trendFilterText,
                        { color: isActive ? roles.primaryActionText : roles.bodyText },
                      ]}
                    >
                      {range === 'week' ? 'Week' : 'Month'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={[styles.trendSummaryRow, { borderColor: roles.defaultCardBorder }]}>
            <Text style={[styles.trendSummaryLabel, { color: roles.metaText }]}>Average score</Text>
            <Text style={[styles.trendSummaryValue, { color: roles.primaryActionBackground }]}>
              {trendAverage || '--'}
              <Text style={[styles.trendSummaryUnit, { color: roles.metaText }]}>/100</Text>
            </Text>
          </View>

          <View style={styles.areaChartWrap}>
            <View style={styles.areaYAxis}>
              {[100, 50, 0].map((label) => (
                <Text key={label} style={[styles.areaAxisLabel, { color: roles.metaText }]}>{label}</Text>
              ))}
            </View>
            <View style={styles.areaChartBody}>
              <View style={styles.areaGrid}>
                {[0, 1, 2].map((line) => (
                  <View key={line} style={[styles.areaGridLine, { backgroundColor: roles.defaultCardBorder }]} />
                ))}
              </View>
              <View style={styles.areaColumns}>
                {trendSeries.map((item) => {
                  const heightPercent = Math.max(item.hasData ? item.score : 0, item.hasData ? 8 : 2);
                  return (
                    <View key={item.key} style={styles.areaColumn}>
                      <View style={styles.areaColumnInner}>
                        <View
                          style={[
                            styles.areaFill,
                            {
                              height: `${heightPercent}%`,
                              backgroundColor: item.hasData ? `${roles.primaryActionBackground}28` : roles.pageBackground,
                              borderTopColor: item.hasData ? roles.primaryActionBackground : roles.defaultCardBorder,
                            },
                          ]}
                        >
                          {item.hasData ? (
                            <View style={[styles.areaPoint, { backgroundColor: roles.primaryActionBackground }]} />
                          ) : null}
                        </View>
                      </View>
                      <Text style={[styles.trendLabel, { color: roles.metaText }]}>{item.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        <AppButton
          title={primaryActionTitle}
          onPress={handlePrimaryAction}
          leading={<AppIcon name={primaryActionIcon} state="inverse" />}
          style={styles.ctaButton}
          fullWidth
        />
      </View>

      {isFirstHairCheck ? (
        <Modal transparent animationType="fade" visible>
          <View style={styles.firstTimeOverlay}>
            <View style={[styles.firstTimeCard, { backgroundColor: roles.defaultCardBackground }]}>
              <View style={[styles.firstTimeIconWrap, { backgroundColor: roles.pageBackground }]}>
                <AppIcon name={overlayIcon} color={roles.primaryActionBackground} size="xl" />
              </View>
              <Text style={[styles.firstTimeTitle, { color: roles.headingText }]}>{overlayTitle}</Text>
              <Text style={[styles.firstTimeMessage, { color: roles.bodyText }]}>{overlayMessage}</Text>
              {!isProfileComplete && profileCompletionMeta.missingFieldLabels?.length ? (
                <Text style={[styles.firstTimeHint, { color: roles.metaText }]} numberOfLines={2}>
                  Missing: {profileCompletionMeta.missingFieldLabels.slice(0, 4).join(', ')}
                  {profileCompletionMeta.missingFieldLabels.length > 4 ? '...' : ''}
                </Text>
              ) : null}
              <AppButton
                title={primaryActionTitle}
                onPress={handlePrimaryAction}
                leading={<AppIcon name={primaryActionIcon} state="inverse" />}
                fullWidth
              />
            </View>
          </View>
        </Modal>
      ) : null}

      <HairLogDetailModal
        visible={Boolean(logDetailDateKey && logDetailEntries.length)}
        dateKey={logDetailDateKey}
        entries={logDetailEntries}
        onClose={closeLogDetails}
      />
    </DashboardLayout>
  );
}

export default function DonorDonationsScreen() {
  const params = useLocalSearchParams();
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;

  if (mode === 'scan') {
    return <DonorHairSubmissionScreen />;
  }

  return <HairAnalysisHomeModule />;
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  headerRow: {
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -1,
    minWidth: 16,
    height: 16,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
  },
  titleBlock: {
    gap: theme.spacing.xs,
  },
  displayTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 30,
    fontWeight: theme.typography.weights.bold,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: 22,
  },
  topGrid: {
    gap: theme.spacing.md,
  },
  rightColumn: {
    gap: theme.spacing.md,
  },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  calendarCard: {
    gap: theme.spacing.sm,
  },
  conditionCard: {
    gap: theme.spacing.sm,
  },
  trendCard: {
    gap: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  cardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  monthControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  monthArrow: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: {
    minWidth: 120,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'space-between',
  },
  dayCell: {
    width: '13.5%',
    aspectRatio: 1,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellMuted: {
    opacity: 0.5,
  },
  dayText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: theme.typography.weights.medium,
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: theme.radius.full,
    position: 'absolute',
    bottom: 4,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  scoreCircle: {
    width: 78,
    height: 78,
    borderRadius: theme.radius.full,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 24,
    fontWeight: theme.typography.weights.bold,
  },
  healthMeta: {
    flex: 1,
    gap: 2,
  },
  healthMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
  },
  healthMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'capitalize',
  },
  healthMetaRange: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  metricItem: {
    width: '48%',
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: 2,
  },
  metricKey: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
  },
  metricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  trendTitleBlock: {
    flex: 1,
    gap: 2,
  },
  trendSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
  },
  trendFilter: {
    flexDirection: 'row',
    borderRadius: theme.radius.full,
    padding: 4,
    gap: 4,
  },
  trendFilterOption: {
    minWidth: 64,
    minHeight: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  trendFilterText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
  },
  trendSummaryRow: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trendSummaryLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.medium,
  },
  trendSummaryValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 22,
    fontWeight: theme.typography.weights.bold,
  },
  trendSummaryUnit: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.medium,
  },
  areaChartWrap: {
    flexDirection: 'row',
    minHeight: 188,
    gap: theme.spacing.xs,
  },
  areaYAxis: {
    width: 28,
    height: 150,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  areaAxisLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
  },
  areaChartBody: {
    flex: 1,
    height: 176,
    position: 'relative',
  },
  areaGrid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    justifyContent: 'space-between',
  },
  areaGridLine: {
    height: 1,
    opacity: 0.7,
  },
  areaColumns: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 176,
  },
  areaColumn: {
    flex: 1,
    height: 176,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  areaColumnInner: {
    width: '100%',
    height: 150,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  areaFill: {
    width: '100%',
    minHeight: 4,
    borderTopWidth: 3,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  areaPoint: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    marginTop: -6,
  },
  trendLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.medium,
  },
  ctaButton: {
    marginTop: theme.spacing.xs,
  },
  centerState: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  centerStateText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
  },
  errorText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  firstTimeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(21, 28, 39, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  firstTimeCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.lg,
  },
  firstTimeIconWrap: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  firstTimeTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  firstTimeMessage: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  firstTimeHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: -theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
});
