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
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
  fetchDonationDrivePreview,
  fetchFeaturedOrganizations,
  fetchOrganizationPreview,
  fetchOrganizationMembershipsByUserId,
  fetchRelevantDonationDriveUpdates,
  joinOrganizationMembership,
} from '../../src/features/donorHome.api';
import { getDonorDonationsModuleData } from '../../src/features/donorDonations.service';
import { useAuthActions } from '../../src/features/auth/hooks/useAuthActions';
import { useNotifications } from '../../src/hooks/useNotifications';
import { useAuth } from '../../src/providers/AuthProvider';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../../src/design-system/theme';
import { invokeEdgeFunction } from '../../src/api/supabase/client';
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

const formatDriveQrStatusLabel = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'Pending';
  if (normalized === 'pending qr') return 'Pending';

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

const getConditionVisual = (condition = '', decision = '') => {
  const normalized = `${condition} ${decision}`.trim().toLowerCase();

  if (normalized.includes('healthy') || normalized.includes('eligible') || normalized.includes('good')) {
    return {
      icon: 'check-circle',
      label: 'Healthy',
    };
  }

  if (normalized.includes('dry') || normalized.includes('damaged') || normalized.includes('frizz') || normalized.includes('improve')) {
    return {
      icon: 'alert-circle',
      label: 'Needs care',
    };
  }

  if (normalized.includes('treated') || normalized.includes('rebonded') || normalized.includes('colored')) {
    return {
      icon: 'circle-slice-8',
      label: 'Treated',
    };
  }

  return {
    icon: 'circle-outline',
    label: condition || 'No check',
  };
};

const getConditionLevel10 = (condition = '', decision = '') => {
  const normalized = `${condition} ${decision}`.toLowerCase();
  if (normalized.includes('eligible') || normalized.includes('healthy') || normalized.includes('good')) return 9;
  if (normalized.includes('treated') || normalized.includes('colored') || normalized.includes('rebonded')) return 6;
  if (normalized.includes('dry') && normalized.includes('damaged')) return 3;
  if (normalized.includes('damaged') || normalized.includes('breakage')) return 2;
  if (normalized.includes('dry') || normalized.includes('frizz') || normalized.includes('oily') || normalized.includes('improve')) return 4;
  if (normalized.includes('fair')) return 5;
  return condition || decision ? 6 : 0;
};

const getScreeningEntries = (submissions = []) => (
  submissions
    .flatMap((submission) => (submission?.ai_screenings || []).map((screening) => ({ submission, screening })))
    .filter((entry) => entry.screening?.created_at)
    .sort((left, right) => new Date(right.screening.created_at).getTime() - new Date(left.screening.created_at).getTime())
);

