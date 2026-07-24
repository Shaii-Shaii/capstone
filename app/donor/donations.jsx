import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppCard } from '../../src/components/ui/AppCard';
import { LatestHairLogResultCard } from '../../src/components/donor/LatestHairLogResultCard';
import { DonorHairSubmissionScreen } from '../../src/components/layout/DonorHairSubmissionScreen';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { HairLogDetailModal } from '../../src/components/hair/HairLogDetailModal';
import { DonorTopBar } from '../../src/components/donor/DonorTopBar';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { GradientActionButton } from '../../src/components/ui/GradientActionButton';
import { EmptyDataState } from '../../src/components/ui/EmptyDataState';
import { SectionTitleRow } from '../../src/components/ui/SectionTitleRow';
import { DonivraLoadingOverlay } from '../../src/components/ui/DonivraLoadingOverlay';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import { fetchHairSubmissionsByUserId } from '../../src/features/hairSubmission.api';
import { buildProfileCompletionMeta } from '../../src/features/profile/services/profile.service';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveThemeRoles, theme } from '../../src/design-system/theme';

let cachedHairAnalysisHomeData = null;
let cachedHairAnalysisHomeUserId = '';
const HAIR_CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ANALYSIS_FAB_SIZE = 48;
const ANALYSIS_FAB_EDGE_PADDING = 12;
const ANALYSIS_FAB_BOTTOM_PADDING = 112;

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

const WEEKLY_SCAN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const getScreeningRecommendations = (entry = null) => (
  Array.isArray(entry?.submission?.donor_recommendations)
    ? entry.submission.donor_recommendations
    : Array.isArray(entry?.submission?.recommendations)
      ? entry.submission.recommendations
      : []
).filter((recommendation) => String(recommendation?.recommendation_text || '').trim());

const CARE_SAFETY_NOTE = 'If you have allergies, scalp irritation, or sensitivity, consult a qualified hair or scalp care professional before trying new ingredients.';

const cleanRecommendationText = (value = '') => {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/Philippine product options? to consider:.*?(?:\.|$)/gi, '')
    .replace(/(?:neutral care|generic|local|country)?\s*product options? to consider:.*?(?:\.|$)/gi, '')
    .replace(/\bPhilippine(?:s)?\b/gi, '')
    .replace(/\b(?:country|locally|local)\s+(?:product|care)\s+options?\b/gi, '')
    .replace(/\b[A-Z][a-z]+(?:n|ian|ese|ish|i)\s+(?:product|brand|care)\s+options?\b/g, '')
    .replace(/Ingredient or product-type options to consider:.*?(?:\.|$)/gi, '')
    .replace(/\b(Dove|Cream Silk|Human Nature|Vitress|Pantene(?:\s+Pro-V)?|Watsons|Lazada(?:\.ph)?|Shopee(?:\.ph)?)\b/gi, 'a suitable product type')
    .trim();

  if (/ingredients that may help/i.test(text) && !/consult a qualified hair or scalp care professional/i.test(text)) {
    return `${text} ${CARE_SAFETY_NOTE}`;
  }
  return text;
};

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

