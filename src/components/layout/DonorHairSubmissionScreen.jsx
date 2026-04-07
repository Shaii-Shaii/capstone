import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
  buildHairReviewDefaultValues,
  hairReviewSchema,
} from '../../features/hairSubmission.schema';
import { donorHairEligibilityRules } from '../../features/hairSubmission.constants';

const ANALYZER_REMINDERS = ['Hair tied', 'No cap', 'Clear view'];
const ANALYZER_HELP_STEPS = [
  {
    key: 'start',
    title: 'Start with one clean view',
    body: 'Tap Analyze My Hair to open the guided camera. The analyzer will move one view at a time so the screen stays simple.',
    highlight: 'camera',
  },
  {
    key: 'capture',
    title: 'Use the center capture button',
    body: 'The large center button takes the photo for the current step. Keep the tied hair inside the guide corners and the center line.',
    highlight: 'camera',
  },
  {
    key: 'upload',
    title: 'Use upload only when needed',
    body: 'If you already have a clear photo, use the image button on the side instead of retaking it with the camera.',
    highlight: 'upload',
  },
  {
    key: 'next',
    title: 'Go next after a photo is ready',
    body: 'The Next arrow appears only after a photo is captured or uploaded. Tap it to move to the next required hair view.',
    highlight: 'next',
  },
  {
    key: 'views',
    title: 'Capture the four required views',
    body: 'Complete Top, Front, Side, and Back so the analyzer can screen the donation correctly.',
    highlight: 'views',
  },
];
const ANALYZER_VIEW_GUIDANCE = [
  'Top (Scalp): hold the camera above the tied hair and show the crown clearly.',
  'Front: show the front hairline and front hair coverage.',
  'Side: capture one full side profile from ear level upward.',
  'Back: show the full back section of the tied hair without obstruction.',
];

const formatLengthLabel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Not detected';
  const inches = numericValue / 2.54;
  return `${numericValue.toFixed(1)} cm / ${inches.toFixed(1)} in`;
};

