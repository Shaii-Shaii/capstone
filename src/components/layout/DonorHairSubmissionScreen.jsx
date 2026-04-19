import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DashboardLayout } from './DashboardLayout';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { AppTextLink } from '../ui/AppTextLink';
import { StatusBanner } from '../ui/StatusBanner';
import { DonorTopBar } from '../donor/DonorTopBar';
import { HairLogDetailModal } from '../hair/HairLogDetailModal';
import { theme } from '../../design-system/theme';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useDonorHairSubmission } from '../../hooks/useDonorHairSubmission';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import {
  fetchHairSubmissionsByUserId,
} from '../../features/hairSubmission.api';
import {
  hairAnalyzerComplianceDefaultValues,
  hairAnalyzerComplianceSchema,
  hairAnalyzerQuestionDefaultValues,
  hairAnalyzerQuestionSchema,
  buildHairReviewDefaultValues,
  hairResultCorrectionSchema,
  buildHairResultCorrectionDefaultValues,
} from '../../features/hairSubmission.schema';
import { hairAnalyzerQuestionChoices } from '../../features/hairSubmission.constants';
import { logAppEvent } from '../../utils/appErrors';
const PHOTO_GUIDELINE_ITEMS = [
  'Use proper lighting.',
  'Keep other people and objects out of the background.',
  'Remove clips, caps, and other hair accessories.',
  'Make sure the hair is fully visible and not hidden at the back.',
  'Keep your face visible clearly.',
];

const PHOTO_CAPTURE_TARGETS = [
  'Front view photo',
  'Side profile photo',
  'Hair ends close-up',
];

const getChoiceLabel = (choices = [], value = '') => (
  choices.find((item) => item.value === value)?.label || value || 'Not set'
);

const getChoiceLabels = (choices = [], values = []) => (
  (Array.isArray(values) ? values : [])
    .map((value) => getChoiceLabel(choices, value))
    .filter(Boolean)
    .join(', ')
);

const isAnswered = (question, answers = {}) => {
  const value = answers?.[question?.key];

  if (!question) return false;
  if (question.type === 'multi') return Array.isArray(value) && value.length > 0;
  if (question.type === 'number') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }

  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
};

const formatLengthLabel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Not detected';
  const inches = numericValue / 2.54;
  return `${numericValue.toFixed(1)} cm / ${inches.toFixed(1)} in`;
};

const formatScheduleDateLabel = (dateValue, startTime = '', endTime = '') => {
  if (!dateValue) return 'Schedule to be announced';

  try {
    const formattedDate = new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateValue));
    return [formattedDate, startTime && endTime ? `${startTime} to ${endTime}` : ''].filter(Boolean).join(' • ');
  } catch {
    return [dateValue, startTime, endTime].filter(Boolean).join(' • ');
  }
};