function HairConditionSummaryCard({ entry, onPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!entry) return null;

  const score = getScoreFromScreening(entry);
  const needsImprovement = screeningNeedsImprovement(entry);
  const conditionLabel = entry.decision || entry.detected_condition || 'Hair check';
  const statusLabel = needsImprovement ? 'Needs care' : 'Good result';
  const statusColor = needsImprovement ? '#d89258' : '#65b96f';
  const previewText = entry.summary
    ? compactText(entry.summary, 150)
    : compactText(entry.decision || 'Tap to open full submission details.', 150);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open hair check details for ${formatRecentLogDate(entry.created_at)}`}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.cardPressed : null]}
    >
      <AppCard
        variant="default"
        radius="xl"
        padding="md"
        style={[
          styles.hairConditionCard,
          {
            borderColor: roles.defaultCardBorder,
            backgroundColor: roles.pageBackground,
          },
        ]}
      >
        <View style={styles.hairConditionHeader}>
          <View style={styles.hairConditionHeaderCopy}>
            <Text style={[styles.hairConditionEyebrow, { color: roles.metaText }]}>
              Hair Condition of the Checking
            </Text>
            <Text style={[styles.hairConditionDate, { color: roles.metaText }]}>
              {formatRecentLogDate(entry.created_at)}
            </Text>
          </View>
          <View style={[styles.hairConditionStatus, { backgroundColor: `${statusColor}20` }]}>
            <Text style={[styles.hairConditionStatusText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <Text style={[styles.hairConditionTitle, { color: roles.headingText }]} numberOfLines={2}>
          {conditionLabel}
        </Text>

        <Text style={[styles.hairConditionSummary, { color: roles.bodyText }]} numberOfLines={2}>
          {previewText}
        </Text>

        <View style={styles.hairConditionFooter}>
          <View style={styles.hairConditionScoreWrap}>
            <Text style={[styles.hairConditionScore, { color: roles.primaryActionBackground }]}>
              {Number.isFinite(score) ? score : '--'}
            </Text>
            <Text style={[styles.hairConditionScoreLabel, { color: roles.metaText }]}>score</Text>
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}

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

function HairAnalysisHomeModule({ initialTab = 'overview' }) {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const headerPrimaryColor = resolvedTheme?.primaryColor || roles.primaryActionBackground;
  const cacheMatchesUser = Boolean(cachedHairAnalysisHomeData && cachedHairAnalysisHomeUserId === user?.id);
  const cachedHome = cacheMatchesUser ? cachedHairAnalysisHomeData : null;
  const submissionsRef = React.useRef(cachedHome?.submissions || []);
  const [isLoading, setIsLoading] = React.useState(!cacheMatchesUser);
  const [error, setError] = React.useState('');
  const [submissions, setSubmissions] = React.useState(cachedHome?.submissions || []);
  const [logDetailDateKey, setLogDetailDateKey] = React.useState('');
  const [logDetailEntries, setLogDetailEntries] = React.useState([]);
  const [isFirstCheckPromptVisible, setIsFirstCheckPromptVisible] = React.useState(false);
  const [isProfileCompletionPromptVisible, setIsProfileCompletionPromptVisible] = React.useState(false);
  const [firstCheckPromptDismissed, setFirstCheckPromptDismissed] = React.useState(false);
  const [activeHairAnalysisTab, setActiveHairAnalysisTab] = React.useState(
    initialTab === 'history' ? 'checkhair' : 'overview'
  );
  const [calendarMonth, setCalendarMonth] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDateKey, setSelectedCalendarDateKey] = React.useState('');

  React.useEffect(() => {
    if (initialTab === 'history') {
      setActiveHairAnalysisTab('checkhair');
    }
  }, [initialTab]);

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
      const result = await fetchHairSubmissionsByUserId(user.id, 30);

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
  const olderLogs = React.useMemo(() => recentLogs.slice(1), [recentLogs]);
  const hasRecentLogs = recentLogs.length > 0;
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
  const latestRecommendations = React.useMemo(
    () => getScreeningRecommendations(latestScreening).slice(0, 3),
    [latestScreening]
  );
  const isProfileComplete = profileCompletionMeta.isComplete;
  const isFirstHairCheck = screenings.length === 0;
  const latestScreeningAtMs = latestScreening?.created_at ? new Date(latestScreening.created_at).getTime() : NaN;
  const isWeeklyScanLocked = Number.isFinite(latestScreeningAtMs)
    ? Date.now() < (latestScreeningAtMs + WEEKLY_SCAN_INTERVAL_MS)
    : false;

  const todayCondition = latestScreening?.detected_condition || 'No result yet';
  const healthScore = getScoreFromScreening(latestScreening);
  const healthScoreDisplay = latestScreening ? healthScore : '--';
  const lengthLabel = getLengthLabel(latestScreening);
  const textureLabel = latestScreening?.detected_texture || 'N/A';
  const scalpLabel = todayCondition || 'N/A';
  const moistureLabel = getMoistureLabel(latestScreening);
  const primaryTextColor = resolvedTheme?.primaryTextColor || roles.headingText;
  const healthRangeLabel = latestScreening ? `Week ${getWeekRangeLabel(new Date())}` : '';

  const handleStartAnalysis = () => {
    router.push('/donor/donations?mode=scan');
  };

  const handlePrimaryAction = () => {
    if (!isProfileComplete) {
      setIsProfileCompletionPromptVisible(true);
      return;
    }
    if (isWeeklyScanLocked && latestScreening) {
      openLogDetailsForEntry(latestScreening);
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

  const firstName = String(profile?.first_name || '').trim();
  const avatarInitials = getInitials(`${profile?.first_name || ''} ${profile?.last_name || ''}`);

  const primaryActionTitle = !isProfileComplete
    ? 'Complete Profile'
    : isFirstHairCheck
      ? 'Start First Hair Check'
      : isWeeklyScanLocked
        ? 'View Recent Log'
        : 'Start Hair Analysis';
  const resolvedPrimaryActionIcon = !isProfileComplete
    ? 'editProfile'
    : isWeeklyScanLocked && !isFirstHairCheck
      ? 'history'
      : 'camera';
  const activeHairPrompt = isProfileCompletionPromptVisible
    ? 'profile'
    : isFirstCheckPromptVisible
      ? 'first-check'
      : '';
  const isProfilePrompt = activeHairPrompt === 'profile';
  const promptTitle = isProfilePrompt
    ? 'Complete your profile first'
    : 'No hair records yet';
  const promptMessage = isProfilePrompt
    ? 'Finish your donor profile details before starting hair checks.'
    : 'Start your first CheckHair scan to create your hair log and analysis.';
  const promptIcon = isProfilePrompt ? 'account-alert-outline' : 'chart-line';
  const promptActionTitle = isProfilePrompt ? 'Complete Profile' : primaryActionTitle;
  const promptActionIcon = isProfilePrompt ? 'editProfile' : resolvedPrimaryActionIcon;
  const promptDismissLabel = isProfilePrompt
    ? 'Dismiss profile completion prompt'
    : 'Dismiss first hair check prompt';
  const floatingHairAnalysisIcon = !isProfileComplete
    ? 'editProfile'
    : isWeeklyScanLocked && !isFirstHairCheck
      ? 'history'
      : 'checkHair';

  React.useEffect(() => {
    const shouldShowPrompt = isProfileComplete
      && isFirstHairCheck
      && !isLoading
      && activeHairAnalysisTab === 'overview'
      && !firstCheckPromptDismissed;

    setIsFirstCheckPromptVisible(shouldShowPrompt);
  }, [activeHairAnalysisTab, firstCheckPromptDismissed, isFirstHairCheck, isLoading, isProfileComplete]);

  const dismissFirstCheckPrompt = () => {
    setFirstCheckPromptDismissed(true);
    setIsFirstCheckPromptVisible(false);
  };

  const dismissProfileCompletionPrompt = () => {
    setIsProfileCompletionPromptVisible(false);
  };

  const dismissHairPrompt = () => {
    if (activeHairPrompt === 'profile') {
      dismissProfileCompletionPrompt();
      return;
    }

    dismissFirstCheckPrompt();
  };

  const handleHairPromptAction = () => {
    if (activeHairPrompt === 'profile') {
      dismissProfileCompletionPrompt();
      router.navigate('/profile');
      return;
    }

    handlePrimaryAction();
  };

  const floatingHairAnalysisButton = (activeHairAnalysisTab === 'overview' || activeHairAnalysisTab === 'checkhair') ? (
    <View
      pointerEvents="box-none"
      style={[
        styles.analysisFabFloatWrap,
        {
          right: ANALYSIS_FAB_EDGE_PADDING,
          bottom: ANALYSIS_FAB_BOTTOM_PADDING,
        },
      ]}
    >
      <Pressable
        onPress={handlePrimaryAction}
        accessibilityRole="button"
        accessibilityLabel={primaryActionTitle}
        style={({ pressed }) => [
          styles.analysisFab,
          {
            backgroundColor: roles.primaryActionBackground,
            borderColor: roles.primaryActionBorder || roles.primaryActionBackground,
          },
          pressed ? styles.cardPressed : null,
        ]}
      >
        <AppIcon name={floatingHairAnalysisIcon} color={roles.primaryActionText} size="md" />
      </Pressable>
    </View>
  ) : null;

  return (
    <DashboardLayout
      header={(
        <View style={[styles.dashboardHeaderSurface, { backgroundColor: headerPrimaryColor }]}>
          <DonorTopBar
            title={firstName || 'Donor'}
            subtitle="Hair Donor"
            avatarInitials={avatarInitials}
            avatarUri={profile?.avatar_url || profile?.photo_path || ''}
            unreadCount={unreadCount}
            onNotificationsPress={() => router.push('/donor/notifications')}
            onProfilePress={() => router.navigate('/profile')}
          />
        </View>
      )}
      navItems={donorDashboardNavItems}
      activeNavKey="checkhair"
      onNavPress={handleNavPress}
      navVariant="donor"
      screenVariant="default"
      showSupportChat={false}
      floatingOverlay={floatingHairAnalysisButton}
      loadingOverlay={isLoading ? (
        <DonivraLoadingOverlay visible label="Loading hair analysis..." />
      ) : null}
    >
      <View style={styles.container}>
        {error ? (
          <View style={[styles.errorCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground }]}>
            <Text style={[styles.errorText, { color: roles.bodyText }]}>{error}</Text>
          </View>
        ) : null}
        <View style={[styles.analysisTabs, { borderBottomColor: roles.defaultCardBorder }]}>
          <Pressable
            onPress={() => setActiveHairAnalysisTab('overview')}
            style={[
              styles.analysisTab,
              activeHairAnalysisTab === 'overview'
                ? [styles.analysisTabActive, { borderBottomColor: headerPrimaryColor }]
                : null,
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
              style={[
                styles.analysisTabText,
                { color: activeHairAnalysisTab === 'overview' ? headerPrimaryColor : roles.metaText },
              ]}
            >
              Overview
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setActiveHairAnalysisTab('checkhair')}
            style={[
              styles.analysisTab,
              activeHairAnalysisTab === 'checkhair'
                ? [styles.analysisTabActive, { borderBottomColor: headerPrimaryColor }]
                : null,
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.9}
              style={[
                styles.analysisTabText,
                { color: activeHairAnalysisTab === 'checkhair' ? headerPrimaryColor : roles.metaText },
              ]}
            >
              Check Hair Condition
            </Text>
          </Pressable>
        </View>

        {activeHairAnalysisTab === 'overview' ? (
          <View style={styles.tabPanelStack}>
            <View style={styles.analysisSectionBlock}>
              <SectionTitleRow
                title="Current Condition"
                icon="heart-pulse"
                color={roles.headingText}
                iconColor={roles.primaryActionBackground}
                accentColor={roles.primaryActionBackground}
                titleStyle={styles.analysisSectionTitle}
              />
              <View style={[styles.card, styles.overviewCard, styles.conditionCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground }]}>
                <View style={styles.healthRow}>
                  <View style={[styles.scoreCircle, { borderColor: latestScreening ? roles.primaryActionBackground : roles.defaultCardBorder }]}>
                    <Text style={[styles.scoreValue, { color: primaryTextColor }]}>{healthScoreDisplay}</Text>
                  </View>
                  <View style={styles.healthMeta}>
                    <Text style={[styles.healthMetaLabel, { color: primaryTextColor }]}>Health Score</Text>
                    <Text style={[styles.healthMetaValue, { color: primaryTextColor }]} numberOfLines={1}>
                      {todayCondition}
                    </Text>
                    {healthRangeLabel ? <Text style={[styles.healthMetaRange, { color: primaryTextColor }]}>{healthRangeLabel}</Text> : null}
                  </View>
                </View>
                <View style={styles.metricsGrid}>
                  <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                    <Text style={[styles.metricKey, { color: primaryTextColor }]}>Length</Text>
                    <Text style={[styles.metricValue, { color: primaryTextColor }]}>{lengthLabel}</Text>
                  </View>
                  <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                    <Text style={[styles.metricKey, { color: primaryTextColor }]}>Texture</Text>
                    <Text style={[styles.metricValue, { color: primaryTextColor }]}>{textureLabel}</Text>
                  </View>
                  <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                    <Text style={[styles.metricKey, { color: primaryTextColor }]}>Scalp</Text>
                    <Text numberOfLines={1} style={[styles.metricValue, { color: primaryTextColor }]}>{scalpLabel}</Text>
                  </View>
                  <View style={[styles.metricItem, { backgroundColor: roles.pageBackground }]}>
                    <Text style={[styles.metricKey, { color: primaryTextColor }]}>Moisture</Text>
                    <Text style={[styles.metricValue, { color: primaryTextColor }]}>{moistureLabel}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.analysisSectionBlock}>
              <SectionTitleRow
                title="Calendar"
                icon="calendar-month-outline"
                color={roles.headingText}
                iconColor={roles.primaryActionBackground}
                accentColor={roles.primaryActionBackground}
                titleStyle={styles.analysisSectionTitle}
              />
              <View style={[styles.card, styles.overviewCard, styles.calendarCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground }]}>
                <View style={styles.calendarHeader}>
                  <Pressable
                    onPress={() => setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))}
                    style={[
                      styles.calendarNavButton,
                      { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder },
                    ]}
                  >
                    <AppIcon name="chevron-left" color={roles.headingText} />
                  </Pressable>
                  <View style={styles.calendarHeaderCopy}>
                    <Text style={[styles.calendarMonthLabel, { color: roles.headingText }]}>{getMonthLabel(calendarMonth)}</Text>
                  </View>
                  <Pressable
                    onPress={() => setCalendarMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))}
                    style={[
                      styles.calendarNavButton,
                      { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder },
                    ]}
                  >
                    <AppIcon name="chevron-right" color={roles.headingText} />
                  </Pressable>
                </View>

                <View style={styles.calendarWeekdayRow}>
                  {HAIR_CALENDAR_WEEKDAYS.map((label) => (
                    <Text key={`hair-calendar-weekday-${label}`} style={[styles.calendarWeekdayText, { color: roles.headingText }]}>
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
                            {
                              borderColor: cell.isSelected
                                ? (cell.hasLog ? roles.primaryActionBackground : roles.defaultCardBorder)
                                : cell.hasLog
                                  ? roles.defaultCardBorder
                                  : 'transparent',
                            },
                            cell.isSelected
                              ? (cell.hasLog
                                ? { backgroundColor: roles.primaryActionBackground }
                                : { backgroundColor: roles.iconPrimarySurface })
                              : cell.hasLog
                                ? { backgroundColor: roles.iconPrimarySurface }
                                : { backgroundColor: 'transparent' },
                            !cell.isCurrentMonth ? styles.calendarDayMuted : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.calendarDayText,
                              {
                                color: cell.isSelected
                                  ? (cell.hasLog ? roles.primaryActionText : roles.primaryActionBackground)
                                  : cell.hasLog
                                    ? roles.primaryActionBackground
                                    : roles.headingText,
                              },
                              !cell.isCurrentMonth && !cell.isSelected ? { color: roles.metaText } : null,
                            ]}
                          >
                            {cell.day}
                          </Text>
                          {cell.hasLog ? (
                            <View
                              style={[
                                styles.calendarDot,
                                {
                                  backgroundColor: cell.isSelected
                                    ? roles.primaryActionText
                                    : roles.primaryActionBackground,
                                },
                              ]}
                            />
                          ) : cell.isToday ? (
                            <View style={[styles.calendarTodayDot, { borderColor: roles.primaryActionBackground }]} />
                          ) : null}
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>

              </View>
            </View>
          </View>
        ) : (
          <View style={styles.tabPanelStack}>
            <View style={styles.analysisSectionBlock}>
              <SectionTitleRow
                title="Hair Log"
                icon="file-document-outline"
                color={roles.headingText}
                iconColor={roles.primaryActionBackground}
                accentColor={roles.primaryActionBackground}
                titleStyle={styles.analysisSectionTitle}
              />
              {hasRecentLogs ? (
                <View style={styles.recentLogFeed}>
                  <LatestHairLogResultCard
                    latestScreening={latestScreening}
                    latestRecommendation={latestRecommendations[0] || null}
                  />

                  <HairConditionSummaryCard
                    entry={latestScreening}
                    onPress={() => openLogDetailsForEntry(latestScreening)}
                  />

                  {olderLogs.length ? (
                    <View style={[styles.card, styles.recentLogCard, { borderColor: roles.defaultCardBorder, backgroundColor: roles.pageBackground }]}>
                      <View style={styles.recentLogList}>
                        {olderLogs.map((entry, index) => {
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
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <EmptyDataState
                  compact
                  showCountBadge={false}
                  title="No recent logs yet"
                  message="Run CheckHair to save your first hair log and analysis details."
                  variant="analysis"
                />
              )}
            </View>
          </View>
        )}
      </View>

      {isFirstCheckPromptVisible || isProfileCompletionPromptVisible ? (
        <Modal
          transparent
          animationType="fade"
          visible={isFirstCheckPromptVisible || isProfileCompletionPromptVisible}
          onRequestClose={dismissHairPrompt}
        >
          <View style={styles.firstTimeOverlay}>
            <Pressable
              style={styles.firstTimeBackdrop}
              onPress={dismissHairPrompt}
              accessibilityRole="button"
              accessibilityLabel={promptDismissLabel}
            />
            {isProfilePrompt ? (
              <Pressable
                style={[styles.firstTimeCard, { backgroundColor: roles.pageBackground }]}
                onPress={() => {}}
              >
                <Pressable
                  onPress={dismissHairPrompt}
                  style={styles.firstTimeCloseButton}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={promptDismissLabel}
                >
                  <MaterialCommunityIcons name="close" size={24} color={roles.primaryActionBackground} />
                </Pressable>
                <View style={[styles.firstTimeIconWrap, { backgroundColor: roles.pageBackground }]}>
                  <AppIcon name={promptIcon} color={roles.primaryActionBackground} size="xl" />
                </View>
                <Text style={[styles.firstTimeTitle, { color: roles.headingText }]}>{promptTitle}</Text>
                <Text style={[styles.firstTimeMessage, { color: roles.bodyText }]}>{promptMessage}</Text>
                <GradientActionButton
                  title={promptActionTitle}
                  onPress={handleHairPromptAction}
                  leading={<AppIcon name={promptActionIcon} state="inverse" />}
                  fullWidth
                  textColor={roles.primaryActionText}
                  style={styles.firstTimeActionButton}
                />
              </Pressable>
            ) : (
              <View style={[styles.firstTimeAnalysisSheet, { backgroundColor: roles.pageBackground }]}>
                <Pressable
                  onPress={dismissHairPrompt}
                  style={styles.firstTimeCloseButton}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={promptDismissLabel}
                >
                  <MaterialCommunityIcons name="close" size={24} color={roles.primaryActionBackground} />
                </Pressable>
                <View style={styles.firstTimeAnalysisState}>
                  <MaterialCommunityIcons
                    name={promptIcon}
                    size={44}
                    color={roles.primaryActionBackground}
                    style={styles.firstTimeAnalysisIcon}
                  />
                  <Text style={[styles.firstTimeTitle, { color: roles.headingText }]}>{promptTitle}</Text>
                  <Text style={[styles.firstTimeMessage, { color: roles.bodyText }]}>{promptMessage}</Text>
                </View>
                <GradientActionButton
                  title={promptActionTitle}
                  onPress={handleHairPromptAction}
                  leading={<AppIcon name={promptActionIcon} state="inverse" />}
                  fullWidth
                  textColor={roles.primaryActionText}
                  style={styles.firstTimeAnalysisActionButton}
                />
              </View>
            )}
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
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;

  if (mode === 'scan') {
    return <DonorHairSubmissionScreen />;
  }

  return <HairAnalysisHomeModule initialTab={tab === 'history' || mode === 'history' ? 'history' : 'overview'} />;
}

const styles = StyleSheet.create({
  dashboardHeaderSurface: {
    marginHorizontal: -theme.layout.screenPaddingX,
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.xs,
  },
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
  analysisTabs: {
    minHeight: 44,
    marginHorizontal: -theme.spacing.md,
    marginTop: -theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  analysisTab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingTop: 4,
    paddingBottom: 8,
  },
  analysisTabActive: {
    borderBottomWidth: 2,
  },
  analysisTabText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'center',
  },
  tabPanelStack: {
    gap: theme.spacing.lg,
  },
  analysisSectionBlock: {
    gap: theme.spacing.xs,
  },
  recentLogFeed: {
    gap: theme.spacing.md,
  },
  analysisSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
  },
  analysisFabFloatWrap: {
    position: 'absolute',
    zIndex: 28,
  },
  analysisFab: {
    width: ANALYSIS_FAB_SIZE,
    height: ANALYSIS_FAB_SIZE,
    borderRadius: ANALYSIS_FAB_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 9,
  },
  overviewIntroCard: {
    borderWidth: 1,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
    ...theme.shadows.soft,
  },
  overviewIntroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
  },
  overviewIntroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  overviewCard: {
    borderRadius: theme.radius.sm,
  },
  calendarCard: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  sectionCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
  },
  sectionCardCaption: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
  },
  conditionStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    flexShrink: 0,
  },
  conditionStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  calendarHeaderCopy: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  calendarMonthLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  calendarNavButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarWeekdayRow: {
    flexDirection: 'row',
    gap: 3,
  },
  calendarWeekdayText: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 8,
    fontWeight: theme.typography.weights.bold,
  },
  calendarGrid: {
    gap: 3,
  },
  calendarRow: {
    flexDirection: 'row',
    gap: 3,
  },
  calendarDay: {
    flex: 1,
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  calendarDayMuted: {
    opacity: 0.46,
  },
  calendarDayText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarDot: {
    width: 4,
    height: 4,
    borderRadius: 3,
  },
  calendarTodayDot: {
    width: 4,
    height: 4,
    borderRadius: 3,
    borderWidth: 1,
  },
  calendarSelectedPanel: {
    borderWidth: 1,
    borderRadius: theme.radius.sm,
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
  hairConditionCard: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
  },
  hairConditionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  hairConditionHeaderCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  hairConditionEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  hairConditionDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  hairConditionStatus: {
    alignSelf: 'flex-start',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
  },
  hairConditionStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hairConditionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyMd,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.bodyMd * theme.typography.lineHeights.snug,
  },
  hairConditionSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  hairConditionFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  hairConditionScoreWrap: {
    alignItems: 'flex-end',
  },
  hairConditionScore: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
  },
  hairConditionScoreLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.995 }],
  },
  conditionCard: {
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
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
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  scoreCircle: {
    width: 70,
    height: 70,
    borderRadius: theme.radius.full,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 22,
    fontWeight: theme.typography.weights.bold,
  },
  healthMeta: {
    flex: 1,
    gap: 1,
  },
  healthMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.bold,
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
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: 2,
  },
  calendarMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    flexShrink: 0,
  },
  calendarMetaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  metricKey: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
  },
  metricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
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
  firstTimeBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  firstTimeCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
    position: 'relative',
    ...theme.shadows.lg,
  },
  firstTimeAnalysisSheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    position: 'relative',
  },
  firstTimeCloseButton: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 2,
    padding: 2,
  },
  firstTimeAnalysisState: {
    width: '100%',
    paddingHorizontal: 0,
    paddingVertical: 0,
    alignItems: 'center',
  },
  firstTimeAnalysisIcon: {
    marginBottom: theme.spacing.md,
  },
  firstTimeAnalysisActionButton: {
    width: '100%',
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
  firstTimeActionButton: {
    width: '100%',
  },
});
