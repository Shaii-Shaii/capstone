import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { DashboardLayout } from '../../src/components/layout/DashboardLayout';
import { AppButton } from '../../src/components/ui/AppButton';
import { AppCard } from '../../src/components/ui/AppCard';
import { AppIcon } from '../../src/components/ui/AppIcon';
import { StatusBanner } from '../../src/components/ui/StatusBanner';
import { DonorTopBar } from '../../src/components/donor/DonorTopBar';
import { HairLogDetailModal as SharedHairLogDetailModal } from '../../src/components/hair/HairLogDetailModal';
import { donorDashboardNavItems } from '../../src/constants/dashboard';
import {
  fetchHairSubmissionsByUserId,
  fetchLatestDonorRecommendationByUserId,
} from '../../src/features/hairSubmission.api';
import {
  fetchFeaturedOrganizations,
  fetchOrganizationMembershipsByUserId,
  fetchOrganizationPreview,
  fetchUpcomingDonationDrives,
  joinOrganizationMembership,
} from '../../src/features/donorHome.api';
import { getDonorDonationsModuleData } from '../../src/features/donorDonations.service';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../../src/design-system/theme';
import { invokeEdgeFunction, supabase } from '../../src/api/supabase/client';
import { loadChatbotBootstrap, resolveChatbotReply } from '../../src/features/chatbot.service';
import { buildProfileCompletionMeta } from '../../src/features/profile/services/profile.service';

const formatDayLabel = (value) => (
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
);


const formatDriveDate = (startDate, endDate) => {
  if (!startDate) return 'Date to follow';
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  const shortFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

  if (!end) {
    return shortFormatter.format(start);
  }

  return `${shortFormatter.format(start)} - ${shortFormatter.format(end)}`;
};

const getInitials = (value = '') => (
  String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'D'
);

const getMembershipRank = (membership) => {
  if (membership?.is_active) return 3;
  if (membership?.is_pending) return 2;
  return membership?.member_id ? 1 : 0;
};

const getBestMembershipByOrganization = (memberships = []) => {
  const membershipByOrganizationId = new Map();

  memberships.forEach((membership) => {
    if (!membership?.organization_id) return;

    const current = membershipByOrganizationId.get(membership.organization_id);
    const nextRank = getMembershipRank(membership);
    const currentRank = getMembershipRank(current);
    const nextUpdatedAt = new Date(membership.updated_at || membership.created_at || 0).getTime();
    const currentUpdatedAt = new Date(current?.updated_at || current?.created_at || 0).getTime();

    if (!current || nextRank > currentRank || (nextRank === currentRank && nextUpdatedAt > currentUpdatedAt)) {
      membershipByOrganizationId.set(membership.organization_id, membership);
    }
  });

  return membershipByOrganizationId;
};

const attachMembershipsToOrganizations = (organizations = [], memberships = []) => {
  const membershipByOrganizationId = getBestMembershipByOrganization(memberships);

  return organizations.map((organization) => ({
    ...organization,
    membership: membershipByOrganizationId.get(organization.organization_id) || null,
  }));
};

const isDriveActiveForHome = (drive = null) => {
  const compareDate = drive?.end_date || drive?.start_date || null;
  if (!compareDate) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(compareDate).getTime() >= today.getTime();
};

const getMobileOrganizationError = (error, fallback = 'Something went wrong. Please try again.') => {
  const message = String(error?.message || error || '').toLowerCase();
  if (!message) return fallback;
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return 'Connection problem. Check your internet and try again.';
  }
  if (message.includes('permission') || message.includes('42501') || message.includes('row-level')) {
    return 'We could not save this yet because your account permission is not ready.';
  }
  if (message.includes('not available') || message.includes('not open')) {
    return 'This organization is not available to join right now.';
  }
  if (message.includes('required')) {
    return 'Your donor account must be ready before joining an organization.';
  }
  return fallback;
};

const normalizeConditionTone = (condition = '') => {
  const normalized = String(condition || '').trim().toLowerCase();

  if (normalized.includes('healthy') || normalized.includes('good')) {
    return {
      dotColor: '',
      label: 'Healthy',
    };
  }

  if (normalized.includes('dry') || normalized.includes('damaged')) {
    return {
      dotColor: '',
      label: 'Needs care',
    };
  }

  if (normalized.includes('treated') || normalized.includes('rebonded') || normalized.includes('colored')) {
    return {
      dotColor: '',
      label: 'Treated',
    };
  }

  return {
    dotColor: '',
    label: condition || 'Checked',
  };
};

const getScreeningEntries = (submissions = []) => (
  submissions
    .flatMap((submission) => (submission?.ai_screenings || []).map((screening) => ({ submission, screening })))
    .filter((entry) => entry.screening?.created_at)
    .sort((left, right) => new Date(right.screening.created_at).getTime() - new Date(left.screening.created_at).getTime())
);

const WEEK_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOME_REALTIME_DEBOUNCE_MS = 420;

