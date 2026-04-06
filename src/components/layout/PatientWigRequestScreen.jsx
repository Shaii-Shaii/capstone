import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { theme } from '../../design-system/theme';
import { patientDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { usePatientWigRequest } from '../../hooks/usePatientWigRequest';
import { useNotifications } from '../../hooks/useNotifications';
import { useProcessTracking } from '../../hooks/useProcessTracking';
import { ProcessStatusTracker } from '../tracking/ProcessStatusTracker';
import { wigRequestDefaultValues, wigRequestSchema } from '../../features/wigRequest.schema';

const formatRequestDate = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const buildRecommendationTitle = ({ preview, specification, draftValues }) => (
  preview?.recommended_style_name
  || [
    specification?.preferred_length || draftValues?.preferredLength || '',
    specification?.preferred_color || draftValues?.preferredColor || '',
    'Wig',
  ]
    .filter(Boolean)
    .join(' ')
  || 'Suggested Wig Style'
);

const buildRecommendationFamily = ({ preview, specification, draftValues }) => (
  preview?.recommended_style_family
  || specification?.preferred_length
  || draftValues?.preferredLength
  || 'Patient wig recommendation'
);

const buildRecommendationOptions = ({ preview, specification, draftValues }) => {
  if (Array.isArray(preview?.options) && preview.options.length) {
    return preview.options.slice(0, 3).map((option, index) => ({
      id: option.id || `option-${index}`,
      name: option.name || `Style ${index + 1}`,
      note: option.note || 'Suggested wig option',
      family: option.family || '',
      matchLabel: option.match_label || option.matchLabel || '',
      generatedImageUri: option.generated_image_data_url || option.generatedImageDataUrl || '',
    }));
  }

  const fallbackOptions = [
    specification?.preferred_length || draftValues?.preferredLength
      ? {
          id: 'preferred-length',
          name: specification?.preferred_length || draftValues?.preferredLength,
          note: 'Suggested length direction',
          family: '',
          matchLabel: 'Suggested',
          generatedImageUri: '',
        }
      : null,
    specification?.preferred_color || draftValues?.preferredColor
      ? {
          id: 'preferred-color',
          name: specification?.preferred_color || draftValues?.preferredColor,
          note: 'Suggested color direction',
          family: '',
          matchLabel: 'Recommended',
          generatedImageUri: '',
        }
      : null,
    preview?.style_notes
      ? {
          id: 'fit-notes',
          name: 'Fit Notes',
          note: preview.style_notes,
          family: '',
          matchLabel: 'AI Note',
          generatedImageUri: '',
        }
      : null,
  ].filter(Boolean);

  return fallbackOptions.slice(0, 3);
};

function RequestDetailsPanel({ control, errors }) {
  return (
    <View style={styles.detailsPanel}>
      <Controller
        control={control}
        name="preferredColor"
        render={({ field }) => (
          <AppInput
            label="Preferred Color"
            placeholder="Natural black"
            variant="filled"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.preferredColor?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="preferredLength"
        render={({ field }) => (
          <AppInput
            label="Preferred Length"
            placeholder="Shoulder length"
            variant="filled"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.preferredLength?.message}
          />
        )}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field }) => (
          <AppInput
            label="Request Notes"
            placeholder="Comfort notes or extra request details"
            variant="filled"
            multiline={true}
            numberOfLines={4}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.notes?.message}
            inputStyle={styles.multilineInput}
          />
        )}
      />
    </View>
  );
}

function RequestDetailsSheet({
  visible,
  onClose,
  control,
  errors,
}) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetKeyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
      >
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={onClose} />

          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.sheetCard}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Request Details</Text>
                <Text style={styles.sheetBody}>
                  Add optional wig preferences here, then go back to the camera step.
                </Text>
              </View>

              <Pressable onPress={onClose} style={styles.headerIconButton}>
                <AppIcon name="close" state="muted" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={[
                styles.sheetScrollContent,
                { paddingBottom: insets.bottom + theme.spacing.md },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              <RequestDetailsPanel control={control} errors={errors} />
            </ScrollView>

            <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, theme.spacing.sm) }]}>
              <AppButton
                title="Apply Request Details"
                onPress={onClose}
                leading={<AppIcon name="success" state="inverse" />}
              />
            </View>
          </AppCard>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function IconCircleButton({
  icon,
  onPress,
  variant = 'secondary',
  disabled = false,
  loading = false,
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
        styles.iconCircleButton,
        isPrimary ? styles.iconCircleButtonPrimary : styles.iconCircleButtonSecondary,
        pressed ? styles.iconCircleButtonPressed : null,
        (disabled || loading) ? styles.iconCircleButtonDisabled : null,
        style,
      ]}
    >
      <AppIcon
        name={icon}
        state={isPrimary ? 'inverse' : 'active'}
        size={isPrimary ? 'xl' : 'lg'}
      />
    </Pressable>
  );
}

