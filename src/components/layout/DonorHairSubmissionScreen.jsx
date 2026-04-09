import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { DashboardSectionHeader } from '../ui/DashboardSectionHeader';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { theme } from '../../design-system/theme';
import { donorDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { useDonorHairSubmission } from '../../hooks/useDonorHairSubmission';
import { useNotifications } from '../../hooks/useNotifications';
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
const ANALYZER_VIEW_GUIDANCE = [
  'Front View Photo: show the full front hair area and visible length in one clear frame.',
  'Back View Photo: show the full back section and overall visible donation length.',
  'Hair Ends Close-Up: capture the lower hair section so the ends and visible damage can be checked.',
  'Side View Photo: capture one full side view from scalp to ends.',
];

const getChoiceLabel = (choices = [], value = '') => (
  choices.find((item) => item.value === value)?.label || value || 'Not set'
);

const getChoiceLabels = (choices = [], values = []) => (
  (Array.isArray(values) ? values : []).map((value) => getChoiceLabel(choices, value)).filter(Boolean).join(', ')
);

const formatLengthLabel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Not detected';
  const inches = numericValue / 2.54;
  return `${numericValue.toFixed(1)} cm / ${inches.toFixed(1)} in`;
};

const formatRequirementLengthLabel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Not set';
  return String(numericValue);
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

