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
import { theme } from '../../design-system/theme';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useDonorHairSubmission } from '../../hooks/useDonorHairSubmission';
import { useAuthActions } from '../../features/auth/hooks/useAuthActions';
import {
  fetchDonorRecommendationsBySubmissionId,
  fetchHairSubmissionsByUserId,
} from '../../features/hairSubmission.api';
import {
  hairAnalyzerComplianceDefaultValues,
  hairAnalyzerComplianceSchema,
  hairAnalyzerQuestionDefaultValues,
  hairAnalyzerQuestionSchema,
  buildHairReviewDefaultValues,
  hairReviewSchema,
} from '../../features/hairSubmission.schema';
import {
  hairAnalyzerQuestionChoices,
  hairDonationModeOptions,
} from '../../features/hairSubmission.constants';
import { logAppEvent } from '../../utils/appErrors';

const DONATION_DROP_OFF_ADDRESS = 'Unit 133 G/F Makati Shangri-La Hotel, Ayala Ave, Makati City, Metro Manila';
const PHOTO_COMPLIANCE_ITEMS = [
  'My hair is not covered by accessories.',
  'My hair is not tied in a ponytail, braid, or bun.',
  'Only one person appears in the photo.',
  'My photo has a plain or clean background.',
  'My photo is clear and taken in good lighting.',
  'My full hair length is visible.',
  'My hair ends are visible.',
  'My photo is recent and unedited.',
  'I understand that image-based screening is only an initial assessment.',
  'I understand that final acceptance is still subject to manual review by Hair for Hope.',
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
  const selectedTreatments = Array.isArray(questionnaireAnswers?.chemicalTreatments) ? questionnaireAnswers.chemicalTreatments : [];
  const colorStatus = questionnaireAnswers?.colorStatus || '';

  if (!analysis.is_hair_detected) reasons.push('Hair must be clearly visible in the uploaded photo set.');
  if (analysis?.missing_views?.length) reasons.push(`Required views are incomplete: ${analysis.missing_views.join(', ')}.`);
  if (donationRequirement?.minimum_hair_length != null && Number.isFinite(confirmedLength) && confirmedLength < Number(donationRequirement.minimum_hair_length)) {
    reasons.push(`Current donation rules require at least ${donationRequirement.minimum_hair_length} of visible hair.`);
  }
  if (donationRequirement?.chemical_treatment_status === false && selectedTreatments.some((item) => item && item !== 'none')) {
    reasons.push('Current donation rules do not allow chemically treated hair.');
  }
  if (donationRequirement?.colored_hair_status === false && ['colored', 'both'].includes(colorStatus)) {
    reasons.push('Current donation rules do not allow colored hair.');
  }
  if (donationRequirement?.bleached_hair_status === false && ['bleached', 'both'].includes(colorStatus)) {
    reasons.push('Current donation rules do not allow bleached hair.');
  }
  if (donationRequirement?.rebonded_hair_status === false && selectedTreatments.includes('rebonded')) {
    reasons.push('Current donation rules do not allow rebonded or straightened hair.');
  }
  if (hasDetectedConcern(source, ['clip', 'accessory', 'obstruction', 'blocked'], ['no clip', 'no accessory', 'not blocked'])) {
    reasons.push('Hair accessories or other objects should not block the hair during screening.');
  }

  const status = reasons.length
    ? (analysis.decision === 'Retake Photos' ? 'Retake Photos' : analysis.decision || 'Needs Review')
    : analysis.decision || 'Eligible';
  const tone = status === 'Eligible' ? 'success' : status === 'Retake Photos' || status === 'Not Yet Eligible' ? 'error' : 'info';

  return {
    status,
    tone,
    reasons,
    contextNote: donationRequirement?.donation_requirement_id
      ? 'This screening compares your answers and uploaded photos with the latest donation requirement record.'
      : 'Donation requirement data was not available, so this screening used your answers and uploaded photos only.',
  };
};