function CaptureModal({
  visible,
  referenceImage,
  hasCameraPermission,
  cameraRef,
  onCameraReady,
  isCapturingPhoto,
  isPickingReference,
  isGeneratingPreview,
  onOpenDetails,
  onClose,
  onUpload,
  onCapture,
  onGeneratePreview,
  onRequestPermission,
}) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>Step 1 of 1</Text>
            </View>

            <View style={styles.modalHeaderActions}>
              <Pressable onPress={onOpenDetails} style={styles.headerIconButton}>
                <AppIcon name="settings" state="muted" />
              </Pressable>
              <Pressable onPress={onClose} style={styles.headerIconButton}>
                <AppIcon name="close" state="muted" />
              </Pressable>
            </View>
          </View>

          <Text style={styles.modalTitle}>Front</Text>
          <Text style={styles.modalBody}>
            Use camera or upload for this step. Keep the front view clear and centered inside the guide.
          </Text>

          <View style={styles.captureStage}>
            {referenceImage?.uri ? (
              <Image source={{ uri: referenceImage.uri }} style={styles.captureStageImage} />
            ) : hasCameraPermission ? (
              <CameraView
                ref={cameraRef}
                style={styles.captureStageImage}
                facing="front"
                mode="picture"
                animateShutter
                onCameraReady={onCameraReady}
              />
            ) : (
              <View style={styles.captureStagePlaceholder}>
                <AppIcon name="camera" state="active" size="xl" />
                <Text style={styles.captureStagePlaceholderTitle}>Camera access needed</Text>
                <Text style={styles.captureStagePlaceholderBody}>
                  Allow camera access or upload a front photo from your device.
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
                <Text style={styles.captureHintText}>Front</Text>
              </View>
            </View>
          </View>

          <View style={styles.captureControls}>
            <IconCircleButton
              icon="image"
              accessibilityLabel="Upload front photo"
              loading={isPickingReference}
              onPress={onUpload}
            />
            <IconCircleButton
              icon="camera"
              accessibilityLabel="Capture front photo"
              variant="primary"
              loading={isCapturingPhoto}
              onPress={hasCameraPermission ? onCapture : onRequestPermission}
              style={styles.captureButtonPrimary}
            />
            <View style={styles.captureControlsSpacer} />
          </View>

          <View style={styles.modalFooter}>
            <Text style={styles.modalFooterText}>
              {referenceImage?.uri
                ? 'Front photo ready. Generate the wig preview when your request details are complete.'
                : 'Use the settings icon for optional request details, then upload or capture one front photo.'}
            </Text>

            <AppButton
              title="Generate Wig Preview"
              loading={isGeneratingPreview}
              disabled={!referenceImage?.uri}
              onPress={onGeneratePreview}
              leading={<AppIcon name="sparkle" state="inverse" />}
            />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
}

function WigOptionCard({ option, isActive, onPress, fallbackImageUri }) {
  const imageUri = option.generatedImageUri || fallbackImageUri || '';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        isActive ? styles.optionCardActive : null,
        pressed ? styles.optionCardPressed : null,
      ]}
    >
      <View style={styles.optionImageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.optionImage} />
        ) : (
          <View style={styles.optionImagePlaceholder}>
            <AppIcon name="sparkle" state="active" />
          </View>
        )}
      </View>
      <Text style={styles.optionName}>{option.name}</Text>
      <Text style={styles.optionMatch}>{option.matchLabel || 'Suggested'}</Text>
      <Text style={styles.optionNote} numberOfLines={2}>{option.note}</Text>
      <View style={[styles.tryOnButton, isActive ? styles.tryOnButtonActive : null]}>
        <Text style={[styles.tryOnButtonText, isActive ? styles.tryOnButtonTextActive : null]}>
          {isActive ? 'Try On ✓' : 'Try On'}
        </Text>
      </View>
    </Pressable>
  );
}