const isPotentialDonationNextStep = (status = '') => {
  const normalized = String(status || '').toLowerCase();
  return normalized !== 'retake photos' && normalized !== 'not yet eligible';
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
      ? `Current minimum hair length: ${formatRequirementLengthLabel(donationRequirement.minimum_hair_length)}.`
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

const buildEligibilitySummary = ({ analysis, confirmedValues, questionnaireAnswers, donationRequirement }) => {
  if (!analysis) return { status: 'Pending', tone: 'info', reasons: [], contextNote: '' };

  const reasons = [];
  const source = normalizeAnalysisText(analysis);
  const confirmedLength = Number(confirmedValues?.declaredLength || analysis?.estimated_length);
  const selectedTreatments = Array.isArray(questionnaireAnswers?.chemicalTreatments) ? questionnaireAnswers.chemicalTreatments : [];
  const colorStatus = questionnaireAnswers?.colorStatus || '';

  if (!analysis.is_hair_detected) reasons.push('Hair must be clearly visible in the uploaded photo set.');
  if (analysis?.missing_views?.length) reasons.push(`Required views are incomplete: ${analysis.missing_views.join(', ')}.`);

  if (
    donationRequirement?.minimum_hair_length != null
    && Number.isFinite(confirmedLength)
    && confirmedLength < Number(donationRequirement.minimum_hair_length)
  ) {
    reasons.push(`Current donation rules require at least ${formatRequirementLengthLabel(donationRequirement.minimum_hair_length)} of visible hair.`);
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
  const tone = status === 'Eligible' ? 'success' : status === 'Retake Photos' ? 'error' : status === 'Not Yet Eligible' ? 'error' : 'info';

  return {
    status,
    tone,
    reasons,
    contextNote: donationRequirement?.donation_requirement_id
      ? 'This screening compares your answers and uploaded photos with the latest donation requirement record.'
      : 'Donation requirement data was not available, so this screening used your answers and uploaded photos only.',
  };
};

function ModuleInfoCard({ stepLabel, title, description, items, footer }) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg" style={styles.cardGap}>
      <Text style={styles.eyebrow}>{stepLabel}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{description}</Text>
      <View style={styles.bulletList}>
        {items.map((item) => (
          <View key={item} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{item}</Text>
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.footnote}>{footer}</Text> : null}
    </AppCard>
  );
}

function QuestionBlock({ label, helperText, error, children }) {
  return (
    <View style={styles.questionBlock}>
      <Text style={styles.questionLabel}>{label}</Text>
      {helperText ? <Text style={styles.questionHelper}>{helperText}</Text> : null}
      {children}
      {error ? <Text style={styles.questionError}>{error}</Text> : null}
    </View>
  );
}

function ChoiceChipRow({ value, options, onChange }) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}>
            <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MultiChoiceChipRow({ values = [], options, onChange }) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const isActive = values.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(isActive ? values.filter((item) => item !== option.value) : [...values, option.value])}
            style={[styles.choiceChip, isActive ? styles.choiceChipActive : null]}
          >
            <Text style={[styles.choiceChipText, isActive ? styles.choiceChipTextActive : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PhotoTile({ photo, onRemove }) {
  return (
    <View style={styles.photoTile}>
      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
      <View style={styles.photoPill}>
        <Text style={styles.photoPillText}>{photo.viewLabel}</Text>
      </View>
      <Pressable onPress={() => onRemove(photo.id)} style={styles.photoRemove}>
        <AppIcon name="close" state="inverse" size="sm" />
      </Pressable>
    </View>
  );
}

function GuideStepCard({ index, view, photo }) {
  return (
    <View style={[styles.stepCard, photo ? styles.stepCardDone : null]}>
      <View style={[styles.stepNumber, photo ? styles.stepNumberDone : null]}>
        <Text style={[styles.stepNumberText, photo ? styles.stepNumberTextDone : null]}>{photo ? 'OK' : index + 1}</Text>
      </View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepLabel}>{view.label}</Text>
        <Text style={styles.stepState}>{photo ? 'Ready' : 'Pending'}</Text>
      </View>
    </View>
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
      <View style={styles.recommendationHeader}>
        <View style={[styles.recommendationPill, isTopPriority ? styles.recommendationPillPrimary : null]}>
          <Text style={[styles.recommendationPillText, isTopPriority ? styles.recommendationPillTextPrimary : null]}>
            {isTopPriority ? 'Top priority' : `Priority ${recommendation.priority_order}`}
          </Text>
        </View>
        {recommendation.title ? <Text style={styles.recommendationTitle}>{recommendation.title}</Text> : null}
      </View>
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

function IconActionButton({ icon, onPress, primary = false, large = false, loading = false, disabled = false }) {
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={[styles.iconButton, primary ? styles.iconButtonPrimary : styles.iconButtonSecondary, large ? styles.iconButtonLarge : styles.iconButtonMedium, disabled ? styles.iconButtonDisabled : null]}
    >
      {loading ? (
        <Text style={[styles.iconButtonLoading, primary ? styles.iconButtonLoadingPrimary : null]}>...</Text>
      ) : (
        <AppIcon name={icon} size={large ? 'xl' : 'lg'} state={primary ? 'inverse' : 'active'} />
      )}
    </Pressable>
  );
}

function AnalyzerHelpModal({ visible, onClose }) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>Hair Donation AI Help</Text>
              <Text style={styles.title}>How the screening works</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <View style={styles.bulletList}>
            {[
              'Answer the short donation pre-screening questions first.',
              'Confirm the photo checklist before opening the camera or uploader.',
              'Capture or upload all four required donation views.',
              'Run AI screening only after the required views are complete.',
            ].map((item) => (
              <View key={item} style={styles.bulletRow}>
                <View style={styles.bulletDot} />
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <View style={styles.bulletList}>
            {ANALYZER_VIEW_GUIDANCE.map((item) => (
              <View key={item} style={styles.bulletRow}>
                <View style={styles.helpIconWrap}>
                  <AppIcon name="camera" state="inverse" size="sm" />
                </View>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}
          </View>

          <AppButton title="Close" onPress={onClose} />
        </AppCard>
      </View>
    </Modal>
  );
}

function GuidedCaptureModal({
  visible,
  currentView,
  currentPhoto,
  capturedCount,
  totalSteps,
  hasCameraPermission,
  cameraRef,
  isCapturingPhoto,
  isUploadingPhoto,
  onClose,
  onRequestPermission,
  onCapture,
  onUpload,
  onRetake,
  onContinue,
  onOpenHelp,
}) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.captureCard}>
          <View style={styles.modalHeader}>
            <View style={styles.progressTag}>
              <Text style={styles.progressTagText}>{capturedCount + 1} / {totalSteps}</Text>
            </View>
            <View style={styles.modalActions}>
              <Pressable onPress={onOpenHelp} style={styles.helpButtonMini}>
                <Text style={styles.helpButtonMiniText}>Help</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <AppIcon name="close" state="muted" />
              </Pressable>
            </View>
          </View>

          <Text style={styles.title}>{currentView?.label || 'Guided capture'}</Text>
          <Text style={styles.body}>Keep the full hair section visible, remove accessories, and use a plain background when possible.</Text>

          <View style={styles.captureStage}>
            {currentPhoto ? (
              <Image source={{ uri: currentPhoto.uri }} style={styles.captureImage} />
            ) : hasCameraPermission ? (
              <CameraView ref={cameraRef} style={styles.captureImage} facing="back" />
            ) : (
              <View style={styles.capturePlaceholder}>
                <AppIcon name="camera-off" state="muted" size="xl" />
                <Text style={styles.capturePlaceholderTitle}>Camera permission needed</Text>
                <Text style={styles.capturePlaceholderBody}>Allow camera access so you can capture the required donation views one by one.</Text>
                <AppButton title="Allow Camera" onPress={onRequestPermission} fullWidth={false} />
              </View>
            )}

            <View style={styles.captureFrame}>
              <View style={[styles.captureCorner, styles.captureCornerTopLeft]} />
              <View style={[styles.captureCorner, styles.captureCornerTopRight]} />
              <View style={[styles.captureCorner, styles.captureCornerBottomLeft]} />
              <View style={[styles.captureCorner, styles.captureCornerBottomRight]} />
            </View>
          </View>

          <View style={styles.captureActions}>
            <IconActionButton icon="image" onPress={onUpload} loading={isUploadingPhoto} />
            <IconActionButton icon={currentPhoto ? 'camera-retake' : 'camera'} onPress={currentPhoto ? onRetake : onCapture} primary={true} large={true} loading={isCapturingPhoto} disabled={!hasCameraPermission && !currentPhoto} />
            <IconActionButton icon="chevron-right" onPress={onContinue} disabled={!currentPhoto} />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

export function DonorHairSubmissionScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [hasStartedScreening, setHasStartedScreening] = useState(false);
  const [hasCompletedQuestionnaireStep, setHasCompletedQuestionnaireStep] = useState(false);
  const [selectedDonationMode, setSelectedDonationMode] = useState('');
  const { user, profile } = useAuth();
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
    latestSubmission,
    error,
    successMessage,
    isLoadingContext,
    isPickingImages,
    isGuidedCaptureOpen,
    currentGuidedView,
    currentGuidedPhoto,
    capturedGuideCount,
    isAnalyzing,
    isSaving,
    canAnalyze,
    progressLabel,
    pickImages,
    pickImageForCurrentView,
    startGuidedCapture,
    saveGuidedPhoto,
    clearCurrentGuidedPhoto,
    advanceGuidedCapture,
    closeGuidedCapture,
    removePhoto,
    analyzePhotos,
    submitSubmission,
    resetFlow,
  } = useDonorHairSubmission({ userId: user?.id });

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();
  const primaryPhoto = photos[0]?.uri || null;
  const recommendations = (analysis?.recommendations || []).slice(0, 3);
  const hasActiveAnalyzerState = Boolean(photos.length || analysis || isAnalyzing || error);
  const shouldShowScreening = hasStartedScreening || hasActiveAnalyzerState || hasCompletedQuestionnaireStep;
  const confidenceLabel = analysis?.confidence_score != null
    ? `${Math.round(Number(analysis.confidence_score) * 100)}% confidence`
    : 'Confidence unavailable';
  const requirementItems = useMemo(() => buildRequirementItems(donationRequirement), [donationRequirement]);
  const haircutPriceLabel = formatCurrency(upcomingHaircutSchedules?.[0]?.haircut_price || 400);

  const { control: questionControl, handleSubmit: handleQuestionSubmit, reset: resetQuestionnaire, formState: { errors: questionErrors } } = useForm({
    resolver: zodResolver(hairAnalyzerQuestionSchema),
    mode: 'onBlur',
    defaultValues: hairAnalyzerQuestionDefaultValues,
  });
  const { control: complianceControl, trigger: triggerCompliance, setValue: setComplianceValue, reset: resetCompliance, formState: { errors: complianceErrors } } = useForm({
    resolver: zodResolver(hairAnalyzerComplianceSchema),
    mode: 'onChange',
    defaultValues: hairAnalyzerComplianceDefaultValues,
  });
  const { control, handleSubmit, reset: resetReview, formState: { errors } } = useForm({
    resolver: zodResolver(hairReviewSchema),
    mode: 'onBlur',
    defaultValues: buildHairReviewDefaultValues(analysis),
  });

  const questionnaireValues = useWatch({ control: questionControl });
  const complianceAcknowledged = useWatch({ control: complianceControl, name: 'acknowledged' });
  const reviewValues = useWatch({ control });
  const eligibility = useMemo(
    () => buildEligibilitySummary({ analysis, confirmedValues: reviewValues, questionnaireAnswers: questionnaireValues, donationRequirement }),
    [analysis, reviewValues, questionnaireValues, donationRequirement]
  );
  const canProceedToDonationMode = Boolean(analysis && isPotentialDonationNextStep(eligibility.status));

  useEffect(() => {
    resetReview(buildHairReviewDefaultValues(analysis, questionnaireValues));
  }, [analysis, questionnaireValues, resetReview]);

  useEffect(() => {
    if (!isGuidedCaptureOpen || cameraPermission?.granted) return;
    requestCameraPermission();
  }, [cameraPermission?.granted, isGuidedCaptureOpen, requestCameraPermission]);

  const donationModeHelper = useMemo(() => ({
    shipping: `Current drop-off address: ${DONATION_DROP_OFF_ADDRESS}`,
    onsite_delivery: 'Use this if you can personally deliver the donation after the screening.',
    pickup: logisticsSettings?.is_pickup_enabled === false
      ? 'Pickup is currently unavailable based on the latest logistics settings.'
      : logisticsSettings?.pickup_notes || 'Pickup depends on the latest logistics settings and final manual review.',
    haircut_assessment: upcomingHaircutSchedules?.length
      ? `Upcoming slots: ${upcomingHaircutSchedules.slice(0, 2).map((item) => formatScheduleDateLabel(item.schedule_date, item.start_time, item.end_time)).join(' | ')}`
      : 'Upcoming haircut schedules are not available right now.',
  }), [logisticsSettings, upcomingHaircutSchedules]);

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/donor/donations') return;
    router.navigate(item.route);
  };

  const handleTakeGuidedPhoto = async () => {
    if (!cameraPermission?.granted || !cameraRef.current) return;
    try {
      setIsCapturingPhoto(true);
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 1 });
      saveGuidedPhoto(photo);
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleContinueQuestionnaire = handleQuestionSubmit(async () => {
    setHasStartedScreening(true);
    setHasCompletedQuestionnaireStep(true);
    return { success: true };
  });

  const handleOpenCaptureStep = async () => {
    const questionnaireValid = await handleQuestionSubmit(async () => true)();
    if (!questionnaireValid) return;
    const complianceValid = await triggerCompliance('acknowledged');
    if (!complianceValid) return;
    setHasStartedScreening(true);
    setHasCompletedQuestionnaireStep(true);
    await startGuidedCapture();
  };

  const handleAnalyzeFlow = handleQuestionSubmit(async (values) => {
    const complianceValid = await triggerCompliance('acknowledged');
    if (!complianceValid) return { success: false };
    setHasStartedScreening(true);
    setHasCompletedQuestionnaireStep(true);
    return await analyzePhotos({
      questionnaireAnswers: values,
      complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
    });
  });

  const handleResetModule = () => {
    resetFlow();
    resetQuestionnaire(hairAnalyzerQuestionDefaultValues);
    resetCompliance(hairAnalyzerComplianceDefaultValues);
    resetReview(buildHairReviewDefaultValues(null));
    setHasStartedScreening(false);
    setHasCompletedQuestionnaireStep(false);
    setSelectedDonationMode('');
  };

  const handleSaveSubmission = async (values) => {
    if (canProceedToDonationMode && !selectedDonationMode) return;
    await submitSubmission(values, {
      questionnaireAnswers: questionnaireValues,
      donationModeValue: canProceedToDonationMode ? selectedDonationMode : '',
    });
  };

  return (
    <DashboardLayout
      navItems={donorDashboardNavItems}
      activeNavKey="donations"
      navVariant="donor"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title="Hair Donation"
          subtitle="Follow the guided donor journey from screening to submission."
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="donor"
          utilityActions={[{ key: 'notifications', icon: 'notifications', badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined, onPress: () => router.navigate('/donor/notifications') }]}
        />
      )}
    >
      {successMessage ? <StatusBanner message={successMessage} variant="success" title="Submission saved" style={styles.cardGap} /> : null}

      <ModuleInfoCard
        stepLabel="Section 1"
        title="Hair Donation Requirements"
        description="Review the current baseline donation requirements before starting the AI screening."
        items={requirementItems}
        footer={donationRequirement?.donation_requirement_id
          ? 'These items come from the latest Donation_Requirements record when available.'
          : 'The current requirement record was not available, so the module is showing the standard interview-based requirement summary.'}
      />

      <ModuleInfoCard
        stepLabel="Section 2"
        title="How Can I Donate?"
        description="Choose the donation path that matches your location and readiness after screening."
        items={[
          `Logistics / shipping: send prepared hair to ${DONATION_DROP_OFF_ADDRESS}. Shipping fee is shouldered by the donor.`,
          'Delivered onsite if you are near the area and ready for manual review.',
          logisticsSettings?.is_pickup_enabled === false ? 'Pickup is currently disabled in the latest logistics settings.' : `Pickup if near the area. ${logisticsSettings?.pickup_notes || 'Pickup still depends on the latest logistics requirement logic.'}`,
          upcomingHaircutSchedules?.length ? `Haircut assessment: available schedule previews include ${upcomingHaircutSchedules.map((item) => formatScheduleDateLabel(item.schedule_date, item.start_time, item.end_time)).join(' | ')}.` : 'Haircut assessment is still subject to screening first before final scheduling.',
        ]}
      />

      <ModuleInfoCard
        stepLabel="Section 3"
        title="What Do I Get?"
        description="These are the donor-side outcomes already supported in the current workflow."
        items={[
          latestCertificate?.certificate_id ? `Certificate of Appreciation is already linked to your latest donation record (${latestCertificate.certificate_number || 'certificate available'}).` : 'Certificate of Appreciation after a qualified donation review.',
          `If haircut applies, the current discounted haircut amount in the flow is ${haircutPriceLabel}.`,
          'If your hair is not yet ideal for donation, the AI can still save recommendations for future donation improvement.',
          latestHaircutReservation?.reservation_id ? `Your latest haircut reservation status is ${latestHaircutReservation.status || 'pending'}.` : 'Haircut reservations become relevant only after assessment and scheduling.',
        ]}
      />

      <ModuleInfoCard
        stepLabel="Section 4"
        title="What Does the AI Do?"
        description="The AI gives an initial donation-oriented screening based on your guided answers and the required photo set."
        items={[
          'The AI first asks a short survey about your current hair state and treatment history.',
          'Before taking photos: no accessories, no ponytail or braid, one person only, plain background, good lighting, dry hair, and no filters.',
          ...ANALYZER_VIEW_GUIDANCE,
          'The AI checks visible length, density, texture, condition, and obvious damage signs against the current donation requirement context when available.',
          'If the screening is not yet ideal for donation, it returns recommendations you can use before trying again.',
        ]}
        footer="The screening is only an initial assessment. Final acceptance still requires manual review by Hair for Hope."
      />

      {!shouldShowScreening ? (
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.cardGap}>
          {isLoadingContext ? <StatusBanner title="Loading donation context" message="The module is loading the current donation requirement, logistics settings, and screening support data." variant="info" style={styles.cardGapSmall} /> : null}
          <DashboardSectionHeader title="Section 5 - Begin AI Screening" description="Start the guided donation screening before you capture photos or submit anything." style={styles.cardGapSmall} />
          <View style={styles.choiceRow}>{['Dry hair', 'No accessories', 'Full length visible'].map((item) => <View key={item} style={styles.choiceChip}><Text style={styles.choiceChipText}>{item}</Text></View>)}</View>
          <View style={styles.actionStack}>
            <AppButton title="Begin AI Screening" onPress={() => setHasStartedScreening(true)} trailing={<AppIcon name="chevron-right" state="inverse" />} />
            <AppButton title="Help" variant="outline" fullWidth={false} leading={<AppIcon name="support" state="muted" />} onPress={() => setIsHelpOpen(true)} />
          </View>
        </AppCard>
      ) : null}

      {shouldShowScreening ? (
        <>
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.cardGap}>
            <View style={styles.headerRow}>
              <DashboardSectionHeader title="Step A - Pre-Analysis Questions" description="Answer the controlled donation questions first. These answers are included in the server-side AI analysis." style={styles.sectionHeaderInline} />
              <AppButton title="Help" variant="outline" fullWidth={false} leading={<AppIcon name="support" state="muted" />} onPress={() => setIsHelpOpen(true)} />
            </View>

            <QuestionBlock label="Are you submitting for initial donation screening or just checking eligibility first?" error={questionErrors.screeningIntent?.message}>
              <Controller control={questionControl} name="screeningIntent" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.screeningIntent} onChange={field.onChange} />} />
            </QuestionBlock>

            <Controller
              control={questionControl}
              name="estimatedHairLengthInches"
              render={({ field }) => (
                <AppInput
                  label="What is your estimated hair length?"
                  placeholder="14"
                  keyboardType="decimal-pad"
                  variant="filled"
                  helperText="Enter the estimated length in inches."
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={questionErrors.estimatedHairLengthInches?.message}
                />
              )}
            />

            <QuestionBlock label="Has your hair been chemically treated?" helperText="Choose all that apply." error={questionErrors.chemicalTreatments?.message}>
              <Controller
                control={questionControl}
                name="chemicalTreatments"
                render={({ field }) => (
                  <MultiChoiceChipRow
                    values={Array.isArray(field.value) ? field.value : []}
                    options={hairAnalyzerQuestionChoices.chemicalTreatments}
                    onChange={(nextValues) => {
                      if (nextValues.includes('none') && nextValues.length > 1) {
                        field.onChange(['none']);
                        return;
                      }
                      if (nextValues.length > 1 && nextValues.includes('none')) {
                        field.onChange(nextValues.filter((item) => item !== 'none'));
                        return;
                      }
                      field.onChange(nextValues);
                    }}
                  />
                )}
              />
            </QuestionBlock>

            {(Array.isArray(questionnaireValues?.chemicalTreatments) && questionnaireValues.chemicalTreatments.some((item) => item && item !== 'none')) ? (
              <QuestionBlock label="When was the treatment done?" error={questionErrors.treatmentTiming?.message}>
                <Controller control={questionControl} name="treatmentTiming" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.treatmentTiming} onChange={field.onChange} />} />
              </QuestionBlock>
            ) : null}

            <QuestionBlock label="Has your hair been colored or bleached?" error={questionErrors.colorStatus?.message}>
              <Controller control={questionControl} name="colorStatus" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.colorStatus} onChange={field.onChange} />} />
            </QuestionBlock>

            {questionnaireValues?.colorStatus && questionnaireValues.colorStatus !== 'no' ? (
              <QuestionBlock label="When was it last colored?" error={questionErrors.colorTiming?.message}>
                <Controller control={questionControl} name="colorTiming" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.colorTiming} onChange={field.onChange} />} />
              </QuestionBlock>
            ) : null}

            <QuestionBlock label="How would you describe your hair condition?" error={questionErrors.hairCondition?.message}>
              <Controller control={questionControl} name="hairCondition" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.hairCondition} onChange={field.onChange} />} />
            </QuestionBlock>

            <QuestionBlock label="Have you noticed split ends or brittle ends on your hair?" error={questionErrors.splitEnds?.message}>
              <Controller control={questionControl} name="splitEnds" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.yesNo} onChange={field.onChange} />} />
            </QuestionBlock>

            <QuestionBlock label="Is your hair currently shedding or falling out more than usual?" error={questionErrors.shedding?.message}>
              <Controller control={questionControl} name="shedding" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.yesNo} onChange={field.onChange} />} />
            </QuestionBlock>

            <QuestionBlock label="How often do you wash your hair in a week?" error={questionErrors.washFrequencyWeekly?.message}>
              <Controller control={questionControl} name="washFrequencyWeekly" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.washFrequencyWeekly} onChange={field.onChange} />} />
            </QuestionBlock>

            <QuestionBlock label="Do you often use heat styling tools?" error={questionErrors.heatStylingFrequency?.message}>
              <Controller control={questionControl} name="heatStylingFrequency" render={({ field }) => <ChoiceChipRow value={field.value} options={hairAnalyzerQuestionChoices.heatStylingFrequency} onChange={field.onChange} />} />
            </QuestionBlock>

            <AppButton title="Continue to Compliance" onPress={handleContinueQuestionnaire} trailing={<AppIcon name="chevron-right" state="inverse" />} />
          </AppCard>

          {hasCompletedQuestionnaireStep ? (
            <AppCard variant="elevated" radius="xl" padding="lg" style={styles.cardGap}>
              <View style={styles.headerRow}>
                <DashboardSectionHeader title="Step B - Photo Compliance Checklist" description="Confirm that your photo set follows the screening instructions before upload or capture." style={styles.sectionHeaderInline} />
                <AppButton title="Edit answers" variant="ghost" fullWidth={false} onPress={() => { setHasCompletedQuestionnaireStep(false); resetFlow(); }} />
              </View>

              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>Screening intent</Text>
                  <Text style={styles.summaryItemValue}>{getChoiceLabel(hairAnalyzerQuestionChoices.screeningIntent, questionnaireValues?.screeningIntent)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>Estimated length</Text>
                  <Text style={styles.summaryItemValue}>{questionnaireValues?.estimatedHairLengthInches || 'Not set'} in</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>Treatments</Text>
                  <Text style={styles.summaryItemValue}>{getChoiceLabels(hairAnalyzerQuestionChoices.chemicalTreatments, questionnaireValues?.chemicalTreatments) || 'Not set'}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryItemLabel}>Color or bleach</Text>
                  <Text style={styles.summaryItemValue}>{getChoiceLabel(hairAnalyzerQuestionChoices.colorStatus, questionnaireValues?.colorStatus)}</Text>
                </View>
              </View>

              <View style={styles.bulletList}>
                {PHOTO_COMPLIANCE_ITEMS.map((item) => (
                  <View key={item} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={styles.bulletText}>{item}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                onPress={() => setComplianceValue('acknowledged', !complianceAcknowledged, { shouldValidate: true, shouldTouch: true, shouldDirty: true })}
                style={styles.checkRow}
              >
                <View style={[styles.checkBox, complianceAcknowledged ? styles.checkBoxActive : null]}>
                  <AppIcon name={complianceAcknowledged ? 'checkbox-marked' : 'checkbox-blank-outline'} state={complianceAcknowledged ? 'inverse' : 'muted'} />
                </View>
                <Text style={styles.checkLabel}>I have read and understood all of the above.</Text>
              </Pressable>
              {complianceErrors.acknowledged?.message ? <Text style={styles.questionError}>{complianceErrors.acknowledged.message}</Text> : null}
            </AppCard>
          ) : null}

          {hasCompletedQuestionnaireStep && complianceAcknowledged ? (
            <AppCard variant="elevated" radius="xl" padding="lg" style={styles.cardGap}>
              <DashboardSectionHeader title="Step C - Required Photo Uploads" description="Capture or upload the four required donation views after you finish the questionnaire and compliance step." style={styles.cardGapSmall} />
              {latestSubmission?.submission_id ? <StatusBanner title="Previous submission found" message="The analyzer also loaded your latest donation submission context so the AI can compare your new screening with the most recent saved donor record when helpful." variant="info" style={styles.cardGapSmall} /> : null}

              <View style={styles.previewBox}>
                {primaryPhoto ? (
                  <Image source={{ uri: primaryPhoto }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewPlaceholder}>
                    <AppIcon name="camera" state="active" size="xl" />
                    <Text style={styles.previewPlaceholderTitle}>No photo set yet</Text>
                    <Text style={styles.previewPlaceholderBody}>Open the guided camera or upload Front, Back, Hair Ends Close-Up, and Side View Photo.</Text>
                  </View>
                )}
                <View style={styles.previewOverlay}>
                  <View style={styles.progressTag}>
                    <Text style={styles.progressTagText}>{photos.length}/{requiredViews.length}</Text>
                  </View>
                  <Text style={styles.previewOverlayText}>{progressLabel}</Text>
                </View>
              </View>

              <View style={styles.stepList}>
                {requiredViews.map((view, index) => <GuideStepCard key={view.key} index={index} view={view} photo={photos[index]} />)}
              </View>

              {photos.length ? <View style={styles.photoGrid}>{photos.map((photo) => <PhotoTile key={photo.id} photo={photo} onRemove={removePhoto} />)}</View> : null}

              <View style={styles.captureActionsRow}>
                <View style={styles.captureSideSlot} />
                <IconActionButton icon="camera" onPress={handleOpenCaptureStep} primary={true} large={true} />
                <IconActionButton icon="image" onPress={pickImages} loading={isPickingImages} />
              </View>

              {photos.length ? (
                <View style={styles.actionStackRow}>
                  <AppButton title={analysis ? 'Analyze Again' : 'Run AI Screening'} variant="outline" loading={isAnalyzing} disabled={!canAnalyze} leading={<AppIcon name="sparkle" state="muted" />} onPress={handleAnalyzeFlow} fullWidth={false} />
                  <AppButton title="Reset Screening" variant="ghost" onPress={handleResetModule} fullWidth={false} />
                </View>
              ) : null}

              {isAnalyzing ? <StatusBanner title="Analyzing with AI" message="Your answers, uploaded photos, and donation rule context are being reviewed now. The structured result will appear below." variant="info" style={styles.cardGapSmall} /> : null}
              {error ? <StatusBanner title={error.title} message={error.message} variant="error" style={styles.cardGapSmall} /> : null}
            </AppCard>
          ) : null}

          {analysis ? (
            <AppCard variant="elevated" radius="xl" padding="lg" style={styles.cardGap}>
              <DashboardSectionHeader title="Step D - AI-Assisted Screening Result" description="Review the structured AI result, confirm the detected details, and continue to the next donor step." style={styles.cardGapSmall} />

              {primaryPhoto ? <Image source={{ uri: primaryPhoto }} style={styles.resultHeroImage} /> : null}

              <StatusBanner title={eligibility.status} message={eligibility.reasons.length ? eligibility.reasons[0] : eligibility.contextNote || 'The AI screening result is ready for review.'} variant={eligibility.tone} style={styles.cardGapSmall} />
              {eligibility.reasons.length ? <View style={styles.bulletList}>{eligibility.reasons.map((reason) => <View key={reason} style={styles.bulletRow}><View style={styles.bulletDot} /><Text style={styles.bulletText}>{reason}</Text></View>)}</View> : null}

              <View style={styles.metricsGrid}>
                <ResultMetricCard label="Estimated length" value={formatLengthLabel(analysis.estimated_length)} />
                <ResultMetricCard label="Texture" value={analysis.detected_texture} />
                <ResultMetricCard label="Density" value={analysis.detected_density} />
                <ResultMetricCard label="Condition" value={analysis.detected_condition} />
                <ResultMetricCard label="Decision" value={analysis.decision} />
                <ResultMetricCard label="Image visibility" value={analysis.is_hair_detected ? 'Clear' : 'Needs review'} />
                <ResultMetricCard label="Confidence" value={confidenceLabel} />
              </View>

              <AppCard variant="soft" radius="xl" padding="lg" style={styles.cardGapSmall}>
                <Text style={styles.summaryLabel}>AI summary</Text>
                <Text style={styles.body}>{analysis.summary || 'No summary was returned for this analysis.'}</Text>
              </AppCard>

              <Controller control={control} name="declaredLength" render={({ field }) => <AppInput label="Confirm detected length" placeholder="35.6" keyboardType="decimal-pad" variant="filled" helperText={`AI result: ${formatLengthLabel(analysis.estimated_length)} | Your estimate: ${questionnaireValues?.estimatedHairLengthInches || 'Not set'} in`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.declaredLength?.message} />} />
              <Controller control={control} name="declaredTexture" render={({ field }) => <AppInput label="Confirm texture" placeholder="Straight" variant="filled" helperText={`AI result: ${analysis.detected_texture || 'No value'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.declaredTexture?.message} />} />
              <Controller control={control} name="declaredDensity" render={({ field }) => <AppInput label="Confirm density" placeholder="Medium" variant="filled" helperText={`AI result: ${analysis.detected_density || 'No value'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.declaredDensity?.message} />} />
              <Controller control={control} name="declaredCondition" render={({ field }) => <AppInput label="Confirm condition" placeholder="Healthy" variant="filled" helperText={`AI result: ${analysis.detected_condition || 'No value'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.declaredCondition?.message} />} />
              <Controller control={control} name="detailNotes" render={({ field }) => <AppInput label="Correction notes" placeholder="Add corrections if the AI missed something" variant="filled" multiline={true} numberOfLines={4} helperText={`AI notes: ${analysis.visible_damage_notes || 'No extra notes'}`} value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={errors.detailNotes?.message} inputStyle={styles.multilineInput} />} />

              {recommendations.length ? <View style={styles.recommendationList}>{recommendations.map((recommendation, index) => <RecommendationCard key={`${recommendation.priority_order}-${recommendation.title || recommendation.recommendation_text.slice(0, 20)}`} recommendation={recommendation} isTopPriority={index === 0} />)}</View> : null}

              {canProceedToDonationMode ? (
                <AppCard variant="soft" radius="xl" padding="lg" style={styles.cardGapSmall}>
                  <DashboardSectionHeader title="Step E - Choose Your Next Donation Step" description="Select the donation path you want saved with this submission." style={styles.sectionHeaderInline} />
                  <View style={styles.modeList}>
                    {hairDonationModeOptions.map((option) => (
                      <DonationModeCard
                        key={option.value}
                        option={option}
                        selected={selectedDonationMode === option.value}
                        disabled={option.value === 'pickup' && logisticsSettings?.is_pickup_enabled === false}
                        helperText={donationModeHelper[option.value]}
                        onSelect={setSelectedDonationMode}
                      />
                    ))}
                  </View>
                </AppCard>
              ) : (
                <StatusBanner title="Not yet ready for donation submission" message="This screening suggests that you should follow the recommendations first. You can still save this screening result and try again later." variant="info" style={styles.cardGapSmall} />
              )}

              <View style={styles.actionStack}>
                <AppButton title={canProceedToDonationMode ? 'Continue to Donation Submission' : 'Save Screening Result'} loading={isSaving} disabled={canProceedToDonationMode && !selectedDonationMode} onPress={handleSubmit(handleSaveSubmission)} />
                <View style={styles.actionStackRow}>
                  <AppButton title="Retake Photos" variant="outline" onPress={handleOpenCaptureStep} fullWidth={false} />
                  <AppButton title="Start Over" variant="ghost" onPress={handleResetModule} fullWidth={false} />
                </View>
              </View>
            </AppCard>
          ) : null}
        </>
      ) : null}

      <GuidedCaptureModal
        visible={isGuidedCaptureOpen}
        currentView={currentGuidedView}
        currentPhoto={currentGuidedPhoto}
        capturedCount={capturedGuideCount}
        totalSteps={requiredViews.length}
        hasCameraPermission={Boolean(cameraPermission?.granted)}
        cameraRef={cameraRef}
        isCapturingPhoto={isCapturingPhoto}
        isUploadingPhoto={isPickingImages}
        onClose={closeGuidedCapture}
        onRequestPermission={requestCameraPermission}
        onCapture={handleTakeGuidedPhoto}
        onUpload={pickImageForCurrentView}
        onRetake={clearCurrentGuidedPhoto}
        onContinue={advanceGuidedCapture}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <AnalyzerHelpModal visible={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  cardGap: {
    marginBottom: theme.spacing.md,
  },
  cardGapSmall: {
    marginBottom: theme.spacing.md,
  },
  eyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  body: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
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
  footnote: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  questionBlock: {
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  questionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  questionHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  questionError: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textError,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  choiceChip: {
    minHeight: 40,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    justifyContent: 'center',
  },
  choiceChipActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  choiceChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  choiceChipTextActive: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  actionStack: {
    gap: theme.spacing.sm,
  },
  actionStackRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderInline: {
    flex: 1,
    marginBottom: 0,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  summaryItem: {
    minWidth: '45%',
    flexGrow: 1,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  summaryItemLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryItemValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
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
    backgroundColor: theme.colors.backgroundPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxActive: {
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
  },
  checkLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textPrimary,
  },
  previewBox: {
    minHeight: 212,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
    marginBottom: theme.spacing.md,
  },
  previewImage: {
    width: '100%',
    height: 212,
  },
  previewPlaceholder: {
    minHeight: 212,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  previewPlaceholderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  previewPlaceholderBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  previewOverlay: {
    position: 'absolute',
    top: theme.spacing.md,
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewOverlayText: {
    maxWidth: '60%',
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textInverse,
  },
  progressTag: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
  progressTagText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  stepList: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  stepCardDone: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  stepNumberDone: {
    backgroundColor: theme.colors.brandPrimary,
  },
  stepNumberText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  stepNumberTextDone: {
    color: theme.colors.textInverse,
  },
  stepCopy: {
    flex: 1,
  },
  stepLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  stepState: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  photoTile: {
    position: 'relative',
    width: 88,
    height: 88,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPill: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.whiteOverlay,
  },
  photoPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.textPrimary,
  },
  captureActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  captureSideSlot: {
    width: 62,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metricCard: {
    minWidth: '47%',
    flexGrow: 1,
    gap: 4,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  metricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  summaryLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  resultHeroImage: {
    width: '100%',
    height: 220,
    borderRadius: theme.radius.xl,
    marginBottom: theme.spacing.md,
  },
  recommendationList: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  recommendationCard: {
    gap: theme.spacing.sm,
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
  recommendationHeader: {
    gap: theme.spacing.xs,
  },
  recommendationPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  recommendationPillPrimary: {
    backgroundColor: theme.colors.backgroundPrimary,
  },
  recommendationPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  recommendationPillTextPrimary: {
    color: theme.colors.brandPrimary,
  },
  recommendationTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  recommendationBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  modeList: {
    gap: theme.spacing.sm,
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
    opacity: 0.55,
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
    backgroundColor: theme.colors.backgroundPrimary,
    alignItems: 'center',
    justifyContent: 'center',
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
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
  },
  captureCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  helpIconWrap: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  helpButtonMini: {
    minHeight: 34,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  helpButtonMiniText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  captureStage: {
    position: 'relative',
    minHeight: 320,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
    marginBottom: theme.spacing.md,
  },
  captureImage: {
    width: '100%',
    height: 320,
  },
  capturePlaceholder: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  capturePlaceholderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  capturePlaceholderBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  captureFrame: {
    position: 'absolute',
    top: 20,
    right: 20,
    bottom: 20,
    left: 20,
    borderRadius: theme.radius.xl,
  },
  captureCorner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: theme.colors.textInverse,
  },
  captureCornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  captureCornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  captureCornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  captureCornerBottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 3,
    borderBottomWidth: 3,
  },
  captureActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  iconButtonPrimary: {
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
  },
  iconButtonSecondary: {
    backgroundColor: theme.colors.backgroundPrimary,
  },
  iconButtonMedium: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  iconButtonLarge: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  iconButtonDisabled: {
    opacity: 0.6,
  },
  iconButtonLoading: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.brandPrimary,
  },
  iconButtonLoadingPrimary: {
    color: theme.colors.textInverse,
  },
});