const getVisibleQuestions = (answers = {}) => (
  QUESTION_STEPS.filter((item) => !item.showWhen || item.showWhen(answers))
);

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
      <Text style={styles.slotDescription}>Add a clear photo for this required view. You can capture a new photo or upload one instead.</Text>

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
              <Text style={styles.stepDescription}>Use the live camera to capture this required donation view.</Text>
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

function DonationModeCard({ option, selected, disabled, helperText, onSelect }) {
  return (
    <Pressable onPress={() => !disabled && onSelect(option.value)} style={[styles.modeCard, selected ? styles.modeCardActive : null, disabled ? styles.modeCardDisabled : null]}>
      <View style={styles.modeHeader}>
        <Text style={styles.modeTitle}>{option.label}</Text>
        <View style={[styles.modeIndicator, selected ? styles.modeIndicatorActive : null]}>
          {selected ? <AppIcon name="check" state="inverse" size="sm" /> : null}
        </View>
      </View>
      <Text style={styles.modeBody}>{option.description}</Text>
      {helperText ? <Text style={styles.modeHelper}>{helperText}</Text> : null}
    </Pressable>
  );
}

const QUESTION_STEPS = [
  {
    key: 'screeningIntent',
    title: 'Are you submitting for initial donation screening or just checking eligibility first?',
    type: 'choice',
    optionsKey: 'screeningIntent',
  },
  {
    key: 'estimatedHairLengthInches',
    title: 'What is your estimated hair length?',
    type: 'number',
    helperText: 'Enter your estimate in inches.',
  },
  {
    key: 'chemicalTreatments',
    title: 'Has your hair been chemically treated?',
    type: 'multi',
    optionsKey: 'chemicalTreatments',
    helperText: 'Choose all that apply.',
  },
  {
    key: 'treatmentTiming',
    title: 'When was the treatment done?',
    type: 'choice',
    optionsKey: 'treatmentTiming',
    showWhen: (answers) => Array.isArray(answers.chemicalTreatments) && answers.chemicalTreatments.some((item) => item && item !== 'none'),
  },
  {
    key: 'colorStatus',
    title: 'Has your hair been colored or bleached?',
    type: 'choice',
    optionsKey: 'colorStatus',
  },
  {
    key: 'colorTiming',
    title: 'When was it last colored?',
    type: 'choice',
    optionsKey: 'colorTiming',
    showWhen: (answers) => answers.colorStatus && answers.colorStatus !== 'no',
  },
  {
    key: 'hairCondition',
    title: 'How would you describe your hair condition?',
    type: 'choice',
    optionsKey: 'hairCondition',
  },
  {
    key: 'splitEnds',
    title: 'Have you noticed split ends or brittle ends on your hair?',
    type: 'choice',
    optionsKey: 'yesNo',
  },
  {
    key: 'shedding',
    title: 'Is your hair currently shedding or falling out more than usual?',
    type: 'choice',
    optionsKey: 'yesNo',
  },
  {
    key: 'washFrequencyWeekly',
    title: 'How often do you wash your hair in a week?',
    type: 'choice',
    optionsKey: 'washFrequencyWeekly',
  },
  {
    key: 'heatStylingFrequency',
    title: 'Do you often use heat styling tools?',
    type: 'choice',
    optionsKey: 'heatStylingFrequency',
  },
];

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

const buildHairConditionHistory = (submissions = []) => {
  const screenings = submissions
    .flatMap((submission) => submission?.ai_screenings || [])
    .filter((screening) => screening?.created_at);

  const markers = new Map();

  screenings.forEach((screening) => {
    const key = new Date(screening.created_at).toISOString().slice(0, 10);
    const current = markers.get(key);

    if (!current || new Date(screening.created_at).getTime() > new Date(current.created_at).getTime()) {
      markers.set(key, screening);
    }
  });

  const latestScreening = screenings.sort((left, right) => (
    new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  ))[0] || null;

  return {
    markers,
    latestScreening,
  };
};