const normalizeAnalysisText = (analysis) => (
  [
    analysis?.summary,
    analysis?.visible_damage_notes,
    analysis?.invalid_image_reason,
    ...(Array.isArray(analysis?.per_view_notes)
      ? analysis.per_view_notes.map((item) => item?.notes || '')
      : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
);

const hasDetectedConcern = (source, keywords = [], negativePhrases = []) => (
  keywords.some((keyword) => source.includes(keyword))
  && !negativePhrases.some((phrase) => source.includes(phrase))
);

const buildEligibilitySummary = ({ analysis, confirmedValues }) => {
  if (!analysis) return { status: 'Pending', tone: 'info', reasons: [] };

  const reasons = [];
  const source = normalizeAnalysisText(analysis);
  const confirmedLength = Number(confirmedValues?.declaredLength || analysis?.estimated_length);

  if (!analysis.is_hair_detected) reasons.push('Hair must be clearly visible in the photo.');
  if (analysis?.missing_views?.length) reasons.push(`Required views are incomplete: ${analysis.missing_views.join(', ')}.`);
  if (Number.isFinite(confirmedLength) && confirmedLength < donorHairEligibilityRules.minimumLengthCentimeters) {
    reasons.push(`Hair length must be at least ${donorHairEligibilityRules.minimumLengthInches} inches.`);
  }
  if (donorHairEligibilityRules.requireHairTied && hasDetectedConcern(source, ['untied', 'hair down', 'not tied', 'loose hair'], ['hair tied', 'tied hair'])) {
    reasons.push('Hair should be tied for screening.');
  }
  if (donorHairEligibilityRules.rejectCapDetected && hasDetectedConcern(source, ['cap', 'hat', 'head covering', 'hood'], ['no cap', 'without cap', 'cap not detected'])) {
    reasons.push('No cap or head covering should be present.');
  }
  if (donorHairEligibilityRules.rejectAccessoryObstruction && hasDetectedConcern(source, ['clip', 'accessory', 'obstruction', 'blocked'], ['no clip', 'no accessory', 'not blocked'])) {
    reasons.push('Hair accessories or other objects should not block the hair.');
  }
  if (donorHairEligibilityRules.rejectVisibleDandruffConcern && hasDetectedConcern(source, ['dandruff'], ['no dandruff', 'dandruff not visible'])) {
    reasons.push('Visible dandruff concern was detected.');
  }
  if (donorHairEligibilityRules.rejectVisibleLiceConcern && hasDetectedConcern(source, ['lice'], ['no lice', 'lice not visible'])) {
    reasons.push('Visible lice concern was detected.');
  }
  if (donorHairEligibilityRules.requireNaturalColor && hasDetectedConcern(source, ['dyed', 'bleached', 'colored', 'rebonded'], [])) {
    reasons.push('Hair must appear natural based on the current Donivra rule set.');
  }

  return {
    status: reasons.length ? 'Not Eligible' : 'Eligible',
    tone: reasons.length ? 'error' : 'success',
    reasons,
  };
};

function PhotoTile({ photo, onRemove }) {
  return (
    <View style={styles.photoTile}>
      <Image source={{ uri: photo.uri }} style={styles.photoImage} />
      <View style={styles.photoLabelPill}>
        <Text style={styles.photoLabelText}>{photo.viewLabel}</Text>
      </View>
      <Pressable onPress={() => onRemove(photo.id)} style={styles.photoRemoveButton}>
        <AppIcon name="close" state="inverse" size="sm" />
      </Pressable>
    </View>
  );
}

function GuideStepCard({ index, view, photo, isActive }) {
  return (
    <View style={[styles.guideStepCard, isActive ? styles.guideStepCardActive : null, photo ? styles.guideStepCardDone : null]}>
      <View style={[styles.guideStepNumber, photo ? styles.guideStepNumberDone : null]}>
        <Text style={[styles.guideStepNumberText, photo ? styles.guideStepNumberTextDone : null]}>
          {photo ? 'OK' : index + 1}
        </Text>
      </View>
      <View style={styles.guideStepCopy}>
        <Text numberOfLines={1} style={styles.guideStepLabel}>{view.label}</Text>
        <Text style={[styles.guideStepStatusText, photo ? styles.guideStepStatusTextDone : null]}>
          {photo ? 'Ready' : isActive ? 'Current' : 'Pending'}
        </Text>
      </View>
    </View>
  );
}

function AnalysisMetricPill({ label, value }) {
  return (
    <View style={styles.analysisMetricPill}>
      <Text style={styles.analysisMetricLabel}>{label}</Text>
      <Text style={styles.analysisMetricValue}>{value || 'Not set'}</Text>
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
        <View style={[styles.recommendationPriorityPill, isTopPriority ? styles.recommendationPriorityPillPrimary : null]}>
          <Text style={[styles.recommendationPriorityText, isTopPriority ? styles.recommendationPriorityTextPrimary : null]}>
            {isTopPriority ? 'Top priority' : `Priority ${recommendation.priority_order}`}
          </Text>
        </View>
        {recommendation.title ? <Text style={styles.recommendationTitle}>{recommendation.title}</Text> : null}
      </View>
      <Text style={styles.recommendationBody}>{recommendation.recommendation_text}</Text>
    </View>
  );
}

function AnalyzerHelpModal({ visible, onClose }) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  useEffect(() => {
    if (visible) {
      setActiveStepIndex(0);
    }
  }, [visible]);

  if (!visible) return null;

  const currentStep = ANALYZER_HELP_STEPS[activeStepIndex];
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === ANALYZER_HELP_STEPS.length - 1;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.captureModalOverlay}>
        <Pressable style={styles.captureModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.helpModalCard}>
          <View style={styles.helpModalHeader}>
            <View>
              <Text style={styles.helpEyebrow}>Hair Analyzer Help</Text>
              <Text style={styles.helpTitle}>How to use the analyzer</Text>
            </View>

            <Pressable onPress={onClose} style={styles.captureModalClose}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <Text style={styles.helpIntro}>
            Follow the quick slider below. Each card shows what button to use and what the donor should capture next.
          </Text>

          <View style={styles.helpSliderDots}>
            {ANALYZER_HELP_STEPS.map((step, index) => (
              <View
                key={step.key}
                style={[
                  styles.helpSliderDot,
                  index === activeStepIndex ? styles.helpSliderDotActive : null,
                ]}
              />
            ))}
          </View>

          <View style={styles.helpSliderCard}>
            <View style={styles.helpStepBadge}>
              <Text style={styles.helpStepBadgeText}>{activeStepIndex + 1}</Text>
            </View>

            <Text style={styles.helpStepTitleCentered}>{currentStep.title}</Text>
            <Text style={styles.helpStepBodyCentered}>{currentStep.body}</Text>

            <View style={styles.helpVisualCard}>
              {currentStep.highlight === 'views' ? (
                <View style={styles.helpViewGrid}>
                  {ANALYZER_VIEW_GUIDANCE.map((item, index) => (
                    <View key={item} style={styles.helpViewItem}>
                      <View style={styles.helpViewNumber}>
                        <Text style={styles.helpViewNumberText}>{index + 1}</Text>
                      </View>
                      <Text style={styles.helpViewText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <>
                  <View style={styles.helpFrameMock}>
                    <View style={[styles.captureCorner, styles.captureCornerTopLeft]} />
                    <View style={[styles.captureCorner, styles.captureCornerTopRight]} />
                    <View style={[styles.captureCorner, styles.captureCornerBottomLeft]} />
                    <View style={[styles.captureCorner, styles.captureCornerBottomRight]} />
                    <View style={styles.helpGuideLineMock} />
                    <Text style={styles.helpFrameText}>Keep the hair inside the guide</Text>
                  </View>

                  <View style={styles.helpControlPreview}>
                    <IconActionButton
                      icon="image"
                      variant={currentStep.highlight === 'upload' ? 'primary' : 'secondary'}
                      accessibilityLabel="Upload preview"
                      style={styles.helpControlSide}
                    />
                    <IconActionButton
                      icon="camera"
                      variant={currentStep.highlight === 'camera' ? 'primary' : 'secondary'}
                      size="lg"
                      accessibilityLabel="Capture preview"
                      style={styles.helpControlCenter}
                    />
                    <IconActionButton
                      icon="chevronRight"
                      variant={currentStep.highlight === 'next' ? 'primary' : 'secondary'}
                      accessibilityLabel="Next preview"
                      style={styles.helpControlSide}
                    />
                  </View>

                  <View style={styles.helpControlLabels}>
                    <Text style={[styles.helpControlLabel, currentStep.highlight === 'upload' ? styles.helpControlLabelActive : null]}>
                      Upload
                    </Text>
                    <Text style={[styles.helpControlLabel, currentStep.highlight === 'camera' ? styles.helpControlLabelActive : null]}>
                      Capture
                    </Text>
                    <Text style={[styles.helpControlLabel, currentStep.highlight === 'next' ? styles.helpControlLabelActive : null]}>
                      Next
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          <View style={styles.helpFooter}>
            <AppButton
              title="Back"
              variant="outline"
              fullWidth={false}
              disabled={isFirstStep}
              onPress={() => setActiveStepIndex((current) => Math.max(0, current - 1))}
            />
            <AppButton
              title={isLastStep ? 'Got it' : 'Next'}
              fullWidth={false}
              trailing={<AppIcon name="chevronRight" state="inverse" />}
              onPress={() => {
                if (isLastStep) {
                  onClose();
                  return;
                }

                setActiveStepIndex((current) => Math.min(ANALYZER_HELP_STEPS.length - 1, current + 1));
              }}
            />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

function IconActionButton({
  icon,
  onPress,
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  accessibilityLabel,
}) {
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconActionButton,
        isPrimary ? styles.iconActionButtonPrimary : styles.iconActionButtonSecondary,
        size === 'lg' ? styles.iconActionButtonLarge : styles.iconActionButtonMedium,
        pressed ? styles.iconActionButtonPressed : null,
        (disabled || loading) ? styles.iconActionButtonDisabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? theme.colors.textInverse : theme.colors.brandPrimary} />
      ) : (
        <AppIcon
          name={icon}
          state={isPrimary ? 'inverse' : 'active'}
          size={size === 'lg' ? 'xl' : 'lg'}
        />
      )}
    </Pressable>
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
  isCameraReady,
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
  if (!currentView || !visible) return null;

  const isLastStep = capturedCount === totalSteps && Boolean(currentPhoto);
  const showLiveCamera = hasCameraPermission && !currentPhoto;
  const captureButtonIcon = !hasCameraPermission ? 'camera' : currentPhoto ? 'retake' : 'camera';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.captureModalOverlay}>
        <Pressable style={styles.captureModalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.captureModalCard}>
          <View style={styles.captureModalHeader}>
            <View style={styles.captureModalStepPill}>
              <Text style={styles.captureModalStepText}>
                Step {Math.min(capturedCount + (currentPhoto ? 0 : 1), totalSteps)} of {totalSteps}
              </Text>
            </View>

            <View style={styles.captureModalHeaderActions}>
              {currentPhoto ? (
                <Pressable onPress={onRetake} style={styles.captureModalClose} accessibilityLabel="Retake photo">
                  <AppIcon name="retake" state="muted" />
                </Pressable>
              ) : null}

              <Pressable onPress={onOpenHelp} style={styles.captureModalHelp}>
                <Text style={styles.captureModalHelpText}>Help</Text>
              </Pressable>

              <Pressable onPress={onClose} style={styles.captureModalClose}>
                <AppIcon name="close" state="muted" />
              </Pressable>
            </View>
          </View>

          <Text style={styles.captureModalTitle}>{currentView.label}</Text>
          <Text style={styles.captureModalBody}>
            Use camera or upload for this step. Keep the hair tied, clear, and centered inside the guide.
          </Text>

          <View style={styles.captureStage}>
            {showLiveCamera ? (
              <CameraView
                ref={cameraRef}
                style={styles.captureStageImage}
                facing="back"
                mode="picture"
                animateShutter
                onCameraReady={isCameraReady}
              />
            ) : currentPhoto ? (
              <Image source={{ uri: currentPhoto.uri }} style={styles.captureStageImage} />
            ) : (
              <View style={styles.captureStagePlaceholder}>
                <AppIcon name="camera" state="active" size="xl" />
                <Text style={styles.captureStagePlaceholderTitle}>{currentView.label}</Text>
                <Text style={styles.captureStagePlaceholderBody}>
                  {hasCameraPermission
                    ? 'The camera is getting ready. Keep the hair inside the guide frame.'
                    : 'Allow camera access first so you can take this photo here.'}
                </Text>
              </View>
            )}

            <View pointerEvents="none" style={styles.captureFrame}>
              <View style={[styles.captureCorner, styles.captureCornerTopLeft]} />
              <View style={[styles.captureCorner, styles.captureCornerTopRight]} />
              <View style={[styles.captureCorner, styles.captureCornerBottomLeft]} />
              <View style={[styles.captureCorner, styles.captureCornerBottomRight]} />
              <View style={styles.captureGuideLine} />
              <View style={styles.captureHintPill}>
                <Text style={styles.captureHintText}>{currentView.label}</Text>
              </View>
            </View>
          </View>

          <View style={styles.captureActionRow}>
            <IconActionButton
              icon="image"
              variant="secondary"
              loading={isUploadingPhoto}
              onPress={onUpload}
              accessibilityLabel="Upload photo"
              style={styles.captureSideButton}
            />

            <IconActionButton
              icon={captureButtonIcon}
              variant="primary"
              size="lg"
              loading={isCapturingPhoto}
              onPress={!hasCameraPermission ? onRequestPermission : currentPhoto ? onRetake : onCapture}
              accessibilityLabel={!hasCameraPermission ? 'Allow camera access' : currentPhoto ? 'Retake photo' : 'Capture photo'}
              style={styles.captureCenterButton}
            />

            {currentPhoto ? (
              <IconActionButton
                icon="chevronRight"
                variant="secondary"
                onPress={onContinue}
                accessibilityLabel={isLastStep ? 'Finish capture' : 'Next step'}
                style={styles.captureSideButton}
              />
            ) : (
              <View style={styles.captureSideButtonPlaceholder} />
            )}
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
  const { user, profile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'donor', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    photos,
    requiredViews,
    analysis,
    error,
    successMessage,
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
  const reviewDefaults = useMemo(() => buildHairReviewDefaultValues(analysis), [analysis]);
  const recommendations = (analysis?.recommendations || []).slice(0, 2);
  const primaryPhoto = photos[0]?.uri || null;
  const hasActiveAnalyzerState = Boolean(photos.length || analysis || isAnalyzing || error);
  const showLanding = !hasActiveAnalyzerState;
  const confidenceLabel = analysis?.confidence_score
    ? `${Math.round(Number(analysis.confidence_score) * 100)}% confidence`
    : 'Confidence unavailable';

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(hairReviewSchema),
    mode: 'onBlur',
    defaultValues: reviewDefaults,
  });
  const reviewValues = useWatch({ control });
  const eligibility = useMemo(
    () => buildEligibilitySummary({ analysis, confirmedValues: reviewValues }),
    [analysis, reviewValues]
  );

  useEffect(() => {
    reset(reviewDefaults);
  }, [reset, reviewDefaults]);

  useEffect(() => {
    if (!isGuidedCaptureOpen) return;
    if (cameraPermission?.granted) return;
    requestCameraPermission();
  }, [cameraPermission?.granted, isGuidedCaptureOpen, requestCameraPermission]);

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/donor/donations') return;
    router.navigate(item.route);
  };

  const handleSaveSubmission = async (values) => {
    await submitSubmission(values);
  };

  const handleTakeGuidedPhoto = async () => {
    if (!cameraPermission?.granted || !cameraRef.current) return;

    try {
      setIsCapturingPhoto(true);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 1,
      });
      saveGuidedPhoto(photo);
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleUploadGuidedPhoto = async () => {
    await pickImageForCurrentView();
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
          subtitle="Save one donation record"
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="donor"
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate('/donor/notifications'),
            },
          ]}
        />
      )}
    >
      {successMessage ? (
        <StatusBanner
          message={successMessage}
          variant="success"
          title="Submission saved"
          style={styles.inlineBanner}
        />
      ) : null}

      {showLanding ? (
        <AppCard variant="elevated" radius="xl" padding="lg">
          <View style={styles.helpButtonRow}>
            <AppButton
              title="Help"
              variant="outline"
              fullWidth={false}
              leading={<AppIcon name="support" state="muted" />}
              onPress={() => setIsHelpOpen(true)}
            />
          </View>

          <View style={styles.landingHero}>
            <View style={styles.landingHeroIcon}>
              <AppIcon name="sparkle" state="active" />
            </View>
            <Text style={styles.landingHeroTitle}>Analyze My Hair</Text>
            <Text style={styles.landingHeroBody}>Use camera or upload for guided screening.</Text>

            <View style={styles.reminderRow}>
              {ANALYZER_REMINDERS.map((item) => (
                <View key={item} style={styles.reminderPill}>
                  <Text style={styles.reminderText}>{item}</Text>
                </View>
              ))}
            </View>

            <AppButton
              title="Analyze My Hair"
              onPress={startGuidedCapture}
              trailing={<AppIcon name="chevronRight" state="inverse" />}
              style={styles.primaryAnalyzerButton}
            />

            <Text style={styles.landingHeroFootnote}>Camera and upload are both available.</Text>
          </View>
        </AppCard>
      ) : (
        <>
          <AppCard variant="elevated" radius="xl" padding="lg">
            <View style={styles.helpButtonRow}>
              <AppButton
                title="Help"
                variant="outline"
                fullWidth={false}
                leading={<AppIcon name="support" state="muted" />}
                onPress={() => setIsHelpOpen(true)}
              />
            </View>

            <DashboardSectionHeader
              title="Hair Analyzer"
              description="Use camera or upload a photo for AI screening. Keep the hair tied, clear, and fully visible."
              style={styles.sectionHeader}
            />

            <View style={styles.analyzerPreviewCard}>
              {primaryPhoto ? (
                <Image source={{ uri: primaryPhoto }} style={styles.analyzerPreviewImage} />
              ) : (
                <View style={styles.analyzerPreviewPlaceholder}>
                  <AppIcon name="camera" state="active" size="xl" />
                  <Text style={styles.analyzerPreviewPlaceholderTitle}>No photo set yet</Text>
                  <Text style={styles.analyzerPreviewPlaceholderBody}>
                    Open the analyzer to capture or upload a clear hair photo set.
                  </Text>
                </View>
              )}

              <View style={styles.analyzerPreviewOverlay}>
                <View style={styles.progressBadge}>
                  <Text style={styles.progressBadgeText}>{photos.length}/{requiredViews.length}</Text>
                </View>
                <Text style={styles.progressText}>{progressLabel}</Text>
              </View>
            </View>

            <View style={styles.viewGuideRail}>
              {requiredViews.map((view, index) => (
                <GuideStepCard
                  key={view.key}
                  index={index}
                  view={view}
                  photo={photos[index]}
                  isActive={!photos[index] && photos.length === index}
                />
              ))}
            </View>

            {photos.length ? (
              <View style={styles.photoGrid}>
                {photos.map((photo) => (
                  <PhotoTile key={photo.id} photo={photo} onRemove={removePhoto} />
                ))}
              </View>
            ) : null}

            <View style={styles.moduleActionRow}>
              <View style={styles.moduleActionSideSlot} />
              <IconActionButton
                icon="camera"
                variant="primary"
                size="lg"
                onPress={startGuidedCapture}
                accessibilityLabel="Open guided camera"
                style={styles.modulePrimaryIconButton}
              />
              <IconActionButton
                icon="image"
                variant="secondary"
                onPress={pickImages}
                loading={isPickingImages}
                accessibilityLabel="Upload hair photos"
                style={styles.moduleSecondaryIconButton}
              />
            </View>

            {photos.length ? (
              <View style={styles.secondaryActionRow}>
                <AppButton
                  title="Analyze Again"
                  variant="outline"
                  loading={isAnalyzing}
                  disabled={!canAnalyze}
                  leading={<AppIcon name="sparkle" state="muted" />}
                  onPress={analyzePhotos}
                  fullWidth={false}
                />
                <AppButton
                  title="Clear"
                  variant="ghost"
                  onPress={resetFlow}
                  fullWidth={false}
                />
              </View>
            ) : null}

            {isAnalyzing ? (
              <StatusBanner
                message="The uploaded photos are being reviewed now. Your result will appear below."
                variant="info"
                title="Analyzing photos"
                style={styles.inlineBanner}
              />
            ) : null}

            {error ? (
              <StatusBanner
                message={error.message}
                variant="error"
                title={error.title}
                style={styles.inlineBanner}
              />
            ) : null}
          </AppCard>

          {analysis ? (
            <AppCard variant="elevated" radius="xl" padding="lg">
              <DashboardSectionHeader
                title="Hair Analysis Result"
                description="Review the AI result, correct anything inaccurate, then confirm the screening."
                style={styles.sectionHeader}
              />

              <View style={styles.verificationStage}>
                {primaryPhoto ? <Image source={{ uri: primaryPhoto }} style={styles.verificationStageImage} /> : null}
                <View style={styles.verificationStageMetrics}>
                  <Text style={styles.verificationStageMetricsTitle}>AI detected</Text>
                  <AnalysisMetricPill label="Length" value={formatLengthLabel(analysis.estimated_length)} />
                  <AnalysisMetricPill label="Texture" value={analysis.detected_texture || 'Not set'} />
                  <AnalysisMetricPill label="Condition" value={analysis.detected_condition || 'Not set'} />
                </View>
              </View>

              <StatusBanner
                message={
                  eligibility.reasons.length
                    ? eligibility.reasons[0]
                    : 'This photo set currently meets the configured Donivra screening rules.'
                }
                variant={eligibility.tone}
                title={eligibility.status}
                style={styles.summaryBanner}
              />

              {eligibility.reasons.length ? (
                <View style={styles.reasonList}>
                  {eligibility.reasons.map((reason) => (
                    <View key={reason} style={styles.reasonItem}>
                      <View style={styles.reasonDot} />
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.metricGrid}>
                <ResultMetricCard label="Estimated length" value={formatLengthLabel(analysis.estimated_length)} />
                <ResultMetricCard label="Texture" value={analysis.detected_texture} />
                <ResultMetricCard label="Density" value={analysis.detected_density} />
                <ResultMetricCard label="Condition" value={analysis.detected_condition} />
                <ResultMetricCard label="Image visibility" value={analysis.is_hair_detected ? 'Clear' : 'Needs review'} />
                <ResultMetricCard label="Confidence" value={confidenceLabel} />
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>AI summary</Text>
                <Text style={styles.summaryText}>
                  {analysis.summary || 'No summary was returned for this analysis.'}
                </Text>
              </View>

              <Controller
                control={control}
                name="declaredLength"
                render={({ field }) => (
                  <AppInput
                    label="Confirm length (cm)"
                    placeholder="35.6"
                    keyboardType="decimal-pad"
                    variant="filled"
                    helperText={`AI result: ${formatLengthLabel(analysis.estimated_length)}`}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.declaredLength?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="declaredTexture"
                render={({ field }) => (
                  <AppInput
                    label="Confirm texture"
                    placeholder="Straight"
                    variant="filled"
                    helperText={`AI result: ${analysis.detected_texture || 'No value'}`}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.declaredTexture?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="declaredDensity"
                render={({ field }) => (
                  <AppInput
                    label="Confirm density"
                    placeholder="Medium"
                    variant="filled"
                    helperText={`AI result: ${analysis.detected_density || 'No value'}`}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.declaredDensity?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="declaredCondition"
                render={({ field }) => (
                  <AppInput
                    label="Confirm condition"
                    placeholder="Healthy"
                    variant="filled"
                    helperText={`AI result: ${analysis.detected_condition || 'No value'}`}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.declaredCondition?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="detailNotes"
                render={({ field }) => (
                  <AppInput
                    label="Correction notes"
                    placeholder="Add corrections if the AI missed something"
                    variant="filled"
                    multiline={true}
                    numberOfLines={4}
                    helperText={`AI notes: ${analysis.visible_damage_notes || 'No extra notes'}`}
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.detailNotes?.message}
                    inputStyle={styles.multilineInput}
                  />
                )}
              />

              {recommendations.length ? (
                <View style={styles.recommendationList}>
                  {recommendations.map((recommendation, index) => (
                    <RecommendationCard
                      key={`${recommendation.priority_order}-${recommendation.title || recommendation.recommendation_text.slice(0, 24)}`}
                      recommendation={recommendation}
                      isTopPriority={index === 0}
                    />
                  ))}
                </View>
              ) : null}

              <View style={styles.confirmActionRow}>
                <AppButton
                  title="Confirm & Continue"
                  loading={isSaving}
                  onPress={handleSubmit(handleSaveSubmission)}
                  fullWidth={true}
                />
                <View style={styles.reviewActionRow}>
                  <AppButton
                    title="Retake Photos"
                    variant="outline"
                    onPress={startGuidedCapture}
                    fullWidth={false}
                  />
                  <AppButton
                    title="Upload New Set"
                    variant="ghost"
                    onPress={pickImages}
                    loading={isPickingImages}
                    fullWidth={false}
                  />
                </View>
              </View>
            </AppCard>
          ) : null}
        </>
      )}

      <GuidedCaptureModal
        visible={isGuidedCaptureOpen}
        currentView={currentGuidedView}
        currentPhoto={currentGuidedPhoto}
        capturedCount={capturedGuideCount}
        totalSteps={requiredViews.length}
        hasCameraPermission={Boolean(cameraPermission?.granted)}
        cameraRef={cameraRef}
        isCameraReady={() => {}}
        isCapturingPhoto={isCapturingPhoto}
        isUploadingPhoto={isPickingImages}
        onClose={closeGuidedCapture}
        onRequestPermission={requestCameraPermission}
        onCapture={handleTakeGuidedPhoto}
        onUpload={handleUploadGuidedPhoto}
        onRetake={clearCurrentGuidedPhoto}
        onContinue={advanceGuidedCapture}
        onOpenHelp={() => setIsHelpOpen(true)}
      />

      <AnalyzerHelpModal
        visible={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    marginBottom: theme.spacing.md,
  },
  inlineBanner: {
    marginBottom: theme.spacing.md,
  },
  landingHero: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.xl,
    borderRadius: theme.radius.xl,
    backgroundColor: '#f8eef0',
    borderWidth: 1,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  landingHeroIcon: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  landingHeroTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    color: theme.colors.textPrimary,
  },
  landingHeroBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  reminderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  helpButtonRow: {
    alignItems: 'flex-end',
    marginBottom: theme.spacing.md,
  },
  reminderPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  reminderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  primaryAnalyzerButton: {
    width: '100%',
  },
  landingHeroFootnote: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  analyzerPreviewCard: {
    position: 'relative',
    minHeight: 200,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#f8eef0',
    borderWidth: 1,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  analyzerPreviewImage: {
    width: '100%',
    height: 200,
  },
  analyzerPreviewPlaceholder: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  analyzerPreviewPlaceholderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  analyzerPreviewPlaceholderBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  analyzerPreviewOverlay: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  progressBadge: {
    minWidth: 52,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  progressBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  progressText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  viewGuideRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  guideStepCard: {
    minWidth: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  guideStepCardActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: '#f4e7ea',
  },
  guideStepCardDone: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  guideStepNumber: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  guideStepNumberDone: {
    backgroundColor: theme.colors.brandPrimary,
  },
  guideStepNumberText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  guideStepNumberTextDone: {
    color: theme.colors.textInverse,
  },
  guideStepCopy: {
    flex: 1,
    gap: 2,
  },
  guideStepLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  guideStepStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  guideStepStatusTextDone: {
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
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
  photoLabelPill: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.whiteOverlay,
  },
  photoLabelText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  photoRemoveButton: {
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
  moduleActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  moduleActionSideSlot: {
    width: 62,
  },
  modulePrimaryIconButton: {
    alignSelf: 'center',
  },
  moduleSecondaryIconButton: {
    alignSelf: 'center',
  },
  secondaryActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  captureModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.overlay,
  },
  captureModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  captureModalCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
  },
  helpModalCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
    paddingBottom: theme.spacing.md,
  },
  helpModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  helpEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  helpTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  helpIntro: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  helpSliderDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  helpSliderDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderSubtle,
  },
  helpSliderDotActive: {
    width: 20,
    backgroundColor: theme.colors.brandPrimary,
  },
  helpSliderCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: '#f8eef0',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    marginBottom: theme.spacing.md,
  },
  helpStepList: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  helpStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: '#f8eef0',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  helpStepBadge: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  helpStepBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
  },
  helpStepCopy: {
    flex: 1,
    gap: 4,
  },
  helpStepTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  helpStepTitleCentered: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  helpStepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  helpStepBodyCentered: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  helpArrowWrap: {
    alignSelf: 'center',
    opacity: 0.7,
  },
  helpVisualCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    gap: theme.spacing.sm,
  },
  helpFrameMock: {
    position: 'relative',
    minHeight: 110,
    borderRadius: theme.radius.xl,
    backgroundColor: '#2c2428',
    padding: theme.spacing.md,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  helpGuideLineMock: {
    position: 'absolute',
    top: 18,
    bottom: 18,
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: theme.radius.full,
  },
  helpFrameText: {
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textInverse,
  },
  helpControlPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  helpControlCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  helpControlSide: {
    width: 54,
    height: 54,
    borderRadius: 27,
    shadowOpacity: 0.08,
    elevation: 4,
  },
  helpControlLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  helpControlLabel: {
    width: 62,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
  helpControlLabelActive: {
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  helpTipsCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    gap: theme.spacing.sm,
  },
  helpTipsTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  helpTipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  helpTipDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    marginTop: 6,
    backgroundColor: theme.colors.brandPrimary,
  },
  helpTipText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  helpViewGrid: {
    gap: theme.spacing.sm,
  },
  helpViewItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  helpViewNumber: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  helpViewNumberText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
  },
  helpViewText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  helpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  captureModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  captureModalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  captureModalStepPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
  captureModalStepText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  captureModalClose: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  captureModalHelp: {
    minHeight: 34,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  captureModalHelpText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  captureModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  captureModalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  captureStage: {
    position: 'relative',
    minHeight: 320,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#191418',
    marginBottom: theme.spacing.md,
  },
  captureStageImage: {
    width: '100%',
    height: 320,
  },
  captureStagePlaceholder: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: '#f3edf1',
  },
  captureStagePlaceholderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  captureStagePlaceholderBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
    borderColor: '#ffffff',
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
  captureGuideLine: {
    position: 'absolute',
    top: 54,
    bottom: 28,
    left: '50%',
    width: 2,
    marginLeft: -1,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: theme.radius.full,
  },
  captureHintPill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(17, 14, 17, 0.7)',
  },
  captureHintText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  captureActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  captureCenterButton: {
    alignSelf: 'center',
  },
  captureSideButton: {
    alignSelf: 'center',
  },
  captureSideButtonPlaceholder: {
    width: 62,
    height: 62,
  },
  iconActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  iconActionButtonPrimary: {
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
  },
  iconActionButtonSecondary: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderColor: theme.colors.borderStrong,
  },
  iconActionButtonMedium: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  iconActionButtonLarge: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  iconActionButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  iconActionButtonDisabled: {
    opacity: 0.64,
  },
  verificationStage: {
    position: 'relative',
    minHeight: 232,
    marginBottom: theme.spacing.md,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#f8eef0',
    borderWidth: 1,
    borderColor: theme.colors.brandPrimaryMuted,
  },
  verificationStageImage: {
    width: '100%',
    height: 232,
  },
  verificationStageMetrics: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    width: 156,
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(88, 78, 84, 0.72)',
  },
  verificationStageMetricsTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  analysisMetricPill: {
    gap: 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  analysisMetricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textMuted,
  },
  analysisMetricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  summaryBanner: {
    marginBottom: theme.spacing.md,
  },
  reasonList: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  reasonDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
    marginTop: 7,
    backgroundColor: theme.colors.brandPrimary,
  },
  reasonText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  metricGrid: {
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
    letterSpacing: 0.4,
  },
  metricValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  summaryCard: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  summaryLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
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
  recommendationPriorityPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  recommendationPriorityPillPrimary: {
    backgroundColor: theme.colors.backgroundPrimary,
  },
  recommendationPriorityText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  recommendationPriorityTextPrimary: {
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
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  confirmActionRow: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  reviewActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
});
