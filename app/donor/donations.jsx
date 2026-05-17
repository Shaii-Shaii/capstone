import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DonorHairSubmissionScreen } from '../../src/components/layout/DonorHairSubmissionScreen';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { HairLogDetailModal } from '../../src/components/hair/HairLogDetailModal';
import { DonorTopBar } from '../../src/components/donor/DonorTopBar';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchHairSubmissionsByUserId } from '../../src/features/hairSubmission.api';
import { buildProfileCompletionMeta } from '../../src/features/profile/services/profile.service';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

let cachedHairAnalysisHomeData = null;
let cachedHairAnalysisHomeUserId = '';
const HAIR_CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getInitials = (value = '') => (
  String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'D'
);

const toLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

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

const formatRecentLogDate = (value) => {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
};

const getScreeningRecommendations = (entry = null) => (
  Array.isArray(entry?.submission?.donor_recommendations)
    ? entry.submission.donor_recommendations
    : Array.isArray(entry?.submission?.recommendations)
      ? entry.submission.recommendations
      : []
).filter((recommendation) => String(recommendation?.recommendation_text || '').trim());

const cleanRecommendationText = (value = '') => (
  String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/Philippine product options? to consider:.*?(?:\.|$)/gi, '')
    .replace(/\b(Dove|Cream Silk|Human Nature|Vitress|Pantene(?:\s+Pro-V)?|Watsons|Lazada(?:\.ph)?|Shopee(?:\.ph)?)\b/gi, 'a suitable product type')
    .trim()
);

const hasNegatedCareConcern = (text = '') => (
  /\b(no|not|without)\s+(?:visible\s+|significant\s+|major\s+)?(?:damage|dryness|frizz|breakage|split\s+ends?|issues?)\b/i.test(text)
  || /\bno\s+significant\s+damage\s+or\s+issues\b/i.test(text)
  || /\bsealed\s+ends?\b/i.test(text)
);

const hasExplicitCareConcern = (text = '') => {
  const normalized = String(text || '').toLowerCase();
  const negated = hasNegatedCareConcern(normalized);
  if (/(split\s+ends?|split\s+tips?|breakage|brittle|fray(?:ed|ing)|frizz|flyaways|oily|greasy|stressed\s+ends)/i.test(normalized)) {
    return true;
  }
  return /(dry|dull|damage|damaged|needs care|not eligible|improve)/i.test(normalized) && !negated;
};

const screeningNeedsImprovement = (screening = null) => {
  if (!screening) return false;
  const combined = [
    screening.decision,
    screening.detected_condition,
    screening.visible_damage_notes,
    screening.summary,
  ].filter(Boolean).join(' ');
  return (
    hasExplicitCareConcern(combined)
    || getScoreFromScreening(screening) < 70
  );
};