function WigPreviewCard({
  frontPhotoUri,
  generatedImageUri,
  title,
  family,
  summary,
  preferredColor,
  preferredLength,
  requestDate,
  onPrimaryAction,
  primaryActionLabel,
  primaryActionLoading = false,
  onSecondaryAction,
  secondaryActionLabel,
}) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg" style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <Text style={styles.resultHeaderTitle}>AI Wig Style Preview</Text>
      </View>

      <View style={styles.resultHero}>
        <View style={styles.resultBadge}>
          <AppIcon name="sparkle" state="muted" size="sm" />
          <Text style={styles.resultBadgeText}>AI Virtual Try-On Active</Text>
        </View>

        <View style={styles.resultCircleWrap}>
          <View style={styles.resultCircleOuter}>
            <View style={styles.resultCircleInner}>
              {generatedImageUri || frontPhotoUri ? (
                <Image source={{ uri: generatedImageUri || frontPhotoUri }} style={styles.resultHeroImage} />
              ) : (
                <View style={styles.resultHeroPlaceholder}>
                  <AppIcon name="image" state="muted" size="xl" />
                </View>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.resultStyleTitle}>{title}</Text>
        <Text style={styles.resultStyleFamily}>{family}</Text>
        <Text style={styles.resultSummary}>{summary}</Text>
      </View>

      <View style={styles.resultMetaRow}>
        {preferredLength ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Length</Text>
            <Text style={styles.metaValue}>{preferredLength}</Text>
          </View>
        ) : null}
        {preferredColor ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Color</Text>
            <Text style={styles.metaValue}>{preferredColor}</Text>
          </View>
        ) : null}
        {requestDate ? (
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Request</Text>
            <Text style={styles.metaValue}>{requestDate}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.resultActionColumn}>
        {secondaryActionLabel ? (
          <AppButton
            title={secondaryActionLabel}
            variant="outline"
            onPress={onSecondaryAction}
            leading={<AppIcon name="camera" state="muted" />}
          />
        ) : null}

        {primaryActionLabel ? (
          <AppButton
            title={primaryActionLabel}
            loading={primaryActionLoading}
            onPress={onPrimaryAction}
            leading={<AppIcon name="sparkle" state="inverse" />}
          />
        ) : null}
      </View>
    </AppCard>
  );
}

function WigGenerationModal({
  visible,
  isGeneratingPreview,
  generatedImageUri,
  title,
  family,
  summary,
  onClose,
}) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />

        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.generationModalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>Wig Generation</Text>
            </View>

            <Pressable onPress={onClose} style={styles.headerIconButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <Text style={styles.generationModalTitle}>AI Wig Preview</Text>
          <Text style={styles.generationModalBody}>
            {isGeneratingPreview
              ? 'Generating the wig style preview from the front photo.'
              : 'Review the generated wig preview result.'}
          </Text>

          <View style={styles.generationStage}>
            {generatedImageUri ? (
              <Image source={{ uri: generatedImageUri }} style={styles.generationStageImage} />
            ) : (
              <View style={styles.generationStagePlaceholder}>
                <AppIcon name="sparkle" state="active" size="xl" />
                <Text style={styles.generationStagePlaceholderText}>
                  {isGeneratingPreview ? 'Generating preview...' : 'No generated wig preview yet.'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.generationResultTitle}>{title}</Text>
          <Text style={styles.generationResultFamily}>{family}</Text>
          <Text style={styles.generationResultSummary}>{summary}</Text>
        </AppCard>
      </View>
    </Modal>
  );
}

function WigStyleOptionsSection({
  options,
  frontPhotoUri,
  selectedOptionId,
  onSelectOption,
  onCustomize,
}) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg" style={styles.optionsSectionCard}>
      <Text style={styles.optionsSectionTitle}>Available Wig Styles from Donated Hair</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.sliderOptionsRow}
      >
        {options.map((option, index) => (
          <WigOptionCard
            key={option.id}
            option={option}
            isActive={selectedOptionId === option.id || (!selectedOptionId && index === 0)}
            onPress={() => onSelectOption(option.id)}
            fallbackImageUri={frontPhotoUri}
          />
        ))}
      </ScrollView>

      <View style={styles.optionsSectionFooter}>
        <AppButton
          title="Customize Selected Style"
          onPress={onCustomize}
          leading={<AppIcon name="sparkle" state="inverse" />}
        />
      </View>
    </AppCard>
  );
}