const normalizeAnalysisText = (analysis) => (
  [
    analysis?.summary,
    analysis?.visible_damage_notes,
    analysis?.invalid_image_reason,
    ...(Array.isArray(analysis?.per_view_notes) ? analysis.per_view_notes.map((item) => item?.notes || '') : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
);

const hasDetectedConcern = (source, keywords = [], negativePhrases = []) => (
  keywords.some((keyword) => source.includes(keyword))
  && !negativePhrases.some((phrase) => source.includes(phrase))
);

const buildEligibilitySummary = ({ analysis, confirmedValues, questionnaireAnswers, donationRequirement }) => {
  if (!analysis) return { status: 'Pending', tone: 'info', reasons: [], contextNote: '' };

  const reasons = [];
  const source = normalizeAnalysisText(analysis);
  const confirmedLength = Number(confirmedValues?.declaredLength || analysis?.estimated_length);
  const hasChemicalProcessHistory = questionnaireAnswers?.chemicalProcessHistory === 'yes';
  const minimumDonationLength = Math.max(
    35.56,
    donationRequirement?.minimum_hair_length != null ? Number(donationRequirement.minimum_hair_length) : 0
  );

  if (!analysis.is_hair_detected) reasons.push('Hair must be clearly visible in the uploaded photo set.');
  if (analysis?.missing_views?.length) reasons.push(`Required views are incomplete: ${analysis.missing_views.join(', ')}.`);
  if (Number.isFinite(confirmedLength) && confirmedLength < minimumDonationLength) {
    reasons.push(`Donation readiness usually needs at least ${(minimumDonationLength / 2.54).toFixed(1)} inches of visible hair.`);
  }
  if (
    hasChemicalProcessHistory
    && (
      donationRequirement?.chemical_treatment_status === false
      || donationRequirement?.colored_hair_status === false
      || donationRequirement?.bleached_hair_status === false
      || donationRequirement?.rebonded_hair_status === false
    )
  ) {
    reasons.push('Recent chemical processing may affect donation eligibility under the current requirement.');
  }
  if (hasDetectedConcern(source, ['clip', 'accessory', 'obstruction', 'blocked'], ['no clip', 'no accessory', 'not blocked'])) {
    reasons.push('Hair accessories or other objects should not block the hair during screening.');
  }

  const aiStatus = analysis.decision === 'Eligible for hair donation'
    ? 'Eligible for hair donation'
    : 'Improve hair condition';
  const status = aiStatus;
  const tone = aiStatus === 'Eligible for hair donation' && !reasons.length ? 'success' : 'info';

  return {
    status,
    tone,
    reasons,
    contextNote: donationRequirement?.donation_requirement_id
      ? 'This check compares your answers and photos with the latest donation requirement.'
      : 'Donation requirement data was not available, so this check used your answers and uploaded photos only.',
  };
};

function ChoiceList({ value, options, onChange, multi = false }) {
  const values = Array.isArray(value) ? value : [];

  return (
    <View style={styles.choiceList}>
      {options.map((option) => {
        const isActive = multi ? values.includes(option.value) : value === option.value;

        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (multi) {
                const nextValues = isActive
                  ? values.filter((item) => item !== option.value)
                  : [...values, option.value];
                onChange(nextValues);
                return;
              }

              onChange(option.value);
            }}
            style={[styles.choiceCard, isActive ? styles.choiceCardActive : null]}
          >
            <Text style={[styles.choiceLabel, isActive ? styles.choiceLabelActive : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PhotoSlotCard({ view, photo, onCapture, onUpload, onRemove, isCapturing, isUploading }) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg">
      <Text style={styles.slotTitle}>{view.label}</Text>
      <Text style={styles.slotDescription}>{view.helperText || 'Add a clear photo for this required view. You can capture a new photo or upload one instead.'}</Text>

      {photo ? (
        <View style={styles.slotPreviewWrap}>
          <Image source={{ uri: photo.uri }} style={styles.slotPreviewImage} />
          <View style={styles.slotPreviewPill}>
            <Text style={styles.slotPreviewPillText}>Saved to this slot</Text>
          </View>
        </View>
      ) : (
        <View style={styles.slotPlaceholder}>
          <AppIcon name="camera" state="muted" size="xl" />
          <Text style={styles.slotPlaceholderTitle}>No photo yet</Text>
          <Text style={styles.slotPlaceholderBody}>Use capture or upload to complete this required slot.</Text>
        </View>
      )}

      <View style={styles.slotActionRow}>
        <AppButton title={photo ? 'Retake' : 'Capture Photo'} onPress={onCapture} loading={isCapturing} fullWidth={false} />
        <AppButton title={photo ? 'Replace' : 'Upload'} variant="outline" onPress={onUpload} loading={isUploading} fullWidth={false} />
        {photo ? <AppButton title="Remove" variant="ghost" onPress={onRemove} fullWidth={false} /> : null}
      </View>
    </AppCard>
  );
}

function PhotoCaptureModal({
  visible,
  view,
  hasCameraPermission,
  cameraRef,
  isCapturing,
  errorMessage,
  onClose,
  onCapture,
  onUpload,
  onRequestPermission,
}) {
  if (!visible || !view) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.captureModalOverlay}>
        <Pressable style={styles.captureModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.captureModalCard}>
          <View style={styles.captureModalHeader}>
            <View>
              <Text style={styles.stepTitle}>{view.label}</Text>
              <Text style={styles.stepDescription}>Use the live camera to capture this required hair-check photo.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.captureModalClose}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <View style={styles.captureModalStage}>
            {hasCameraPermission ? (
              <CameraView
                ref={cameraRef}
                style={styles.captureModalPreview}
                facing="back"
                mode="picture"
                animateShutter
              />
            ) : (
              <View style={styles.captureModalPlaceholder}>
                <AppIcon name="camera" state="active" size="xl" />
                <Text style={styles.captureModalPlaceholderTitle}>Camera access needed</Text>
                <Text style={styles.captureModalPlaceholderBody}>
                  Allow camera access to capture this hair photo. You can still upload an image if needed.
                </Text>
              </View>
            )}
          </View>

          {errorMessage ? <Text style={styles.questionError}>{errorMessage}</Text> : null}

          <View style={styles.captureModalActions}>
            <AppButton title="Upload Instead" variant="outline" fullWidth={false} onPress={onUpload} />
            {hasCameraPermission ? (
              <AppButton title={isCapturing ? 'Capturing...' : 'Capture Photo'} fullWidth={false} onPress={onCapture} loading={isCapturing} />
            ) : (
              <AppButton title="Allow Camera" fullWidth={false} onPress={onRequestPermission} />
            )}
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

function ResultMetricCard({ label, value }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value || 'Not detected'}</Text>
    </View>
  );
}

function RecommendationCard({ recommendation, isTopPriority }) {
  return (
    <View style={[styles.recommendationCard, isTopPriority ? styles.recommendationCardPrimary : null]}>
      <Text style={styles.recommendationPill}>{isTopPriority ? 'Top priority' : `Priority ${recommendation.priority_order}`}</Text>
      {recommendation.title ? <Text style={styles.recommendationTitle}>{recommendation.title}</Text> : null}
      <Text style={styles.recommendationBody}>{recommendation.recommendation_text}</Text>
    </View>
  );
}

function CorrectionChoiceField({ value, options, onChange }) {
  return (
    <View style={styles.choiceList}>
      {options.map((option) => {
        const isActive = value === option.value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.choiceCard, isActive ? styles.choiceCardActive : null]}
          >
            <Text style={[styles.choiceLabel, isActive ? styles.choiceLabelActive : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const FIRST_TIME_QUESTION_STEPS = [
  {
    key: 'washFrequency',
    title: 'How often do you wash your hair?',
    type: 'choice',
    optionsKey: 'washFrequency',
  },
  {
    key: 'scalpItch',
    title: 'Does your scalp itch?',
    type: 'choice',
    optionsKey: 'itchFrequency',
  },
  {
    key: 'dandruffOrFlakes',
    title: 'Do you notice dandruff or flakes?',
    type: 'choice',
    optionsKey: 'dandruffLevel',
  },
  {
    key: 'oilyAfterWash',
    title: 'Does your scalp get oily quickly after washing?',
    type: 'choice',
    optionsKey: 'quickOiliness',
  },
  {
    key: 'dryOrRough',
    title: 'Does your hair feel dry or rough?',
    type: 'choice',
    optionsKey: 'drynessLevel',
  },
  {
    key: 'hairFall',
    title: 'Do you notice more hair fall than usual?',
    type: 'choice',
    optionsKey: 'hairFallLevel',
  },
  {
    key: 'chemicalProcessHistory',
    title: 'Have you used bleach, hair color, rebond, relax, or perm?',
    type: 'choice',
    optionsKey: 'chemicalProcessHistory',
  },
  {
    key: 'heatUse',
    title: 'Do you often use heat on your hair?',
    type: 'choice',
    optionsKey: 'heatUseFrequency',
  },
];

const RETURNING_QUESTION_STEPS = [
  {
    key: 'followedPreviousAdvice',
    title: 'Since your last hair check, did you follow the recommended hair-care advice?',
    helperText: 'This helps compare your current result with your last saved recommendations.',
    type: 'choice',
    optionsKey: 'recommendationFollowThrough',
  },
  {
    key: 'hairConditionProgress',
    title: 'Since your last check, how would you describe your hair now?',
    type: 'choice',
    optionsKey: 'hairProgress',
  },
  {
    key: 'noticedChanges',
    title: 'What changes have you noticed since your last check?',
    helperText: 'Choose all that apply.',
    type: 'multi',
    optionsKey: 'followUpChanges',
  },
  {
    key: 'heatUseSinceLastCheck',
    title: 'Have you used heat styling since your last hair check?',
    type: 'choice',
    optionsKey: 'heatUseFrequency',
  },
  {
    key: 'chemicalTreatmentSinceLastCheck',
    title: 'Have you used bleach, color, rebond, relax, or perm since your last check?',
    type: 'choice',
    optionsKey: 'chemicalProcessHistory',
  },
  {
    key: 'routineChangedSinceLastCheck',
    title: 'Have you changed your hair-care routine since your last check?',
    type: 'choice',
    optionsKey: 'yesNo',
  },
  {
    key: 'routineChangeFocus',
    title: 'If yes, what changed most?',
    type: 'choice',
    optionsKey: 'routineChangeFocus',
    showWhen: (answers = {}) => answers?.routineChangedSinceLastCheck === 'yes',
  },
  {
    key: 'healthierNow',
    title: 'Do you feel your hair is healthier now than before?',
    type: 'choice',
    optionsKey: 'healthyNow',
  },
];

const getQuestionStepsForMode = (questionnaireMode = 'first_time') => (
  questionnaireMode === 'returning_follow_up'
    ? RETURNING_QUESTION_STEPS
    : FIRST_TIME_QUESTION_STEPS
);

const getVisibleQuestions = (answers = {}, questionnaireMode = 'first_time') => (
  getQuestionStepsForMode(questionnaireMode).filter((item) => !item.showWhen || item.showWhen(answers))
);

const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const formatCalendarMonthLabel = (value) => (
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(value)
);

const formatCalendarDayLabel = (value) => (
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
);

const buildCalendarDays = (visibleMonth) => {
  const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const firstWeekday = firstDay.getDay();
  const firstCalendarDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - firstWeekday);

  return Array.from({ length: 35 }, (_, index) => {
    const day = new Date(firstCalendarDay);
    day.setDate(firstCalendarDay.getDate() + index);
    return day;
  });
};

const normalizeConditionTone = (condition = '') => {
  const normalized = String(condition || '').trim().toLowerCase();

  if (normalized.includes('healthy') || normalized.includes('good')) {
    return { dotColor: '#54b86f', label: 'Healthy' };
  }

  if (normalized.includes('dry') || normalized.includes('damaged')) {
    return { dotColor: '#f0a856', label: 'Needs care' };
  }

  if (normalized.includes('treated') || normalized.includes('rebonded') || normalized.includes('colored')) {
    return { dotColor: '#7a8ae6', label: 'Treated' };
  }

  return {
    dotColor: theme.colors.brandPrimary,
    label: condition || 'Checked',
  };
};

// Converts a Date object or ISO string to the user's LOCAL calendar date key (YYYY-MM-DD).
// Using toISOString() on local-midnight Date objects shifts the day in UTC+N timezones,
// causing a one-day mismatch between calendar cells and stored screening dates.
const toLocalDateKey = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildHairConditionHistory = (submissions = []) => {
  const entries = submissions
    .flatMap((submission) => {
      const latestDetail = [...(submission?.submission_details || [])]
        .sort((left, right) => new Date(right.created_at || 0).getTime() - new Date(left.created_at || 0).getTime())[0] || null;

      return (submission?.ai_screenings || [])
        .filter((screening) => screening?.created_at)
        .map((screening) => ({
          screening,
          submission,
          detail: latestDetail,
          images: latestDetail?.images || [],
          recommendations: submission?.donor_recommendations || [],
        }));
    });

  const markers = new Map();

  entries.forEach((entry) => {
    const key = toLocalDateKey(entry.screening.created_at);
    const current = markers.get(key) || [];
    current.push(entry);
    current.sort((left, right) => new Date(right.screening.created_at).getTime() - new Date(left.screening.created_at).getTime());
    markers.set(key, current);
  });

  const latestEntry = [...entries].sort((left, right) => (
    new Date(right.screening.created_at).getTime() - new Date(left.screening.created_at).getTime()
  ))[0] || null;

  return {
    markers,
    latestEntry,
    latestScreening: latestEntry?.screening || null,
    screenings: entries.map((entry) => entry.screening),
    entries,
  };
};

const buildAnalysisHistoryContext = (submissions = []) => {
  const history = buildHairConditionHistory(submissions);
  const sortedEntries = [...history.entries]
    .sort((left, right) => new Date(right.screening.created_at).getTime() - new Date(left.screening.created_at).getTime());
  const latestEntry = sortedEntries[0] || null;
  const entries = sortedEntries
    .slice(0, 6)
    .map((entry) => ({
      created_at: entry.screening?.created_at || '',
      detected_condition: entry.screening?.detected_condition || '',
      decision: entry.screening?.decision || '',
      summary: entry.screening?.summary || '',
      estimated_length: entry.screening?.estimated_length ?? null,
      recommendations: Array.isArray(entry.recommendations)
        ? entry.recommendations
          .slice(0, 4)
          .map((recommendation) => ({
            title: recommendation?.title || '',
            recommendation_text: recommendation?.recommendation_text || '',
            priority_order: recommendation?.priority_order ?? null,
          }))
        : [],
    }));

  return {
    total_checks: history.screenings.length,
    latest_condition: history.latestScreening?.detected_condition || '',
    latest_check_at: history.latestScreening?.created_at || '',
    latest_result: latestEntry?.screening
      ? {
          created_at: latestEntry.screening.created_at || '',
          detected_condition: latestEntry.screening.detected_condition || '',
          decision: latestEntry.screening.decision || '',
          summary: latestEntry.screening.summary || '',
          estimated_length: latestEntry.screening.estimated_length ?? null,
        }
      : null,
    latest_recommendations: Array.isArray(latestEntry?.recommendations)
      ? latestEntry.recommendations
        .slice(0, 4)
        .map((recommendation) => ({
          title: recommendation?.title || '',
          recommendation_text: recommendation?.recommendation_text || '',
          priority_order: recommendation?.priority_order ?? null,
        }))
      : [],
    entries,
  };
};

const buildHistoryTrendLabel = (submissions = []) => {
  const screenings = submissions
    .flatMap((submission) => submission?.ai_screenings || [])
    .filter((screening) => screening?.created_at && screening?.detected_condition)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 2);

  if (screenings.length < 2) return '';

  const scoreCondition = (condition = '') => {
    const normalized = String(condition || '').toLowerCase();
    if (normalized.includes('healthy') || normalized.includes('good')) return 3;
    if (normalized.includes('dry') || normalized.includes('frizz')) return 2;
    if (normalized.includes('damaged') || normalized.includes('treated')) return 1;
    return 2;
  };

  const latestScore = scoreCondition(screenings[0]?.detected_condition);
  const previousScore = scoreCondition(screenings[1]?.detected_condition);

  if (latestScore > previousScore) return 'Trend looks better than your last check.';
  if (latestScore < previousScore) return 'Trend suggests your hair may need more care than last time.';
  return 'Trend looks similar to your last hair check.';
};

const buildDonationReadinessLabel = ({ screening, donationRequirement }) => {
  if (!screening) return '';
  if (screening?.donation_readiness_note) return screening.donation_readiness_note;

  const estimatedLength = Number(screening.estimated_length);
  const minimumDonationLength = Math.max(
    35.56,
    donationRequirement?.minimum_hair_length != null ? Number(donationRequirement.minimum_hair_length) : 0
  );

  if (!Number.isFinite(estimatedLength)) return '';
  if (estimatedLength < minimumDonationLength) return 'Hair is not yet long enough for donation guidance.';

  const condition = String(screening.detected_condition || '').toLowerCase();
  if (condition.includes('healthy') || condition.includes('good')) {
    return 'Hair may be ready for donation review if you want to continue.';
  }

  return 'Hair may be long enough, but this check suggests improving the condition first.';
};

function HairConditionLogCard({ submissions, onOpenAnalyzer, onSelectDate, trendLabel = '' }) {
  const history = useMemo(() => buildHairConditionHistory(submissions), [submissions]);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const hasHistory = history.markers.size > 0;
  const latestTone = normalizeConditionTone(history.latestScreening?.detected_condition);
  const latestLengthLabel = history.latestScreening?.estimated_length
    ? formatLengthLabel(history.latestScreening.estimated_length)
    : '';
  const latestSummary = history.latestScreening?.summary || 'Your saved hair check will appear here for long-term tracking.';
  const latestDateKey = history.latestScreening?.created_at
    ? toLocalDateKey(history.latestScreening.created_at)
    : '';

  useEffect(() => {
    if (!history.latestScreening?.created_at) return;

    const latestMonth = new Date(history.latestScreening.created_at);
    if (Number.isNaN(latestMonth.getTime())) return;

    setVisibleMonth(new Date(latestMonth.getFullYear(), latestMonth.getMonth(), 1));
  }, [history.latestScreening?.created_at]);

  if (!hasHistory) {
    return (
      <AppCard variant="default" radius="xl" padding="md">
        <View style={styles.emptyCalendarState}>
          <View style={styles.emptyCalendarIcon}>
            <AppIcon name="checkHair" size="md" state="active" />
          </View>
          <View style={styles.emptyCalendarCopy}>
            <Text style={styles.emptyCalendarTitle}>No hair check yet</Text>
            <Text style={styles.emptyCalendarBody}>
              Try CheckHair to start tracking your hair condition.
            </Text>
          </View>
          <AppButton
            title="Start hair check"
            size="md"
            fullWidth={false}
            onPress={onOpenAnalyzer}
          />
        </View>
      </AppCard>
    );
  }

  return (
    <AppCard variant="default" radius="xl" padding="md">
      <View style={styles.calendarLeadCard}>
        <View style={styles.calendarLeadIconWrap}>
          <AppIcon name="checkHair" size="md" state="active" />
        </View>
        <View style={styles.calendarLeadCopy}>
          <Text style={styles.calendarLeadEyebrow}>Latest hair check</Text>
          <Text style={styles.calendarLeadTitle}>{latestTone.label}</Text>
          <Text style={styles.calendarLeadBody} numberOfLines={2}>
            {latestSummary}
          </Text>
        </View>
        <View style={styles.calendarLeadMeta}>
          <Text style={styles.calendarLeadMetaLabel}>Saved</Text>
          <Text style={styles.calendarLeadMetaValue}>{formatCalendarDayLabel(history.latestScreening?.created_at)}</Text>
        </View>
      </View>

      <View style={styles.calendarHeaderRow}>
        <View style={styles.calendarHeaderCopy}>
          <Text style={styles.calendarMonthLabel}>{formatCalendarMonthLabel(visibleMonth)}</Text>
          <Text style={styles.calendarSummaryText}>Tracked dates from your saved hair checks</Text>
        </View>

        <View style={styles.calendarMonthControls}>
          <Pressable
            onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            style={styles.calendarMonthButton}
          >
            <AppIcon name="chevron-left" size="sm" state="muted" />
          </Pressable>
          <Pressable
            onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            style={styles.calendarMonthButton}
          >
            <AppIcon name="chevron-right" size="sm" state="muted" />
          </Pressable>
        </View>
      </View>

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {calendarDays.map((day) => {
          const key = toLocalDateKey(day); // local calendar date — avoids UTC midnight shift
          const dateEntries = history.markers.get(key) || [];
          const screening = dateEntries[0]?.screening || null;
          const tone = normalizeConditionTone(screening?.detected_condition);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();

          return (
            <Pressable
              key={key}
              disabled={!dateEntries.length}
              onPress={() => {
                if (dateEntries.length) onSelectDate?.(key, dateEntries);
              }}
              style={[
                styles.calendarCell,
                screening ? styles.calendarCellActive : null,
                key === latestDateKey ? styles.calendarCellLatest : null,
                !isCurrentMonth ? styles.calendarCellMuted : null,
              ]}
            >
              <Text style={styles.calendarCellLabel}>{day.getDate()}</Text>
              {dateEntries.length > 1 ? <Text style={styles.calendarCellCount}>{dateEntries.length}</Text> : null}
              <View
                style={[
                  styles.conditionDot,
                  { backgroundColor: screening ? tone.dotColor : theme.colors.transparent },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.calendarSupportRow}>
        <View style={styles.calendarSupportCard}>
          <Text style={styles.calendarSupportLabel}>Checks logged</Text>
          <Text style={styles.calendarSupportValue}>{history.screenings.length}</Text>
        </View>
        <View style={styles.calendarSupportCard}>
          <Text style={styles.calendarSupportLabel}>Current status</Text>
          <Text style={styles.calendarSupportValue}>{latestTone.label}</Text>
        </View>
        {latestLengthLabel ? (
          <View style={styles.calendarSupportCard}>
            <Text style={styles.calendarSupportLabel}>Latest length</Text>
            <Text style={styles.calendarSupportValue}>{latestLengthLabel}</Text>
          </View>
        ) : null}
      </View>

      {trendLabel ? <Text style={styles.calendarTrendText}>{trendLabel}</Text> : null}
    </AppCard>
  );
}

export function DonorHairSubmissionScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isAnalyzerActive, setIsAnalyzerActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isPhotoCaptureOpen, setIsPhotoCaptureOpen] = useState(false);
  const [activeCaptureSlotIndex, setActiveCaptureSlotIndex] = useState(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraModalError, setCameraModalError] = useState('');
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const [selectedHistoryEntries, setSelectedHistoryEntries] = useState([]);
  const [resultConfirmationMode, setResultConfirmationMode] = useState('pending');
  const { user, profile, resolvedTheme } = useAuth();
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    photos,
    requiredViews,
    analysis,
    donationRequirement,
    error,
    successMessage,
    isLoadingContext,
    isPickingImages,
    isCapturingImages,
    isAnalyzing,
    isSaving,
    completedPhotoCount,
    progressLabel,
    pickPhotoForSlot,
    capturePhotoForSlot,
    savePhotoAssetForSlot,
    removePhoto,
    analyzePhotos,
    submitSubmission,
  } = useDonorHairSubmission({ userId: user?.id, databaseUserId: profile?.user_id });

  const avatarInitials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim();
  const questionForm = useForm({
    resolver: zodResolver(hairAnalyzerQuestionSchema),
    mode: 'onChange',
    defaultValues: hairAnalyzerQuestionDefaultValues,
  });
  const complianceForm = useForm({
    resolver: zodResolver(hairAnalyzerComplianceSchema),
    mode: 'onChange',
    defaultValues: hairAnalyzerComplianceDefaultValues,
  });
  const correctionForm = useForm({
    resolver: zodResolver(hairResultCorrectionSchema),
    mode: 'onChange',
    defaultValues: buildHairResultCorrectionDefaultValues(null),
  });
  const questionnaireValues = useWatch({ control: questionForm.control });
  const complianceAcknowledged = useWatch({ control: complianceForm.control, name: 'acknowledged' });
  const savedHistory = useMemo(() => buildHairConditionHistory(analysisHistory), [analysisHistory]);
  const isReturningUser = savedHistory.entries.length > 0;
  const questionnaireMode = isReturningUser ? 'returning_follow_up' : 'first_time';

  useEffect(() => {
    questionForm.setValue('questionnaireMode', questionnaireMode, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [questionForm, questionnaireMode]);

  const visibleQuestions = useMemo(
    () => getVisibleQuestions({
      ...(questionnaireValues || {}),
      questionnaireMode,
    }, questionnaireMode),
    [questionnaireMode, questionnaireValues]
  );
  const currentQuestion = visibleQuestions[questionIndex] || visibleQuestions[0];
  const currentView = requiredViews[photoIndex];
  const currentPhoto = photos[photoIndex];
  const activeCaptureView = activeCaptureSlotIndex != null ? requiredViews[activeCaptureSlotIndex] : null;
  const hasCameraPermission = Boolean(cameraPermission?.granted);

  const eligibility = useMemo(
    () => buildEligibilitySummary({
      analysis,
      confirmedValues: null,
      questionnaireAnswers: questionnaireValues,
      donationRequirement,
    }),
    [analysis, questionnaireValues, donationRequirement]
  );

  const stepTitles = useMemo(() => ([
    'Questions',
    'Photo guide',
    'Capture or upload',
    'AI result',
  ]), []);
  const visibleStepNumber = stepIndex + 1;
  const visibleStepTotal = stepTitles.length;
  const latestAnalyzedSubmission = useMemo(
    () => analysisHistory.find((submission) => Array.isArray(submission?.ai_screenings) && submission.ai_screenings.length) || null,
    [analysisHistory]
  );
  const latestSavedScreening = latestAnalyzedSubmission?.ai_screenings?.[0] || null;
  const hasSavedAnalysis = Boolean(latestAnalyzedSubmission && latestSavedScreening);
  const hasDraftFlow = Boolean(analysis || photos.some(Boolean));
  const latestTrendLabel = useMemo(() => buildHistoryTrendLabel(analysisHistory), [analysisHistory]);
  const latestSavedRecommendations = useMemo(
    () => (latestAnalyzedSubmission?.donor_recommendations || []).slice(0, 2),
    [latestAnalyzedSubmission]
  );

  const loadAnalysisHistory = React.useCallback(async () => {
    if (!user?.id) return;

    setIsLoadingHistory(true);
    setHistoryError('');

    const submissionsResult = await fetchHairSubmissionsByUserId(user.id, 12);
    const submissions = submissionsResult.data || [];
    setAnalysisHistory(submissions);

    if (submissionsResult.error) {
      setHistoryError('Hair history could not be loaded right now.');
    }

    setIsLoadingHistory(false);
  }, [user?.id]);

  useEffect(() => {
    loadAnalysisHistory();
  }, [loadAnalysisHistory]);

  useEffect(() => {
    if (successMessage) {
      setIsAnalyzerActive(false);
      loadAnalysisHistory();
    }
  }, [loadAnalysisHistory, successMessage]);

  useEffect(() => {
    correctionForm.reset(buildHairResultCorrectionDefaultValues(analysis));
    setResultConfirmationMode('pending');
  }, [analysis, correctionForm]);

  const openHistoryDate = React.useCallback((dateKey, entries) => {
    setSelectedHistoryDate(dateKey);
    setSelectedHistoryEntries(entries || []);
  }, []);

  useEffect(() => {
    logAppEvent('donor_hair_submission.flow', 'Donor screening flow initialized without intro wizard steps.', {
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      visibleSteps: stepTitles,
    });
  }, [profile?.user_id, stepTitles, user?.id]);

  const canMovePastQuestion = isAnswered(currentQuestion, questionnaireValues);
  const isAutoAdvanceQuestion = stepIndex === 0 && currentQuestion?.type === 'choice';
  const isCurrentPhotoComplete = Boolean(photos[photoIndex]);
  const showFooterPrimaryAction = !(stepIndex === 3 && Boolean(analysis));
  const isNextDisabled = (
    (stepIndex === 0 && !canMovePastQuestion)
    || (stepIndex === 1 && !Boolean(complianceAcknowledged))
    || (stepIndex === 2 && !isCurrentPhotoComplete)
    || (stepIndex === 3 && (!analysis || isAnalyzing || isSaving))
  );

  const nextButtonTitle = useMemo(() => {
    if (stepIndex === 0) return questionIndex === visibleQuestions.length - 1 ? 'Continue' : 'Next';
    if (stepIndex === 1) return 'Continue';
    if (stepIndex === 2) return photoIndex === requiredViews.length - 1 ? 'Analyze' : 'Next';
    return analysis ? (isSaving ? 'Saving...' : 'Save to hair log') : 'Retry analysis';
  }, [analysis, isSaving, photoIndex, questionIndex, requiredViews.length, stepIndex, visibleQuestions.length]);

  const saveConfirmedAnalysis = async () => {
    if (!analysis) return;

    logAppEvent('donor_hair_submission.confirmation', 'User confirmed AI result for saving.', {
      userId: user?.id || null,
      analysisKeys: Object.keys(analysis || {}),
    });

    const result = await submitSubmission(buildHairReviewDefaultValues(analysis, questionForm.getValues()), {
      questionnaireAnswers: {
        ...questionForm.getValues(),
        questionnaireMode,
      },
      donationModeValue: '',
    });

    if (result?.success) {
      questionForm.reset({
        ...hairAnalyzerQuestionDefaultValues,
        questionnaireMode,
      });
      complianceForm.reset(hairAnalyzerComplianceDefaultValues);
      correctionForm.reset(buildHairResultCorrectionDefaultValues(null));
      setQuestionIndex(0);
      setPhotoIndex(0);
      setStepIndex(0);
      setResultConfirmationMode('pending');
      setIsAnalyzerActive(false);
    }
  };

  const handleCorrectionSubmit = correctionForm.handleSubmit(async (values) => {
    logAppEvent('donor_hair_submission.confirmation', 'User requested AI reassessment with corrected details.', {
      userId: user?.id || null,
      correctedLengthUnit: values.correctedLengthUnit,
      hasCorrectedLength: Boolean(values.correctedLengthValue),
      correctedTexture: values.correctedTexture || '',
      correctedDensity: values.correctedDensity || '',
    });

    const result = await analyzePhotos({
      questionnaireAnswers: {
        ...questionForm.getValues(),
        questionnaireMode,
      },
      complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
      historyContext: buildAnalysisHistoryContext(analysisHistory),
      correctedDetails: values,
    });

    if (result?.success) {
      setResultConfirmationMode('pending');
    }
  });

  const goToNextQuestionStep = (answersSnapshot = questionForm.getValues(), currentQuestionKey = currentQuestion?.key) => {
    const nextVisibleQuestions = getVisibleQuestions({
      ...answersSnapshot,
      questionnaireMode,
    }, questionnaireMode);
    const activeQuestionIndex = nextVisibleQuestions.findIndex((item) => item.key === currentQuestionKey);

    if (activeQuestionIndex >= 0 && activeQuestionIndex < nextVisibleQuestions.length - 1) {
      setQuestionIndex(activeQuestionIndex + 1);
      return;
    }

    setStepIndex(1);
  };

  const handleQuestionChoiceChange = async ({ fieldName, nextValue, fieldOnChange }) => {
    logAppEvent('donor_hair_submission.questionnaire', 'Question choice selected.', {
      userId: user?.id || null,
      questionKey: fieldName,
      questionType: currentQuestion?.type || null,
      value: nextValue,
    });

    fieldOnChange(nextValue);

    const nextAnswers = {
      ...questionForm.getValues(),
      [fieldName]: nextValue,
    };
    const isValid = await questionForm.trigger(fieldName);

    logAppEvent('donor_hair_submission.questionnaire', 'Question choice validation completed.', {
      userId: user?.id || null,
      questionKey: fieldName,
      questionType: currentQuestion?.type || null,
      isValid,
    });

    if (!isValid) return;

    logAppEvent('donor_hair_submission.questionnaire', 'Question choice auto-advance triggered.', {
      userId: user?.id || null,
      questionKey: fieldName,
      questionnaireMode,
      isFinalVisibleQuestion: getVisibleQuestions({
        ...nextAnswers,
        questionnaireMode,
      }, questionnaireMode).findIndex((item) => item.key === fieldName) === getVisibleQuestions({
        ...nextAnswers,
        questionnaireMode,
      }, questionnaireMode).length - 1,
    });

    goToNextQuestionStep(nextAnswers, fieldName);
  };

  const goPrevious = () => {
    if (stepIndex === 0 && questionIndex > 0) {
      setQuestionIndex((current) => current - 1);
      return;
    }
    if (stepIndex === 2 && photoIndex > 0) {
      setPhotoIndex((current) => current - 1);
      return;
    }
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
    }
  };

  useEffect(() => {
    if (questionIndex > visibleQuestions.length - 1) {
      setQuestionIndex(Math.max(visibleQuestions.length - 1, 0));
    }
  }, [questionIndex, visibleQuestions.length]);

  const renderQuestionInput = () => {
    if (!currentQuestion) return null;
    const fieldName = currentQuestion.key;
    const fieldError = questionForm.formState.errors[fieldName]?.message;

    if (currentQuestion.type === 'number') {
      return (
        <Controller
          control={questionForm.control}
          name={fieldName}
          render={({ field }) => (
            <AppInput
              label={currentQuestion.title}
              placeholder="14"
              keyboardType="decimal-pad"
              variant="filled"
              helperText={currentQuestion.helperText}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldError}
            />
          )}
        />
      );
    }

    return (
      <View>
        <Text style={styles.questionTitle}>{currentQuestion.title}</Text>
        {currentQuestion.helperText ? <Text style={styles.questionHelper}>{currentQuestion.helperText}</Text> : null}
        <Controller
          control={questionForm.control}
          name={fieldName}
          render={({ field }) => (
            <ChoiceList
              value={field.value}
              options={hairAnalyzerQuestionChoices[currentQuestion.optionsKey]}
              onChange={(nextValue) => {
                if (currentQuestion.type === 'choice') {
                  handleQuestionChoiceChange({
                    fieldName,
                    nextValue,
                    fieldOnChange: field.onChange,
                  });
                  return;
                }

                field.onChange(nextValue);
              }}
              multi={currentQuestion.type === 'multi'}
            />
          )}
        />
        {fieldError ? <Text style={styles.questionError}>{fieldError}</Text> : null}
      </View>
    );
  };

  const closePhotoCaptureModal = () => {
    setIsPhotoCaptureOpen(false);
    setActiveCaptureSlotIndex(null);
    setCameraModalError('');
  };

  const openPhotoCaptureModal = async (slotIndex) => {
    setActiveCaptureSlotIndex(slotIndex);
    setIsPhotoCaptureOpen(true);
    setCameraModalError('');

    logAppEvent('donor_hair_submission.photo_camera', 'Opening camera capture flow for donation photo slot.', {
      userId: user?.id || null,
      slotIndex,
      viewKey: requiredViews[slotIndex]?.key || null,
      platform: Platform.OS,
      hasCameraPermission,
    });

    if (!hasCameraPermission) {
      const permissionResult = await requestCameraPermission();
      logAppEvent('donor_hair_submission.photo_camera', 'Camera permission requested from donation photo modal.', {
        userId: user?.id || null,
        slotIndex,
        granted: permissionResult?.granted ?? false,
        canAskAgain: permissionResult?.canAskAgain ?? null,
      });

      if (!permissionResult?.granted) {
        setCameraModalError(permissionResult?.canAskAgain === false
          ? 'Camera access is blocked for this browser or device. Enable it in settings, or use Upload instead.'
          : 'Camera access was not granted. Allow camera access to capture this photo, or use Upload instead.');
      }
    }
  };

  const handleCapturePhoto = async () => {
    if (activeCaptureSlotIndex == null) return;

    logAppEvent('donor_hair_submission.photo_camera', 'Camera capture requested from donation photo modal.', {
      userId: user?.id || null,
      slotIndex: activeCaptureSlotIndex,
      viewKey: requiredViews[activeCaptureSlotIndex]?.key || null,
      platform: Platform.OS,
      hasCameraPermission,
    });

    if (!hasCameraPermission) {
      const permissionResult = await requestCameraPermission();
      logAppEvent('donor_hair_submission.photo_camera', 'Camera permission re-requested before capture.', {
        userId: user?.id || null,
        slotIndex: activeCaptureSlotIndex,
        granted: permissionResult?.granted ?? false,
        canAskAgain: permissionResult?.canAskAgain ?? null,
      });

      if (!permissionResult?.granted) {
        setCameraModalError(permissionResult?.canAskAgain === false
          ? 'Camera access is blocked for this browser or device. Enable it in settings, or use Upload instead.'
          : 'Camera access was not granted. Allow camera access to capture this photo, or use Upload instead.');
        return;
      }
    }

    if (!cameraRef.current || isCapturingPhoto) {
      setCameraModalError('The camera is still starting. Please wait a moment and try again.');
      return;
    }

    setIsCapturingPhoto(true);
    setCameraModalError('');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      logAppEvent('donor_hair_submission.photo_camera', 'Camera photo captured from donation photo modal.', {
        userId: user?.id || null,
        slotIndex: activeCaptureSlotIndex,
        viewKey: requiredViews[activeCaptureSlotIndex]?.key || null,
        hasUri: Boolean(photo?.uri),
      });

      const saveResult = await savePhotoAssetForSlot(activeCaptureSlotIndex, photo, 'capture');
      if (!saveResult?.success) {
        setCameraModalError(saveResult?.error || 'The captured photo could not be saved to this slot.');
        return;
      }

      closePhotoCaptureModal();
    } catch (captureError) {
      logAppEvent('donor_hair_submission.photo_camera', 'Camera capture failed from donation photo modal.', {
        userId: user?.id || null,
        slotIndex: activeCaptureSlotIndex,
        viewKey: requiredViews[activeCaptureSlotIndex]?.key || null,
        message: captureError?.message || 'Unknown camera capture error.',
      }, 'error');

      setCameraModalError('The camera could not capture a photo right now. Please try again, or use Upload instead.');
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleUploadFromCameraModal = async () => {
    if (activeCaptureSlotIndex == null) return;

    const uploadSlotIndex = activeCaptureSlotIndex;
    closePhotoCaptureModal();
    await pickPhotoForSlot(uploadSlotIndex);
  };

  const handleNext = async () => {
    if (stepIndex === 0) {
      const fieldName = currentQuestion?.key;
      const isValid = fieldName ? await questionForm.trigger(fieldName) : false;
      if (!isValid) return;

      logAppEvent('donor_hair_submission.questionnaire', 'Manual question advance triggered.', {
        userId: user?.id || null,
        questionKey: fieldName || null,
        questionType: currentQuestion?.type || null,
      });

      goToNextQuestionStep(questionForm.getValues(), fieldName);
      return;
    }

    if (stepIndex === 1) {
      const isValid = await complianceForm.trigger('acknowledged');
      if (!isValid) return;
      setStepIndex(2);
      return;
    }

    if (stepIndex === 2) {
      if (!photos[photoIndex]) return;
      if (photoIndex < requiredViews.length - 1) {
        setPhotoIndex((current) => current + 1);
        return;
      }

      if (photos.filter(Boolean).length !== requiredViews.length) return;
      setStepIndex(3);
      if (!analysis) {
        await analyzePhotos({
          questionnaireAnswers: {
            ...questionForm.getValues(),
            questionnaireMode,
          },
          complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
          historyContext: buildAnalysisHistoryContext(analysisHistory),
        });
      }
      return;
    }

    if (stepIndex === 3) {
      if (!analysis) {
        await analyzePhotos({
          questionnaireAnswers: {
            ...questionForm.getValues(),
            questionnaireMode,
          },
          complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
          historyContext: buildAnalysisHistoryContext(analysisHistory),
        });
        return;
      }
      return;
    }
  };

  const renderStepContent = () => {
    switch (stepIndex) {
      case 0:
        if (isLoadingHistory) {
          return (
            <AppCard variant="elevated" radius="xl" padding="lg">
              <View style={styles.loadingState}>
                <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
                <Text style={styles.loadingStateText}>Loading saved hair log before questions</Text>
              </View>
            </AppCard>
          );
        }

        return (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.stepDescription}>
              {isReturningUser
                ? 'Follow-up check: answer a shorter set of progress questions so the AI can compare your current photos with your saved hair log.'
                : 'First-time check: answer the full baseline hair-condition questions before the photo review.'}
            </Text>
            <Text style={styles.progressText}>Question {questionIndex + 1} of {visibleQuestions.length}</Text>
            {renderQuestionInput()}
          </AppCard>
        );
      case 1:
        return (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.stepTitle}>Before you take photos</Text>
            <Text style={styles.stepDescription}>Follow these quick photo rules first, then continue to camera or upload.</Text>
            <View style={styles.guidelineSection}>
              <Text style={styles.guidelineTitle}>Photo rules</Text>
              <View style={styles.bulletList}>
                {PHOTO_GUIDELINE_ITEMS.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.guidelineSection}>
              <Text style={styles.guidelineTitle}>You will need to capture</Text>
              <View style={styles.captureTargetList}>
                {PHOTO_CAPTURE_TARGETS.map((item, index) => (
                  <View key={item} style={styles.captureTargetCard}>
                    <View style={styles.captureTargetBadge}>
                      <Text style={styles.captureTargetBadgeText}>{index + 1}</Text>
                    </View>
                    <Text style={styles.captureTargetText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
            <Pressable
              onPress={() => complianceForm.setValue('acknowledged', !complianceAcknowledged, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
              style={styles.checkRow}
            >
              <View style={[styles.checkBox, complianceAcknowledged ? styles.checkBoxActive : null]}>
                <AppIcon name={complianceAcknowledged ? 'checkbox-marked' : 'checkbox-blank-outline'} state={complianceAcknowledged ? 'inverse' : 'muted'} />
              </View>
              <Text style={styles.checkLabel}>I understand the photo guide and I am ready to continue.</Text>
            </Pressable>
            {complianceForm.formState.errors.acknowledged?.message ? <Text style={styles.questionError}>{complianceForm.formState.errors.acknowledged.message}</Text> : null}
          </AppCard>
        );
      case 2:
        return (
          <View style={styles.stepStack}>
            <AppCard variant="soft" radius="xl" padding="lg">
              <Text style={styles.progressText}>Photo {photoIndex + 1} of {requiredViews.length}</Text>
              <Text style={styles.stepDescription}>Completed: {completedPhotoCount} of {requiredViews.length}</Text>
              <View style={styles.slotRail}>
                {requiredViews.map((view, index) => (
                  <Pressable key={view.key} onPress={() => setPhotoIndex(index)} style={[styles.slotRailItem, photoIndex === index ? styles.slotRailItemActive : null]}>
                    <Text style={[styles.slotRailLabel, photos[index] ? styles.slotRailLabelDone : null]}>{index + 1}. {view.label}</Text>
                  </Pressable>
                ))}
              </View>
            </AppCard>
            <PhotoSlotCard
              view={currentView}
              photo={currentPhoto}
              onCapture={() => {
                if (Platform.OS === 'web') {
                  openPhotoCaptureModal(photoIndex);
                  return;
                }

                capturePhotoForSlot(photoIndex);
              }}
              onUpload={() => pickPhotoForSlot(photoIndex)}
              onRemove={() => removePhoto(photoIndex)}
              isCapturing={isCapturingImages}
              isUploading={isPickingImages}
            />
          </View>
        );
      case 3:
        return analysis ? (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.stepTitle}>AI hair result</Text>
            <>
                <StatusBanner title={eligibility.status} message={eligibility.reasons[0] || eligibility.contextNote || 'The AI screening result is ready for review.'} variant={eligibility.tone} style={styles.bannerGap} />
                <View style={styles.metricsGrid}>
                  <ResultMetricCard label="Estimated length" value={formatLengthLabel(analysis.estimated_length)} />
                  <ResultMetricCard label="Texture" value={analysis.detected_texture} />
                  <ResultMetricCard label="Density" value={analysis.detected_density} />
                  <ResultMetricCard label="Hair condition" value={analysis.detected_condition} />
                  <ResultMetricCard label="Status" value={analysis.decision} />
                  <ResultMetricCard label="Confidence" value={analysis.confidence_score != null ? `${Math.round(Number(analysis.confidence_score) * 100)}%` : 'Needs review'} />
                </View>
                {analysis.length_assessment ? (
                  <AppCard variant="soft" radius="xl" padding="lg" style={styles.bannerGap}>
                    <Text style={styles.summaryLabel}>Visible length analysis</Text>
                    <Text style={styles.stepDescription}>{analysis.length_assessment}</Text>
                  </AppCard>
                ) : null}
                <AppCard variant="soft" radius="xl" padding="lg" style={styles.bannerGap}>
                  <Text style={styles.summaryLabel}>Hair assessment</Text>
                  <Text style={styles.stepDescription}>{analysis.summary || 'No summary was returned for this analysis.'}</Text>
                </AppCard>

                {(analysis?.recommendations || []).length ? (
                  <AppCard variant="soft" radius="xl" padding="lg" style={styles.bannerGap}>
                    <Text style={styles.summaryLabel}>Improvement advice</Text>
                    <View style={styles.recommendationList}>
                      {(analysis.recommendations || []).map((recommendation, index) => (
                        <RecommendationCard key={`${recommendation.priority_order}-${recommendation.title || recommendation.recommendation_text.slice(0, 20)}`} recommendation={recommendation} isTopPriority={index === 0} />
                      ))}
                    </View>
                  </AppCard>
                ) : null}

                {analysis.history_assessment ? (
                  <AppCard variant="soft" radius="xl" padding="lg" style={styles.bannerGap}>
                    <Text style={styles.summaryLabel}>Trend context</Text>
                    <Text style={styles.stepDescription}>{analysis.history_assessment}</Text>
                  </AppCard>
                ) : null}
                {analysis.donation_readiness_note ? (
                  <AppCard variant="soft" radius="xl" padding="lg" style={styles.bannerGap}>
                    <Text style={styles.summaryLabel}>Donation suitability note</Text>
                    <Text style={styles.stepDescription}>
                      {analysis.donation_readiness_note}
                    </Text>
                  </AppCard>
                ) : null}
                <AppCard variant="soft" radius="xl" padding="lg">
                  <Text style={styles.summaryLabel}>Confirm result</Text>
                  <Text style={styles.stepDescription}>
                    Is this result accurate? You can continue if it looks right, or edit only hair length, texture, and density before the AI reassesses the final result.
                  </Text>
                  <View style={styles.postAnalysisActions}>
                    <AppButton
                      title={isSaving ? 'Saving...' : 'Yes, continue'}
                      fullWidth={false}
                      onPress={saveConfirmedAnalysis}
                      loading={isSaving}
                      disabled={isSaving || isAnalyzing}
                    />
                    <AppButton
                      title="No, edit details"
                      variant="outline"
                      fullWidth={false}
                      onPress={() => setResultConfirmationMode('editing')}
                      disabled={isSaving || isAnalyzing}
                    />
                  </View>
                </AppCard>
                {resultConfirmationMode === 'editing' ? (
                  <AppCard variant="soft" radius="xl" padding="lg" style={styles.bannerGap}>
                    <Text style={styles.summaryLabel}>Refine detected details</Text>
                    <Text style={styles.stepDescription}>
                      Update only the details that look inaccurate. The AI will reassess the final result using these corrected inputs together with your uploaded photos.
                    </Text>

                    <Controller
                      control={correctionForm.control}
                      name="correctedLengthValue"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <View style={styles.correctionFieldGroup}>
                          <Text style={styles.correctionFieldLabel}>Hair length</Text>
                          <View style={styles.correctionLengthRow}>
                            <View style={styles.correctionLengthInputWrap}>
                              <AppInput
                                value={value}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                keyboardType="decimal-pad"
                                placeholder="Enter length"
                              />
                            </View>
                            <View style={styles.correctionUnitWrap}>
                              <Controller
                                control={correctionForm.control}
                                name="correctedLengthUnit"
                                render={({ field: { onChange: onUnitChange, value: unitValue } }) => (
                                  <CorrectionChoiceField
                                    value={unitValue}
                                    options={hairAnalyzerQuestionChoices.correctionLengthUnit}
                                    onChange={onUnitChange}
                                  />
                                )}
                              />
                            </View>
                          </View>
                          {correctionForm.formState.errors.correctedLengthValue?.message ? (
                            <Text style={styles.questionError}>{correctionForm.formState.errors.correctedLengthValue.message}</Text>
                          ) : null}
                        </View>
                      )}
                    />

                    <Controller
                      control={correctionForm.control}
                      name="correctedTexture"
                      render={({ field: { onChange, value } }) => (
                        <View style={styles.correctionFieldGroup}>
                          <Text style={styles.correctionFieldLabel}>Hair texture</Text>
                          <CorrectionChoiceField
                            value={value}
                            options={hairAnalyzerQuestionChoices.hairTexture}
                            onChange={onChange}
                          />
                          {correctionForm.formState.errors.correctedTexture?.message ? (
                            <Text style={styles.questionError}>{correctionForm.formState.errors.correctedTexture.message}</Text>
                          ) : null}
                        </View>
                      )}
                    />

                    <Controller
                      control={correctionForm.control}
                      name="correctedDensity"
                      render={({ field: { onChange, value } }) => (
                        <View style={styles.correctionFieldGroup}>
                          <Text style={styles.correctionFieldLabel}>Hair density</Text>
                          <CorrectionChoiceField
                            value={value}
                            options={hairAnalyzerQuestionChoices.hairDensity}
                            onChange={onChange}
                          />
                          {correctionForm.formState.errors.correctedDensity?.message ? (
                            <Text style={styles.questionError}>{correctionForm.formState.errors.correctedDensity.message}</Text>
                          ) : null}
                        </View>
                      )}
                    />

                    <View style={styles.postAnalysisActions}>
                      <AppButton
                        title={isAnalyzing ? 'Re-analyzing...' : 'Re-run AI analysis'}
                        fullWidth={false}
                        onPress={handleCorrectionSubmit}
                        loading={isAnalyzing}
                        disabled={isAnalyzing || isSaving}
                      />
                      <AppButton
                        title="Cancel edits"
                        variant="ghost"
                        fullWidth={false}
                        onPress={() => {
                          correctionForm.reset(buildHairResultCorrectionDefaultValues(analysis));
                          setResultConfirmationMode('pending');
                        }}
                        disabled={isAnalyzing || isSaving}
                      />
                    </View>
                  </AppCard>
                ) : null}
              </>
          </AppCard>
        ) : (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.stepTitle}>Hair analysis unavailable</Text>
            <Text style={styles.stepDescription}>
              {error?.message || 'Cannot analyze hair right now. Please try again later.'}
            </Text>
            <View style={styles.postAnalysisActions}>
              <AppButton
                title={isAnalyzing ? 'Retrying...' : 'Try again'}
                fullWidth={false}
                onPress={async () => {
                  await analyzePhotos({
                    questionnaireAnswers: {
                      ...questionForm.getValues(),
                      questionnaireMode,
                    },
                    complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
                    historyContext: buildAnalysisHistoryContext(analysisHistory),
                  });
                }}
                loading={isAnalyzing}
                disabled={isAnalyzing || isSaving}
              />
            </View>
          </AppCard>
        );
      default:
        return null;
    }
  };

  const startButtonTitle = hasDraftFlow
    ? 'Continue hair check'
    : isLoadingHistory
      ? 'Loading hair log...'
    : hasSavedAnalysis
      ? 'Start new hair check'
      : 'Start hair check';
  const latestSavedTone = normalizeConditionTone(latestSavedScreening?.detected_condition);
  const checkHairSubtitle = isAnalyzerActive
    ? `Step ${visibleStepNumber} of ${visibleStepTotal}`
    : hasSavedAnalysis
      ? 'Hair log ready'
      : '';
  const summaryHeroTitle = isReturningUser ? 'Start follow-up hair check' : 'Start first hair check';
  const summaryHeroBody = isReturningUser
    ? 'Answer a shorter progress check, add fresh photos, and compare today’s hair condition with your previous result and recommendations.'
    : 'Answer the full baseline hair questions, follow the photo guide, and get your first AI hair result to track over time.';

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={donorDashboardNavItems}
      activeNavKey="checkhair"
      navVariant="donor"
      screenVariant="default"
      onNavPress={(item) => {
        if (!item.route || item.route === '/donor/donations') return;
        router.navigate(item.route);
      }}
      header={(
        <DonorTopBar
          title="CheckHair"
          subtitle={checkHairSubtitle}
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url || profile?.photo_path || ''}
          unreadCount={unreadCount}
          onNotificationsPress={() => router.navigate('/donor/notifications')}
          onProfilePress={() => router.navigate('/profile')}
          onLogoutPress={logout}
          isLoggingOut={isLoggingOut}
        />
      )}
    >
      {successMessage ? <StatusBanner message={successMessage} variant="success" title="Hair check saved" style={styles.bannerGap} /> : null}
      {historyError ? <StatusBanner message={historyError} variant="info" style={styles.bannerGap} /> : null}
      {isLoadingContext ? <StatusBanner title="Loading CheckHair" message="Preparing your analyzer context." variant="info" style={styles.bannerGap} /> : null}
      {error ? <StatusBanner title={error.title} message={error.message} variant="error" style={styles.bannerGap} /> : null}

      {!isAnalyzerActive ? (
        <View style={styles.summaryStage}>
          {isLoadingHistory || hasSavedAnalysis ? (
            <View style={styles.sectionGroup}>
              <View style={styles.sectionHeaderCompact}>
                <Text style={styles.sectionTitleCompact}>Hair log</Text>
                {latestTrendLabel ? (
                  <Text style={styles.sectionMetaCompact}>{latestTrendLabel}</Text>
                ) : null}
              </View>
              {isLoadingHistory ? (
                <AppCard variant="default" radius="xl" padding="md">
                  <View style={styles.loadingState}>
                    <ActivityIndicator color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
                    <Text style={styles.loadingStateText}>Loading hair log</Text>
                  </View>
                </AppCard>
              ) : (
                <HairConditionLogCard
                  submissions={analysisHistory}
                  onOpenAnalyzer={() => setIsAnalyzerActive(true)}
                  onSelectDate={openHistoryDate}
                  trendLabel={latestTrendLabel}
                />
              )}
            </View>
          ) : null}

          <AppCard variant="default" radius="xl" padding="lg">
            <View style={styles.summaryHeroCentered}>
              <View style={styles.summaryIconWrap}>
                <AppIcon name="checkHair" size="lg" state="active" />
              </View>
              <View style={styles.summaryHeroCopy}>
                <Text style={styles.summaryHeroTitle}>{summaryHeroTitle}</Text>
                <Text style={styles.summaryHeroBody}>{summaryHeroBody}</Text>
              </View>
              {isReturningUser && latestSavedRecommendations.length ? (
                <Text style={styles.summaryHeroMeta}>
                  Last recommendation focus: {latestSavedRecommendations.map((item) => item.title || item.recommendation_text).filter(Boolean).slice(0, 2).join(', ')}
                </Text>
              ) : null}
              <AppButton
                title={startButtonTitle}
                fullWidth={false}
                onPress={() => setIsAnalyzerActive(true)}
                disabled={isLoadingHistory}
              />
              {hasSavedAnalysis ? (
                <Text style={styles.summaryHeroMeta}>
                  Latest: {latestSavedTone.label}
                </Text>
              ) : null}
            </View>
          </AppCard>
        </View>
      ) : (
        <View style={styles.wizardStage}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressText}>Step {visibleStepNumber} of {visibleStepTotal}</Text>
              <Text style={styles.progressHelper}>{progressLabel}</Text>
            </View>
            <AppTextLink title="Close check" variant="muted" onPress={() => setIsAnalyzerActive(false)} />
          </View>

          <View style={styles.stepContentWrap}>
            {renderStepContent()}
          </View>

          <View style={styles.footerNav}>
            <AppButton title="Previous" variant="outline" fullWidth={false} onPress={goPrevious} disabled={stepIndex === 0 && questionIndex === 0 && photoIndex === 0} />
            {!isAutoAdvanceQuestion && showFooterPrimaryAction ? (
              <AppButton
                title={nextButtonTitle}
                fullWidth={false}
                onPress={handleNext}
                loading={(stepIndex === 2 || stepIndex === 3) && isAnalyzing}
                disabled={isNextDisabled}
              />
            ) : null}
          </View>
        </View>
      )}

      <PhotoCaptureModal
        visible={isPhotoCaptureOpen}
        view={activeCaptureView}
        hasCameraPermission={hasCameraPermission}
        cameraRef={cameraRef}
        isCapturing={isCapturingPhoto}
        errorMessage={cameraModalError}
        onClose={closePhotoCaptureModal}
        onCapture={handleCapturePhoto}
        onUpload={handleUploadFromCameraModal}
        onRequestPermission={async () => {
          const permissionResult = await requestCameraPermission();
          logAppEvent('donor_hair_submission.photo_camera', 'Camera permission manually requested from donation photo modal.', {
            userId: user?.id || null,
            slotIndex: activeCaptureSlotIndex,
            granted: permissionResult?.granted ?? false,
            canAskAgain: permissionResult?.canAskAgain ?? null,
          });

          if (!permissionResult?.granted) {
            setCameraModalError(permissionResult?.canAskAgain === false
              ? 'Camera access is blocked for this browser or device. Enable it in settings, or use Upload instead.'
              : 'Camera access was not granted. Allow camera access to capture this photo, or use Upload instead.');
          } else {
            setCameraModalError('');
          }
        }}
      />

      <HairLogDetailModal
        visible={Boolean(selectedHistoryDate)}
        dateKey={selectedHistoryDate}
        entries={selectedHistoryEntries}
        onClose={() => {
          setSelectedHistoryDate('');
          setSelectedHistoryEntries([]);
        }}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  wizardStage: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  summaryStage: {
    gap: theme.spacing.md,
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  summaryHeroCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  summaryHeroCopy: {
    gap: 4,
    alignItems: 'center',
  },
  summaryHeroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  summaryHeroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  summaryHeroMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  sectionGroup: {
    gap: theme.spacing.sm,
  },
  actionGroups: {
    gap: theme.spacing.md,
  },
  actionSection: {
    gap: theme.spacing.sm,
  },
  actionSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  actionSectionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  sectionTitleCompact: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  sectionHeaderCompact: {
    gap: 4,
  },
  sectionMetaCompact: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  loadingState: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  loadingStateText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
  postAnalysisActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  correctionFieldGroup: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  correctionFieldLabel: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  correctionLengthRow: {
    gap: theme.spacing.sm,
  },
  correctionLengthInputWrap: {
    width: '100%',
  },
  correctionUnitWrap: {
    width: '100%',
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
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  emptyCalendarCopy: {
    gap: 4,
  },
  emptyCalendarTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  emptyCalendarBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  calendarLeadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  calendarLeadIconWrap: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  calendarLeadCopy: {
    flex: 1,
    gap: 2,
  },
  calendarLeadEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  calendarLeadTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  calendarLeadBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  calendarLeadMeta: {
    alignItems: 'flex-end',
    gap: 2,
  },
  calendarLeadMetaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  calendarLeadMetaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  calendarHeaderCopy: {
    flex: 1,
  },
  calendarMonthLabel: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  calendarSummaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  calendarMonthControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  calendarMonthButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: theme.colors.textMuted,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  calendarCell: {
    width: '13.5%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  calendarCellActive: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  calendarCellLatest: {
    borderColor: theme.colors.brandPrimary,
    borderWidth: 1.5,
  },
  calendarCellMuted: {
    opacity: 0.42,
  },
  calendarCellLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  conditionDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
  },
  calendarCellCount: {
    position: 'absolute',
    top: 6,
    right: 6,
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  calendarSupportRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  calendarSupportCard: {
    minWidth: '30%',
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  calendarSupportLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  calendarSupportValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  calendarTrendText: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  stepContentWrap: {
    width: '100%',
    alignSelf: 'center',
  },
  stepStack: {
    gap: theme.spacing.md,
    width: '100%',
  },
  bannerGap: {
    marginBottom: theme.spacing.md,
  },
  stepTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  stepDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  stepFootnote: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  guidelineSection: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  guidelineTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  bulletList: {
    gap: theme.spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    marginTop: 7,
    backgroundColor: theme.colors.brandPrimary,
  },
  bulletText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  captureTargetList: {
    gap: theme.spacing.sm,
  },
  captureTargetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  captureTargetBadge: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  captureTargetBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textOnBrand,
  },
  captureTargetText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textPrimary,
  },
  choiceList: {
    gap: theme.spacing.sm,
  },
  choiceCard: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  choiceCardActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  choiceLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  choiceLabelActive: {
    fontWeight: theme.typography.weights.semibold,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  progressText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
  },
  progressHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  questionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  questionHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  questionError: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textError,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  checkBox: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  checkBoxActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimary,
  },
  checkLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textPrimary,
  },
  slotRail: {
    gap: theme.spacing.xs,
  },
  slotRailItem: {
    padding: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  slotRailItemActive: {
    borderWidth: 1,
    borderColor: theme.colors.brandPrimary,
  },
  slotRailLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  slotRailLabelDone: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  slotTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  slotDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  slotPreviewWrap: {
    position: 'relative',
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  slotPreviewImage: {
    width: '100%',
    height: 240,
  },
  slotPreviewPill: {
    position: 'absolute',
    left: theme.spacing.md,
    top: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.whiteOverlay,
  },
  slotPreviewPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textPrimary,
  },
  slotPlaceholder: {
    minHeight: 220,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  slotPlaceholderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  slotPlaceholderBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  slotActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  metricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  summaryLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  answerSummaryList: {
    gap: theme.spacing.xs,
  },
  answerSummaryItem: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  recommendationList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  recommendationCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  recommendationCardPrimary: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  recommendationPill: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.brandPrimary,
  },
  recommendationTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  recommendationBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  modeList: {
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.md,
  },
  modeCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  modeCardActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  modeCardDisabled: {
    opacity: 0.6,
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  modeTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  modeIndicator: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  modeIndicatorActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimary,
  },
  modeBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  modeHelper: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
  footerNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  captureModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  captureModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  captureModalCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  captureModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  captureModalClose: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  captureModalStage: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundDark,
    minHeight: 320,
  },
  captureModalPreview: {
    width: '100%',
    height: 320,
  },
  captureModalPlaceholder: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  captureModalPlaceholderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  captureModalPlaceholderBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  captureModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
