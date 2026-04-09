import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { resolveBrandLogoSource, theme } from '../../design-system/theme';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useNotifications } from '../../hooks/useNotifications';
import { useDonorHairSubmission } from '../../hooks/useDonorHairSubmission';
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

const formatCurrency = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'PHP 400';

  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      maximumFractionDigits: 0,
    }).format(numericValue);
  } catch {
    return `PHP ${numericValue}`;
  }
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

const buildRequirementItems = (donationRequirement) => {
  if (!donationRequirement?.donation_requirement_id) {
    return [
      'Hair should ideally be at least 14 inches.',
      'Hair is preferably untreated.',
      'Hair is preferably uncolored.',
      'Hair is still subject to evaluation even if you meet the basic requirements.',
      'Final acceptance is still for manual review by authorized personnel.',
    ];
  }

  return [
    donationRequirement.minimum_hair_length != null
      ? `Current minimum hair length: ${donationRequirement.minimum_hair_length}.`
      : 'Current minimum hair length is not set in the latest requirement record.',
    donationRequirement.chemical_treatment_status === false
      ? 'Chemically treated hair is currently not allowed.'
      : 'Chemically treated hair may still be reviewed based on the latest requirement record.',
    donationRequirement.colored_hair_status === false
      ? 'Colored hair is currently not allowed.'
      : 'Colored hair may still be reviewed based on the latest requirement record.',
    donationRequirement.bleached_hair_status === false
      ? 'Bleached hair is currently not allowed.'
      : 'Bleached hair may still be reviewed based on the latest requirement record.',
    donationRequirement.rebonded_hair_status === false
      ? 'Rebonded or straightened hair is currently not allowed.'
      : 'Rebonded or straightened hair may still be reviewed based on the latest requirement record.',
    donationRequirement.notes || 'Final acceptance is still for manual review by authorized personnel.',
  ];
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

function StepInfoCard({ title, description, items, footer }) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg">
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.stepDescription}>{description}</Text>
      <View style={styles.bulletList}>
        {items.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.stepFootnote}>{footer}</Text> : null}
    </AppCard>
  );
}

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