const compactText = (value = '', limit = 140) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 3).trimEnd()}...`;
};

const getMonthLabel = (date) => (
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)
);

const buildHairCalendarCells = (cursorDate, markedDateKeys = new Set(), selectedDateKey = '') => {
  const monthStart = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = toLocalDateKey(date);
    return {
      key,
      date,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === cursorDate.getMonth(),
      isToday: key === toLocalDateKey(new Date()),
      isSelected: key === selectedDateKey,
      hasLog: markedDateKeys.has(key),
    };
  });
};

function HairAnalysisHomeModule() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const cacheMatchesUser = Boolean(cachedHairAnalysisHomeData && cachedHairAnalysisHomeUserId === user?.id);
  const cachedHome = cacheMatchesUser ? cachedHairAnalysisHomeData : null;
  const submissionsRef = React.useRef(cachedHome?.submissions || []);
  const [isLoading, setIsLoading] = React.useState(!cacheMatchesUser);
  const [error, setError] = React.useState('');
  const [submissions, setSubmissions] = React.useState(cachedHome?.submissions || []);
  const [logDetailDateKey, setLogDetailDateKey] = React.useState('');
  const [logDetailEntries, setLogDetailEntries] = React.useState([]);
  const [calendarMonth, setCalendarMonth] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = React.useState(() => toLocalDateKey(new Date()));

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

      if (!submissionsRef.current.length) {
        setIsLoading(true);
      }
      setError('');
      const result = await fetchHairSubmissionsByUserId(user.id, 120);

      if (!mounted) return;

      if (result.error) {
        setError(result.error.message || 'Could not load hair analysis history.');
      }

      const normalized = Array.isArray(result.data) ? result.data : [];
      cachedHairAnalysisHomeData = { submissions: normalized };
      cachedHairAnalysisHomeUserId = user.id;
      submissionsRef.current = normalized;
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

  const latestScreening = screenings[0] || null;
  const recentLogs = React.useMemo(() => screenings.slice(0, 5), [screenings]);
  const screeningsByDate = React.useMemo(() => {
    const grouped = new Map();
    screenings.forEach((entry) => {
      const key = toLocalDateKey(entry.created_at);
      if (!key) return;
      const rows = grouped.get(key) || [];
      rows.push(entry);
      grouped.set(key, rows);
    });
    return grouped;
  }, [screenings]);
  const calendarDateKeys = React.useMemo(() => new Set(screeningsByDate.keys()), [screeningsByDate]);
  const calendarCells = React.useMemo(
    () => buildHairCalendarCells(calendarMonth, calendarDateKeys, selectedCalendarDateKey),
    [calendarDateKeys, calendarMonth, selectedCalendarDateKey]
  );
  const calendarRows = React.useMemo(() => {
    const rows = [];
    for (let index = 0; index < calendarCells.length; index += 7) {
      rows.push(calendarCells.slice(index, index + 7));
    }
    return rows;
  }, [calendarCells]);
  const selectedDateLogs = screeningsByDate.get(selectedCalendarDateKey) || [];
  const selectedDateLatestLog = selectedDateLogs[0] || null;
  const latestRecommendations = React.useMemo(
    () => getScreeningRecommendations(latestScreening).slice(0, 3),
    [latestScreening]
  );
  const latestNeedsImprovement = screeningNeedsImprovement(latestScreening);
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const isProfileComplete = profileCompletionMeta.isComplete;
  const isFirstHairCheck = screenings.length === 0;

  const todayCondition = latestScreening?.detected_condition || 'No result yet';
  const healthScore = getScoreFromScreening(latestScreening);
  const lengthLabel = getLengthLabel(latestScreening);
  const textureLabel = latestScreening?.detected_texture || 'N/A';
  const scalpLabel = todayCondition || 'N/A';
  const moistureLabel = getMoistureLabel(latestScreening);

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

  const openLogDetailsForEntry = (entry) => {
    if (!entry?.created_at) return;
    setLogDetailDateKey(toLocalDateKey(entry.created_at));
    setLogDetailEntries([{
      screening: entry,
      submission: entry.submission,
      recommendations: getScreeningRecommendations(entry),
      images: (entry.submission?.submission_details || []).flatMap((detail) => detail.images || []),
    }]);
  };

  const closeLogDetails = () => {
    setLogDetailDateKey('');
    setLogDetailEntries([]);
  };

  const avatarInitials = getInitials(`${profile?.first_name || ''} ${profile?.last_name || ''}`);

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
      header={(
        <DonorTopBar
          title={brandName}
          subtitle="Hair Analysis"
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url || profile?.photo_path || ''}
          unreadCount={unreadCount}
          onNotificationsPress={() => router.push('/donor/notifications')}
          onProfilePress={() => router.navigate('/profile')}
        />
      )}
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
        {isLoading ? (
          <StatusBanner
            variant="info"
            message="Refreshing hair analysis in the background."
            presentation="floating"
            visible={isLoading}
            autoDismissMs={3000}
          />
        ) : null}

        <View style={[styles.card, styles.calendarCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}>
          <View style={styles.calendarHeader}>
            <Pressable
              onPress={() => setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))}
              style={[styles.calendarNavButton, { backgroundColor: roles.pageBackground }]}
            >
              <AppIcon name="chevron-left" color={roles.headingText} />
            </Pressable>
            <View style={styles.calendarHeaderCopy}>
              <Text style={[styles.cardTitle, { color: roles.headingText }]}>{getMonthLabel(calendarMonth)}</Text>
              <Text style={[styles.cardSubtitle, { color: roles.metaText }]}>
                {selectedDateLogs.length
                  ? `${selectedDateLogs.length} log${selectedDateLogs.length === 1 ? '' : 's'} selected`
                  : `${calendarDateKeys.size} logged day${calendarDateKeys.size === 1 ? '' : 's'}`}
              </Text>
            </View>
            <Pressable
              onPress={() => setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))}
              style={[styles.calendarNavButton, { backgroundColor: roles.pageBackground }]}
            >
              <AppIcon name="chevron-right" color={roles.headingText} />
            </Pressable>
          </View>

          <View style={styles.calendarWeekdayRow}>
            {HAIR_CALENDAR_WEEKDAYS.map((label) => (
              <Text key={`hair-calendar-weekday-${label}`} style={[styles.calendarWeekdayText, { color: roles.metaText }]}>
                {label}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {calendarRows.map((row, rowIndex) => (
              <View key={`hair-calendar-row-${rowIndex}`} style={styles.calendarRow}>
                {row.map((cell) => (
                  <Pressable
                    key={cell.key}
                    onPress={() => {
                      setSelectedCalendarDateKey(cell.key);
                      if (!cell.isCurrentMonth) {
                        setCalendarMonth(new Date(cell.date.getFullYear(), cell.date.getMonth(), 1));
                      }
                      const logs = screeningsByDate.get(cell.key) || [];
                      if (logs[0]) {
                        openLogDetailsForEntry(logs[0]);
                      }
                    }}
                    style={[
                      styles.calendarDay,
                      { borderColor: cell.isSelected ? roles.primaryActionBackground : roles.defaultCardBorder },
                      cell.isSelected ? { backgroundColor: roles.primaryActionBackground } : { backgroundColor: roles.pageBackground },
                      !cell.isCurrentMonth ? styles.calendarDayMuted : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDayText,
                        { color: cell.isSelected ? roles.primaryActionText : roles.headingText },
                        !cell.isCurrentMonth && !cell.isSelected ? { color: roles.metaText } : null,
                      ]}
                    >
                      {cell.day}
                    </Text>
                    {cell.hasLog ? (
                      <View style={[styles.calendarDot, { backgroundColor: cell.isSelected ? roles.primaryActionText : roles.primaryActionBackground }]} />
                    ) : cell.isToday ? (
                      <View style={[styles.calendarTodayDot, { borderColor: roles.primaryActionBackground }]} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>

          <View style={[styles.calendarSelectedPanel, { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder }]}>
            <View style={styles.calendarSelectedCopy}>
              <Text style={[styles.calendarSelectedTitle, { color: roles.headingText }]}>
                {selectedDateLatestLog ? selectedDateLatestLog.detected_condition || 'Hair check' : 'No log selected'}
              </Text>
              <Text style={[styles.calendarSelectedText, { color: roles.bodyText }]}>
                {selectedDateLatestLog
                  ? compactText(selectedDateLatestLog.summary || selectedDateLatestLog.decision || 'Tap a marked date to view the saved AI scan.', 120)
                  : 'Marked dates contain saved hair analysis logs.'}
              </Text>
            </View>
            {selectedDateLatestLog ? (
              <Pressable
                onPress={() => openLogDetailsForEntry(selectedDateLatestLog)}
                style={[styles.calendarViewButton, { backgroundColor: roles.iconPrimarySurface }]}
              >
                <Text style={[styles.calendarViewButtonText, { color: roles.iconPrimaryColor }]}>View</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={styles.topGrid}>
          <View style={[styles.card, styles.recentLogCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground }]}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={[styles.cardTitle, { color: roles.headingText }]}>Recent Hair Log</Text>
                <Text style={[styles.cardSubtitle, { color: roles.metaText }]}>Latest AI scan results and next steps</Text>
              </View>
              <View style={[styles.logCountPill, { backgroundColor: roles.pageBackground }]}>
                <Text style={[styles.logCountText, { color: roles.bodyText }]}>{screenings.length} logs</Text>
              </View>
            </View>

            {latestScreening && latestNeedsImprovement ? (
              <View style={[styles.improvementPanel, { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder }]}>
                <View style={styles.improvementHeader}>
                  <View style={[styles.improvementIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                    <AppIcon name="sparkle" color={roles.iconPrimaryColor} />
                  </View>
                  <View style={styles.improvementCopy}>
                    <Text style={[styles.improvementTitle, { color: roles.headingText }]}>Focus for improvement</Text>
                    <Text style={[styles.improvementBody, { color: roles.bodyText }]}>
                      Your latest result needs care. Follow the AI recommendation below before your next scan.
                    </Text>
                  </View>
                </View>
                {latestRecommendations.length ? (
                  <View style={styles.recommendationPreviewList}>
                    {latestRecommendations.slice(0, 2).map((recommendation, index) => (
                      <View key={recommendation.recommendation_id || `${recommendation.title}-${index}`} style={styles.recommendationPreviewItem}>
                        <Text style={[styles.recommendationPreviewTitle, { color: roles.headingText }]}>
                          {recommendation.title || `Recommendation ${index + 1}`}
                        </Text>
                        <Text style={[styles.recommendationPreviewText, { color: roles.bodyText }]}>
                          {compactText(cleanRecommendationText(recommendation.recommendation_text), 170)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.improvementBody, { color: roles.bodyText }]}>
                    Keep your hair clean, loose, and protected from heat or harsh chemical processing, then scan again for a clearer comparison.
                  </Text>
                )}
              </View>
            ) : null}

            <View style={styles.recentLogList}>
              {recentLogs.length ? recentLogs.map((entry, index) => {
                const score = getScoreFromScreening(entry);
                const needsImprovement = screeningNeedsImprovement(entry);
                const recommendations = getScreeningRecommendations(entry);
                const primaryRecommendation = recommendations[0] || null;

                return (
                  <Pressable
                    key={entry.ai_screening_id || entry.created_at || index}
                    onPress={() => openLogDetailsForEntry(entry)}
                    style={[
                      styles.recentLogItem,
                      { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground },
                    ]}
                  >
                    <View style={styles.recentLogMain}>
                      <View style={styles.recentLogTopRow}>
                        <Text style={[styles.recentLogDate, { color: roles.metaText }]}>
                          {formatRecentLogDate(entry.created_at)}
                        </Text>
                        <View
                          style={[
                            styles.recentLogStatus,
                            {
                              backgroundColor: needsImprovement ? '#F8E4D2' : '#E3F3E5',
                            },
                          ]}
                        >
                          <Text style={[styles.recentLogStatusText, { color: needsImprovement ? '#9A5B21' : '#2D6F3E' }]}>
                            {needsImprovement ? 'Needs care' : 'Good'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.recentLogCondition, { color: roles.headingText }]}>
                        {entry.detected_condition || entry.decision || 'Hair check'}
                      </Text>
                      {needsImprovement && primaryRecommendation?.recommendation_text ? (
                        <Text style={[styles.recentLogRecommendation, { color: roles.bodyText }]}>
                          Do this: {compactText(cleanRecommendationText(primaryRecommendation.recommendation_text), 130)}
                        </Text>
                      ) : (
                        <Text style={[styles.recentLogRecommendation, { color: roles.bodyText }]}>
                          {entry.summary ? compactText(entry.summary, 130) : 'Tap to review this saved AI scan.'}
                        </Text>
                      )}
                    </View>
                    <View style={styles.recentLogScoreWrap}>
                      <Text style={[styles.recentLogScore, { color: roles.primaryActionBackground }]}>{score || '--'}</Text>
                      <Text style={[styles.recentLogScoreLabel, { color: roles.metaText }]}>score</Text>
                    </View>
                  </Pressable>
                );
              }) : (
                <Pressable
                  onPress={handlePrimaryAction}
                  style={[styles.emptyLogState, { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground }]}
                >
                  <AppIcon name="camera" color={roles.primaryActionBackground} size="lg" />
                  <View style={styles.emptyLogCopy}>
                    <Text style={[styles.emptyLogTitle, { color: roles.headingText }]}>No recent logs yet</Text>
                    <Text style={[styles.emptyLogBody, { color: roles.bodyText }]}>Start your first hair check to get AI recommendations.</Text>
                  </View>
                </Pressable>
              )}
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

        <AppButton
          title={primaryActionTitle}
          onPress={handlePrimaryAction}
          leading={<AppIcon name={primaryActionIcon} state="inverse" />}
          style={styles.ctaButton}
          fullWidth
        />
      </View>

      {isFirstHairCheck && !isLoading ? (
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
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  calendarHeaderCopy: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  calendarNavButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarWeekdayRow: {
    flexDirection: 'row',
    gap: 5,
  },
  calendarWeekdayText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  calendarGrid: {
    gap: 5,
  },
  calendarRow: {
    flexDirection: 'row',
    gap: 5,
  },
  calendarDay: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  calendarDayMuted: {
    opacity: 0.46,
  },
  calendarDayText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  calendarTodayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
  },
  calendarSelectedPanel: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  calendarSelectedCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  calendarSelectedTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'capitalize',
  },
  calendarSelectedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  calendarViewButton: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
  },
  calendarViewButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
  },
  recentLogCard: {
    gap: theme.spacing.sm,
  },
  conditionCard: {
    gap: theme.spacing.sm,
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
  cardSubtitle: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
  },
  logCountPill: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  logCountText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
  },
  improvementPanel: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  improvementHeader: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  improvementIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  improvementCopy: {
    flex: 1,
    gap: 2,
  },
  improvementTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  improvementBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  recommendationPreviewList: {
    gap: theme.spacing.xs,
  },
  recommendationPreviewItem: {
    gap: 2,
  },
  recommendationPreviewTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
  },
  recommendationPreviewText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  recentLogList: {
    gap: theme.spacing.xs,
  },
  recentLogItem: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  recentLogMain: {
    flex: 1,
    gap: 4,
  },
  recentLogTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  recentLogDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  recentLogStatus: {
    borderRadius: theme.radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recentLogStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  recentLogCondition: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'capitalize',
  },
  recentLogRecommendation: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  recentLogScoreWrap: {
    width: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentLogScore: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 20,
    fontWeight: theme.typography.weights.bold,
  },
  recentLogScoreLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
  },
  emptyLogState: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyLogCopy: {
    flex: 1,
    gap: 2,
  },
  emptyLogTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  emptyLogBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
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