function InsightModal({ visible, title, body, rows = [], onClose }) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.insightModalOverlay}>
        <Pressable style={styles.insightModalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.insightModalCard}>
          <View style={styles.insightModalHeader}>
            <Text style={styles.insightModalTitle}>{title}</Text>
            <Pressable onPress={onClose} style={styles.insightModalClose}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          {body ? <Text style={styles.insightModalBody}>{body}</Text> : null}

          <View style={styles.insightList}>
            {rows.filter((row) => row?.value).map((row) => (
              <View key={row.label} style={styles.insightRow}>
                <Text style={styles.insightLabel}>{row.label}</Text>
                <Text style={styles.insightValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

function HairConditionLogCard({ submissions, onOpenAnalyzer }) {
  const visibleMonth = useMemo(() => new Date(), []);
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const history = useMemo(() => buildHairConditionHistory(submissions), [submissions]);
  const hasHistory = history.markers.size > 0;
  const latestTone = normalizeConditionTone(history.latestScreening?.detected_condition);

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
      <View style={styles.calendarHeaderRow}>
        <View>
          <Text style={styles.calendarMonthLabel}>{formatCalendarMonthLabel(visibleMonth)}</Text>
          <Text style={styles.calendarSummaryText}>Latest: {latestTone.label}</Text>
        </View>

        <View style={styles.latestConditionChip}>
          <View style={[styles.conditionDot, { backgroundColor: latestTone.dotColor }]} />
          <Text style={styles.latestConditionText}>
            {formatCalendarDayLabel(history.latestScreening?.created_at)}
          </Text>
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
          const key = day.toISOString().slice(0, 10);
          const screening = history.markers.get(key);
          const tone = normalizeConditionTone(screening?.detected_condition);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();

          return (
            <View
              key={key}
              style={[
                styles.calendarCell,
                screening ? styles.calendarCellActive : null,
                !isCurrentMonth ? styles.calendarCellMuted : null,
              ]}
            >
              <Text style={styles.calendarCellLabel}>{day.getDate()}</Text>
              <View
                style={[
                  styles.conditionDot,
                  { backgroundColor: screening ? tone.dotColor : theme.colors.transparent },
                ]}
              />
            </View>
          );
        })}
      </View>
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
  const [selectedDonationMode, setSelectedDonationMode] = useState('');
  const [isPhotoCaptureOpen, setIsPhotoCaptureOpen] = useState(false);
  const [activeCaptureSlotIndex, setActiveCaptureSlotIndex] = useState(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraModalError, setCameraModalError] = useState('');
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [latestRecommendations, setLatestRecommendations] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [activeInsight, setActiveInsight] = useState('');
  const { user, profile, resolvedTheme } = useAuth();
  const { logout, isLoading: isLoggingOut } = useAuthActions();
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    photos,
    requiredViews,
    analysis,
    donationRequirement,
    logisticsSettings,
    upcomingHaircutSchedules,
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
  const reviewForm = useForm({
    resolver: zodResolver(hairReviewSchema),
    mode: 'onChange',
    defaultValues: buildHairReviewDefaultValues(analysis),
  });

  const questionnaireValues = useWatch({ control: questionForm.control });
  const complianceAcknowledged = useWatch({ control: complianceForm.control, name: 'acknowledged' });
  const reviewValues = useWatch({ control: reviewForm.control });

  const visibleQuestions = useMemo(
    () => getVisibleQuestions(questionnaireValues || {}),
    [questionnaireValues]
  );
  const currentQuestion = visibleQuestions[questionIndex] || visibleQuestions[0];
  const currentView = requiredViews[photoIndex];
  const currentPhoto = photos[photoIndex];
  const activeCaptureView = activeCaptureSlotIndex != null ? requiredViews[activeCaptureSlotIndex] : null;
  const hasCameraPermission = Boolean(cameraPermission?.granted);

  const eligibility = useMemo(
    () => buildEligibilitySummary({
      analysis,
      confirmedValues: reviewValues,
      questionnaireAnswers: questionnaireValues,
      donationRequirement,
    }),
    [analysis, reviewValues, questionnaireValues, donationRequirement]
  );

  const stepTitles = useMemo(() => ([
    'Questionnaire',
    'Compliance checklist',
    'Required photo capture and upload',
    'AI result',
    'Next-step donation path',
  ]), []);
  const visibleStepNumber = stepIndex + 1;
  const visibleStepTotal = stepTitles.length;
  const visibleStepTitle = stepTitles[stepIndex];
  const latestAnalyzedSubmission = useMemo(
    () => analysisHistory.find((submission) => Array.isArray(submission?.ai_screenings) && submission.ai_screenings.length) || null,
    [analysisHistory]
  );
  const latestSavedScreening = latestAnalyzedSubmission?.ai_screenings?.[0] || null;
  const latestSavedRecommendation = latestRecommendations[0] || null;
  const hasSavedAnalysis = Boolean(latestAnalyzedSubmission && latestSavedScreening);
  const hasDraftFlow = Boolean(analysis || photos.some(Boolean));

  const loadAnalysisHistory = React.useCallback(async () => {
    if (!user?.id) return;

    setIsLoadingHistory(true);
    setHistoryError('');

    const submissionsResult = await fetchHairSubmissionsByUserId(user.id, 12);
    const submissions = submissionsResult.data || [];
    setAnalysisHistory(submissions);

    const latestSubmissionWithScreening = submissions.find((submission) => (
      Array.isArray(submission?.ai_screenings) && submission.ai_screenings.length
    ));

    if (latestSubmissionWithScreening?.submission_id) {
      const recommendationsResult = await fetchDonorRecommendationsBySubmissionId(latestSubmissionWithScreening.submission_id, 3);
      setLatestRecommendations(recommendationsResult.data || []);

      if (recommendationsResult.error) {
        setHistoryError('Some hair insights could not be loaded right now.');
      }
    } else {
      setLatestRecommendations([]);
    }

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
    logAppEvent('donor_hair_submission.flow', 'Donor screening flow initialized without intro wizard steps.', {
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      visibleSteps: stepTitles,
    });
  }, [profile?.user_id, stepTitles, user?.id]);

  const canMovePastQuestion = isAnswered(currentQuestion, questionnaireValues);
  const isAutoAdvanceQuestion = stepIndex === 0 && currentQuestion?.type === 'choice';
  const isCurrentPhotoComplete = Boolean(photos[photoIndex]);
  const canProceedToDonationMode = eligibility.status !== 'Retake Photos' && eligibility.status !== 'Not Yet Eligible';
  const isReviewStepFilled = Boolean(
    reviewValues?.declaredLength?.trim()
    && reviewValues?.declaredTexture?.trim()
    && reviewValues?.declaredDensity?.trim()
    && reviewValues?.declaredCondition?.trim()
  );
  const isFinishStepComplete = analysis
    && isReviewStepFilled
    && (!canProceedToDonationMode || Boolean(selectedDonationMode));

  const isNextDisabled = (
    (stepIndex === 0 && !canMovePastQuestion)
    || (stepIndex === 1 && !Boolean(complianceAcknowledged))
    || (stepIndex === 2 && !isCurrentPhotoComplete)
    || (stepIndex === 3 && isAnalyzing)
    || (stepIndex === 4 && (!analysis || !isFinishStepComplete || isSaving))
  );

  const nextButtonTitle = useMemo(() => {
    if (stepIndex === 0) return questionIndex === visibleQuestions.length - 1 ? 'Continue' : 'Next';
    if (stepIndex === 1) return 'Continue';
    if (stepIndex === 2) return photoIndex === requiredViews.length - 1 ? 'Analyze' : 'Next';
    if (stepIndex === 3) return analysis ? 'Next' : 'Retry analysis';
    return isSaving ? 'Saving...' : 'Finish';
  }, [analysis, isSaving, photoIndex, questionIndex, requiredViews.length, stepIndex, visibleQuestions.length]);

  const goToNextQuestionStep = (answersSnapshot = questionForm.getValues(), currentQuestionKey = currentQuestion?.key) => {
    const nextVisibleQuestions = getVisibleQuestions(answersSnapshot);
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
      isFinalVisibleQuestion: getVisibleQuestions(nextAnswers).findIndex((item) => item.key === fieldName) === getVisibleQuestions(nextAnswers).length - 1,
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

  useEffect(() => {
    const treatments = Array.isArray(questionnaireValues?.chemicalTreatments)
      ? questionnaireValues.chemicalTreatments
      : [];
    const hasTreatmentHistory = treatments.some((item) => item && item !== 'none');

    if (!hasTreatmentHistory && questionForm.getValues('treatmentTiming')) {
      questionForm.setValue('treatmentTiming', '', { shouldDirty: true, shouldValidate: false });
    }

    if ((questionnaireValues?.colorStatus || '') === 'no' && questionForm.getValues('colorTiming')) {
      questionForm.setValue('colorTiming', '', { shouldDirty: true, shouldValidate: false });
    }
  }, [questionForm, questionnaireValues?.chemicalTreatments, questionnaireValues?.colorStatus]);

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

  useEffect(() => {
    reviewForm.reset(buildHairReviewDefaultValues(analysis, questionnaireValues));
  }, [analysis, questionnaireValues, reviewForm]);

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
          questionnaireAnswers: questionForm.getValues(),
          complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
        });
      }
      return;
    }

    if (stepIndex === 3) {
      if (!analysis) {
        await analyzePhotos({
          questionnaireAnswers: questionForm.getValues(),
          complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
        });
        return;
      }
      setStepIndex(4);
      return;
    }

    if (stepIndex === 4) {
      if (!analysis) return;

      const canProceedToDonationMode = eligibility.status !== 'Retake Photos' && eligibility.status !== 'Not Yet Eligible';
      if (canProceedToDonationMode && !selectedDonationMode) return;

      const isReviewValid = await reviewForm.trigger();
      if (!isReviewValid) return;

      const result = await submitSubmission(reviewForm.getValues(), {
        questionnaireAnswers: questionForm.getValues(),
        donationModeValue: canProceedToDonationMode ? selectedDonationMode : '',
      });

      if (result?.success) {
        questionForm.reset(hairAnalyzerQuestionDefaultValues);
        complianceForm.reset(hairAnalyzerComplianceDefaultValues);
        reviewForm.reset(buildHairReviewDefaultValues(null));
        setSelectedDonationMode('');
        setQuestionIndex(0);
        setPhotoIndex(0);
        setStepIndex(0);
        setIsAnalyzerActive(false);
      }
    }
  };

  const renderStepContent = () => {
    switch (stepIndex) {
      case 0:
        return (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.progressText}>Question {questionIndex + 1} of {visibleQuestions.length}</Text>
            {renderQuestionInput()}
          </AppCard>
        );
      case 1:
        return (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.stepTitle}>Compliance checklist</Text>
            <Text style={styles.stepDescription}>Confirm that your photos follow the screening instructions before you add them.</Text>
            <View style={styles.bulletList}>
              {PHOTO_COMPLIANCE_ITEMS.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
            <Pressable
              onPress={() => complianceForm.setValue('acknowledged', !complianceAcknowledged, { shouldDirty: true, shouldTouch: true, shouldValidate: true })}
              style={styles.checkRow}
            >
              <View style={[styles.checkBox, complianceAcknowledged ? styles.checkBoxActive : null]}>
                <AppIcon name={complianceAcknowledged ? 'checkbox-marked' : 'checkbox-blank-outline'} state={complianceAcknowledged ? 'inverse' : 'muted'} />
              </View>
              <Text style={styles.checkLabel}>I have read and understood all of the above.</Text>
            </Pressable>
            {complianceForm.formState.errors.acknowledged?.message ? <Text style={styles.questionError}>{complianceForm.formState.errors.acknowledged.message}</Text> : null}
          </AppCard>
        );
      case 2:
        return (
          <View style={styles.stepStack}>
            <AppCard variant="soft" radius="xl" padding="lg">
              <Text style={styles.progressText}>Photo slot {photoIndex + 1} of {requiredViews.length}</Text>
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
        return (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.stepTitle}>AI-assisted screening result</Text>
            {analysis ? (
              <>
                <StatusBanner title={eligibility.status} message={eligibility.reasons[0] || eligibility.contextNote || 'The AI screening result is ready for review.'} variant={eligibility.tone} style={styles.bannerGap} />
                <View style={styles.metricsGrid}>
                  <ResultMetricCard label="Estimated length" value={formatLengthLabel(analysis.estimated_length)} />
                  <ResultMetricCard label="Texture" value={analysis.detected_texture} />
                  <ResultMetricCard label="Density" value={analysis.detected_density} />
                  <ResultMetricCard label="Condition" value={analysis.detected_condition} />
                  <ResultMetricCard label="Decision" value={analysis.decision} />
                  <ResultMetricCard label="Image visibility" value={analysis.is_hair_detected ? 'Clear' : 'Needs review'} />
                </View>
                <AppCard variant="soft" radius="xl" padding="lg" style={styles.bannerGap}>
                  <Text style={styles.summaryLabel}>AI summary</Text>
                  <Text style={styles.stepDescription}>{analysis.summary || 'No summary was returned for this analysis.'}</Text>
                </AppCard>
                <AppCard variant="soft" radius="xl" padding="lg">
                  <Text style={styles.summaryLabel}>Answer snapshot</Text>
                  <View style={styles.answerSummaryList}>
                    <Text style={styles.answerSummaryItem}>Purpose: {getChoiceLabel(hairAnalyzerQuestionChoices.screeningIntent, questionnaireValues?.screeningIntent)}</Text>
                    <Text style={styles.answerSummaryItem}>Estimated length: {questionnaireValues?.estimatedHairLengthInches || 'Not set'} in</Text>
                    <Text style={styles.answerSummaryItem}>Chemical treatments: {getChoiceLabels(hairAnalyzerQuestionChoices.chemicalTreatments, questionnaireValues?.chemicalTreatments) || 'Not set'}</Text>
                    <Text style={styles.answerSummaryItem}>Color or bleach history: {getChoiceLabel(hairAnalyzerQuestionChoices.colorStatus, questionnaireValues?.colorStatus)}</Text>
                    <Text style={styles.answerSummaryItem}>Current condition: {getChoiceLabel(hairAnalyzerQuestionChoices.hairCondition, questionnaireValues?.hairCondition)}</Text>
                  </View>
                </AppCard>
              </>
            ) : (
              <StatusBanner title="Analysis not ready" message={error?.message || 'The photo set is ready. Retry the analysis to load the screening result.'} variant="info" />
            )}
          </AppCard>
        );
      case 4:
        return (
          <ScrollView contentContainerStyle={styles.stepStack}>
            <AppCard variant="elevated" radius="xl" padding="lg">
              <Text style={styles.stepTitle}>Next-step donation path</Text>
              <Text style={styles.stepDescription}>Confirm the detected details, then choose the donation path that should be saved with this submission.</Text>

              <Controller control={reviewForm.control} name="declaredLength" render={({ field }) => <AppInput label="Confirm detected length" placeholder="35.6" keyboardType="decimal-pad" variant="filled" helperText={`AI result: ${formatLengthLabel(analysis?.estimated_length)} | Your estimate: ${questionnaireValues?.estimatedHairLengthInches || 'Not set'} in`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={reviewForm.formState.errors.declaredLength?.message} />} />
              <Controller control={reviewForm.control} name="declaredTexture" render={({ field }) => <AppInput label="Confirm texture" placeholder="Straight" variant="filled" helperText={`AI result: ${analysis?.detected_texture || 'No value'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={reviewForm.formState.errors.declaredTexture?.message} />} />
              <Controller control={reviewForm.control} name="declaredDensity" render={({ field }) => <AppInput label="Confirm density" placeholder="Medium" variant="filled" helperText={`AI result: ${analysis?.detected_density || 'No value'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={reviewForm.formState.errors.declaredDensity?.message} />} />
              <Controller control={reviewForm.control} name="declaredCondition" render={({ field }) => <AppInput label="Confirm condition" placeholder="Healthy" variant="filled" helperText={`AI result: ${analysis?.detected_condition || 'No value'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={reviewForm.formState.errors.declaredCondition?.message} />} />
              <Controller control={reviewForm.control} name="detailNotes" render={({ field }) => <AppInput label="Correction notes" placeholder="Add corrections if the AI missed something" variant="filled" multiline={true} numberOfLines={4} helperText={`AI notes: ${analysis?.visible_damage_notes || 'No extra notes'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={reviewForm.formState.errors.detailNotes?.message} inputStyle={styles.multilineInput} />} />

              {eligibility.status !== 'Retake Photos' && eligibility.status !== 'Not Yet Eligible' ? (
                <View style={styles.modeList}>
                  {hairDonationModeOptions.map((option) => (
                    <DonationModeCard
                      key={option.value}
                      option={option}
                      selected={selectedDonationMode === option.value}
                      disabled={option.value === 'pickup' && logisticsSettings?.is_pickup_enabled === false}
                      helperText={option.value === 'shipping'
                        ? `Current drop-off address: ${DONATION_DROP_OFF_ADDRESS}`
                        : option.value === 'haircut_assessment'
                          ? upcomingHaircutSchedules?.length
                            ? `Upcoming slots: ${upcomingHaircutSchedules.slice(0, 2).map((item) => formatScheduleDateLabel(item.schedule_date, item.start_time, item.end_time)).join(' | ')}`
                            : 'Upcoming haircut schedules are not available right now.'
                          : option.value === 'pickup'
                            ? logisticsSettings?.pickup_notes || 'Pickup depends on the latest logistics settings and final manual review.'
                            : 'Use this if you can personally deliver the donation after the screening.'}
                      onSelect={setSelectedDonationMode}
                    />
                  ))}
                </View>
              ) : (
                <StatusBanner title="Not yet ready for donation submission" message="This screening suggests that you should follow the recommendations first. You can still save this screening result and try again later." variant="info" style={styles.bannerGap} />
              )}

              {(analysis?.recommendations || []).length ? (
                <View style={styles.recommendationList}>
                  {(analysis.recommendations || []).map((recommendation, index) => (
                    <RecommendationCard key={`${recommendation.priority_order}-${recommendation.title || recommendation.recommendation_text.slice(0, 20)}`} recommendation={recommendation} isTopPriority={index === 0} />
                  ))}
                </View>
              ) : null}
            </AppCard>
          </ScrollView>
        );
      default:
        return null;
    }
  };

  const startButtonTitle = hasDraftFlow
    ? 'Continue hair check'
    : hasSavedAnalysis
      ? 'Start new hair check'
      : 'Start hair check';
  const latestSavedTone = normalizeConditionTone(latestSavedScreening?.detected_condition);
  const latestLengthLabel = latestSavedScreening?.estimated_length
    ? formatLengthLabel(latestSavedScreening.estimated_length)
    : '';
  const checkHairSubtitle = isAnalyzerActive
    ? `Step ${visibleStepNumber} of ${visibleStepTotal}`
    : hasSavedAnalysis
      ? 'Latest result ready'
      : 'Start your self-check';

  return (
    <DashboardLayout
      showSupportChat={false}
      navItems={donorDashboardNavItems}
      activeNavKey="checkhair"
      navVariant="donor"
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
          <AppCard variant="default" radius="xl" padding="lg">
            <View style={styles.summaryHeroRow}>
              <View style={styles.summaryIconWrap}>
                <AppIcon name="checkHair" size="lg" state="active" />
              </View>
              <View style={styles.summaryHeroCopy}>
                <Text style={styles.summaryHeroTitle}>Start hair check</Text>
                <Text style={styles.summaryHeroBody}>
                  Run a quick AI hair check and track your condition over time.
                </Text>
              </View>
            </View>

            <View style={styles.summaryHeroActions}>
              <AppButton
                title={startButtonTitle}
                fullWidth={false}
                onPress={() => setIsAnalyzerActive(true)}
              />
              {hasSavedAnalysis ? (
                <Text style={styles.summaryHeroMeta}>
                  Latest: {latestSavedTone.label}
                </Text>
              ) : null}
            </View>
          </AppCard>

          {!isLoadingHistory && hasSavedAnalysis ? (
            <AppCard variant="default" radius="xl" padding="lg">
              <View style={styles.latestResultHeader}>
                <View style={styles.summaryIconWrapSmall}>
                  <AppIcon name="success" size="sm" state="active" />
                </View>
                <View style={styles.latestResultCopy}>
                  <Text style={styles.latestResultTitle}>Your latest result</Text>
                  <Text style={styles.latestResultBody}>
                    {latestSavedRecommendation?.recommendation_text || latestSavedScreening?.summary || 'Your latest hair check is ready.'}
                  </Text>
                </View>
              </View>

              <View style={styles.latestResultMetrics}>
                <View style={styles.latestMetricChip}>
                  <Text style={styles.latestMetricLabel}>Condition</Text>
                  <Text style={styles.latestMetricValue}>{latestSavedTone.label}</Text>
                </View>
                {latestLengthLabel ? (
                  <View style={styles.latestMetricChip}>
                    <Text style={styles.latestMetricLabel}>Length</Text>
                    <Text style={styles.latestMetricValue}>{latestLengthLabel}</Text>
                  </View>
                ) : null}
                {latestSavedScreening?.decision ? (
                  <View style={styles.latestMetricChip}>
                    <Text style={styles.latestMetricLabel}>Status</Text>
                    <Text style={styles.latestMetricValue}>{latestSavedScreening.decision}</Text>
                  </View>
                ) : null}
              </View>
            </AppCard>
          ) : null}

          <View style={styles.sectionGroup}>
            <Text style={styles.sectionTitleCompact}>Hair log</Text>
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
              />
            )}
          </View>

          {hasSavedAnalysis ? (
            <View style={styles.postAnalysisActions}>
              <AppButton
                title="Check hair eligibility"
                variant="secondary"
                fullWidth={false}
                leading={<AppIcon name="shield" state="default" />}
                onPress={() => setActiveInsight('eligibility')}
              />
              <AppButton
                title="Check hair condition"
                fullWidth={false}
                leading={<AppIcon name="checkHair" state="inverse" />}
                onPress={() => setActiveInsight('condition')}
              />
            </View>
          ) : null}
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
            {!isAutoAdvanceQuestion ? (
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

      <InsightModal
        visible={activeInsight === 'eligibility'}
        title="Hair eligibility"
        body={latestSavedScreening?.decision || 'Your latest eligibility result is ready.'}
        rows={[
          { label: 'Result', value: latestSavedScreening?.decision || '' },
          { label: 'Minimum length', value: donationRequirement?.minimum_hair_length ? `${donationRequirement.minimum_hair_length} cm` : '' },
          { label: 'Detected length', value: latestLengthLabel },
          { label: 'Top guidance', value: latestSavedRecommendation?.title || latestSavedRecommendation?.recommendation_text || '' },
        ]}
        onClose={() => setActiveInsight('')}
      />

      <InsightModal
        visible={activeInsight === 'condition'}
        title="Hair condition"
        body={latestSavedScreening?.summary || 'Your latest hair condition overview is ready.'}
        rows={[
          { label: 'Condition', value: latestSavedTone.label },
          { label: 'Texture', value: latestSavedScreening?.detected_texture || '' },
          { label: 'Density', value: latestSavedScreening?.detected_density || '' },
          { label: 'Notes', value: latestSavedScreening?.visible_damage_notes || latestSavedRecommendation?.recommendation_text || '' },
        ]}
        onClose={() => setActiveInsight('')}
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
  summaryHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
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
    flex: 1,
    gap: 4,
  },
  summaryHeroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  summaryHeroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  summaryHeroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  summaryHeroMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
  },
  latestResultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  summaryIconWrapSmall: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  latestResultCopy: {
    flex: 1,
    gap: 4,
  },
  latestResultTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  latestResultBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  latestResultMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  latestMetricChip: {
    minWidth: '30%',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  latestMetricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  latestMetricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  sectionGroup: {
    gap: theme.spacing.sm,
  },
  sectionTitleCompact: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
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
  latestConditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  latestConditionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
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
  insightModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.overlay,
  },
  insightModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  insightModalCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  insightModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  insightModalTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  insightModalClose: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  insightModalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  insightList: {
    gap: theme.spacing.sm,
  },
  insightRow: {
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  insightLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  insightValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
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