function AnimatedHomeSection({ children, delay = 0, style }) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(14)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(delay),
        Animated.spring(translateY, {
          toValue: 0,
          damping: 16,
          stiffness: 180,
          mass: 0.8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

// Converts any Date or ISO string to the user's LOCAL calendar date key (YYYY-MM-DD).
// Using toISOString() on local-midnight Date objects shifts the day in UTC+N timezones,
// causing a one-day mismatch between calendar cells and stored screening dates.
const toLocalDateKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Maps each logged calendar date to the submission that owns the latest AI screening on that date.
const buildSubmissionByDate = (submissions = []) => {
  const latest = new Map(); // dateKey → { submission, createdAt }

  submissions.forEach((submission) => {
    (submission?.ai_screenings || []).forEach((screening) => {
      if (!screening?.created_at) return;
      const key = toLocalDateKey(screening.created_at);
      const current = latest.get(key);
      if (!current || new Date(screening.created_at).getTime() > new Date(current.createdAt).getTime()) {
        latest.set(key, { submission, createdAt: screening.created_at });
      }
    });
  });

  const result = new Map();
  latest.forEach(({ submission }, key) => result.set(key, submission));
  return result;
};


const buildHairLogDetailEntry = (entry, fallbackRecommendation = null) => {
  if (!entry?.screening || !entry?.submission) return null;

  return {
    screening: entry.screening,
    submission: entry.submission,
    images: entry.submission?.submission_details?.flatMap((detail) => detail.images || []) || [],
    recommendations: entry.submission?.donor_recommendations?.length
      ? entry.submission.donor_recommendations
      : fallbackRecommendation
        ? [fallbackRecommendation]
        : [],
  };
};

// Derives 0-10 levels for each hair metric from the screening data.
// Falls back to DB columns (shine_level etc.) if populated, otherwise infers from text fields.
const deriveHairMetrics = (screening) => {
  const cond = String(screening?.detected_condition || '').toLowerCase();
  const dmg = String(screening?.visible_damage_notes || '').toLowerCase();
  const tex = String(screening?.detected_texture || '').toLowerCase();

  const shine =
    screening?.shine_level != null ? screening.shine_level
    : cond.includes('healthy') || cond.includes('good') ? 8
    : cond.includes('dry') || cond.includes('damaged') ? 3
    : cond.includes('oily') ? 5 : 5;

  const frizz =
    screening?.frizz_level != null ? screening.frizz_level
    : cond.includes('frizz') ? 7
    : cond.includes('healthy') ? 2
    : tex.includes('wavy') || tex.includes('curly') ? 5 : 3;

  const dryness =
    screening?.dryness_level != null ? screening.dryness_level
    : cond.includes('dry') ? 8
    : cond.includes('healthy') ? 2
    : cond.includes('oily') ? 1 : 4;

  const oiliness =
    screening?.oiliness_level != null ? screening.oiliness_level
    : cond.includes('oily') || cond.includes('greasy') ? 8
    : cond.includes('healthy') ? 2
    : cond.includes('dry') ? 1 : 3;

  const damage =
    screening?.damage_level != null ? screening.damage_level
    : dmg.includes('split') || dmg.includes('break') || cond.includes('damaged') ? 8
    : cond.includes('healthy') ? 1
    : cond.includes('dry') ? 5 : 3;

  return { shine, frizz, dryness, oiliness, damage };
};

const HAIR_METRIC_DEFS = [
  { key: 'shine', label: 'Shine', positive: true, tip: 'Does hair look glossy or dull?' },
  { key: 'frizz', label: 'Frizz', positive: false, tip: 'Flyaway or messy strands?' },
  { key: 'dryness', label: 'Dryness', positive: false, tip: 'Rough or straw-like texture?' },
  { key: 'oiliness', label: 'Oiliness', positive: false, tip: 'Greasy or flat near roots?' },
  { key: 'damage', label: 'Damage / Splits', positive: false, tip: 'Broken or uneven ends?' },
];

const HAIR_METRIC_ICON_BY_KEY = {
  shine: 'white-balance-sunny',
  frizz: 'blur',
  dryness: 'water-off-outline',
  oiliness: 'water-outline',
  damage: 'content-cut',
};

// Kept for the detailed hair widget layout if the donor home re-enables an expanded analysis card.
// eslint-disable-next-line no-unused-vars
function HairConditionWidget({ screening, onViewDetail }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const bodyFont = resolvedTheme?.fontFamily || theme.typography.fontFamily;
  const headingFont = resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay;

  if (!screening) return null;
  const metrics = deriveHairMetrics(screening);

  return (
    <AppCard variant="default" radius="xl" padding="md">
      <View style={styles.hairWidgetHeader}>
        <View style={styles.hairWidgetTitleRow}>
          <View style={[styles.hairWidgetIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="hair-dryer-outline" size={16} color={roles.primaryActionBackground} />
          </View>
          <Text style={[styles.hairWidgetTitle, { color: roles.headingText, fontFamily: headingFont }]}>
            Hair Condition
          </Text>
        </View>
        {onViewDetail ? (
          <Pressable onPress={onViewDetail} style={styles.hairWidgetViewBtn}>
            <Text style={[styles.hairWidgetViewBtnText, { color: roles.primaryActionBackground, fontFamily: bodyFont }]}>
              View log
            </Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color={roles.primaryActionBackground} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.hairMetricList}>
        {HAIR_METRIC_DEFS.map((def) => {
          const rawValue = metrics[def.key] ?? 5;
          const level = Math.max(0, Math.min(10, rawValue));
          const barFraction = level / 10;
          const barColor = def.positive
            ? (level >= 7 ? '#54b86f' : level >= 4 ? '#f0a856' : '#e05252')
            : (level <= 3 ? '#54b86f' : level <= 6 ? '#f0a856' : '#e05252');

          return (
            <View key={def.key} style={styles.hairMetricRow}>
              <View style={[styles.hairMetricIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons
                  name={HAIR_METRIC_ICON_BY_KEY[def.key] || 'circle-outline'}
                  size={12}
                  color={roles.iconPrimaryColor}
                />
              </View>
              <Text style={[styles.hairMetricLabel, { color: roles.bodyText, fontFamily: bodyFont }]}>
                {def.label}
              </Text>
              <View style={[styles.hairMetricTrack, { backgroundColor: roles.supportCardBackground }]}>
                <View style={[styles.hairMetricFill, { width: `${barFraction * 100}%`, backgroundColor: barColor }]} />
              </View>
              <Text style={[styles.hairMetricValue, { color: barColor, fontFamily: bodyFont }]}>
                {level}/10
              </Text>
            </View>
          );
        })}
      </View>

      {screening.summary ? (
        <Text numberOfLines={2} style={[styles.hairWidgetSummary, { color: roles.metaText, fontFamily: bodyFont }]}>
          {screening.summary}
        </Text>
      ) : null}
    </AppCard>
  );
}

function HairCalendarWidget({ hairSubmissions, onOpenDate }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const headingFont = resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay;
  const bodyFont = resolvedTheme?.fontFamily || theme.typography.fontFamily;

  const [isMonthExpanded, setIsMonthExpanded] = React.useState(false);
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = React.useState(() => toLocalDateKey(new Date()));

  const submissionByDate = React.useMemo(
    () => buildSubmissionByDate(hairSubmissions),
    [hairSubmissions]
  );
  const todayKey = toLocalDateKey(new Date());

  // Build 7-day week strip (Sun-Sat of the current week) so labels and dates stay aligned.
  const weekDays = React.useMemo(() => {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const key = toLocalDateKey(d);
      const submission = submissionByDate.get(key) || null;
      const latestScreening = submission
        ? (submission.ai_screenings || [])
            .filter((sc) => sc?.created_at && toLocalDateKey(sc.created_at) === key)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
        : null;
      const dayName = WEEK_DAY_LABELS[d.getDay()].charAt(0);
      return { date: d, key, submission, latestScreening, dayName };
    });
  }, [submissionByDate]);

  // Build monthly grid (for expanded view)
  const calendarGrid = React.useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const startPad = firstDay.getDay();
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= lastDate; d++) {
      const date = new Date(year, month, d);
      const key = toLocalDateKey(date);
      const submission = submissionByDate.get(key) || null;
      const latestScreening = submission
        ? (submission.ai_screenings || [])
            .filter((sc) => sc?.created_at && toLocalDateKey(sc.created_at) === key)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
        : null;
      cells.push({ date, key, submission, latestScreening });
    }
    return cells;
  }, [currentMonth, submissionByDate]);

  const monthRows = React.useMemo(() => {
    const result = [];
    for (let i = 0; i < calendarGrid.length; i += 7) {
      const row = calendarGrid.slice(i, i + 7);
      while (row.length < 7) row.push(null);
      result.push(row);
    }
    return result;
  }, [calendarGrid]);

  const monthLabel = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  const renderDayCell = (cell, key) => {
    if (!cell) return <View key={key} style={styles.calDayCell} />;
    const isToday = cell.key === todayKey;
    const isSelected = cell.key === selectedKey;
    const hasLog = Boolean(cell.latestScreening);
    return (
      <Pressable
        key={cell.key}
        onPress={() => setSelectedKey(cell.key)}
        style={({ pressed }) => [styles.calDayCell, pressed ? styles.cardPressed : null]}
      >
        <View style={[
          styles.calDayCircle,
          isToday ? [styles.calDayToday, { backgroundColor: roles.primaryActionBackground }] : null,
          isSelected && !isToday ? [styles.calDaySelected, { borderColor: roles.primaryActionBackground }] : null,
        ]}>
          <Text style={[styles.calDayNumber, {
            color: isToday ? roles.primaryActionText : isSelected ? roles.primaryActionBackground : hasLog ? roles.headingText : roles.metaText,
            fontFamily: bodyFont,
          }]}>
            {cell.date.getDate()}
          </Text>
          {hasLog ? (
            <View style={[styles.calCheckBadge, { backgroundColor: roles.primaryActionBackground, borderColor: roles.defaultCardBackground }]}>
              <MaterialCommunityIcons name="check" size={9} color={roles.primaryActionText} />
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <AppCard variant="default" radius="xl" padding="md">
      {isMonthExpanded ? (
        <>
          <View style={styles.calMonthHeader}>
            <Text style={[styles.calMonthLabel, { color: roles.headingText, fontFamily: headingFont }]}>
              {monthLabel}
            </Text>
            <View style={styles.calMonthNav}>
              <Pressable
                onPress={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                style={({ pressed }) => [styles.calNavBtn, { backgroundColor: roles.supportCardBackground }, pressed ? styles.cardPressed : null]}
              >
                <MaterialCommunityIcons name="chevron-left" size={18} color={roles.headingText} />
              </Pressable>
              <Pressable
                onPress={() => setCurrentMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                style={({ pressed }) => [styles.calNavBtn, { backgroundColor: roles.supportCardBackground }, pressed ? styles.cardPressed : null]}
              >
                <MaterialCommunityIcons name="chevron-right" size={18} color={roles.headingText} />
              </Pressable>
              <Pressable
                onPress={() => setIsMonthExpanded(false)}
                style={({ pressed }) => [styles.calNavBtn, { backgroundColor: roles.iconPrimarySurface }, pressed ? styles.cardPressed : null]}
              >
                <MaterialCommunityIcons name="calendar-minus" size={16} color={roles.primaryActionBackground} />
              </Pressable>
            </View>
          </View>

          <View style={styles.calWeekRow}>
            {WEEK_DAY_LABELS.map((day) => (
              <View key={day} style={styles.calWeekCell}>
                <Text style={[styles.calWeekLabel, { color: roles.metaText, fontFamily: bodyFont }]}>{day}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {isMonthExpanded ? (
        // Full month grid
        monthRows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.calRow}>
            {row.map((cell, cellIdx) => renderDayCell(cell, `pad-${rowIdx}-${cellIdx}`))}
          </View>
        ))
      ) : (
        // Week strip
        <View style={styles.calWeekStrip}>
          {weekDays.map((day) => {
            const isToday = day.key === todayKey;
            const isSelected = day.key === selectedKey;
            const hasLog = Boolean(day.latestScreening);
            return (
              <Pressable
                key={day.key}
                onPress={() => {
                  setSelectedKey(day.key);
                  if (hasLog && onOpenDate) {
                    onOpenDate({ submission: day.submission, screening: day.latestScreening });
                  }
                }}
                style={({ pressed }) => [styles.calWeekDayCol, pressed ? styles.cardPressed : null]}
              >
                <Text style={[styles.calWeekDayLabel, {
                  color: isToday ? roles.primaryActionBackground : roles.metaText,
                  fontFamily: bodyFont,
                  fontWeight: isToday ? theme.typography.weights.bold : theme.typography.weights.regular,
                }]}>
                  {day.dayName}
                </Text>
                <View style={[
                  styles.calDayCircle,
                  isToday ? [styles.calDayToday, { backgroundColor: roles.primaryActionBackground }] : null,
                  isSelected && !isToday ? [styles.calDaySelected, { borderColor: roles.primaryActionBackground }] : null,
                ]}>
                  <Text style={[styles.calDayNumber, {
                    color: isToday ? roles.primaryActionText : isSelected ? roles.primaryActionBackground : hasLog ? roles.headingText : roles.metaText,
                    fontFamily: bodyFont,
                  }]}>
                    {day.date.getDate()}
                  </Text>
                  {hasLog ? (
                    <View style={[styles.calCheckBadge, { backgroundColor: roles.primaryActionBackground, borderColor: roles.defaultCardBackground }]}>
                      <MaterialCommunityIcons name="check" size={9} color={roles.primaryActionText} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </AppCard>
  );
}

function FinishSetupCard({ completionMeta, onManageProfile }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const missingFields = completionMeta?.missingFieldLabels?.slice(0, 3) || [];
  const missingText = missingFields.length
    ? `Missing: ${missingFields.join(', ')}${completionMeta.missingFieldLabels.length > 3 ? ', and more' : ''}.`
    : 'Complete your donor details before starting donor flows.';

  return (
    <AppCard variant="soft" radius="xl" padding="md" contentStyle={styles.setupCardContent}>
      <View style={styles.setupCardHeader}>
        <View style={[styles.setupIcon, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="account-edit-outline" size={22} color={roles.primaryActionBackground} />
        </View>
        <View style={styles.setupCopy}>
          <Text style={[styles.setupTitle, { color: roles.headingText }]}>Finish Setting Up Your Account</Text>
          <Text style={[styles.setupBody, { color: roles.bodyText }]}>{missingText}</Text>
        </View>
      </View>
      <Pressable
        onPress={onManageProfile}
        style={({ pressed }) => [
          styles.setupButton,
          { backgroundColor: roles.primaryActionBackground },
          pressed ? styles.cardPressed : null,
        ]}
      >
        <Text style={[styles.setupButtonText, { color: roles.primaryActionText }]}>Manage Profile</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={roles.primaryActionText} />
      </Pressable>
    </AppCard>
  );
}

// Kept as a compact action-row variant for future home quick actions.
// eslint-disable-next-line no-unused-vars
function DonorFlowCard({
  title,
  description,
  badge,
  badgeVariant = 'neutral',
  icon,
  buttonTitle,
  onPress,
  filled = false,
  style,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const badgeStyles = badgeVariant === 'success'
    ? { backgroundColor: '#e9f8ef', color: '#0f7b3d' }
    : badgeVariant === 'warning'
      ? { backgroundColor: '#fff5dd', color: '#8a5a00' }
      : { backgroundColor: roles.iconPrimarySurface, color: roles.primaryActionBackground };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.flowActionRow,
        {
          backgroundColor: filled ? roles.primaryActionBackground : roles.defaultCardBackground,
          borderColor: filled ? roles.primaryActionBackground : roles.defaultCardBorder,
        },
        pressed ? styles.cardPressed : null,
        style,
      ]}
    >
      <View style={[
        styles.flowIconWrap,
        { backgroundColor: filled ? roles.primaryActionText : roles.iconPrimarySurface },
      ]}>
        <MaterialCommunityIcons
          name={icon}
          size={20}
          color={roles.primaryActionBackground}
        />
      </View>
      <View style={styles.flowActionCopy}>
        <View style={styles.flowActionTitleRow}>
          <Text numberOfLines={1} style={[styles.flowCardTitle, { color: filled ? roles.primaryActionText : roles.headingText }]}>
            {title}
          </Text>
          {badge ? (
            <View style={[styles.flowBadge, { backgroundColor: filled ? 'rgba(255,255,255,0.18)' : badgeStyles.backgroundColor }]}>
              <Text style={[styles.flowBadgeText, { color: filled ? roles.primaryActionText : badgeStyles.color }]}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={[styles.flowCardDescription, { color: filled ? roles.primaryActionText : roles.bodyText }]}>
          {description}
        </Text>
      </View>
      <View style={[styles.flowActionCta, { backgroundColor: filled ? roles.primaryActionText : roles.primaryActionBackground }]}>
        <Text numberOfLines={1} style={[
          styles.flowCardButtonText,
          { color: filled ? roles.primaryActionBackground : roles.primaryActionText },
        ]}>{buttonTitle}</Text>
        <AppIcon name="chevronRight" size="sm" color={filled ? roles.primaryActionBackground : roles.primaryActionText} />
      </View>
    </Pressable>
  );
}

// Kept for alternate single-feature-drive layouts.
// eslint-disable-next-line no-unused-vars
function UpcomingDriveHero({ drive, onPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const imageUrl = drive?.event_image_url || drive?.organization_logo_url || '';

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  if (!drive) {
    return (
      <AppCard variant="outline" radius="xl" padding="md" contentStyle={styles.emptyDriveHero}>
        <Text style={[styles.emptyDriveTitle, { color: roles.headingText }]}>No upcoming drives yet</Text>
        <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>
          Public events and private organization drives will appear here when available.
        </Text>
      </AppCard>
    );
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed ? styles.cardPressed : null]}>
      <View style={[styles.upcomingDriveHero, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        {imageUrl && !imageFailed ? (
          <Image source={{ uri: imageUrl }} style={styles.upcomingDriveImage} resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <View style={[styles.upcomingDriveFallback, { backgroundColor: roles.iconPrimarySurface }]}>
            <MaterialCommunityIcons name="calendar-heart" size={34} color={roles.primaryActionBackground} />
          </View>
        )}
        <View style={styles.upcomingDriveScrim} />
        <View style={styles.upcomingDriveCopy}>
          <Text style={styles.upcomingDriveEyebrow}>COMMUNITY EVENT</Text>
          <Text numberOfLines={2} style={styles.upcomingDriveTitle}>{drive.event_title || 'Donation drive'}</Text>
          <Text numberOfLines={1} style={styles.upcomingDriveMeta}>
            {formatDriveDate(drive.start_date, drive.end_date)}
            {drive.location_label ? `  •  ${drive.location_label}` : ''}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function HomeModeTabs({ activeTab, onChange }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const items = [
    { key: 'drives', label: 'Donation Drive' },
    { key: 'organizations', label: 'Organization' },
  ];

  return (
    <View style={[styles.homeModeTabs, { backgroundColor: roles.pageBackground, borderBottomColor: roles.defaultCardBorder }]}>
      {items.map((item) => {
        const isActive = activeTab === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.homeModeTab,
              isActive ? [styles.homeModeTabActive, { borderBottomColor: roles.primaryActionBackground }] : null,
              pressed ? styles.cardPressed : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.homeModeTabText, { color: isActive ? roles.primaryActionBackground : roles.headingText }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ActiveDonationDriveCard({ drive, onPress, style }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const imageUrl = drive?.event_image_url || drive?.organization_logo_url || '';
  const scopeLabel = drive?.is_public ? 'Public' : 'Members';

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <View style={[styles.activeDriveCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }, style]}>
      <View style={[styles.activeDriveCover, { backgroundColor: roles.iconPrimarySurface }]}>
        {imageUrl && !imageFailed ? (
          <Image source={{ uri: imageUrl }} style={styles.activeDriveImage} resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <View style={styles.activeDriveFallback}>
            <MaterialCommunityIcons name="calendar-heart" size={42} color={roles.primaryActionBackground} />
          </View>
        )}
      </View>
      <View style={styles.activeDriveBody}>
        <View style={styles.activeDriveTitleRow}>
          <Text numberOfLines={2} style={[styles.activeDriveTitle, { color: roles.headingText }]}>
            {drive?.event_title || 'Donation drive'}
          </Text>
          <View style={[styles.activeDriveBadge, { backgroundColor: roles.primaryActionBackground }]}>
            <Text style={[styles.activeDriveBadgeText, { color: roles.primaryActionText }]}>{scopeLabel}</Text>
          </View>
        </View>
        {drive?.short_overview || drive?.event_overview ? (
          <Text numberOfLines={3} style={[styles.activeDriveDescription, { color: roles.bodyText }]}>
            {drive.short_overview || drive.event_overview}
          </Text>
        ) : null}
        <View style={styles.activeDriveMetaRow}>
          {drive?.location_label ? (
            <View style={styles.activeDriveMetaItem}>
              <MaterialCommunityIcons name="map-marker-outline" size={17} color={roles.headingText} />
              <Text numberOfLines={1} style={[styles.activeDriveMetaText, { color: roles.bodyText }]}>
                {drive.location_label}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.activeDriveMetaDot, { color: roles.metaText }]}>•</Text>
          <View style={styles.activeDriveMetaItem}>
            <MaterialCommunityIcons name="calendar-blank-outline" size={17} color={roles.headingText} />
            <Text numberOfLines={1} style={[styles.activeDriveMetaText, { color: roles.bodyText }]}>
              {formatDriveDate(drive?.start_date, drive?.end_date)}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.activeDriveButton,
            { backgroundColor: roles.primaryActionBackground },
            pressed ? styles.cardPressed : null,
          ]}
        >
          <Text style={[styles.activeDriveButtonText, { color: roles.primaryActionText }]}>
            {drive?.registration ? 'View Drive' : 'Donate'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function EmptyDonationDriveCard() {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  return (
    <View style={[styles.emptyDriveCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      <View style={[styles.emptyDriveIcon, { backgroundColor: roles.iconPrimarySurface }]}>
        <MaterialCommunityIcons name="calendar-search-outline" size={26} color={roles.primaryActionBackground} />
      </View>
      <Text style={[styles.emptyDriveTitle, { color: roles.headingText }]}>No active donation drives yet</Text>
      <Text style={[styles.emptyDriveText, { color: roles.bodyText }]}>
        Public drives and private drives from joined organizations will appear here.
      </Text>
    </View>
  );
}

function OrganizationHomeCard({ organization, onPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const isActiveMember = Boolean(organization?.membership?.is_active);
  const isPendingMember = Boolean(organization?.membership?.is_pending);
  const joinButtonTitle = isActiveMember ? 'Joined' : isPendingMember ? 'Pending' : 'Join';
  const joinButtonIsSecondary = isActiveMember || isPendingMember;

  React.useEffect(() => {
    setImageFailed(false);
  }, [organization?.organization_logo_url]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.orgJoinCard,
        { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={[styles.orgJoinLogoWrap, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
        {organization?.organization_logo_url && !imageFailed ? (
          <Image
            source={{ uri: organization.organization_logo_url }}
            style={styles.orgJoinLogo}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <Text style={[styles.orgJoinInitials, { color: roles.primaryActionBackground }]}>
            {getInitials(organization?.organization_name)}
          </Text>
        )}
      </View>

      <Text numberOfLines={2} style={[styles.orgJoinName, { color: roles.headingText }]}>
        {organization?.organization_name || 'Partner organization'}
      </Text>
      <Text numberOfLines={3} style={[styles.orgJoinDescription, { color: roles.bodyText }]}>
        {organization?.organization_type
          ? `${organization.organization_type} partner for Donivra donation drives.`
          : 'Partner organization for hair donation activities.'}
      </Text>

      <View style={styles.orgJoinMetaRow}>
        <View style={styles.orgJoinMetaItem}>
          <MaterialCommunityIcons name="account-group-outline" size={15} color={roles.metaText} />
          <Text style={[styles.orgJoinMetaText, { color: roles.metaText }]}>Partner</Text>
        </View>
        <View style={[styles.orgJoinDot, { backgroundColor: roles.defaultCardBorder }]} />
        <View style={styles.orgJoinMetaItem}>
          <MaterialCommunityIcons name="map-marker-outline" size={15} color={roles.metaText} />
          <Text numberOfLines={1} style={[styles.orgJoinMetaText, { color: roles.metaText }]}>
            {organization?.location_label || 'Philippines'}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.orgJoinButton,
          {
            backgroundColor: joinButtonIsSecondary ? roles.supportCardBackground : roles.primaryActionBackground,
            borderColor: joinButtonIsSecondary ? roles.defaultCardBorder : roles.primaryActionBackground,
          },
        ]}
      >
        <MaterialCommunityIcons
          name={isActiveMember ? 'check' : isPendingMember ? 'clock-outline' : 'plus'}
          size={16}
          color={joinButtonIsSecondary ? roles.bodyText : roles.primaryActionText}
        />
        <Text style={[
          styles.orgJoinButtonText,
          { color: joinButtonIsSecondary ? roles.bodyText : roles.primaryActionText },
        ]}>
          {joinButtonTitle}
        </Text>
      </View>
    </Pressable>
  );
}

function OrganizationHomeSection({
  organizations,
  searchQuery,
  onSearchChange,
  onOpenOrganization,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredOrganizations = React.useMemo(() => (
    organizations.filter((organization) => {
      if (!normalizedQuery) return true;
      return [
        organization.organization_name,
        organization.organization_type,
        organization.location_label,
        organization.address_label,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    })
  ), [normalizedQuery, organizations]);
  return (
    <View style={styles.organizationHome}>
      <View style={[styles.organizationSearchShell, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
        <MaterialCommunityIcons name="magnify" size={22} color={roles.metaText} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
          placeholder="Search organizations..."
          placeholderTextColor={roles.metaText}
          style={[styles.organizationSearchInput, { color: roles.headingText }]}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.section}>
        <HomeSectionHeader title="Organizations You Can Join" />
        {filteredOrganizations.length ? (
          <View style={styles.orgJoinGrid}>
            {filteredOrganizations.slice(0, 6).map((organization) => (
              <OrganizationHomeCard
                key={`org-join-${organization.organization_id}`}
                organization={organization}
                onPress={() => onOpenOrganization(organization)}
              />
            ))}
          </View>
        ) : (
          <Text style={[styles.emptySectionText, { color: roles.bodyText }]}>No organizations matched your search.</Text>
        )}
      </View>

    </View>
  );
}

function HomeSectionHeader({ title, actionLabel, onActionPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <View style={styles.homeSectionHeader}>
      <Text style={[styles.homeSectionTitle, { color: roles.headingText }]}>{title}</Text>
      {actionLabel && onActionPress ? (
        <Pressable onPress={onActionPress} style={styles.homeSectionAction}>
          <Text style={[styles.homeSectionActionText, { color: roles.primaryActionBackground }]}>
            {actionLabel}
          </Text>
          <AppIcon name="chevronRight" size="sm" color={roles.primaryActionBackground} />
        </Pressable>
      ) : null}
    </View>
  );
}

function AiInsightCard({ message, name }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const headingFont = resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay;
  const bodyFont = resolvedTheme?.fontFamily || theme.typography.fontFamily;

  return (
    <View style={[
      styles.aiInsightCard,
      {
        backgroundColor: roles.defaultCardBackground,
        borderColor: roles.defaultCardBorder,
        borderLeftColor: roles.primaryActionBackground,
      },
    ]}>
      <View style={styles.aiInsightHeader}>
        <View style={[styles.aiInsightIconWrap, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons name="star-four-points-outline" size={18} color={roles.primaryActionBackground} />
        </View>
        <Text numberOfLines={1} style={[styles.homeGreetingTitle, { color: roles.headingText, fontFamily: headingFont }]}>
          Hello, {name}!
        </Text>
      </View>
      <Text style={[styles.aiInsightText, { color: roles.bodyText, fontFamily: bodyFont }]}>
        {message || 'Loading your personalized insight…'}
      </Text>
    </View>
  );
}

function HomeSplashLoading() {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const headingFont = resolvedTheme?.secondaryFontFamily || resolvedTheme?.fontFamily || theme.typography.fontFamilyDisplay;

  React.useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    <View style={styles.homeSplashLoading}>
      <Image
        source={logoSource}
        style={styles.homeSplashLogo}
        resizeMode="contain"
        onError={() => setImageFailed(true)}
      />
      <Text style={[styles.homeSplashBrand, { color: roles.headingText, fontFamily: headingFont }]}>
        {resolvedTheme?.brandName || 'Donivra'}
      </Text>
      <ActivityIndicator color={roles.primaryActionBackground} size="small" />
    </View>
  );
}

function OrganizationPreviewModal({
  visible,
  organization,
  isLoading,
  errorMessage,
  feedbackMessage,
  feedbackVariant,
  isJoining,
  onClose,
  onJoinOrganization,
  onViewOrganization,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const [isJoinConfirmOpen, setIsJoinConfirmOpen] = React.useState(false);
  const isActiveMember = Boolean(organization?.membership?.is_active);
  const isPendingMember = Boolean(organization?.membership?.is_pending);
  const organizationIsJoinable = (
    String(organization?.status || '').trim().toLowerCase() === 'active'
    && Boolean(organization?.is_approved)
    && String(organization?.approval_status || '').trim().toLowerCase() === 'approved'
  );
  const joinButtonTitle = isActiveMember
    ? 'Joined'
    : isPendingMember
      ? 'Pending approval'
      : 'Join organization';
  const membershipMessage = errorMessage
    || feedbackMessage
    || (isPendingMember ? 'Your request is pending. We will notify you once approved.' : '')
    || (!organizationIsJoinable && organization && !isActiveMember
      ? 'This organization is not available to join right now.'
      : '');
  const membershipVariant = errorMessage
    ? 'error'
    : feedbackMessage
      ? feedbackVariant || 'info'
      : isActiveMember
        ? 'success'
        : 'info';

  React.useEffect(() => {
    setImageFailed(false);
  }, [organization?.organization_logo_url]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewModalOverlay}>
        <Pressable style={styles.previewModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.previewModalCard}>
          <View style={styles.previewModalHeader}>
            <View style={styles.previewModalHeaderCopy}>
              <Text style={[styles.previewEyebrow, { color: roles.metaText }]}>Organization</Text>
              <Text style={[styles.previewTitle, { color: roles.headingText }]}>
                {organization?.organization_name || 'Organization preview'}
              </Text>
            </View>

            <Pressable onPress={onClose} style={[styles.previewCloseButton, { backgroundColor: roles.supportCardBackground }]}>
              <AppIcon name="close" size="sm" state="muted" />
            </Pressable>
          </View>

          {membershipMessage ? (
            <StatusBanner
              variant={membershipVariant}
              message={membershipMessage}
              style={styles.previewBanner}
            />
          ) : null}

          {isLoading ? (
            <View style={styles.previewLoadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading organization</Text>
            </View>
          ) : organization ? (
            <>
              <View style={styles.organizationPreviewSummary}>
                <View style={[styles.organizationPreviewLogoWrap, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
                  {organization.organization_logo_url && !imageFailed ? (
                    <Image
                      source={{ uri: organization.organization_logo_url }}
                      style={styles.organizationPreviewLogo}
                      resizeMode="cover"
                      onError={() => setImageFailed(true)}
                    />
                  ) : (
                    <AppIcon name="organization" size="md" state="default" color={roles.headingText} />
                  )}
                </View>

                <View style={styles.organizationPreviewCopy}>
                  {isActiveMember ? (
                    <View style={[styles.organizationPreviewPill, { backgroundColor: roles.iconPrimarySurface }]}>
                      <MaterialCommunityIcons name="check" size={13} color={roles.primaryActionBackground} />
                      <Text style={[styles.organizationPreviewPillText, { color: roles.primaryActionBackground }]}>Joined</Text>
                    </View>
                  ) : null}
                  {organization.organization_type ? (
                    <Text style={[styles.previewSupportText, { color: roles.metaText }]}>
                      {organization.organization_type}
                    </Text>
                  ) : null}
                  {organization.location_label ? (
                    <Text style={[styles.previewStatusText, { color: roles.metaText }]}>
                      {organization.location_label}
                    </Text>
                  ) : null}
                  {organization.contact_number ? (
                    <Text style={[styles.previewStatusText, { color: roles.metaText }]}>
                      {organization.contact_number}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.organizationPreviewActions}>
                <AppButton
                  title="View details"
                  variant="outline"
                  fullWidth={false}
                  onPress={onViewOrganization}
                />
                <AppButton
                  title={joinButtonTitle}
                  fullWidth={false}
                  onPress={() => setIsJoinConfirmOpen(true)}
                  disabled={isActiveMember || isPendingMember || !organizationIsJoinable}
                  loading={isJoining}
                />
              </View>
            </>
          ) : (
            <Text style={[styles.emptySectionText, { color: roles.bodyText }]}>
              Organization details are not available right now.
            </Text>
          )}
        </AppCard>
      </View>
      <Modal transparent visible={isJoinConfirmOpen} animationType="fade" onRequestClose={() => setIsJoinConfirmOpen(false)}>
        <View style={styles.joinModalOverlay}>
          <Pressable style={styles.joinModalBackdrop} onPress={() => setIsJoinConfirmOpen(false)} />
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.joinModalCard}>
            <Text style={styles.joinModalTitle}>Send Join Request?</Text>
            <Text style={styles.joinModalBody}>
              Your membership will be pending until approved by the organization.
            </Text>
            <View style={styles.joinModalActions}>
              <AppButton title="Cancel" variant="outline" fullWidth={false} onPress={() => setIsJoinConfirmOpen(false)} />
              <AppButton
                title="Confirm"
                fullWidth={false}
                loading={isJoining}
                onPress={async () => {
                  setIsJoinConfirmOpen(false);
                  await onJoinOrganization?.();
                }}
              />
            </View>
          </AppCard>
        </View>
      </Modal>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS FOR DAILY REMINDER & ANALYTICS

const conditionScoreMap = {
  healthy: 5,
  good: 4,
  'fair': 3,
  improving: 3.5,
  'needs care': 2,
  poor: 1,
  dry: 2,
  damaged: 1.5,
  treated: 3,
  rebonded: 3,
  colored: 3,
};

const normalizeConditionForChart = (condition = '') => {
  const normalized = String(condition || '').trim().toLowerCase();
  for (const [key, score] of Object.entries(conditionScoreMap)) {
    if (normalized.includes(key)) return score;
  }
  return 2.5; // default middle score
};

// Build analytics data from submissions
const buildAnalyticsData = (submissions = []) => {
  const allScreenings = submissions
    .flatMap((s) => (s?.ai_screenings || []).map((screening) => ({ submission: s, screening })))
    .filter((entry) => entry.screening?.created_at)
    .sort((a, b) => new Date(a.screening.created_at) - new Date(b.screening.created_at));

  if (!allScreenings.length) {
    return {
      hasHistory: false,
      chartData: [],
      latestStatus: null,
      latestAnalysis: null,
      trendDirection: null,
    };
  }

  // Get last 10 screenings for chart
  const recentScreenings = allScreenings.slice(-10);

  // Map to chart data
  const chartData = recentScreenings.map((entry) => ({
    date: toLocalDateKey(entry.screening.created_at),
    displayDate: formatDayLabel(entry.screening.created_at),
    value: normalizeConditionForChart(entry.screening.detected_condition),
    condition: entry.screening.detected_condition,
  }));

  // Calculate trend
  const latestValue = chartData[chartData.length - 1]?.value || 2.5;
  const earliestValue = chartData[0]?.value || 2.5;
  let trendDirection = '→';
  if (latestValue > earliestValue + 0.3) trendDirection = '↑';
  else if (latestValue < earliestValue - 0.3) trendDirection = '↓';

  return {
    hasHistory: true,
    chartData,
    latestStatus: normalizeConditionTone(allScreenings[allScreenings.length - 1]?.screening?.detected_condition),
    latestAnalysis: allScreenings[allScreenings.length - 1]?.screening || null,
    trendDirection,
  };
};

// Build daily reminder state from submissions
const buildDailyReminder = (submissions = []) => {
  const today = toLocalDateKey(new Date());

  const allScreenings = submissions
    .flatMap((s) => (s?.ai_screenings || []).map((screening) => ({ submission: s, screening })))
    .filter((entry) => entry.screening?.created_at);

  if (!allScreenings.length) {
    return {
      type: 'first-time',
      title: 'Start your hair check',
      subtitle: 'No analysis yet. Begin with CheckHair to understand your hair condition.',
      buttonLabel: 'Start CheckHair',
    };
  }

  // Check if analysis done today
  const todayScreenings = allScreenings.filter((entry) => toLocalDateKey(entry.screening.created_at) === today);

  if (todayScreenings.length > 0) {
    // Already analyzed today - show improvement tip
    const latestToday = todayScreenings[todayScreenings.length - 1];
    const decision = latestToday.screening.decision || latestToday.screening.summary || 'Keep following your routine';
    const summary = String(decision)
      .trim()
      .split('\n')[0] // first line only
      .slice(0, 100); // max 100 chars

    return {
      type: 'analyzed-today',
      title: "Today's care tip",
      subtitle: summary || 'Check your latest result for more details',
      buttonLabel: 'View latest result',
    };
  }

  // No analysis today - remind
  return {
    type: 'reminder',
    title: "You haven't checked your hair today",
    subtitle: 'Quick hair check takes 1 minute',
    buttonLabel: 'Start CheckHair',
  };
};

const buildContextualGreeting = ({ donorName, hasHistory, latestCondition, checkedToday, daysSinceLastLog, latestRecommendation }) => {
  const name = donorName || 'there';
  if (!hasHistory) return `Hey ${name}! Start your first hair check to get personalized insights.`;
  const tone = normalizeConditionTone(latestCondition || '');
  if (checkedToday) {
    return tone.label === 'Healthy'
      ? `Looking great, ${name}! Your hair is healthy today. Keep it up!`
      : `Hey ${name}! Today's check shows ${tone.label.toLowerCase()}. See your care tips below.`;
  }
  const days = Number(daysSinceLastLog) || 0;
  const daysText = days === 1 ? '1 day' : `${days} days`;
  if (days > 1) {
    return tone.label !== 'Healthy'
      ? `Hey ${name}, you haven't logged for ${daysText}. Based on your previous log, you had ${tone.label.toLowerCase()} hair. Have you tried the recommendations?`
      : `Hey ${name}! It's been ${daysText} since your last check. Your hair was healthy last time — check in again!`;
  }
  return tone.label !== 'Healthy'
    ? `Hey ${name}, your last check showed ${tone.label.toLowerCase()} hair. Have you tried the care tips we shared?`
    : `Welcome back, ${name}! Last check: ${tone.label.toLowerCase()}. Ready for today's check?`;
};

// ─────────────────────────────────────────────────────────────────────────────

export default function DonorHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const { width: viewportWidth } = useWindowDimensions();
  const { user, profile } = useAuth();
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const {
    unreadCount,
  } = useNotifications({
    role: 'donor',
    userId: user?.id,
    userEmail: user?.email || profile?.email || '',
    databaseUserId: profile?.user_id,
    mode: 'badge',
    liveUpdates: true,
  });
  const [isLoadingHome, setIsLoadingHome] = React.useState(true);
  const [homeError, setHomeError] = React.useState('');
  const [homeTab, setHomeTab] = React.useState(tabParam === 'organizations' ? 'organizations' : 'drives');
  const [organizationSearchQuery, setOrganizationSearchQuery] = React.useState('');
  const [donationDrives, setDonationDrives] = React.useState([]);
  const [organizations, setOrganizations] = React.useState([]);
  const [hairSubmissions, setHairSubmissions] = React.useState([]);
  const [isOrganizationPreviewOpen, setIsOrganizationPreviewOpen] = React.useState(false);
  const [isLoadingOrganizationPreview] = React.useState(false);
  const [selectedOrganizationPreview, setSelectedOrganizationPreview] = React.useState(null);
  const [organizationPreviewError, setOrganizationPreviewError] = React.useState('');
  const [organizationPreviewFeedback, setOrganizationPreviewFeedback] = React.useState({ message: '', variant: 'info' });
  const [isJoiningOrganizationPreview, setIsJoiningOrganizationPreview] = React.useState(false);
  // Hair log detail modal
  const [isHairLogModalOpen, setIsHairLogModalOpen] = React.useState(false);
  const [selectedHairLogEntries, setSelectedHairLogEntries] = React.useState([]);
  const [latestRecommendation, setLatestRecommendation] = React.useState(null);
  const [aiGreeting, setAiGreeting] = React.useState('');

  const firstName = String(profile?.first_name || '').trim();
  const lastName = String(profile?.last_name || '').trim();
  const greetingName = firstName || String(profile?.email || user?.email || 'Donor').split('@')[0];
  const avatarInitials = [firstName?.[0], lastName?.[0]].filter(Boolean).join('').toUpperCase();
  const avatarUri = profile?.avatar_url || profile?.photo_path || '';

  React.useEffect(() => {
    if (tabParam === 'organizations') {
      setHomeTab('organizations');
      return;
    }
    if (tabParam === 'drives') {
      setHomeTab('drives');
    }
  }, [tabParam]);
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
  const areCredentialsCompleted = profileCompletionMeta.isComplete;
  const activeDriveCardWidth = React.useMemo(() => (
    Math.min(340, Math.max(286, viewportWidth - (theme.spacing.md * 4)))
  ), [viewportWidth]);
  const activeDriveSnapInterval = activeDriveCardWidth + theme.spacing.md;

  const loadHome = React.useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return;

    if (!silent) {
      setIsLoadingHome(true);
    }
    setHomeError('');

    const [
      donationModuleResult,
      organizationsResult,
      organizationMembershipsResult,
      upcomingDrivesResult,
      submissionsResult,
      recommendationResult,
    ] = await Promise.all([
      getDonorDonationsModuleData({
        userId: user.id,
        databaseUserId: profile?.user_id || null,
        driveLimit: 8,
      }),
      fetchFeaturedOrganizations(10),
      fetchOrganizationMembershipsByUserId(profile?.user_id || null),
      fetchUpcomingDonationDrives(12, profile?.user_id || null),
      fetchHairSubmissionsByUserId(user.id, 12),
      fetchLatestDonorRecommendationByUserId(user.id).catch(() => ({ data: null })),
    ]);

    const visibleDriveRows = upcomingDrivesResult.data?.length
      ? upcomingDrivesResult.data
      : (donationModuleResult.drives || []);
    setDonationDrives(visibleDriveRows.filter(isDriveActiveForHome));
    setOrganizations(attachMembershipsToOrganizations(
      organizationsResult.data || [],
      organizationMembershipsResult.data || []
    ));
    setHairSubmissions(submissionsResult.data || []);
    setLatestRecommendation(recommendationResult?.data || null);
    const loadFailed = Boolean(
      donationModuleResult.error
      || organizationsResult.error
      || organizationMembershipsResult.error
      || upcomingDrivesResult.error
      || submissionsResult.error
    );
    setHomeError(loadFailed ? 'Some updates could not load.' : '');
    setIsLoadingHome(false);

    // Build contextual AI greeting from loaded data
    const analytics = buildAnalyticsData(submissionsResult.data || []);
    const todayStr = toLocalDateKey(new Date());
    const checkedToday = (submissionsResult.data || []).some((s) =>
      (s?.ai_screenings || []).some(
        (sc) => sc?.created_at && toLocalDateKey(sc.created_at) === todayStr
      )
    );
    const greetName = String(profile?.first_name || '').trim()
      || String(user?.email || '').split('@')[0]
      || 'Donor';

    // Compute days since last log
    const allEntries = getScreeningEntries(submissionsResult.data || []);
    const latestEntry = allEntries[0] || null;
    let daysSinceLastLog = 0;
    if (latestEntry?.screening?.created_at) {
      const lastDate = new Date(latestEntry.screening.created_at);
      daysSinceLastLog = Math.max(0, Math.floor((Date.now() - lastDate.getTime()) / 86400000));
    }

    const greetingContext = {
      donorName: greetName,
      hasHistory: analytics.hasHistory,
      latestCondition: analytics.latestAnalysis?.detected_condition || null,
      checkedToday,
      daysSinceLastLog,
      latestRecommendation: recommendationResult?.data?.recommendation_text || null,
    };

    // Set immediate fallback, then try AI enhancement
    setAiGreeting(buildContextualGreeting(greetingContext));

    // Try OpenAI edge function, then chatbot fallback
    const latestConditionText = analytics.latestAnalysis?.detected_condition || 'no result yet';
    const aiPrompt = [
      `Write one warm, personal home greeting for hair donor named ${greetName}.`,
      analytics.hasHistory
        ? `Their last hair check: ${latestConditionText}. Days since last log: ${daysSinceLastLog}.`
        : 'They have not done a hair check yet.',
      checkedToday ? 'They already checked today.' : '',
      recommendationResult?.data?.recommendation_text
        ? `Previous tip given: ${recommendationResult.data.recommendation_text.slice(0, 80)}` : '',
      'Return one short sentence under 20 words. Mention condition or days since last log. No markdown.',
    ].filter(Boolean).join(' ');

    invokeEdgeFunction('home-greeting', { body: { prompt: aiPrompt, donorName: greetName, condition: latestConditionText, daysSinceLastLog } })
      .then(({ data, error }) => {
        const text = String(data?.greeting || data?.message || '').replace(/\s+/g, ' ').trim();
        if (!error && text) { setAiGreeting(text.slice(0, 200)); return; }
        return loadChatbotBootstrap({ role: 'donor', userId: user.id });
      })
      .then((bootstrap) => {
        if (!bootstrap) return null;
        return resolveChatbotReply({
          role: 'donor',
          userId: user.id,
          text: aiPrompt,
          faqs: bootstrap.faqs || [],
          settings: bootstrap.settings,
          recentMessages: [],
        });
      })
      .then((reply) => {
        const text = String(reply?.text || '').replace(/\s+/g, ' ').trim();
        if (text) setAiGreeting(text.slice(0, 200));
      })
      .catch(() => {});
  }, [profile?.first_name, profile?.user_id, user?.email, user?.id]);

  const homeRealtimeRefreshRef = React.useRef(null);
  const scheduleHomeRealtimeRefresh = React.useCallback(() => {
    if (homeRealtimeRefreshRef.current) {
      clearTimeout(homeRealtimeRefreshRef.current);
    }

    homeRealtimeRefreshRef.current = setTimeout(() => {
      void loadHome({ silent: true });
    }, HOME_REALTIME_DEBOUNCE_MS);
  }, [loadHome]);

  React.useEffect(() => {
    loadHome();
  }, [loadHome]);

  useFocusEffect(
    React.useCallback(() => {
      void loadHome({ silent: true });
      return undefined;
    }, [loadHome])
  );

  React.useEffect(() => {
    return () => {
      if (homeRealtimeRefreshRef.current) {
        clearTimeout(homeRealtimeRefreshRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!user?.id || !profile?.user_id) return undefined;

    const channel = supabase.channel(`donor-home-live-${profile.user_id}`);
    const onRealtimeEvent = () => {
      scheduleHomeRealtimeRefresh();
    };

    channel
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Drive_Requests',
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Donation_Drive_Registrations',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Organization_Members',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Organizations',
      }, onRealtimeEvent)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'Hair_Submissions',
        filter: `User_ID=eq.${profile.user_id}`,
      }, onRealtimeEvent)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.user_id, scheduleHomeRealtimeRefresh, user?.id]);

  // Compute daily reminder and analytics data
  const dailyReminder = React.useMemo(() => buildDailyReminder(hairSubmissions), [hairSubmissions]);
  const analyticsData = React.useMemo(() => buildAnalyticsData(hairSubmissions), [hairSubmissions]);
  // Build entries array for latest result modal
  const latestResultEntries = React.useMemo(() => {
    if (!analyticsData.latestAnalysis) return [];
    
    // Find the submission that contains this latest screening
    const latestScreening = analyticsData.latestAnalysis;
    const latestSubmission = hairSubmissions.find((submission) => 
      (submission?.ai_screenings || []).some((screening) => 
        screening?.ai_screening_id === latestScreening?.ai_screening_id
      )
    );

    if (!latestSubmission) return [];

    const entry = buildHairLogDetailEntry(
      { screening: latestScreening, submission: latestSubmission },
      latestRecommendation
    );

    return entry ? [entry] : [];
  }, [analyticsData.latestAnalysis, hairSubmissions, latestRecommendation]);

  const handleOpenHairLogEntry = React.useCallback((entry) => {
    const detailEntry = buildHairLogDetailEntry(entry, latestRecommendation);
    if (!detailEntry) return;
    setSelectedHairLogEntries([detailEntry]);
    setIsHairLogModalOpen(true);
  }, [latestRecommendation]);

  const handleCloseHairLogModal = React.useCallback(() => {
    setIsHairLogModalOpen(false);
    setSelectedHairLogEntries([]);
  }, []);

  const handleNavPress = (item) => {
    if (!item.route) return;
    router.navigate(item.route);
  };

  const handleOpenOrganizationPreview = React.useCallback(async (organization) => {
    if (!organization?.organization_id) return;
    router.navigate(`/donor/organizations?organizationId=${organization.organization_id}`);
  }, [router]);

  const handleJoinOrganizationPreview = React.useCallback(async () => {
    const organizationId = selectedOrganizationPreview?.organization_id;
    if (!organizationId || !profile?.user_id) {
      setOrganizationPreviewFeedback({
        message: 'Your donor account is required before joining an organization.',
        variant: 'error',
      });
      return;
    }

    setOrganizationPreviewFeedback({ message: '', variant: 'info' });
    setOrganizationPreviewError('');
    setIsJoiningOrganizationPreview(true);
    const result = await joinOrganizationMembership({
      organizationId,
      databaseUserId: profile.user_id,
    });
    setIsJoiningOrganizationPreview(false);

    if (result.error) {
      setOrganizationPreviewFeedback({
        message: getMobileOrganizationError(result.error, 'Organization membership could not be saved right now.'),
        variant: 'error',
      });
      return;
    }

    const refreshed = await fetchOrganizationPreview(organizationId, profile.user_id);
    if (refreshed.data) {
      setSelectedOrganizationPreview(refreshed.data);
    } else if (result.data) {
      setSelectedOrganizationPreview((current) => (
        current
          ? {
              ...current,
              membership: result.data,
              drives: (current.drives || []).map((drive) => ({
                ...drive,
                membership: result.data,
              })),
            }
          : current
      ));
    }

    const nextMembership = refreshed.data?.membership || result.data || null;
    if (nextMembership) {
      setOrganizations((currentOrganizations) => currentOrganizations.map((organization) => (
        organization.organization_id === organizationId
          ? {
              ...organization,
              membership: nextMembership,
            }
          : organization
      )));
    }

    setOrganizationPreviewFeedback({
      message: result.alreadyMember
        ? 'You are already a member of this organization.'
        : result.alreadyPending
          ? 'Your request is still pending approval.'
          : result.requestSubmitted
            ? 'Join request submitted. Waiting for organization approval.'
            : 'Organization membership updated.',
      variant: result.requestSubmitted || result.alreadyPending ? 'info' : 'success',
    });
  }, [profile?.user_id, selectedOrganizationPreview?.organization_id]);

  const handleViewOrganizationPreview = React.useCallback(() => {
    const organizationId = selectedOrganizationPreview?.organization_id;
    if (!organizationId) return;
    setIsOrganizationPreviewOpen(false);
    setOrganizationPreviewError('');
    setOrganizationPreviewFeedback({ message: '', variant: 'info' });
    router.navigate(`/donor/organizations?organizationId=${organizationId}`);
  }, [router, selectedOrganizationPreview?.organization_id]);

  return (
    <DashboardLayout
      navItems={donorDashboardNavItems}
      activeNavKey="home"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
      showSupportChat={false}
      chatModalPresentation="centered"
      draggableChat={true}
      header={(
        <DonorTopBar
          title=""
          avatarInitials={avatarInitials}
          avatarUri={avatarUri}
          unreadCount={unreadCount}
          onNotificationsPress={() => router.navigate('/donor/notifications')}
          onProfilePress={() => router.navigate('/profile')}
          onLogoutPress={logout}
          isLoggingOut={isLoggingOut}
        />
      )}
    >
      {homeError ? (
        <StatusBanner
          variant="info"
          message={homeError}
          style={styles.statusBanner}
        />
      ) : null}

      {isLoadingHome ? (
        <HomeSplashLoading />
      ) : (
        <View style={styles.homeFeed}>
          <AnimatedHomeSection delay={10}>
            <HomeModeTabs activeTab={homeTab} onChange={setHomeTab} />
          </AnimatedHomeSection>

          {homeTab === 'drives' ? (
            <AnimatedHomeSection delay={20}>
              <AiInsightCard
                name={greetingName}
                message={aiGreeting || buildContextualGreeting({
                  donorName: greetingName,
                  hasHistory: analyticsData.hasHistory,
                  latestCondition: analyticsData.latestAnalysis?.detected_condition || null,
                  checkedToday: dailyReminder.type === 'analyzed-today',
                  latestRecommendation: latestRecommendation?.recommendation_text || null,
                })}
              />
            </AnimatedHomeSection>
          ) : null}

          {!areCredentialsCompleted ? (
            <AnimatedHomeSection delay={60}>
              <FinishSetupCard
                completionMeta={profileCompletionMeta}
                onManageProfile={() => router.navigate('/profile')}
              />
            </AnimatedHomeSection>
          ) : null}

          {homeTab === 'drives' ? (
            <>
              <AnimatedHomeSection delay={90} style={styles.section}>
                <HomeSectionHeader title="Analysis History" />
                <HairCalendarWidget
                  hairSubmissions={hairSubmissions}
                  onOpenDate={handleOpenHairLogEntry}
                />
              </AnimatedHomeSection>

              <AnimatedHomeSection delay={140} style={styles.section}>
                <HomeSectionHeader title="Active Donation Drives" />
                {donationDrives.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    decelerationRate="fast"
                    snapToInterval={activeDriveSnapInterval}
                    snapToAlignment="start"
                    contentContainerStyle={styles.activeDriveCarouselContent}
                    style={styles.activeDriveCarousel}
                  >
                    {donationDrives.slice(0, 8).map((drive) => (
                        <ActiveDonationDriveCard
                          key={`active-drive-${drive.donation_drive_id}`}
                          drive={drive}
                          onPress={() => router.navigate(`/donor/drives/${drive.donation_drive_id}`)}
                          style={{ width: activeDriveCardWidth }}
                        />
                      ))}
                  </ScrollView>
                ) : (
                  <View style={styles.activeDriveList}>
                    <EmptyDonationDriveCard />
                  </View>
                )}
              </AnimatedHomeSection>
            </>
          ) : (
            <AnimatedHomeSection delay={90}>
              <OrganizationHomeSection
                organizations={organizations}
                searchQuery={organizationSearchQuery}
                onSearchChange={setOrganizationSearchQuery}
                onOpenOrganization={handleOpenOrganizationPreview}
              />
            </AnimatedHomeSection>
          )}
        </View>
      )}

      <OrganizationPreviewModal
        visible={isOrganizationPreviewOpen}
        organization={selectedOrganizationPreview}
        isLoading={isLoadingOrganizationPreview}
        errorMessage={organizationPreviewError}
        feedbackMessage={organizationPreviewFeedback.message}
        feedbackVariant={organizationPreviewFeedback.variant}
        isJoining={isJoiningOrganizationPreview}
        onClose={() => {
          setIsOrganizationPreviewOpen(false);
          setOrganizationPreviewError('');
          setOrganizationPreviewFeedback({ message: '', variant: 'info' });
        }}
        onJoinOrganization={handleJoinOrganizationPreview}
        onViewOrganization={handleViewOrganizationPreview}
      />

      <SharedHairLogDetailModal
        visible={isHairLogModalOpen}
        entries={selectedHairLogEntries.length ? selectedHairLogEntries : latestResultEntries}
        onClose={handleCloseHairLogModal}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  statusBanner: {
    marginTop: 0,
  },
  homeFeed: {
    gap: theme.spacing.sm,
  },
  homeModeTabs: {
    minHeight: 58,
    marginHorizontal: -theme.spacing.md,
    marginTop: -theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  homeModeTab: {
    flex: 1,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  homeModeTabActive: {
    borderBottomWidth: 2,
  },
  homeModeTabText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  activeDriveList: {
    gap: theme.spacing.md,
  },
  activeDriveCarousel: {
    marginHorizontal: -theme.spacing.md,
  },
  activeDriveCarouselContent: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  activeDriveCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    ...theme.shadows.soft,
  },
  activeDriveCover: {
    width: '100%',
    height: 188,
    overflow: 'hidden',
  },
  activeDriveImage: {
    width: '100%',
    height: '100%',
  },
  activeDriveFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDriveBody: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  activeDriveTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  activeDriveTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
  },
  activeDriveBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  activeDriveBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  activeDriveDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  activeDriveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  activeDriveMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '47%',
  },
  activeDriveMetaText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  activeDriveMetaDot: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  activeDriveButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.sm,
  },
  activeDriveButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
  },
  emptyDriveCard: {
    minHeight: 164,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  emptyDriveIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeFlowGrid: {
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  flowGridItem: {
    width: '100%',
  },
  flowGridItemStacked: {
    width: '100%',
  },
  setupCardContent: {
    gap: theme.spacing.md,
  },
  setupCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  setupIcon: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupCopy: {
    flex: 1,
    gap: 4,
  },
  setupTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  setupBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  setupButton: {
    minHeight: 48,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  setupButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  flowActionRow: {
    minHeight: 92,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  flowActionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  flowActionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  flowCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  flowIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowBadge: {
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  flowBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.4,
  },
  flowCardCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  flowCardTitle: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.compact.body * theme.typography.lineHeights.snug,
  },
  flowCardDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    flexShrink: 1,
  },
  flowActionCta: {
    minHeight: 38,
    maxWidth: 128,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  flowCardButton: {
    minHeight: 42,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  flowCardButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  upcomingDriveHero: {
    height: 224,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  upcomingDriveImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  upcomingDriveFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingDriveScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
  upcomingDriveCopy: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    bottom: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  upcomingDriveEyebrow: {
    color: theme.colors.palette.white,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.8,
  },
  upcomingDriveTitle: {
    color: theme.colors.palette.white,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  upcomingDriveMeta: {
    color: theme.colors.palette.white,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  emptyDriveHero: {
    minHeight: 132,
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  emptyDriveTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  emptyDriveText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  organizationList: {
    gap: theme.spacing.sm,
  },
  organizationRow: {
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  organizationRowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  organizationRowCopy: {
    flex: 1,
    gap: 3,
  },
  organizationRowName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.semibold,
  },
  organizationRowMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  quickOverviewSection: {
    gap: theme.spacing.xs,
  },
  section: {
    gap: theme.spacing.sm,
  },
  homeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
  },
  homeSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  homeSectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 32,
  },
  homeSectionActionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  loadingState: {
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  homeSplashLoading: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xxxl,
  },
  homeSplashLogo: {
    width: 118,
    height: 118,
  },
  homeSplashBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    textAlign: 'center',
  },
  emptySectionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  emptySectionTextInline: {
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },
  // Drive feed (Facebook style)
  driveFeedScroll: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
  },
  driveFeedItem: {
    width: 190,
  },
  driveCard: {
    width: 190,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  driveCover: {
    width: '100%',
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  driveCoverImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  driveDateBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  driveDateBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
  },
  driveLinkedTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  driveLinkedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  driveCardBody: {
    padding: theme.spacing.sm,
    gap: 3,
  },
  driveOrgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  driveTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.snug,
  },
  driveSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    flex: 1,
  },
  // Hair condition widget
  hairWidgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  hairWidgetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  hairWidgetIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairWidgetTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
  },
  hairWidgetViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  hairWidgetViewBtnText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  hairMetricList: {
    gap: theme.spacing.xs,
  },
  hairMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  hairMetricIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  hairMetricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    width: 90,
  },
  hairMetricTrack: {
    flex: 1,
    height: 7,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
  },
  hairMetricFill: {
    height: '100%',
    borderRadius: theme.radius.full,
  },
  hairMetricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
    width: 30,
    textAlign: 'right',
  },
  hairWidgetSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    marginTop: theme.spacing.xs,
    lineHeight: theme.typography.compact.caption * 1.4,
  },
  // Week strip calendar
  calWeekStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
  calWeekDayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  calWeekDayLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
  },
  organizationCard: {
    width: '100%',
    minHeight: 134,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
  },
  organizationLogoWrap: {
    width: '100%',
    height: 68,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  organizationLogo: {
    width: '100%',
    height: '100%',
  },
  organizationInitials: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.bold,
  },
  organizationName: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    fontWeight: theme.typography.weights.semibold,
  },
  organizationLocation: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  organizationHome: {
    gap: theme.spacing.md,
  },
  organizationSearchShell: {
    minHeight: 50,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  organizationSearchInput: {
    flex: 1,
    minHeight: 48,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    paddingVertical: 0,
  },
  orgJoinGrid: {
    gap: theme.spacing.sm,
  },
  orgJoinCard: {
    minHeight: 206,
    borderRadius: 18,
    borderWidth: 1,
    padding: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'flex-start',
    ...theme.shadows.soft,
  },
  orgJoinLogoWrap: {
    width: 68,
    height: 68,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  orgJoinLogo: {
    width: '100%',
    height: '100%',
  },
  orgJoinInitials: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  orgJoinName: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
    marginBottom: 4,
  },
  orgJoinDescription: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.sm,
  },
  orgJoinMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'stretch',
    marginBottom: theme.spacing.sm,
  },
  orgJoinMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '46%',
  },
  orgJoinMetaText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  orgJoinDot: {
    width: 4,
    height: 4,
    borderRadius: theme.radius.full,
  },
  orgJoinButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 'auto',
  },
  orgJoinButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  previewModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  previewModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewModalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  joinModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  joinModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  joinModalCard: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
  },
  joinModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  joinModalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  joinModalActions: {
    marginTop: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  previewModalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  previewEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  previewTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  previewCloseButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBanner: {
    marginBottom: theme.spacing.sm,
  },
  previewLoadingState: {
    minHeight: 172,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  previewIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  previewLogo: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  previewLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIdentityCopy: {
    flex: 1,
    gap: 2,
  },
  previewSupportText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  previewStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  previewMetaBlock: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  previewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  previewMetaText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  previewBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.md,
  },
  previewActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  driveQrStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  driveQrImage: {
    width: 220,
    height: 220,
  },
  driveQrMeta: {
    alignItems: 'center',
    gap: 4,
    marginBottom: theme.spacing.md,
  },
  driveQrStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  driveQrContextTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  driveQrContextText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  organizationPreviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  organizationPreviewIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  organizationPreviewSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  organizationPreviewLogoWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
  },
  organizationPreviewLogo: {
    width: '100%',
    height: '100%',
  },
  organizationPreviewCopy: {
    flex: 1,
    gap: 2,
  },
  organizationPreviewPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    marginBottom: 2,
  },
  organizationPreviewPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  organizationDriveList: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  organizationDriveTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  organizationDriveRow: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
  },
  organizationDriveName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    marginBottom: 2,
  },
  organizationDriveDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  organizationDriveRegistration: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    marginTop: 2,
  },
  emptyCalendarState: {
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  emptyCalendarIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCalendarCopy: {
    gap: 4,
  },
  emptyCalendarTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  emptyCalendarBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  compactCalendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  compactSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
  },
  compactConditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  compactConditionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  iconOnlyButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  calendarMonthLabel: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
  },
  calendarSummaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  latestConditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  latestConditionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xs,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: theme.spacing.xs,
  },
  calendarCell: {
    width: '13.5%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  calendarCellLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
  },
  conditionDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
  },
  // ─── AI Insight Card ───────────────────────────────────────────────────────
  aiInsightCard: {
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  aiInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  aiInsightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  homeGreetingTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
  },
  aiInsightText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  // ─── Monthly Calendar ───────────────────────────────────────────────────────
  calMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  calMonthLabel: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
  },
  calMonthNav: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  calNavBtn: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calWeekCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  calWeekLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  calRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  calDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 3,
    gap: 2,
  },
  calDayCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayToday: {
    borderRadius: 19,
  },
  calDaySelected: {
    borderWidth: 2,
  },
  calDayNumber: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 17,
    fontWeight: theme.typography.weights.semibold,
  },
  calCheckBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  joinOrgPromptCard: {
    gap: theme.spacing.sm,
  },
  joinOrgPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  joinOrgIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  joinOrgCopy: {
    flex: 1,
    gap: 3,
  },
  joinOrgTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
  },
  joinOrgSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  horizontalPicker: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    paddingBottom: 2,
  },
  horizontalPickerItem: {
    width: 132,
  },

  // ─── Hair Log Detail Modal ────────────────────────────────────────────────
  hairLogModalCard: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    maxHeight: '85%',
  },
  hairLogScroll: {
    flexGrow: 0,
  },
  hairLogScrollContent: {
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  hairLogConditionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  hairLogConditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hairLogConditionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogConditionDetail: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  hairLogSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    marginTop: theme.spacing.xs,
  },
  hairLogPhotoLoading: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairLogPhotoRow: {
    gap: theme.spacing.sm,
    paddingBottom: 2,
  },
  hairLogPhoto: {
    width: 100,
    height: 100,
    borderRadius: 14,
  },
  hairLogEmptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  hairLogAiBlock: {
    borderRadius: 16,
    borderWidth: 1,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  hairLogDecisionBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  hairLogDecisionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'capitalize',
  },
  hairLogAiSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  hairLogMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  hairLogMetaItem: {
    gap: 2,
    minWidth: 72,
  },
  hairLogMetaKey: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hairLogMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogDamageNote: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * 1.5,
    fontStyle: 'italic',
  },
  hairLogRecsLoader: {
    alignSelf: 'flex-start',
  },
  hairLogRecsList: {
    gap: 0,
  },
  hairLogRecItem: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    gap: 2,
  },
  hairLogRecTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  hairLogRecText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },

  // ─── Daily Hair Reminder Card ────────────────────────────────────────────
  reminderCard: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  reminderContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  reminderIconWrap: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  reminderCopy: {
    flex: 1,
    gap: 1,
  },
  reminderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.compact.bodyMd * theme.typography.lineHeights.snug,
  },
  reminderSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  reminderFooter: {
    marginTop: theme.spacing.xs,
  },

  // ─── Hair Analytics Card ─────────────────────────────────────────────────
  analyticsCard: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: 4,
  },
  analyticsTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: theme.typography.compact.bodyMd * theme.typography.lineHeights.snug,
  },
  analyticsSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
});

