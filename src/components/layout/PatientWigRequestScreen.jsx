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
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Sharing from 'expo-sharing';
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
import { logAppError } from '../../utils/appErrors';

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
      summary: option.summary || option.note || '',
      styleNotes: option.style_notes || option.note || '',
      family: option.family || '',
      matchLabel: option.match_label || option.matchLabel || '',
      optionIndex: option.option_index || index + 1,
      generatedImageUri: option.generated_image_data_url || option.generatedImageDataUrl || '',
      previewUrl: option.preview_url || option.generated_image_data_url || option.generatedImageDataUrl || '',
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

const PREFERENCE_GROUPS = [
  {
    name: 'preferredLength',
    title: 'Preferred length',
    options: ['Short', 'Shoulder length', 'Medium', 'Long'],
  },
  {
    name: 'preferredColor',
    title: 'Preferred color',
    options: ['Natural black', 'Dark brown', 'Warm brown', 'Other'],
  },
  {
    name: 'hairTexture',
    title: 'Texture',
    options: ['Straight', 'Wavy', 'Curly', 'Soft layers'],
  },
  {
    name: 'capSize',
    title: 'Cap size',
    options: ['Small', 'Medium', 'Large', 'Not sure'],
  },
  {
    name: 'stylePreference',
    title: 'Style preference',
    options: ['Natural bob', 'Layered waves', 'Soft pixie', 'Classic straight', 'Other'],
  },
];