const WEEK_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getCalendarDotColor = (level) => {
  if (level >= 8) return '#54b86f';
  if (level >= 5) return '#f0a856';
  if (level > 0) return '#e05252';
  return null;
};

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

  // Build 7-day week strip (Mon–Sun of the current week)
  const weekDays = React.useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun
    // Get Monday of current week
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const key = toLocalDateKey(d);
      const submission = submissionByDate.get(key) || null;
      const latestScreening = submission
        ? (submission.ai_screenings || [])
            .filter((sc) => sc?.created_at && toLocalDateKey(sc.created_at) === key)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null
        : null;
      const level = latestScreening
        ? getConditionLevel10(latestScreening.detected_condition || '', latestScreening.decision || '')
        : 0;
      const isToday = key === todayKey;
      const dayName = isToday ? 'Today' : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
      return { date: d, key, submission, latestScreening, level, dayName };
    });
  }, [submissionByDate, todayKey]);

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
      const level = latestScreening
        ? getConditionLevel10(latestScreening.detected_condition || '', latestScreening.decision || '')
        : 0;
      cells.push({ date, key, submission, latestScreening, level });
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

  const selectedCell = React.useMemo(() => {
    if (isMonthExpanded) {
      return calendarGrid.find((c) => c && c.key === selectedKey) || null;
    }
    return weekDays.find((c) => c.key === selectedKey) || null;
  }, [calendarGrid, isMonthExpanded, selectedKey, weekDays]);

  const renderDayCell = (cell, key) => {
    if (!cell) return <View key={key} style={styles.calDayCell} />;
    const isToday = cell.key === todayKey;
    const isSelected = cell.key === selectedKey;
    const dotColor = getCalendarDotColor(cell.level);
    const hasLog = Boolean(cell.latestScreening);
    return (
      <Pressable
        key={cell.key}
        onPress={() => setSelectedKey(cell.key)}
        style={({ pressed }) => [styles.calDayCell, pressed ? styles.cardPressed : null]}
      >
        {dotColor
          ? <View style={[styles.calDot, { backgroundColor: dotColor }]} />
          : <View style={styles.calDotSpacer} />}
        <View style={[
          styles.calDayCircle,
          isToday ? [styles.calDayToday, { backgroundColor: roles.primaryActionBackground }] : null,
          isSelected && !isToday ? [styles.calDaySelected, { borderColor: roles.primaryActionBackground }] : null,
        ]}>
          <Text style={[styles.calDayNumber, {
            color: isToday ? roles.primaryActionText : hasLog ? roles.headingText : roles.metaText,
            fontFamily: bodyFont,
          }]}>
            {cell.date.getDate()}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <AppCard variant="default" radius="xl" padding="md">
      {/* Header row */}
      <View style={styles.calMonthHeader}>
        <Text style={[styles.calMonthLabel, { color: roles.headingText, fontFamily: headingFont }]}>
          {isMonthExpanded ? monthLabel : new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
        </Text>
        <View style={styles.calMonthNav}>
          {isMonthExpanded ? (
            <>
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
            </>
          ) : null}
          <Pressable
            onPress={() => setIsMonthExpanded((v) => !v)}
            style={({ pressed }) => [styles.calNavBtn, { backgroundColor: roles.iconPrimarySurface }, pressed ? styles.cardPressed : null]}
          >
            <MaterialCommunityIcons
              name={isMonthExpanded ? 'calendar-minus' : 'calendar-month-outline'}
              size={16}
              color={roles.primaryActionBackground}
            />
          </Pressable>
        </View>
      </View>

      {/* Weekday label row */}
      <View style={styles.calWeekRow}>
        {WEEK_DAY_LABELS.map((day) => (
          <View key={day} style={styles.calWeekCell}>
            <Text style={[styles.calWeekLabel, { color: roles.metaText, fontFamily: bodyFont }]}>{day}</Text>
          </View>
        ))}
      </View>

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
            const dotColor = getCalendarDotColor(day.level);
            const hasLog = Boolean(day.latestScreening);
            return (
              <Pressable
                key={day.key}
                onPress={() => setSelectedKey(day.key)}
                style={({ pressed }) => [styles.calWeekDayCol, pressed ? styles.cardPressed : null]}
              >
                <Text style={[styles.calWeekDayLabel, {
                  color: isToday ? roles.primaryActionBackground : roles.metaText,
                  fontFamily: bodyFont,
                  fontWeight: isToday ? theme.typography.weights.bold : theme.typography.weights.regular,
                }]}>
                  {day.dayName}
                </Text>
                {dotColor
                  ? <View style={[styles.calDot, { backgroundColor: dotColor }]} />
                  : <View style={styles.calDotSpacer} />}
                <View style={[
                  styles.calDayCircle,
                  isToday ? [styles.calDayToday, { backgroundColor: roles.primaryActionBackground }] : null,
                  isSelected && !isToday ? [styles.calDaySelected, { borderColor: roles.primaryActionBackground }] : null,
                ]}>
                  <Text style={[styles.calDayNumber, {
                    color: isToday ? roles.primaryActionText : hasLog ? roles.headingText : roles.metaText,
                    fontFamily: bodyFont,
                  }]}>
                    {day.date.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Progress section */}
      <View style={[styles.calProgressSection, { borderTopColor: roles.defaultCardBorder }]}>
        <Text style={[styles.calProgressTitle, { color: roles.headingText, fontFamily: headingFont }]}>
          {selectedKey === todayKey
            ? "Today's check"
            : `${new Date(`${selectedKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        </Text>
        {selectedCell?.latestScreening ? (() => {
          const dotColor = getCalendarDotColor(selectedCell.level);
          const visual = getConditionVisual(
            selectedCell.latestScreening.detected_condition,
            selectedCell.latestScreening.decision
          );
          return (
            <View style={styles.calProgressRow}>
              <View style={[styles.calProgressDot, { backgroundColor: dotColor || roles.metaText }]} />
              <View style={styles.calProgressCopy}>
                <Text style={[styles.calProgressCondition, { color: roles.headingText, fontFamily: bodyFont }]}>
                  {visual.label}
                </Text>
                {selectedCell.latestScreening.summary ? (
                  <Text numberOfLines={1} style={[styles.calProgressSummary, { color: roles.bodyText, fontFamily: bodyFont }]}>
                    {selectedCell.latestScreening.summary}
                  </Text>
                ) : null}
              </View>
              {onOpenDate ? (
                <Pressable
                  onPress={() => onOpenDate({ submission: selectedCell.submission, screening: selectedCell.latestScreening })}
                  style={({ pressed }) => [styles.calProgressViewBtn, { backgroundColor: roles.iconPrimarySurface }, pressed ? styles.cardPressed : null]}
                >
                  <MaterialCommunityIcons name="chevron-right" size={16} color={roles.primaryActionBackground} />
                </Pressable>
              ) : null}
            </View>
          );
        })() : (
          <Text style={[styles.calProgressEmpty, { color: roles.metaText, fontFamily: bodyFont }]}>
            {selectedKey === todayKey ? 'No hair check yet today.' : 'No log for this date.'}
          </Text>
        )}
      </View>

      {/* Color legend */}
      <View style={styles.calLegendRow}>
        {[['#54b86f', 'Good'], ['#f0a856', 'Monitor'], ['#e05252', 'Needs care']].map(([color, label]) => (
          <View key={label} style={styles.calLegendItem}>
            <View style={[styles.calLegendDot, { backgroundColor: color }]} />
            <Text style={[styles.calLegendText, { color: roles.metaText, fontFamily: bodyFont }]}>{label}</Text>
          </View>
        ))}
      </View>
    </AppCard>
  );
}

function DonationDriveCard({ drive }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const imageUrl = drive?.event_image_url || drive?.organization_logo_url || '';

  React.useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);

  return (
    <View style={[styles.driveCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
      {/* Cover banner */}
      <View style={[styles.driveCover, { backgroundColor: roles.iconPrimarySurface }]}>
        {imageUrl && !imageFailed ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.driveCoverImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <MaterialCommunityIcons name="gift-outline" size={32} color={roles.primaryActionBackground} />
        )}
        {/* Date badge floating on cover */}
        <View style={[styles.driveDateBadge, { backgroundColor: roles.defaultCardBackground, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, elevation: 2 }]}>
          <MaterialCommunityIcons name="calendar-check-outline" size={10} color={roles.primaryActionBackground} />
          <Text numberOfLines={1} style={[styles.driveDateBadgeText, { color: roles.headingText }]}>
            {formatDriveDate(drive.start_date, drive.end_date)}
          </Text>
        </View>
        {/* Joined if registered */}
        {drive.registration ? (
          <View style={[styles.driveLinkedTag, { backgroundColor: roles.primaryActionBackground }]}>
            <Text style={[styles.driveLinkedText, { color: roles.primaryActionText }]}>Joined</Text>
          </View>
        ) : null}
      </View>

      {/* Content */}
      <View style={styles.driveCardBody}>
        <Text numberOfLines={2} style={[styles.driveTitle, { color: roles.headingText }]}>
          {drive.event_title || 'Donation drive'}
        </Text>
        {drive.organization_name ? (
          <View style={styles.driveOrgRow}>
            <MaterialCommunityIcons name="domain" size={11} color={roles.metaText} />
            <Text numberOfLines={1} style={[styles.driveSubtitle, { color: roles.bodyText }]}>
              {drive.organization_name}
            </Text>
          </View>
        ) : null}
        {drive.location_label || drive.city ? (
          <View style={styles.driveOrgRow}>
            <MaterialCommunityIcons name="map-marker-outline" size={11} color={roles.metaText} />
            <Text numberOfLines={1} style={[styles.driveSubtitle, { color: roles.metaText }]}>
              {drive.location_label || drive.city}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
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
    <AppCard
      variant={filled ? 'default' : 'outline'}
      radius="xl"
      padding="md"
      style={[
        filled ? { backgroundColor: roles.primaryActionBackground, borderColor: roles.primaryActionBackground } : null,
        style,
      ]}
      contentStyle={styles.flowCardContent}
    >
      <View style={styles.flowCardTop}>
        <View style={[
          styles.flowIconWrap,
          { backgroundColor: filled ? roles.primaryActionText : roles.iconPrimarySurface },
        ]}>
          <MaterialCommunityIcons
            name={icon}
            size={22}
            color={filled ? roles.primaryActionBackground : roles.primaryActionBackground}
          />
        </View>
        {badge ? (
          <View style={[styles.flowBadge, { backgroundColor: badgeStyles.backgroundColor }]}>
            <Text style={[styles.flowBadgeText, { color: badgeStyles.color }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.flowCardCopy}>
        <Text style={[styles.flowCardTitle, { color: filled ? roles.primaryActionText : roles.headingText }]}>
          {title}
        </Text>
        <Text numberOfLines={2} style={[styles.flowCardDescription, { color: filled ? roles.primaryActionText : roles.bodyText }]}>
          {description}
        </Text>
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.flowCardButton,
          {
            backgroundColor: filled ? roles.primaryActionText : roles.primaryActionBackground,
            borderColor: filled ? roles.primaryActionText : roles.primaryActionBackground,
          },
          pressed ? styles.cardPressed : null,
        ]}
      >
        <Text style={[
          styles.flowCardButtonText,
          { color: filled ? roles.primaryActionBackground : roles.primaryActionText },
        ]}>
          {buttonTitle}
        </Text>
      </Pressable>
    </AppCard>
  );
}

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
          Join a partnered organization to see hair donation activities.
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

function PartneredOrganizationsSection({ organizations, onOpenOrganization, onViewAll }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <View style={styles.section}>
      <HomeSectionHeader title="Partnered Organizations" actionLabel="Join" onActionPress={onViewAll} />
      {organizations.length ? (
        <View style={styles.organizationList}>
          {organizations.slice(0, 3).map((organization) => (
            <Pressable
              key={`org-row-${organization.organization_id}`}
              onPress={() => onOpenOrganization(organization)}
              style={({ pressed }) => [
                styles.organizationRow,
                { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
                pressed ? styles.cardPressed : null,
              ]}
            >
              <View style={[styles.organizationRowIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons name="hand-heart-outline" size={19} color={roles.primaryActionBackground} />
              </View>
              <View style={styles.organizationRowCopy}>
                <Text numberOfLines={1} style={[styles.organizationRowName, { color: roles.headingText }]}>
                  {organization.organization_name}
                </Text>
                <Text numberOfLines={1} style={[styles.organizationRowMeta, { color: roles.metaText }]}>
                  {organization.location_label || organization.organization_type || 'Partner organization'}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={roles.metaText} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptySectionText, { color: roles.bodyText }]}>No organizations available right now.</Text>
      )}
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
    <View style={[styles.aiInsightCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
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

function PreviewMetaRow({ icon, text }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!text) return null;

  return (
    <View style={styles.previewMetaRow}>
      <AppIcon name={icon} size="sm" state="muted" />
      <Text numberOfLines={2} style={[styles.previewMetaText, { color: roles.bodyText }]}>
        {text}
      </Text>
    </View>
  );
}

function DonationDrivePreviewModal({
  visible,
  drive,
  isLoading,
  errorMessage,
  feedbackMessage,
  feedbackVariant,
  onClose,
  onShowMore,
  onContinue,
  primaryActionTitle = 'Continue',
  primaryActionDisabled = false,
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.previewModalOverlay}>
        <Pressable style={styles.previewModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.previewModalCard}>
          <View style={styles.previewModalHeader}>
            <View style={styles.previewModalHeaderCopy}>
              <Text style={[styles.previewEyebrow, { color: roles.metaText }]}>Drive preview</Text>
              <Text style={[styles.previewTitle, { color: roles.headingText }]}>
                {drive?.event_title || 'Donation drive'}
              </Text>
            </View>

            <Pressable onPress={onClose} style={[styles.previewCloseButton, { backgroundColor: roles.supportCardBackground }]}>
              <AppIcon name="close" size="sm" state="muted" />
            </Pressable>
          </View>

          {feedbackMessage ? (
            <StatusBanner
              variant={feedbackVariant || 'info'}
              message={feedbackMessage}
              style={styles.previewBanner}
            />
          ) : null}

          {isLoading ? (
            <View style={styles.previewLoadingState}>
              <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              <Text style={[styles.loadingText, { color: roles.bodyText }]}>Loading drive overview</Text>
            </View>
          ) : drive ? (
            <>
              <View style={styles.previewIdentityRow}>
                {drive.event_image_url || drive.organization_logo_url ? (
                  <Image source={{ uri: drive.event_image_url || drive.organization_logo_url }} style={styles.previewLogo} resizeMode="cover" />
                ) : (
                  <View style={[styles.previewLogoFallback, { backgroundColor: roles.iconPrimarySurface }]}>
                    <AppIcon name="donations" size="md" state="default" color={roles.iconPrimaryColor} />
                  </View>
                )}

                <View style={styles.previewIdentityCopy}>
                  {drive.organization_name ? (
                    <Text style={[styles.previewSupportText, { color: roles.metaText }]}>
                      {drive.organization_name}
                    </Text>
                  ) : null}
                  <Text style={[styles.previewStatusText, { color: roles.metaText }]}>
                    {drive.registration ? 'Joineded' : (drive.status || 'Upcoming')}
                  </Text>
                </View>
              </View>

              <View style={styles.previewMetaBlock}>
                <PreviewMetaRow icon="appointment" text={formatDriveDate(drive.start_date, drive.end_date)} />
                <PreviewMetaRow icon="location" text={drive.address_label || drive.location_label} />
              </View>

              {drive.short_overview ? (
                <Text style={[styles.previewBody, { color: roles.bodyText }]}>
                  {drive.short_overview}
                </Text>
              ) : null}

              <View style={styles.previewActions}>
                <AppButton
                  title={primaryActionTitle}
                  fullWidth={false}
                  onPress={onContinue}
                  disabled={primaryActionDisabled}
                />
                <AppButton
                  title="Show more"
                  variant="outline"
                  fullWidth={false}
                  onPress={onShowMore}
                />
              </View>
            </>
          ) : (
            <Text style={[styles.emptySectionText, { color: roles.bodyText }]}>
              Drive details are not available right now.
            </Text>
          )}
        </AppCard>
      </View>
    </Modal>
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
}) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const [imageFailed, setImageFailed] = React.useState(false);
  const isActiveMember = Boolean(organization?.membership?.is_active);
  const hasInactiveMembership = Boolean(organization?.membership && !organization?.membership?.is_active);
  const organizationIsJoinable = (
    String(organization?.status || '').trim().toLowerCase() === 'active'
    && Boolean(organization?.is_approved)
    && String(organization?.approval_status || '').trim().toLowerCase() === 'approved'
  );
  const joinButtonTitle = isActiveMember
    ? 'Joined'
    : hasInactiveMembership
      ? 'Rejoin organization'
      : 'Join organization';
  const membershipMessage = errorMessage
    || feedbackMessage
    || (
      isActiveMember
        ? 'You are already a member of this organization.'
        : !organizationIsJoinable && organization
          ? 'This organization is not available to join right now.'
          : ''
    );
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
              <View style={styles.organizationPreviewIdentity}>
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

              {organization.short_overview ? (
                <Text style={[styles.previewBody, { color: roles.bodyText }]}>
                  {organization.short_overview}
                </Text>
              ) : null}

              {organization.drives?.length ? (
                <View style={styles.organizationDriveList}>
                  <Text style={[styles.organizationDriveTitle, { color: roles.headingText }]}>Related drives</Text>
                  {organization.drives.map((drive) => (
                    <View key={`preview-drive-${drive.donation_drive_id}`} style={[styles.organizationDriveRow, { borderColor: roles.defaultCardBorder }]}>
                      <Text numberOfLines={1} style={[styles.organizationDriveName, { color: roles.headingText }]}>
                        {drive.event_title}
                      </Text>
                      <Text style={[styles.organizationDriveDate, { color: roles.metaText }]}>
                        {formatDriveDate(drive.start_date, drive.end_date)}
                      </Text>
                      {drive.registration?.registration_status ? (
                        <Text style={[styles.organizationDriveRegistration, { color: roles.metaText }]}>
                          {formatDriveQrStatusLabel(drive.registration.registration_status)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.organizationPreviewActions}>
                <AppButton
                  title={joinButtonTitle}
                  fullWidth={false}
                  onPress={onJoinOrganization}
                  disabled={isActiveMember || !organizationIsJoinable}
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
  const { user, profile, resolvedTheme } = useAuth();
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
  const [donationDrives, setDonationDrives] = React.useState([]);
  const [organizations, setOrganizations] = React.useState([]);
  const [activeOrganizationMemberships, setActiveOrganizationMemberships] = React.useState([]);
  const [hairSubmissions, setHairSubmissions] = React.useState([]);
  const [showAllDrives, setShowAllDrives] = React.useState(false);
  const [isDrivePreviewOpen, setIsDrivePreviewOpen] = React.useState(false);
  const [isOrganizationPreviewOpen, setIsOrganizationPreviewOpen] = React.useState(false);
  const [isLoadingDrivePreview, setIsLoadingDrivePreview] = React.useState(false);
  const [isLoadingOrganizationPreview, setIsLoadingOrganizationPreview] = React.useState(false);
  const [selectedDrivePreview, setSelectedDrivePreview] = React.useState(null);
  const [selectedOrganizationPreview, setSelectedOrganizationPreview] = React.useState(null);
  const [drivePreviewError, setDrivePreviewError] = React.useState('');
  const [organizationPreviewError, setOrganizationPreviewError] = React.useState('');
  const [drivePreviewFeedback, setDrivePreviewFeedback] = React.useState({ message: '', variant: 'info' });
  const [organizationPreviewFeedback, setOrganizationPreviewFeedback] = React.useState({ message: '', variant: 'info' });
  const [isJoiningOrganizationPreview, setIsJoiningOrganizationPreview] = React.useState(false);
  const [donationFlowState, setDonationFlowState] = React.useState({
    hasOngoingDonation: false,
    ongoingDonationMessage: '',
    isEligible: false,
    isDonationReady: false,
    latestScreeningCreatedAt: '',
  });
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

  const loadHome = React.useCallback(async () => {
    if (!user?.id) return;

    setIsLoadingHome(true);
    setHomeError('');

    const [
      donationModuleResult,
      organizationsResult,
      memberDriveUpdatesResult,
      membershipsResult,
      submissionsResult,
      recommendationResult,
    ] = await Promise.all([
      getDonorDonationsModuleData({
        userId: user.id,
        databaseUserId: profile?.user_id || null,
        driveLimit: 8,
      }),
      fetchFeaturedOrganizations(10),
      fetchRelevantDonationDriveUpdates({
        databaseUserId: profile?.user_id || null,
        limit: 12,
      }),
      fetchOrganizationMembershipsByUserId(profile?.user_id || null),
      fetchHairSubmissionsByUserId(user.id, 12),
      fetchLatestDonorRecommendationByUserId(user.id).catch(() => ({ data: null })),
    ]);

    setDonationDrives(memberDriveUpdatesResult.data?.length ? memberDriveUpdatesResult.data : (donationModuleResult.drives || []));
    setOrganizations(organizationsResult.data || []);
    setActiveOrganizationMemberships((membershipsResult.data || []).filter((membership) => membership.is_active));
    setHairSubmissions(submissionsResult.data || []);
    setLatestRecommendation(recommendationResult?.data || null);
    setDonationFlowState({
      hasOngoingDonation: Boolean(donationModuleResult.hasOngoingDonation),
      ongoingDonationMessage: donationModuleResult.ongoingDonationMessage || '',
      isEligible: Boolean(donationModuleResult.isEligible || donationModuleResult.isAiEligible),
      isDonationReady: Boolean(donationModuleResult.isDonationReady),
      latestScreeningCreatedAt: donationModuleResult.latestScreening?.created_at || '',
    });

    const loadFailed = Boolean(
      donationModuleResult.error
      || organizationsResult.error
      || memberDriveUpdatesResult.error
      || membershipsResult.error
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

  React.useEffect(() => {
    loadHome();
  }, [loadHome]);

  const isMemberOfAnyOrg = !isLoadingHome && (activeOrganizationMemberships.length > 0 || donationDrives.some((d) => d.is_member));
  const memberOrgDrives = React.useMemo(
    () => donationDrives.filter((d) => d.is_member),
    [donationDrives]
  );
  const visibleMemberDrives = showAllDrives ? memberOrgDrives : memberOrgDrives.slice(0, 4);

  // Compute daily reminder and analytics data
  const dailyReminder = React.useMemo(() => buildDailyReminder(hairSubmissions), [hairSubmissions]);
  const analyticsData = React.useMemo(() => buildAnalyticsData(hairSubmissions), [hairSubmissions]);
  const firstUpcomingDrive = React.useMemo(() => {
    const sortedDrives = [...donationDrives]
      .filter((drive) => drive?.donation_drive_id)
      .sort((left, right) => new Date(left?.start_date || 8640000000000000).getTime() - new Date(right?.start_date || 8640000000000000).getTime());
    return sortedDrives[0] || null;
  }, [donationDrives]);
  const latestAnalysisDateLabel = analyticsData.latestAnalysis?.created_at
    ? formatDriveDate(analyticsData.latestAnalysis.created_at)
    : '';
  const hairConditionBadgeLabel = analyticsData.hasHistory
    ? String(analyticsData.latestStatus?.label || 'Checked').toUpperCase()
    : 'START';
  const hairConditionBadgeVariant = analyticsData.latestStatus?.label === 'Healthy'
    ? 'success'
    : analyticsData.hasHistory
      ? 'warning'
      : 'neutral';
  const donationEligibilityLabel = donationFlowState.isEligible
    ? 'ELIGIBLE'
    : donationFlowState.latestScreeningCreatedAt
      ? 'RECHECK'
      : 'CHECK REQUIRED';
  const donationEligibilityBadgeVariant = donationFlowState.isEligible
    ? 'success'
    : donationFlowState.latestScreeningCreatedAt
      ? 'warning'
      : 'neutral';
  const openProfileOrRoute = React.useCallback((route) => {
    if (!areCredentialsCompleted) {
      router.navigate('/profile');
      return;
    }

    router.navigate(route);
  }, [areCredentialsCompleted, router]);

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

  const handleOpenDrivePreview = React.useCallback(async (drive) => {
    if (!drive?.donation_drive_id) return;

    setSelectedDrivePreview(drive);
    setDrivePreviewError('');
    setDrivePreviewFeedback({ message: '', variant: 'info' });
    setIsDrivePreviewOpen(true);
    setIsLoadingDrivePreview(true);

    const result = await fetchDonationDrivePreview(drive.donation_drive_id, profile?.user_id || null);
    if (result.error) {
      setDrivePreviewError('Drive details could not be loaded right now.');
    }

    if (result.data) {
      setSelectedDrivePreview(result.data);
    }

    setIsLoadingDrivePreview(false);
  }, [profile?.user_id]);

  const handleOpenOrganizationPreview = React.useCallback(async (organization) => {
    if (!organization?.organization_id) return;

    setSelectedOrganizationPreview(organization);
    setOrganizationPreviewError('');
    setOrganizationPreviewFeedback({ message: '', variant: 'info' });
    setIsOrganizationPreviewOpen(true);
    setIsLoadingOrganizationPreview(true);

    const result = await fetchOrganizationPreview(organization.organization_id, profile?.user_id || null);
    if (result.error) {
      setOrganizationPreviewError('Organization details could not be loaded right now.');
    }

    if (result.data) {
      setSelectedOrganizationPreview(result.data);
    }

    setIsLoadingOrganizationPreview(false);
  }, [profile?.user_id]);

  const handleContinueDriveFlow = React.useCallback(() => {
    if (!selectedDrivePreview?.donation_drive_id) return;
    setIsDrivePreviewOpen(false);
    router.navigate(`/donor/drives/${selectedDrivePreview.donation_drive_id}`);
  }, [router, selectedDrivePreview]);

  const handleShowDriveMore = React.useCallback(() => {
    if (!selectedDrivePreview?.donation_drive_id) return;
    setIsDrivePreviewOpen(false);
    router.navigate(`/donor/drives/${selectedDrivePreview.donation_drive_id}`);
  }, [router, selectedDrivePreview]);

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
      const errorText = String(result.error?.message || '').trim();
      setOrganizationPreviewFeedback({
        message: errorText || 'Organization membership could not be saved right now.',
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

    setOrganizationPreviewFeedback({
      message: result.alreadyMember ? 'You are already a member of this organization.' : 'Organization joined successfully.',
      variant: 'success',
    });
  }, [profile?.user_id, selectedOrganizationPreview?.organization_id]);

  const hasOngoingDonation = Boolean(donationFlowState.hasOngoingDonation);
  const ongoingDonationMessage = donationFlowState.ongoingDonationMessage
    || 'You already have an ongoing donation. Please complete or wait for the current donation process to finish before starting a new one.';
  const drivePreviewMessage = drivePreviewError
    || drivePreviewFeedback.message
    || (
      selectedDrivePreview?.registration?.qr?.is_valid
        ? 'This drive is already linked to your account.'
        : hasOngoingDonation
          ? ongoingDonationMessage
          : selectedDrivePreview?.organization_id && !selectedDrivePreview?.membership?.is_active
            ? 'Join the organization first to view this drive.'
            : ''
    );
  const drivePreviewVariant = drivePreviewError
    ? 'error'
    : (drivePreviewFeedback.message ? drivePreviewFeedback.variant : 'info');
  const drivePreviewPrimaryTitle = 'Continue';
  const drivePreviewPrimaryDisabled = !selectedDrivePreview?.registration?.qr?.is_valid && hasOngoingDonation;
  return (
    <DashboardLayout
      navItems={donorDashboardNavItems}
      activeNavKey="home"
      navVariant="donor"
      onNavPress={handleNavPress}
      screenVariant="default"
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

          {!areCredentialsCompleted ? (
            <AnimatedHomeSection delay={60}>
              <FinishSetupCard
                completionMeta={profileCompletionMeta}
                onManageProfile={() => router.navigate('/profile')}
              />
            </AnimatedHomeSection>
          ) : null}

          <AnimatedHomeSection delay={90} style={styles.homeFlowGrid}>
            <DonorFlowCard
              title="Hair Condition"
              icon="hair-dryer-outline"
              badge={hairConditionBadgeLabel}
              badgeVariant={hairConditionBadgeVariant}
              description={analyticsData.hasHistory
                ? `Last scan: ${latestAnalysisDateLabel || 'recently'}. Review your hair condition before donation.`
                : 'Start with the hair condition flow before using donation features.'}
              buttonTitle="Check Hair Condition"
              onPress={() => openProfileOrRoute('/donor/donations')}
              style={styles.flowGridItem}
            />
            <DonorFlowCard
              title="Donation Status"
              icon="hand-heart-outline"
              badge={donationEligibilityLabel}
              badgeVariant={donationEligibilityBadgeVariant}
              description={donationFlowState.hasOngoingDonation
                ? ongoingDonationMessage
                : donationFlowState.isEligible
                  ? 'Your latest hair eligibility can be used for donation logistics or event registration.'
                  : 'Complete or re-check hair eligibility within the last month before donating.'}
              buttonTitle={donationFlowState.isEligible ? 'Donate Hair' : 'Start Eligibility Check'}
              onPress={() => openProfileOrRoute(donationFlowState.isEligible ? '/donor/status' : '/donor/donations')}
              filled={analyticsData.hasHistory}
              style={styles.flowGridItem}
            />
          </AnimatedHomeSection>

          {analyticsData.hasHistory ? (
            <AnimatedHomeSection delay={120}>
              <HairCalendarWidget
                hairSubmissions={hairSubmissions}
                onOpenDate={handleOpenHairLogEntry}
              />
            </AnimatedHomeSection>
          ) : null}

          <AnimatedHomeSection delay={160} style={styles.section}>
            <HomeSectionHeader
              title="Upcoming Drives"
              actionLabel="View Events"
              onActionPress={() => openProfileOrRoute('/donor/status')}
            />
            <UpcomingDriveHero
              drive={firstUpcomingDrive}
              onPress={() => firstUpcomingDrive ? handleOpenDrivePreview(firstUpcomingDrive) : openProfileOrRoute('/donor/organizations')}
            />
          </AnimatedHomeSection>

          <AnimatedHomeSection delay={190} style={styles.section}>
            {isMemberOfAnyOrg ? (
              <>
                <HomeSectionHeader
                  title="Organization drives"
                  actionLabel={memberOrgDrives.length > 4 ? (showAllDrives ? 'Less' : 'All') : undefined}
                  onActionPress={memberOrgDrives.length > 4 ? () => setShowAllDrives((current) => !current) : undefined}
                />
                {visibleMemberDrives.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.driveFeedScroll}
                  >
                    {visibleMemberDrives.map((item) => (
                      <Pressable
                        key={`drive-${item.donation_drive_id}`}
                        onPress={() => handleOpenDrivePreview(item)}
                        style={({ pressed }) => [styles.driveFeedItem, pressed ? styles.cardPressed : null]}
                      >
                        <DonationDriveCard drive={item} />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={[styles.emptySectionText, { color: resolveThemeRoles(resolvedTheme).bodyText }]}>No drives yet.</Text>
                )}
              </>
            ) : null}
          </AnimatedHomeSection>

          <AnimatedHomeSection delay={220}>
            <PartneredOrganizationsSection
              organizations={organizations}
              onOpenOrganization={handleOpenOrganizationPreview}
              onViewAll={() => openProfileOrRoute('/donor/organizations')}
            />
          </AnimatedHomeSection>
        </View>
      )}

      <DonationDrivePreviewModal
        visible={isDrivePreviewOpen}
        drive={selectedDrivePreview}
        isLoading={isLoadingDrivePreview}
        errorMessage={drivePreviewError}
        feedbackMessage={drivePreviewMessage}
        feedbackVariant={drivePreviewVariant}
        onClose={() => {
          setIsDrivePreviewOpen(false);
          setDrivePreviewError('');
          setDrivePreviewFeedback({ message: '', variant: 'info' });
        }}
        onShowMore={handleShowDriveMore}
        onContinue={handleContinueDriveFlow}
        primaryActionTitle={drivePreviewPrimaryTitle}
        primaryActionDisabled={drivePreviewPrimaryDisabled}
      />

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
  homeFlowGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  flowGridItem: {
    flexGrow: 1,
    flexBasis: '47%',
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
  flowCardContent: {
    minHeight: 174,
    gap: theme.spacing.sm,
  },
  flowCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  flowIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
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
    fontSize: 11,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.4,
  },
  flowCardCopy: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  flowCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight: theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
  },
  flowCardDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
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
    fontSize: theme.typography.compact.bodyMd,
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
    marginBottom: theme.spacing.xs,
  },
  calWeekDayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: theme.spacing.xs,
  },
  calWeekDayLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    marginBottom: 2,
  },
  calLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  calLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calLegendDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
  },
  calLegendText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
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
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
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
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  calDotSpacer: {
    width: 5,
    height: 5,
  },
  calDayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calDayToday: {
    borderRadius: 16,
  },
  calDaySelected: {
    borderWidth: 1.5,
  },
  calDayNumber: {
    fontSize: 12,
    fontWeight: '500',
  },
  calProgressSection: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    gap: theme.spacing.sm,
  },
  calProgressTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
  },
  calProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  calProgressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  calProgressCopy: {
    flex: 1,
    gap: 2,
  },
  calProgressCondition: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyMd,
    fontWeight: theme.typography.weights.semibold,
  },
  calProgressSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  calProgressViewBtn: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  calProgressEmpty: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  calendarLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  calendarLegendDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
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