export function PatientWigRequestScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const { user, profile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'patient', userId: user?.id });
  const {
    tracker,
    trackingError,
    isLoadingTracking,
    isRefreshingTracking,
    refreshTracking,
  } = useProcessTracking({ role: 'patient', userId: user?.id });
  const {
    latestWigRequest,
    latestWigSpecification,
    hasSubmittedRequest,
    referenceImage,
    preview,
    error,
    successMessage,
    isLoadingContext,
    isPickingReference,
    isGeneratingPreview,
    isSavingRequest,
    pickReferenceImage,
    saveCapturedReferenceImage,
    generatePreview,
    regenerateSavedRecommendation,
    saveRequest,
  } = usePatientWigRequest({ userId: user?.id });

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(wigRequestSchema),
    mode: 'onBlur',
    defaultValues: wigRequestDefaultValues,
  });

  const draftValues = useWatch({ control });
  const firstName = profile?.first_name || 'Patient';
  const avatarInitials = `${profile?.first_name?.[0] || firstName[0] || ''}${profile?.last_name?.[0] || ''}`.trim() || 'SS';
  const hasCameraPermission = Boolean(cameraPermission?.granted);
  const shouldShowTracker = hasSubmittedRequest && Boolean(tracker || isLoadingTracking || trackingError);
  const shouldShowRecommendation = Boolean(preview || referenceImage?.uri || latestWigSpecification?.ai_picture_sample_url);
  const recommendationOptions = useMemo(() => buildRecommendationOptions({
    preview,
    specification: latestWigSpecification,
    draftValues,
  }), [draftValues, latestWigSpecification, preview]);
  const selectedOption = useMemo(
    () => recommendationOptions.find((option) => option.id === selectedOptionId) || recommendationOptions[0] || null,
    [recommendationOptions, selectedOptionId]
  );
  const recommendationTitle = selectedOption?.name || buildRecommendationTitle({
    preview,
    specification: latestWigSpecification,
    draftValues,
  });
  const recommendationFamily = selectedOption?.family || buildRecommendationFamily({
    preview,
    specification: latestWigSpecification,
    draftValues,
  });
  const recommendationSummary = selectedOption?.note
    || preview?.summary
    || latestWigRequest?.notes
    || 'Your suggested wig recommendation will appear here after the front photo is processed.';
  const preferredColor = latestWigSpecification?.preferred_color || draftValues?.preferredColor || '';
  const preferredLength = latestWigSpecification?.preferred_length || draftValues?.preferredLength || '';
  const generatedImageUri = selectedOption?.generatedImageUri || preview?.generated_image_data_url || '';

  useEffect(() => {
    setSelectedOptionId(recommendationOptions[0]?.id || '');
  }, [preview?.generated_image_data_url, recommendationOptions]);

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/patient/requests') return;
    router.navigate(item.route);
  };

  const openCaptureFlow = async () => {
    setIsCaptureOpen(true);

    if (!cameraPermission?.granted) {
      await requestCameraPermission();
    }
  };

  const closeCaptureFlow = () => {
    setIsCaptureOpen(false);
  };

  const handleCapturePhoto = async () => {
    if (!cameraPermission?.granted) {
      await requestCameraPermission();
      return;
    }

    if (!cameraRef.current || isCapturingPhoto) return;

    setIsCapturingPhoto(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: true,
      });

      saveCapturedReferenceImage(photo);
    } catch {
      saveCapturedReferenceImage(null);
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleGeneratePreviewFromModal = handleSubmit(async (values) => {
    setIsGenerationModalOpen(true);
    const result = await generatePreview(values);

    if (result?.success) {
      closeCaptureFlow();
    }

    return result;
  });

  const handleSaveRequest = handleSubmit(async (values) => {
    const result = await saveRequest(values);

    if (result?.success) {
      await refreshTracking();
    }

    return result;
  });

  const headerSubtitle = hasSubmittedRequest
    ? 'Track your wig request and review the latest patient-side wig suggestion.'
    : 'Open the front-photo capture flow, complete the hidden request details, and review the white wig preview result.';

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="requests"
      navVariant="patient"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title="Request a Wig"
          subtitle={headerSubtitle}
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={profile?.avatar_url}
          variant="patient"
          quickTools={[
            {
              key: 'profile',
              label: 'Profile',
              icon: 'profile',
              onPress: () => router.navigate('/profile'),
            },
          ]}
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate('/patient/notifications'),
            },
          ]}
        />
      )}
    >
      {isLoadingContext ? (
        <StatusBanner
          title="Checking request details"
          message="Loading your patient request details."
          variant="info"
        />
      ) : null}

      {error ? (
        <StatusBanner
          message={error.message}
          variant="error"
          title={error.title}
        />
      ) : null}

      {successMessage ? (
        <StatusBanner
          message={successMessage}
          variant="success"
          title="Request updated"
        />
      ) : null}

      {!hasSubmittedRequest ? (
        <AppCard variant="patientTint" radius="xl" padding="lg" style={styles.intakeCard}>
          <Text style={styles.intakeEyebrow}>Patient Wig Request</Text>
          <Text style={styles.intakeTitle}>Front Photo First</Text>
          <Text style={styles.intakeBody}>
            Use the capture flow to upload or take one front photo. The request details are tucked behind the settings icon inside that camera module.
          </Text>
          <AppButton
            title={referenceImage?.uri ? 'Reopen Capture Flow' : 'Open Capture Flow'}
            onPress={openCaptureFlow}
            leading={<AppIcon name="camera" state="inverse" />}
          />
        </AppCard>
      ) : null}

      {!hasSubmittedRequest && shouldShowRecommendation ? (
        <>
          <WigPreviewCard
            frontPhotoUri={referenceImage?.uri}
            generatedImageUri={generatedImageUri}
            title={recommendationTitle}
            family={recommendationFamily}
            summary={recommendationSummary}
            preferredColor={preferredColor}
            preferredLength={preferredLength}
            onPrimaryAction={handleSaveRequest}
            primaryActionLabel="Submit Wig Request"
            primaryActionLoading={isSavingRequest}
            onSecondaryAction={openCaptureFlow}
            secondaryActionLabel="Retake Front Photo"
          />
          {recommendationOptions.length ? (
            <WigStyleOptionsSection
              options={recommendationOptions}
              frontPhotoUri={referenceImage?.uri}
              selectedOptionId={selectedOptionId}
              onSelectOption={setSelectedOptionId}
              onCustomize={() => setIsGenerationModalOpen(true)}
            />
          ) : null}
        </>
      ) : null}

      {shouldShowTracker ? (
        <ProcessStatusTracker
          role="patient"
          tracker={tracker}
          error={trackingError}
          isLoading={isLoadingTracking}
          isRefreshing={isRefreshingTracking}
          onRefresh={refreshTracking}
        />
      ) : null}

      {hasSubmittedRequest && shouldShowRecommendation ? (
        <>
          <WigPreviewCard
            frontPhotoUri={referenceImage?.uri}
            generatedImageUri={generatedImageUri}
            title={recommendationTitle}
            family={recommendationFamily}
            summary={recommendationSummary}
            preferredColor={preferredColor}
            preferredLength={preferredLength}
            requestDate={formatRequestDate(latestWigRequest?.request_date)}
            onPrimaryAction={regenerateSavedRecommendation}
            primaryActionLabel="Refresh Wig Preview"
            primaryActionLoading={isGeneratingPreview}
            onSecondaryAction={openCaptureFlow}
            secondaryActionLabel="Open Camera Flow"
          />
          {recommendationOptions.length ? (
            <WigStyleOptionsSection
              options={recommendationOptions}
              frontPhotoUri={referenceImage?.uri}
              selectedOptionId={selectedOptionId}
              onSelectOption={setSelectedOptionId}
              onCustomize={() => setIsGenerationModalOpen(true)}
            />
          ) : null}
        </>
      ) : null}

      <CaptureModal
        visible={isCaptureOpen}
        referenceImage={referenceImage}
        hasCameraPermission={hasCameraPermission}
        cameraRef={cameraRef}
        onCameraReady={() => {}}
        isCapturingPhoto={isCapturingPhoto}
        isPickingReference={isPickingReference}
        isGeneratingPreview={isGeneratingPreview}
        onOpenDetails={() => setIsDetailsOpen(true)}
        onClose={closeCaptureFlow}
        onUpload={pickReferenceImage}
        onCapture={handleCapturePhoto}
        onGeneratePreview={handleGeneratePreviewFromModal}
        onRequestPermission={requestCameraPermission}
      />

      <RequestDetailsSheet
        visible={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        control={control}
        errors={errors}
      />

      <WigGenerationModal
        visible={isGenerationModalOpen}
        isGeneratingPreview={isGeneratingPreview}
        generatedImageUri={generatedImageUri}
        title={recommendationTitle}
        family={recommendationFamily}
        summary={recommendationSummary}
        onClose={() => setIsGenerationModalOpen(false)}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  intakeCard: {
    gap: theme.spacing.sm,
  },
  intakeEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  intakeTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  intakeBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  optionsSectionCard: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderColor: theme.colors.borderMuted,
  },
  optionsSectionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  optionsSectionFooter: {
    marginTop: theme.spacing.md,
  },
  sliderOptionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.xs,
  },
  resultCard: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderColor: theme.colors.borderMuted,
  },
  resultHeader: {
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  resultHeaderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  resultHero: {
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  resultBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    marginBottom: theme.spacing.md,
  },
  resultBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  resultCircleWrap: {
    marginBottom: theme.spacing.md,
  },
  resultCircleOuter: {
    width: 224,
    height: 224,
    borderRadius: 112,
    padding: 8,
    backgroundColor: '#e4efff',
    borderWidth: 2,
    borderColor: '#87b7ff',
    ...theme.shadows.soft,
  },
  resultCircleInner: {
    width: '100%',
    height: '100%',
    borderRadius: 104,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
  },
  resultHeroImage: {
    width: '100%',
    height: '100%',
  },
  resultHeroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultStyleTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  resultStyleFamily: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    marginBottom: theme.spacing.xs,
  },
  resultSummary: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  resultMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metaPill: {
    minWidth: '30%',
    flexGrow: 1,
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  metaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: theme.colors.textMuted,
  },
  metaValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  availableWrap: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  availableTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  optionCard: {
    width: 136,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  optionCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  optionCardActive: {
    borderColor: '#87b7ff',
    backgroundColor: '#f4f8ff',
  },
  optionImageWrap: {
    height: 92,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
    marginBottom: theme.spacing.sm,
  },
  optionImage: {
    width: '100%',
    height: '100%',
  },
  optionImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionName: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  optionMatch: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    marginBottom: 4,
  },
  optionNote: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  tryOnButton: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  tryOnButtonActive: {
    backgroundColor: '#4f8fe8',
    borderColor: '#4f8fe8',
  },
  tryOnButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  tryOnButtonTextActive: {
    color: theme.colors.textInverse,
  },
  resultActionColumn: {
    gap: theme.spacing.sm,
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
  generationModalCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
  },
  sheetKeyboardWrap: {
    flex: 1,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '74%',
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderStrong,
    alignSelf: 'center',
    marginBottom: theme.spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  sheetTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sheetBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    paddingBottom: theme.spacing.md,
  },
  sheetFooter: {
    paddingTop: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  stepPill: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: '#f7efef',
  },
  stepPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 32,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  modalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight: 40,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  generationModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  generationModalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  generationStage: {
    minHeight: 320,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
    marginBottom: theme.spacing.md,
  },
  generationStageImage: {
    width: '100%',
    height: 320,
  },
  generationStagePlaceholder: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  generationStagePlaceholderText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  generationResultTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  generationResultFamily: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    marginBottom: theme.spacing.xs,
  },
  generationResultSummary: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  detailsPanel: {
    gap: theme.spacing.sm,
  },
  captureStage: {
    position: 'relative',
    minHeight: 320,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: '#090909',
    marginBottom: theme.spacing.md,
  },
  captureStageImage: {
    width: '100%',
    height: 320,
  },
  captureStagePlaceholder: {
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
    backgroundColor: 'rgba(255,255,255,0.55)',
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
  captureControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  captureControlsSpacer: {
    width: 64,
  },
  iconCircleButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  iconCircleButtonPrimary: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
  },
  iconCircleButtonSecondary: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderColor: theme.colors.borderStrong,
  },
  captureButtonPrimary: {
    marginTop: -8,
  },
  iconCircleButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  iconCircleButtonDisabled: {
    opacity: 0.64,
  },
  modalFooter: {
    gap: theme.spacing.sm,
  },
  modalFooterText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: 'top',
  },
});