function ChoiceGroup({ control, name, title, options }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.choiceGroup}>
          <Text style={styles.choiceTitle}>{title}</Text>
          <View style={styles.choiceWrap}>
            {options.map((option) => {
              const isSelected = field.value === option;
              return (
                <Pressable
                  key={`${name}-${option}`}
                  onPress={() => field.onChange(option)}
                  style={({ pressed }) => [
                    styles.choiceChip,
                    isSelected ? styles.choiceChipSelected : null,
                    pressed ? styles.choiceChipPressed : null,
                  ]}
                >
                  <Text style={[styles.choiceText, isSelected ? styles.choiceTextSelected : null]}>
                    {option}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    />
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
                ? 'Front photo ready. Continue to wig preferences next.'
                : 'Upload or capture one clear front photo.'}
            </Text>

            <AppButton
              title="Use Photo"
              disabled={!referenceImage?.uri}
              onPress={onGeneratePreview}
              leading={<AppIcon name="success" state="inverse" />}
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
          {isActive ? 'Selected' : 'Select'}
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
        <Text style={styles.resultHeaderTitle}>AI Wig Reference</Text>
      </View>

      <View style={styles.resultHero}>
        <View style={styles.resultBadge}>
          <AppIcon name="sparkle" state="muted" size="sm" />
          <Text style={styles.resultBadgeText}>Reference only</Text>
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

function WigStyleOptionsSection({
  options,
  frontPhotoUri,
  selectedOptionId,
  onSelectOption,
  onCustomize,
}) {
  return (
    <AppCard variant="elevated" radius="xl" padding="lg" style={styles.optionsSectionCard}>
      <Text style={styles.optionsSectionTitle}>AI Wig Preview Options</Text>
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
          title="Regenerate Options"
          onPress={onCustomize}
          leading={<AppIcon name="sparkle" state="inverse" />}
        />
      </View>
    </AppCard>
  );
}

function RequestFlowModal({
  visible,
  step,
  control,
  errors,
  patientName,
  patientCode,
  hospitalName,
  medicalCondition,
  referenceImage,
  hasOtherPreference,
  recommendationOptions,
  selectedOptionId,
  onSelectOption,
  recommendationTitle,
  recommendationFamily,
  recommendationSummary,
  preferredColor,
  preferredLength,
  generatedImageUri,
  hasGeneratedPreview,
  isPickingReference,
  isGeneratingPreview,
  isSavingRequest,
  onClose,
  onBackToPatient,
  onContinueToDetails,
  onUploadPhoto,
  onOpenCamera,
  onGeneratePreview,
  onSkipPreview,
  onRegenerate,
  onDownloadSelected,
  onSubmitRequest,
  onViewTimeline,
}) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flowKeyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={onClose} />

          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.flowCard}>
            <View style={styles.modalHeader}>
              <View style={styles.stepPill}>
                <Text style={styles.stepPillText}>
                  {step === 'patient' ? 'Step 1'
                    : step === 'details' ? 'Step 2'
                    : step === 'summary' ? 'Step 3'
                    : 'Submitted'}
                </Text>
              </View>

              <Pressable onPress={onClose} style={styles.headerIconButton}>
                <AppIcon name="close" state="muted" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.flowScroll}
              contentContainerStyle={[
                styles.flowScrollContent,
                { paddingBottom: Math.max(insets.bottom, theme.spacing.md) },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              {step === 'patient' ? (
                <View style={styles.flowSection}>
                  <Text style={styles.flowTitle}>Patient details</Text>
                  <Text style={styles.flowBody}>Review the patient record linked to this account before starting the request.</Text>

                  <View style={styles.previewGrid}>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Patient</Text>
                      <Text style={styles.previewValue}>{patientName || 'Patient account'}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Patient code</Text>
                      <Text style={styles.previewValue}>{patientCode || 'Not assigned'}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Hospital</Text>
                      <Text style={styles.previewValue}>{hospitalName || 'Not linked'}</Text>
                    </View>
                    {medicalCondition ? (
                      <View style={styles.previewRow}>
                        <Text style={styles.previewLabel}>Medical condition</Text>
                        <Text style={styles.previewValue}>{medicalCondition}</Text>
                      </View>
                    ) : null}
                  </View>

                  <Controller
                    control={control}
                    name="acceptedTerms"
                    render={({ field }) => (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: Boolean(field.value) }}
                        onPress={() => field.onChange(!field.value)}
                        style={styles.agreementRow}
                      >
                        <View style={[
                          styles.checkBox,
                          field.value ? styles.checkBoxActive : null,
                        ]}>
                          {field.value ? <AppIcon name="success" state="inverse" size="sm" /> : null}
                        </View>
                        <Text style={styles.agreementText}>
                          I agree that my patient record and uploaded photo may be used by the organization as reference for this wig request.
                        </Text>
                      </Pressable>
                    )}
                  />
                  {errors.acceptedTerms?.message ? (
                    <Text style={styles.fieldError}>{errors.acceptedTerms.message}</Text>
                  ) : null}

                  <View style={styles.actionRow}>
                    <AppButton
                      title="Back"
                      variant="secondary"
                      onPress={onClose}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                    <AppButton
                      title="Continue"
                      onPress={onContinueToDetails}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                  </View>
                </View>
              ) : null}

              {step === 'details' ? (
                <View style={styles.flowSection}>
                  <Text style={styles.flowTitle}>Photo and wig preferences</Text>
                  <Text style={styles.flowBody}>Add one clear front photo, then choose the closest wig options.</Text>

                  <View style={styles.photoPreviewBox}>
                    {referenceImage?.uri ? (
                      <Image source={{ uri: referenceImage.uri }} style={styles.photoPreviewImage} />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <AppIcon name="camera" state="active" size="xl" />
                        <Text style={styles.flowBody}>No front photo yet.</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.actionRow}>
                    <AppButton
                      title="Upload"
                      variant="secondary"
                      loading={isPickingReference}
                      onPress={onUploadPhoto}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                    <AppButton
                      title="Camera"
                      variant="secondary"
                      onPress={onOpenCamera}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                  </View>

                  {PREFERENCE_GROUPS.map((group) => (
                    <ChoiceGroup
                      key={group.name}
                      control={control}
                      name={group.name}
                      title={group.title}
                      options={group.options}
                    />
                  ))}

                  {hasOtherPreference ? (
                    <Controller
                      control={control}
                      name="specialNotes"
                      render={({ field }) => (
                        <AppInput
                          label="Other preference"
                          placeholder="Add a short custom preference"
                          variant="filled"
                          multiline={true}
                          numberOfLines={3}
                          value={field.value}
                          onChangeText={field.onChange}
                          onBlur={field.onBlur}
                          error={errors.specialNotes?.message}
                          inputStyle={styles.multilineInput}
                        />
                      )}
                    />
                  ) : null}

                  <View style={styles.actionRow}>
                    <AppButton
                      title="Back"
                      variant="secondary"
                      onPress={onBackToPatient}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                    <AppButton
                      title="Generate with AI"
                      loading={isGeneratingPreview}
                      disabled={!referenceImage?.uri}
                      onPress={onGeneratePreview}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                  </View>
                  <AppButton
                    title="Skip AI"
                    variant="secondary"
                    disabled={!referenceImage?.uri}
                    onPress={onSkipPreview}
                  />
                </View>
              ) : null}

              {step === 'summary' ? (
                <View style={styles.flowSection}>
                  <Text style={styles.flowTitle}>Request summary</Text>
                  <Text style={styles.flowBody}>Review the uploaded photo and selected wig details before submitting.</Text>

                  <View style={styles.photoPreviewBox}>
                    {referenceImage?.uri ? (
                      <Image source={{ uri: referenceImage.uri }} style={styles.photoPreviewImage} />
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <AppIcon name="image" state="active" size="xl" />
                        <Text style={styles.flowBody}>No photo attached.</Text>
                      </View>
                    )}
                  </View>

                  {hasGeneratedPreview ? (
                    <>
                      <WigPreviewCard
                        frontPhotoUri={referenceImage?.uri}
                        generatedImageUri={generatedImageUri}
                        title={recommendationTitle}
                        family={recommendationFamily}
                        summary={recommendationSummary}
                        preferredColor={preferredColor}
                        preferredLength={preferredLength}
                        onSecondaryAction={onOpenCamera}
                        secondaryActionLabel="Retake Photo"
                      />

                      {recommendationOptions.length > 1 ? (
                        <WigStyleOptionsSection
                          options={recommendationOptions}
                          frontPhotoUri={referenceImage?.uri}
                          selectedOptionId={selectedOptionId}
                          onSelectOption={onSelectOption}
                          onCustomize={onRegenerate}
                        />
                      ) : null}
                    </>
                  ) : (
                    <AppCard variant="subtle" radius="lg" padding="md" style={styles.summaryNoteCard}>
                      <Text style={styles.summaryNoteTitle}>AI preview skipped</Text>
                      <Text style={styles.flowBody}>
                        Your request will use the uploaded photo and selected wig preferences for review.
                      </Text>
                    </AppCard>
                  )}

                  <AppButton
                    title="Submit Wig Request"
                    loading={isSavingRequest}
                    onPress={onSubmitRequest}
                    leading={<AppIcon name="requests" state="inverse" />}
                  />

                  {hasGeneratedPreview && generatedImageUri ? (
                    <AppButton
                      title="Save Wig Image"
                      variant="secondary"
                      onPress={onDownloadSelected}
                      leading={<AppIcon name="save" state="active" />}
                    />
                  ) : null}

                  <AppButton
                    title={hasGeneratedPreview ? 'Regenerate' : 'Generate AI Preview'}
                    variant="secondary"
                    loading={isGeneratingPreview}
                    onPress={onRegenerate}
                    leading={<AppIcon name="sparkle" state="active" />}
                  />
                </View>
              ) : null}

              {step === 'waiting' ? (
                <View style={styles.waitingState}>
                  <AppIcon name="success" state="active" size="xl" />
                  <Text style={styles.flowTitle}>Request submitted</Text>
                  <Text style={styles.flowBody}>Waiting for organization review.</Text>
                  <AppButton
                    title="View Timeline"
                    onPress={onViewTimeline}
                    leading={<AppIcon name="updates" state="inverse" />}
                  />
                </View>
              ) : null}
            </ScrollView>
          </AppCard>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PatientWigRequestScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [isFlowOpen, setIsFlowOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [flowStep, setFlowStep] = useState('patient');
  const { user, profile, patientProfile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'patient', userId: user?.id, databaseUserId: profile?.user_id });
  const {
    tracker,
    trackingError,
    isLoadingTracking,
    isRefreshingTracking,
    refreshTracking,
  } = useProcessTracking({ role: 'patient', userId: user?.id, databaseUserId: profile?.user_id });
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
    clearPreview,
    generatePreview,
    saveRequest,
  } = usePatientWigRequest({ userId: user?.id });

  const {
    control,
    handleSubmit,
    setError: setFormError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(wigRequestSchema),
    mode: 'onBlur',
    defaultValues: wigRequestDefaultValues,
  });

  const draftValues = useWatch({ control });
  const firstName = (profile?.first_name || '').trim();
  const lastName = (profile?.last_name || '').trim();
  const avatarUri = profile?.avatar_url || profile?.photo_path || patientProfile?.patient_picture || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();
  const patientFullName = [profile?.first_name, profile?.middle_name, profile?.last_name, profile?.suffix]
    .filter(Boolean)
    .join(' ')
    .trim();
  const patientCode = patientProfile?.patient_code || '';
  const hospitalName = patientProfile?.hospital_name || patientProfile?.hospital?.hospital_name || '';
  const medicalCondition = patientProfile?.medical_condition || '';
  const hasCameraPermission = Boolean(cameraPermission?.granted);
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
  const recommendationSummary = selectedOption?.summary
    || selectedOption?.note
    || preview?.summary
    || latestWigRequest?.notes
    || 'Your suggested wig recommendation will appear here after the front photo is processed.';
  const preferredColor = latestWigSpecification?.preferred_color || draftValues?.preferredColor || '';
  const preferredLength = latestWigSpecification?.preferred_length || draftValues?.preferredLength || '';
  const generatedImageUri = selectedOption?.generatedImageUri || preview?.generated_image_data_url || latestWigSpecification?.ai_wig_preview_url || '';
  const hasGeneratedPreview = Boolean(preview);

  useEffect(() => {
    setSelectedOptionId(recommendationOptions[0]?.id || '');
  }, [latestWigSpecification?.ai_wig_preview_url, preview?.generated_image_data_url, recommendationOptions]);

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
    const result = await generatePreview(values);

    if (result?.success) {
      closeCaptureFlow();
      setIsFlowOpen(true);
      setFlowStep('summary');
    }

    return result;
  });

  const handleSaveRequest = handleSubmit(async (values) => {
    if (!values.acceptedTerms) {
      setFormError('acceptedTerms', {
        type: 'manual',
        message: 'Please accept the request agreement first.',
      });
      return { success: false, error: 'Please accept the request agreement first.' };
    }

    const result = await saveRequest(values, selectedOptionId);

    if (result?.success) {
      await refreshTracking();
      setFlowStep('waiting');
      setIsTimelineOpen(true);
    }

    return result;
  });

  const handleSkipPreview = handleSubmit(async () => {
    clearPreview();
    setFlowStep('summary');
    return { success: true };
  });

  const openRequestFlow = () => {
    setFlowStep('patient');
    setIsFlowOpen(true);
    setIsTimelineOpen(false);
  };

  const closeRequestFlow = () => {
    setIsFlowOpen(false);
    setFlowStep('patient');
  };

  const handleContinueToDetails = handleSubmit(async (values) => {
    if (!values.acceptedTerms) {
      setFormError('acceptedTerms', {
        type: 'manual',
        message: 'Please accept the patient record consent first.',
      });
      return { success: false, error: 'Please accept the patient record consent first.' };
    }

    setFlowStep('details');
    return { success: true };
  });

  const handleDownloadSelectedImage = async () => {
    if (!generatedImageUri) return;

    try {
      let shareUri = generatedImageUri;
      if (generatedImageUri.startsWith('data:image/')) {
        const extension = generatedImageUri.includes('image/png') ? 'png' : 'jpg';
        const base64 = generatedImageUri.split(',')[1] || '';
        shareUri = `${FileSystem.cacheDirectory}wig-preview-${Date.now()}.${extension}`;
        await FileSystem.writeAsStringAsync(shareUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else if (/^https?:\/\//i.test(generatedImageUri)) {
        const extension = generatedImageUri.toLowerCase().includes('.png') ? 'png' : 'jpg';
        const downloadResult = await FileSystem.downloadAsync(
          generatedImageUri,
          `${FileSystem.cacheDirectory}wig-preview-${Date.now()}.${extension}`
        );
        shareUri = downloadResult.uri;
      }

      // Try to save to gallery, but don't block if it fails
      // (Android Expo media library may request AUDIO permission which isn't needed for images)
      try {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (permission.granted) {
          await MediaLibrary.createAssetAsync(shareUri);
          return;
        }
      } catch (mediaLibraryError) {
        // MediaLibrary may fail on some Android versions due to permission issues
        // This is not critical - fall through to sharing instead
        logAppError('patientWigRequest.downloadSelectedImage.gallery', mediaLibraryError, {
          userId: user?.id,
          note: 'Gallery save failed, attempting share instead',
        });
      }

      // Fallback to sharing (works on all platforms)
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(shareUri, {
          mimeType: generatedImageUri.includes('image/png') ? 'image/png' : 'image/jpeg',
          dialogTitle: 'Save wig preview',
        });
      }
    } catch (downloadError) {
      logAppError('patientWigRequest.downloadSelectedImage', downloadError, { userId: user?.id });
    }
  };

  const handleStartPreview = async () => {
    await openCaptureFlow();
  };

  const handleUsePhotoFromCapture = () => {
    closeCaptureFlow();
    setIsFlowOpen(true);
    setFlowStep('details');
  };

  const hasOtherPreference = [
    draftValues?.preferredColor,
    draftValues?.stylePreference,
  ].some((value) => String(value || '').toLowerCase() === 'other');

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="requests"
      navVariant="patient"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title="Requests"
          subtitle=""
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={avatarUri}
          variant="patient"
          minimal={true}
          showAvatar={true}
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

      {hasSubmittedRequest ? (
        <AppCard variant="patientTint" radius="xl" padding="lg" style={styles.intakeCard}>
          <Text style={styles.intakeEyebrow}>Current request</Text>
          <Text style={styles.intakeTitle}>{latestWigRequest?.status || 'Pending review'}</Text>
          <Text style={styles.intakeBody}>
            Your wig request is active. New submissions are disabled until this request is closed.
          </Text>
          <View style={styles.actionRow}>
            <AppButton
              title={isTimelineOpen ? 'Hide Timeline' : 'View Timeline'}
              onPress={() => setIsTimelineOpen((current) => !current)}
              leading={<AppIcon name="updates" state="inverse" />}
              fullWidth={false}
              style={styles.actionButton}
            />
            <AppButton
              title="Refresh"
              variant="secondary"
              onPress={refreshTracking}
              loading={isRefreshingTracking}
              fullWidth={false}
              style={styles.actionButton}
            />
          </View>
        </AppCard>
      ) : (
        <AppCard variant="patientTint" radius="xl" padding="lg" style={styles.intakeCard}>
          <Text style={styles.intakeEyebrow}>Patient wig request</Text>
          <Text style={styles.intakeTitle}>Request a wig</Text>
          <Text style={styles.intakeBody}>
            Start a guided request. You will choose preferences, add a front photo, and review an AI reference before submitting.
          </Text>
          <AppButton
            title="Request Wig"
            onPress={openRequestFlow}
            leading={<AppIcon name="requests" state="inverse" />}
          />
        </AppCard>
      )}

      {hasSubmittedRequest && isTimelineOpen ? (
        <ProcessStatusTracker
          role="patient"
          tracker={tracker}
          error={trackingError}
          isLoading={isLoadingTracking}
          isRefreshing={isRefreshingTracking}
          onRefresh={refreshTracking}
        />
      ) : null}

      <RequestFlowModal
        visible={isFlowOpen}
        step={flowStep}
        control={control}
        errors={errors}
        patientName={patientFullName}
        patientCode={patientCode}
        hospitalName={hospitalName}
        medicalCondition={medicalCondition}
        referenceImage={referenceImage}
        hasOtherPreference={hasOtherPreference}
        recommendationOptions={recommendationOptions}
        selectedOptionId={selectedOptionId}
        onSelectOption={setSelectedOptionId}
        recommendationTitle={recommendationTitle}
        recommendationFamily={recommendationFamily}
        recommendationSummary={recommendationSummary}
        preferredColor={preferredColor}
        preferredLength={preferredLength}
        generatedImageUri={generatedImageUri}
        hasGeneratedPreview={hasGeneratedPreview}
        isPickingReference={isPickingReference}
        isGeneratingPreview={isGeneratingPreview}
        isSavingRequest={isSavingRequest}
        onClose={closeRequestFlow}
        onBackToPatient={() => setFlowStep('patient')}
        onContinueToDetails={handleContinueToDetails}
        onUploadPhoto={pickReferenceImage}
        onOpenCamera={handleStartPreview}
        onGeneratePreview={handleGeneratePreviewFromModal}
        onSkipPreview={handleSkipPreview}
        onRegenerate={handleGeneratePreviewFromModal}
        onDownloadSelected={handleDownloadSelectedImage}
        onSubmitRequest={handleSaveRequest}
        onViewTimeline={() => {
          setIsFlowOpen(false);
          setIsTimelineOpen(true);
        }}
      />

      <CaptureModal
        visible={isCaptureOpen}
        referenceImage={referenceImage}
        hasCameraPermission={hasCameraPermission}
        cameraRef={cameraRef}
        onCameraReady={() => {}}
        isCapturingPhoto={isCapturingPhoto}
        isPickingReference={isPickingReference}
        onClose={closeCaptureFlow}
        onUpload={pickReferenceImage}
        onCapture={handleCapturePhoto}
        onGeneratePreview={handleUsePhotoFromCapture}
        onRequestPermission={requestCameraPermission}
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
  previewGrid: {
    gap: theme.spacing.sm,
  },
  previewRow: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderMuted,
  },
  previewLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  previewValue: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  choiceGroup: {
    gap: theme.spacing.xs,
  },
  choiceTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  choiceChip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.backgroundPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  choiceChipSelected: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.surfaceSoft,
  },
  choiceChipPressed: {
    opacity: 0.82,
  },
  choiceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  choiceTextSelected: {
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  checkBoxActive: {
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
  },
  agreementText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  fieldError: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textError,
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
  flowKeyboardWrap: {
    flex: 1,
  },
  flowCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
    maxHeight: '86%',
  },
  flowScroll: {
    flexGrow: 0,
  },
  flowScrollContent: {
    gap: theme.spacing.md,
  },
  flowSection: {
    gap: theme.spacing.md,
  },
  flowTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  flowBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  photoPreviewBox: {
    minHeight: 220,
    borderRadius: theme.radius.xl,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  photoPreviewImage: {
    width: '100%',
    height: 260,
  },
  photoPlaceholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  summaryNoteCard: {
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundPrimary,
    borderColor: theme.colors.borderMuted,
  },
  summaryNoteTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  waitingState: {
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
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