export function DonorHairSubmissionScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [stepIndex, setStepIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selectedDonationMode, setSelectedDonationMode] = useState('');
  const [isPhotoCaptureOpen, setIsPhotoCaptureOpen] = useState(false);
  const [activeCaptureSlotIndex, setActiveCaptureSlotIndex] = useState(null);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraModalError, setCameraModalError] = useState('');
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const { user, profile, resolvedTheme } = useAuth();
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    photos,
    requiredViews,
    analysis,
    donationRequirement,
    logisticsSettings,
    upcomingHaircutSchedules,
    latestHaircutReservation,
    latestCertificate,
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
  } = useDonorHairSubmission({ userId: user?.id });

  const avatarInitials = `${profile?.first_name?.[0] || ''}${profile?.last_name?.[0] || ''}`.trim();
  const requirementItems = useMemo(() => buildRequirementItems(donationRequirement), [donationRequirement]);
  const haircutPriceLabel = formatCurrency(upcomingHaircutSchedules?.[0]?.haircut_price || 400);

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
    () => QUESTION_STEPS.filter((item) => !item.showWhen || item.showWhen(questionnaireValues || {})),
    [questionnaireValues]
  );
  const currentQuestion = visibleQuestions[questionIndex] || visibleQuestions[0];
  const currentView = requiredViews[photoIndex];
  const currentPhoto = photos[photoIndex];
  const activeCaptureView = activeCaptureSlotIndex != null ? requiredViews[activeCaptureSlotIndex] : null;
  const hasCameraPermission = Boolean(cameraPermission?.granted);
  const brandLogoSource = resolveBrandLogoSource(resolvedTheme, brandLogoFailed);

  useEffect(() => {
    setBrandLogoFailed(false);
  }, [resolvedTheme?.logoIcon]);

  const eligibility = useMemo(
    () => buildEligibilitySummary({
      analysis,
      confirmedValues: reviewValues,
      questionnaireAnswers: questionnaireValues,
      donationRequirement,
    }),
    [analysis, reviewValues, questionnaireValues, donationRequirement]
  );

  const stepTitles = [
    'Hair Donation Requirements',
    'How Can I Donate?',
    'What Do I Get?',
    'What Does the AI Do?',
    'Begin AI Screening',
    'Questionnaire',
    'Compliance checklist',
    'Required photo capture and upload',
    'AI result',
    'Next-step donation path',
  ];
  const screeningStepTitles = stepTitles.slice(5);
  const isScreeningFlowActive = stepIndex >= 5;
  const visibleStepNumber = isScreeningFlowActive ? stepIndex - 4 : stepIndex + 1;
  const visibleStepTotal = isScreeningFlowActive ? screeningStepTitles.length : 5;
  const visibleStepTitle = isScreeningFlowActive ? screeningStepTitles[stepIndex - 5] : stepTitles[stepIndex];

  const canMovePastQuestion = isAnswered(currentQuestion, questionnaireValues);
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
    (stepIndex === 5 && !canMovePastQuestion)
    || (stepIndex === 6 && !Boolean(complianceAcknowledged))
    || (stepIndex === 7 && !isCurrentPhotoComplete)
    || (stepIndex === 8 && isAnalyzing)
    || (stepIndex === 9 && (!analysis || !isFinishStepComplete || isSaving))
  );

  const nextButtonTitle = useMemo(() => {
    if (stepIndex <= 4) return 'Next';
    if (stepIndex === 5) return questionIndex === visibleQuestions.length - 1 ? 'Continue' : 'Next';
    if (stepIndex === 6) return 'Continue';
    if (stepIndex === 7) return photoIndex === requiredViews.length - 1 ? 'Analyze' : 'Next';
    if (stepIndex === 8) return analysis ? 'Next' : 'Retry analysis';
    return isSaving ? 'Saving...' : 'Finish';
  }, [analysis, isSaving, photoIndex, questionIndex, requiredViews.length, stepIndex, visibleQuestions.length]);

  const goPrevious = () => {
    if (stepIndex === 5 && questionIndex > 0) {
      setQuestionIndex((current) => current - 1);
      return;
    }
    if (stepIndex === 7 && photoIndex > 0) {
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
              onChange={field.onChange}
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

      const saveResult = savePhotoAssetForSlot(activeCaptureSlotIndex, photo, 'capture');
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
    if (stepIndex <= 4) {
      setStepIndex((current) => current + 1);
      return;
    }

    if (stepIndex === 5) {
      const fieldName = currentQuestion?.key;
      const isValid = fieldName ? await questionForm.trigger(fieldName) : false;
      if (!isValid) return;

      if (questionIndex < visibleQuestions.length - 1) {
        setQuestionIndex((current) => current + 1);
        return;
      }

      setStepIndex(6);
      return;
    }

    if (stepIndex === 6) {
      const isValid = await complianceForm.trigger('acknowledged');
      if (!isValid) return;
      setStepIndex(7);
      return;
    }

    if (stepIndex === 7) {
      if (!photos[photoIndex]) return;
      if (photoIndex < requiredViews.length - 1) {
        setPhotoIndex((current) => current + 1);
        return;
      }

      if (photos.filter(Boolean).length !== requiredViews.length) return;
      setStepIndex(8);
      if (!analysis) {
        await analyzePhotos({
          questionnaireAnswers: questionForm.getValues(),
          complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
        });
      }
      return;
    }

    if (stepIndex === 8) {
      if (!analysis) {
        await analyzePhotos({
          questionnaireAnswers: questionForm.getValues(),
          complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
        });
        return;
      }
      setStepIndex(9);
      return;
    }

    if (stepIndex === 9) {
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
      }
    }
  };

  const renderStepContent = () => {
    switch (stepIndex) {
      case 0:
        return (
          <StepInfoCard
            title="Hair Donation Requirements"
            description="Review the current baseline donation requirements before starting the AI screening."
            items={requirementItems}
            footer={donationRequirement?.donation_requirement_id
              ? 'These items come from the latest Donation_Requirements record when available.'
              : 'The current requirement record was not available, so the module is showing the standard interview-based requirement summary.'}
          />
        );
      case 1:
        return (
          <StepInfoCard
            title="How Can I Donate?"
            description="Choose the donation path that matches your location and readiness after screening."
            items={[
              `Logistics / shipping: send prepared hair to ${DONATION_DROP_OFF_ADDRESS}. Shipping fee is shouldered by the donor.`,
              'Delivered onsite if you are near the area and ready for manual review.',
              logisticsSettings?.is_pickup_enabled === false ? 'Pickup is currently disabled in the latest logistics settings.' : `Pickup if near the area. ${logisticsSettings?.pickup_notes || 'Pickup still depends on the latest logistics requirement logic.'}`,
              upcomingHaircutSchedules?.length ? `Haircut assessment: available schedule previews include ${upcomingHaircutSchedules.map((item) => formatScheduleDateLabel(item.schedule_date, item.start_time, item.end_time)).join(' | ')}.` : 'Haircut assessment is still subject to screening first before final scheduling.',
            ]}
          />
        );
      case 2:
        return (
          <StepInfoCard
            title="What Do I Get?"
            description="These are the donor-side outcomes already supported in the current workflow."
            items={[
              latestCertificate?.certificate_id ? `Certificate of Appreciation is already linked to your latest donation record (${latestCertificate.certificate_number || 'certificate available'}).` : 'Certificate of Appreciation after a qualified donation review.',
              `If haircut applies, the current discounted haircut amount in the flow is ${haircutPriceLabel}.`,
              'If your hair is not yet ideal for donation, the AI can still save recommendations for future donation improvement.',
              latestHaircutReservation?.reservation_id ? `Your latest haircut reservation status is ${latestHaircutReservation.status || 'pending'}.` : 'Haircut reservations become relevant only after assessment and scheduling.',
            ]}
          />
        );
      case 3:
        return (
          <StepInfoCard
            title="What Does the AI Do?"
            description="The AI gives an initial donation-oriented screening based on your guided answers and the required photo set."
            items={[
              'The AI first asks a short survey about your current hair state and treatment history.',
              'Before taking photos: no accessories, no ponytail or braid, one person only, plain background, good lighting, dry hair, and no filters.',
              'The AI checks visible length, density, texture, condition, and obvious damage signs against the current donation requirement context when available.',
              ...requiredViews.map((view) => `${view.label}: required for screening.`),
              'The screening is only an initial assessment. Final acceptance still requires manual review by Hair for Hope.',
            ]}
          />
        );
      case 4:
        return (
          <StepInfoCard
            title="Begin AI Screening"
            description="You are about to start the guided donation screening journey."
            items={[
              'You will answer the questions one at a time.',
              'You will confirm the photo checklist before capture or upload.',
              'You will add the four required donation views one slot at a time.',
              'AI analysis runs only after the required answers and image slots are complete.',
            ]}
          />
        );
      case 5:
        return (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.progressText}>Question {questionIndex + 1} of {visibleQuestions.length}</Text>
            {renderQuestionInput()}
          </AppCard>
        );
      case 6:
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
      case 7:
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
      case 8:
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
      case 9:
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

  return (
    <DashboardLayout
      navItems={donorDashboardNavItems}
      activeNavKey="donations"
      navVariant="donor"
      onNavPress={(item) => {
        if (!item.route || item.route === '/donor/donations') return;
        router.navigate(item.route);
      }}
      header={(
        <DashboardHeader
          title="Hair Donation"
          subtitle={visibleStepTitle}
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="donor"
          utilityActions={[{ key: 'notifications', icon: 'notifications', badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined, onPress: () => router.navigate('/donor/notifications') }]}
        />
      )}
    >
      {successMessage ? <StatusBanner message={successMessage} variant="success" title="Submission saved" style={styles.bannerGap} /> : null}
      {isLoadingContext ? <StatusBanner title="Loading donation context" message="The module is loading the current donation requirement, logistics settings, and donor support data." variant="info" style={styles.bannerGap} /> : null}
      {error ? <StatusBanner title={error.title} message={error.message} variant="error" style={styles.bannerGap} /> : null}

      <View style={styles.wizardStage}>
        <View style={styles.brandMarkWrap}>
          <View style={styles.brandMarkFrame}>
            <Image
              source={brandLogoSource}
              style={styles.brandMarkImage}
              resizeMode="contain"
              onError={() => setBrandLogoFailed(true)}
            />
          </View>
        </View>

        <View style={styles.progressHeader}>
          <Text style={styles.progressText}>Step {visibleStepNumber} of {visibleStepTotal}</Text>
          <Text style={styles.progressHelper}>{progressLabel}</Text>
        </View>

        <View style={styles.stepContentWrap}>
          {renderStepContent()}
        </View>

        <View style={styles.footerNav}>
          <AppButton title="Previous" variant="outline" fullWidth={false} onPress={goPrevious} disabled={stepIndex === 0 && questionIndex === 0 && photoIndex === 0} />
          <AppButton
            title={nextButtonTitle}
            fullWidth={false}
            onPress={handleNext}
            loading={(stepIndex === 7 || stepIndex === 8) && isAnalyzing}
            disabled={isNextDisabled}
          />
        </View>
      </View>

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
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  wizardStage: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  brandMarkWrap: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  brandMarkFrame: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  brandMarkImage: {
    width: 46,
    height: 46,
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
