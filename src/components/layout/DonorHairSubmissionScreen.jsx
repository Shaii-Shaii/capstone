import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { DashboardLayout } from './DashboardLayout';
import { AppCard } from '../ui/AppCard';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppInput } from '../ui/AppInput';
import { StatusBanner } from '../ui/StatusBanner';
import { DonorTopBar } from '../donor/DonorTopBar';
import { HairLogDetailModal } from '../hair/HairLogDetailModal';
import { resolveBrandLogoSource, theme } from '../../design-system/theme';
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
import { buildProfileCompletionMeta } from '../../features/profile/services/profile.service';
import { logAppEvent } from '../../utils/appErrors';

let NativeVisionCamera = null;
let NativeFaceCamera = null;
let useNativeCameraDevice = null;
let useNativeFrameProcessor = null;
let useNativeFaceDetector = null;
let NativeWorklets = null;
let nativeVisionCameraLoadError = '';
let nativeFaceCameraLoadError = '';
const isExpoGoRuntime = Constants?.appOwnership === 'expo';

try {
  if (Platform.OS !== 'web' && !isExpoGoRuntime) {
    const visionCameraModule = require('react-native-vision-camera');
    NativeVisionCamera = visionCameraModule?.Camera || null;
    useNativeCameraDevice = visionCameraModule?.useCameraDevice || null;
    useNativeFrameProcessor = visionCameraModule?.useFrameProcessor || null;
  }
} catch (_nativeCameraError) {
  NativeVisionCamera = null;
  useNativeCameraDevice = null;
  useNativeFrameProcessor = null;
  nativeVisionCameraLoadError = _nativeCameraError?.message || 'Vision Camera module could not be loaded.';
}

try {
  if (Platform.OS !== 'web' && !isExpoGoRuntime) {
    const faceDetectorModule = require('react-native-vision-camera-face-detector');
    NativeFaceCamera = faceDetectorModule?.Camera || null;
    useNativeFaceDetector = faceDetectorModule?.useFaceDetector || null;
  }
} catch (error) {
  NativeFaceCamera = null;
  useNativeFaceDetector = null;
  nativeFaceCameraLoadError = error?.message || 'Face detector module could not be loaded.';
}

if (!NativeFaceCamera && Platform.OS !== 'web' && !isExpoGoRuntime) {
  try {
    const faceDetectorCameraModule = require('react-native-vision-camera-face-detector/lib/commonjs/Camera');
    NativeFaceCamera = faceDetectorCameraModule?.Camera || null;
    nativeFaceCameraLoadError = '';
  } catch (error) {
    nativeFaceCameraLoadError = nativeFaceCameraLoadError || error?.message || 'Face detector camera wrapper could not be loaded.';
  }
}

try {
  if (Platform.OS !== 'web' && !isExpoGoRuntime) {
    const workletsModule = require('react-native-worklets-core');
    NativeWorklets = workletsModule?.Worklets || null;
  }
} catch (error) {
  NativeWorklets = null;
  nativeFaceCameraLoadError = nativeFaceCameraLoadError || error?.message || 'Worklets Core module could not be loaded.';
}

const PHOTO_GUIDELINE_ITEMS = [
  'Use bright, even lighting so color, shine, dryness, and frizz are visible.',
  'Keep only one person in the frame with a plain background.',
  'Remove eyeglasses, sunglasses, masks, caps, headbands, clips, pins, hair ties, scarves, headphones, and anything covering the face or hair.',
  'Capture the required front view, one side profile, and a close-up of the hair ends.',
  'Keep hair loose, centered, and visible from root or hairline to the lowest visible ends.',
];

const PHOTO_CAPTURE_TARGETS = [
  'Front view photo',
  'Side profile photo',
  'Hair ends close-up',
];

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

void formatScheduleDateLabel;

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

const isSideProfileView = (view = {}) => String(view?.key || view?.label || '').toLowerCase().includes('side');
const isHairEndsView = (view = {}) => String(view?.key || view?.label || '').toLowerCase().includes('ends');

const getInitialLiveFaceStatus = (view = null) => ({
  valid: isHairEndsView(view),
  faceCount: 0,
  message: isHairEndsView(view)
    ? 'Frame the lowest hair ends closely. Remove ties, clips, glasses, and anything covering the face or strands.'
    : isSideProfileView(view)
      ? 'Turn to one side so your side profile and hair length are visible.'
      : 'Face the camera directly and keep your hair fully visible.',
  tone: 'info',
});

const resolveLiveFaceStatus = (faces = [], view = null) => {
  const faceList = Array.isArray(faces) ? faces : [];
  const expectsSideProfile = isSideProfileView(view);
  const expectsHairEnds = isHairEndsView(view);

  if (!faceList.length) {
    if (expectsHairEnds) {
      return {
        valid: true,
        faceCount: 0,
        message: 'Hair ends close-up ready. Keep the ends sharp, well lit, and free from accessories.',
        tone: 'success',
      };
    }

    return {
      valid: false,
      faceCount: 0,
      message: expectsSideProfile
        ? 'No side profile detected. Turn to one side and keep your hair visible.'
        : 'No person detected. Center your face and hair.',
      tone: 'error',
    };
  }

  if (faceList.length > 1) {
    return {
      valid: false,
      faceCount: faceList.length,
      message: 'Multiple subjects detected. Only one person is allowed.',
      tone: 'error',
    };
  }

  const face = faceList[0] || {};
  const bounds = face.bounds || {};
  const width = Number(bounds.width || 0);
  const height = Number(bounds.height || 0);
  const rollAngle = Math.abs(Number(face.rollAngle || 0));
  const yawAngle = Math.abs(Number(face.yawAngle || 0));

  if (width < 90 || height < 90) {
    return {
      valid: false,
      faceCount: 1,
      message: expectsHairEnds
        ? 'Move closer to the hair ends so the strands are sharp and visible.'
        : expectsSideProfile
          ? 'Move closer so your side profile and hair length are clearly visible.'
          : 'Move closer so your face and hair are clearly visible.',
      tone: 'warning',
    };
  }

  if (rollAngle > 24) {
    return {
      valid: false,
      faceCount: 1,
      message: 'Keep your head steady and upright for a clearer hair analysis photo.',
      tone: 'warning',
    };
  }

  if (expectsSideProfile) {
    if (yawAngle < 18) {
      return {
        valid: false,
        faceCount: 1,
        message: 'Turn your head to one side. This required view should show your side profile and hair length.',
        tone: 'warning',
      };
    }

    return {
      valid: true,
      faceCount: 1,
      message: 'Side profile detected. Keep hair length and ends visible with no glasses, clips, or headbands.',
      tone: 'success',
    };
  }

  if (!expectsHairEnds && yawAngle > 34) {
    return {
      valid: false,
      faceCount: 1,
      message: 'Face the camera directly for the front view. Use the next view for your side profile.',
      tone: 'warning',
    };
  }

  return {
    valid: true,
    faceCount: 1,
    message: expectsHairEnds
      ? 'Hair ends close-up ready. Keep the ends sharp, well lit, and uncovered.'
      : 'Front view detected. Keep your face and hair centered, with glasses and accessories removed.',
    tone: 'success',
  };
};

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
  if (analysis?.invalid_image_reason) reasons.push(analysis.invalid_image_reason);
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

function LiveHairCameraPanel({
  currentView,
  currentPhoto,
  photoIndex,
  photos,
  requiredViews,
  completedPhotoCount,
  hasCameraPermission,
  cameraRef,
  liveFaceStatus,
  canUseNativeLiveCamera,
  liveFrameBrightness,
  liveNoAccessories,
  isCapturing,
  isUploading,
  isAnalyzing,
  cameraError,
  onCapture,
  onUpload,
  onRemove,
  onSelectView,
  onRequestPermission,
  onFacesChange,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const cameraStageHeight = Math.min(Math.max(windowHeight * 0.46, 340), 440);
  const statusToneStyle = liveFaceStatus?.valid
    ? styles.liveStatusPillSuccess
    : liveFaceStatus?.tone === 'error'
      ? styles.liveStatusPillError
      : styles.liveStatusPillWarning;
  const scannerMessage = canUseNativeLiveCamera
    ? liveFaceStatus?.message || 'Scanning face and hair visibility.'
    : isExpoGoRuntime
      ? 'Camera preview is active. Live face detection requires the development build, not Expo Go.'
    : nativeVisionCameraLoadError
      ? `Vision Camera did not load: ${nativeVisionCameraLoadError}`
    : nativeFaceCameraLoadError
      ? `Live face detection did not load: ${nativeFaceCameraLoadError}`
      : 'Live face detection needs the rebuilt native app.';
  const scannerTitle = canUseNativeLiveCamera
    ? (liveFaceStatus?.valid ? 'Ready to scan' : isSideProfileView(currentView) ? 'Checking profile' : 'Live analysis')
    : isExpoGoRuntime ? 'Camera preview' : 'Native scanner not active';
  const scannerIconState = canUseNativeLiveCamera
    ? (liveFaceStatus?.valid ? 'success' : 'warning')
    : 'danger';
  const resolvedScannerIconState = scannerIconState === 'warning' ? 'active' : scannerIconState;
  const liveStatusDotStyle = liveFaceStatus?.valid
    ? styles.liveStatusDotValid
    : liveFaceStatus?.tone === 'error' || !canUseNativeLiveCamera
      ? styles.liveStatusDotError
      : styles.liveStatusDotActive;
  const angleChecklistLabel = isSideProfileView(currentView)
    ? 'Side profile'
    : isHairEndsView(currentView)
      ? 'Ends visible'
      : 'Front view';
  const isBrightEnough = canUseNativeLiveCamera && liveFrameBrightness >= 100;
  const liveChecklistItems = [
    { label: 'Bright light', checked: isBrightEnough },
    { label: angleChecklistLabel, checked: Boolean(liveFaceStatus?.valid && canUseNativeLiveCamera) },
    { label: 'No accessories', checked: Boolean(liveNoAccessories && canUseNativeLiveCamera) },
  ];

  return (
    <View style={styles.liveCameraPanel}>
      <View style={[styles.liveCameraStage, { height: cameraStageHeight }]}>
        {hasCameraPermission ? (
          canUseNativeLiveCamera ? (
            <NativeLiveFaceCamera
              cameraRef={cameraRef}
              isActive
              onFacesChange={onFacesChange}
            />
          ) : (
            <CameraView
              ref={cameraRef}
              style={styles.liveCameraPreview}
              facing="front"
              mode="picture"
              animateShutter
            />
          )
        ) : currentPhoto?.uri ? (
          <Image source={{ uri: currentPhoto.uri }} style={styles.liveCameraPreview} resizeMode="cover" />
        ) : (
          <View style={styles.liveCameraPermission}>
            <AppIcon name="camera" size="xl" state="active" />
            <Text style={styles.liveCameraPermissionTitle}>Camera access needed</Text>
            <Text style={styles.liveCameraPermissionBody}>Allow camera access for live hair scanning, or upload this required view.</Text>
          </View>
        )}

        <View style={styles.liveCameraTopBar}>
          <View style={[styles.liveStatusPill, statusToneStyle]}>
            <View style={[styles.liveStatusDot, liveStatusDotStyle, isAnalyzing ? styles.liveStatusDotActive : null]} />
            <Text style={styles.liveStatusText}>{isAnalyzing ? 'AI analyzing' : scannerTitle}</Text>
          </View>
          <Text style={styles.liveCounterText}>{completedPhotoCount}/{requiredViews.length}</Text>
        </View>

        <View style={styles.liveAnalysisToast}>
          <AppIcon name={liveFaceStatus?.valid ? 'check-circle-outline' : 'alert-circle-outline'} size="sm" state={resolvedScannerIconState} />
          <Text style={styles.liveAnalysisToastText}>{scannerMessage}</Text>
        </View>

        <View style={styles.liveFrameGuide} pointerEvents="none">
          <View style={styles.liveFrameCornerTopLeft} />
          <View style={styles.liveFrameCornerTopRight} />
          <View style={styles.liveFrameCornerBottomLeft} />
          <View style={styles.liveFrameCornerBottomRight} />
        </View>

      </View>

      <View style={styles.liveCameraBottomSheet}>
        <Text style={styles.liveStepLabel}>Required view {photoIndex + 1} of {requiredViews.length}</Text>
        <Text style={styles.liveCameraTitle}>{currentView?.label || 'Hair photo'}</Text>
        <Text style={styles.liveCameraBody}>{currentView?.helperText || 'Keep your hair centered with one person in frame and remove anything covering it.'}</Text>

        <View style={styles.liveChecklist}>
          {liveChecklistItems.map((item) => (
            <View key={item.label} style={styles.liveChecklistItem}>
              <AppIcon
                name={item.checked ? 'check-circle-outline' : 'circle-outline'}
                size="sm"
                state={item.checked ? 'success' : 'muted'}
              />
              <Text style={styles.liveChecklistText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {cameraError ? <Text style={styles.questionError}>{cameraError}</Text> : null}

        <View style={styles.liveActionRow}>
          <AppButton
            title={hasCameraPermission ? (isCapturing ? 'Scanning...' : 'Scan this view') : 'Allow camera'}
            fullWidth={false}
            leading={<AppIcon name={hasCameraPermission ? 'checkHair' : 'camera'} size="md" state="inverse" />}
            onPress={hasCameraPermission ? onCapture : onRequestPermission}
            loading={isCapturing}
            disabled={isCapturing || isUploading || isAnalyzing || (canUseNativeLiveCamera && !liveFaceStatus?.valid)}
            style={styles.livePrimaryAction}
          />
          <AppButton
            title="Upload"
            variant="outline"
            fullWidth={false}
            leading={<AppIcon name="upload" size="md" state="active" />}
            onPress={onUpload}
            loading={isUploading}
            disabled={isCapturing || isUploading || isAnalyzing}
            style={styles.liveSecondaryAction}
          />
          {currentPhoto ? (
            <AppButton
              title="Remove"
              variant="ghost"
              fullWidth={false}
              leading={<AppIcon name="close" size="sm" state="danger" />}
              onPress={onRemove}
              disabled={isCapturing || isUploading || isAnalyzing}
              style={styles.liveRemoveAction}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.liveThumbRail}>
        {requiredViews.map((view, index) => (
          <Pressable
            key={view.key}
            onPress={() => onSelectView(index)}
            style={[
              styles.liveThumbItem,
              photoIndex === index ? styles.liveThumbItemActive : null,
              photos[index] ? styles.liveThumbItemDone : null,
            ]}
          >
            {photos[index]?.uri ? (
              <Image source={{ uri: photos[index].uri }} style={styles.liveThumbImage} resizeMode="cover" />
            ) : (
              <AppIcon name="camera" size="sm" state={photoIndex === index ? 'active' : 'muted'} />
            )}
            <Text style={[styles.liveThumbLabel, photoIndex === index ? styles.liveThumbLabelActive : null]} numberOfLines={1}>
              {index + 1}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function NativeLiveFaceCamera({ cameraRef, isActive, onFacesChange }) {
  const device = useNativeCameraDevice('front');
  const faceDetectionOptions = React.useMemo(() => ({
    performanceMode: 'fast',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'all',
    minFaceSize: 0.18,
    trackingEnabled: true,
    cameraFacing: 'front',
  }), []);
  const { detectFaces, stopListeners } = useNativeFaceDetector(faceDetectionOptions);
  const handleFacesOnJs = React.useMemo(
    () => NativeWorklets.createRunOnJS((faces = [], brightness = -1) => {
      onFacesChange?.(faces, brightness);
    }),
    [onFacesChange]
  );
  const frameProcessor = useNativeFrameProcessor((frame) => {
    'worklet';
    const faces = detectFaces(frame);
    let avgBrightness = -1;
    try {
      if (typeof frame.toArrayBuffer === 'function') {
        const buffer = frame.toArrayBuffer();
        const bytes = new Uint8Array(buffer);
        const sampleEnd = Math.min(frame.width * frame.height, bytes.length);
        const step = Math.max(1, Math.floor(sampleEnd / 250));
        let sum = 0;
        let count = 0;
        for (let i = 0; i < sampleEnd; i += step) {
          sum += bytes[i];
          count++;
        }
        avgBrightness = count > 0 ? Math.round(sum / count) : -1;
      }
    } catch (_e) {
      avgBrightness = -1;
    }
    handleFacesOnJs(faces, avgBrightness);
  }, [detectFaces, handleFacesOnJs]);

  React.useEffect(() => (
    () => {
      stopListeners?.();
    }
  ), [stopListeners]);

  if (!NativeVisionCamera || !device) {
    return (
      <View style={styles.liveCameraPermission}>
        <AppIcon name="camera" size="xl" state="active" />
        <Text style={styles.liveCameraPermissionTitle}>Live scanner starting</Text>
        <Text style={styles.liveCameraPermissionBody}>Camera device is not ready yet. You can still upload a photo for this view.</Text>
      </View>
    );
  }

  return (
    <NativeVisionCamera
      ref={cameraRef}
      style={styles.liveCameraPreview}
      device={device}
      isActive={isActive}
      photo
      frameProcessor={frameProcessor}
      pixelFormat="yuv"
    />
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

function AnalysisLevelRow({ label, value, positive = false }) {
  const level = Math.max(1, Math.min(10, Math.round(Number(value) || 1)));
  return (
    <View style={styles.analysisLevelRow}>
      <Text style={styles.analysisLevelLabel}>{label}</Text>
      <View style={styles.analysisLevelTrack}>
        <View
          style={[
            styles.analysisLevelFill,
            positive ? styles.analysisLevelFillPositive : null,
            { width: `${level * 10}%` },
          ]}
        />
      </View>
      <Text style={styles.analysisLevelValue}>{level}</Text>
    </View>
  );
}

function AnalysisLoadingSplash({ resolvedTheme }) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    <View style={styles.analysisSplash}>
      <View style={styles.analysisSplashLogoWrap}>
        <Image
          source={logoSource}
          style={styles.analysisSplashLogo}
          resizeMode="contain"
          onError={() => setImageFailed(true)}
        />
        <ActivityIndicator
          color={resolvedTheme?.primaryColor || theme.colors.brandPrimary}
          size="large"
          style={styles.analysisSplashProgress}
        />
      </View>
      <Text style={styles.analysisSplashTitle}>Analyzing Hair</Text>
      <Text style={styles.analysisSplashText}>Checking photos and previous log.</Text>
    </View>
  );
}

function ProfileSetupGate({ completionMeta, onManageProfile }) {
  return (
    <Pressable onPress={onManageProfile} style={({ pressed }) => [styles.profileGateCard, pressed ? styles.interactivePressed : null]}>
      <View style={styles.profileGateTop}>
        <View style={styles.profileGateIcon}>
          <AppIcon name="shield-check-outline" size="lg" state="active" />
        </View>
        <View style={styles.profileGateCopy}>
          <Text style={styles.profileGateTitle}>Finish Setting Up Your Account</Text>
          <Text style={styles.profileGateBody}>{completionMeta?.percentage || 0}% complete</Text>
        </View>
        <AppIcon name="chevronRight" size="md" state="muted" />
      </View>
    </Pressable>
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

const buildWeekDays = (anchorDate = new Date()) => {
  const start = new Date(anchorDate);
  start.setDate(anchorDate.getDate() - anchorDate.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
};

const normalizeConditionTone = (condition = '') => {
  const normalized = String(condition || '').trim().toLowerCase();

  if (normalized.includes('healthy') || normalized.includes('good')) {
    return { dotColor: '#54b86f', label: 'Healthy', emoji: '😊' };
  }

  if (normalized.includes('dry') || normalized.includes('damaged')) {
    return { dotColor: '#f0a856', label: 'Needs care', emoji: normalized.includes('damaged') ? '😟' : '😐' };
  }

  if (normalized.includes('treated') || normalized.includes('rebonded') || normalized.includes('colored')) {
    return { dotColor: '#7a8ae6', label: 'Treated', emoji: '🙂' };
  }

  return {
    dotColor: theme.colors.brandPrimary,
    label: condition || 'Checked',
    emoji: condition ? '😌' : '🙂',
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

const buildRetryCountdownMessage = (errorState, secondsRemaining) => {
  if (!errorState) return '';
  if (!Number.isFinite(secondsRemaining) || secondsRemaining <= 0) {
    const normalizedMessage = String(errorState.message || '');
    if (/retry\s+in\s+\d+(?:\.\d+)?\s*seconds?/i.test(normalizedMessage)) {
      return 'Cannot analyze hair right now. Please try again.';
    }
    return normalizedMessage || 'Cannot analyze hair right now. Please try again later.';
  }

  return `Cannot analyze hair, please try again in ${secondsRemaining} seconds.`;
};

function HairConditionLogCard({ submissions, onOpenAnalyzer, onSelectDate, trendLabel = '' }) {
  const history = useMemo(() => buildHairConditionHistory(submissions), [submissions]);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [calendarMode, setCalendarMode] = useState('week');
  const [pressedDateKey, setPressedDateKey] = useState('');
  const calendarDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const weekDays = useMemo(() => buildWeekDays(new Date()), []);
  const visibleDays = calendarMode === 'week' ? weekDays : calendarDays;
  const hasHistory = history.markers.size > 0;
  const latestTone = normalizeConditionTone(history.latestScreening?.detected_condition);
  const latestLengthLabel = history.latestScreening?.estimated_length
    ? formatLengthLabel(history.latestScreening.estimated_length)
    : '';
  const latestSummary = history.latestScreening?.summary || 'No summary yet.';
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
      <Pressable onPress={onOpenAnalyzer} style={({ pressed }) => [styles.emptyCalendarState, pressed ? styles.interactivePressed : null]}>
        <View style={styles.emptyCalendarIcon}>
          <AppIcon name="checkHair" size="lg" state="active" />
        </View>
        <View style={styles.emptyCalendarCopy}>
          <Text style={styles.emptyCalendarTitle}>Start Hair Check</Text>
          <Text style={styles.emptyCalendarBody}>No logs yet.</Text>
        </View>
        <AppIcon name="chevronRight" size="md" state="muted" />
      </Pressable>
    );
  }

  return (
    <View style={styles.calendarWidget}>
      <View style={styles.calendarLeadCard}>
        <Text style={styles.calendarEmotion}>{latestTone.emoji}</Text>
        <View style={styles.calendarLeadCopy}>
          <Text style={styles.calendarLeadTitle}>{latestTone.label}</Text>
          <Text style={styles.calendarLeadBody} numberOfLines={1}>
            {latestSummary}
          </Text>
        </View>
        <View style={styles.calendarLeadMeta}>
          <Text style={styles.calendarLeadMetaValue}>{formatCalendarDayLabel(history.latestScreening?.created_at)}</Text>
        </View>
      </View>

      <View style={styles.calendarHeaderRow}>
        <View style={styles.calendarHeaderCopy}>
          <Text style={styles.calendarMonthLabel}>
            {calendarMode === 'week' ? 'This week' : formatCalendarMonthLabel(visibleMonth)}
          </Text>
          <Text style={styles.calendarSummaryText}>{history.screenings.length} checks logged</Text>
        </View>

        <View style={styles.calendarModeSwitch}>
          {['week', 'month'].map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setCalendarMode(mode)}
              style={[styles.calendarModeButton, calendarMode === mode ? styles.calendarModeButtonActive : null]}
            >
              <Text style={[styles.calendarModeText, calendarMode === mode ? styles.calendarModeTextActive : null]}>
                {mode === 'week' ? 'Week' : 'Month'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {calendarMode === 'month' ? (
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
      ) : null}

      <View style={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={[styles.calendarGrid, calendarMode === 'week' ? styles.calendarGridWeek : null]}>
        {visibleDays.map((day) => {
          const key = toLocalDateKey(day); // local calendar date — avoids UTC midnight shift
          const dateEntries = history.markers.get(key) || [];
          const screening = dateEntries[0]?.screening || null;
          const tone = normalizeConditionTone(screening?.detected_condition);
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          const isPressed = pressedDateKey === key;

          return (
            <Pressable
              key={key}
              disabled={!dateEntries.length}
              onPressIn={() => setPressedDateKey(key)}
              onPressOut={() => setPressedDateKey('')}
              onPress={() => {
                if (dateEntries.length) onSelectDate?.(key, dateEntries);
              }}
              style={[
                styles.calendarCell,
                calendarMode === 'week' ? styles.calendarCellWeek : null,
                screening ? styles.calendarCellActive : null,
                key === latestDateKey ? styles.calendarCellLatest : null,
                calendarMode === 'month' && !isCurrentMonth ? styles.calendarCellMuted : null,
                isPressed ? styles.interactivePressed : null,
              ]}
            >
              <Text style={styles.calendarCellEmoji}>{screening ? tone.emoji : ''}</Text>
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

      <View style={styles.calendarQuickStats}>
        <Text style={styles.calendarQuickStat}>{latestLengthLabel || latestTone.label}</Text>
        {trendLabel ? <Text style={styles.calendarQuickStat}>{trendLabel}</Text> : null}
      </View>
    </View>
  );
}

export function DonorHairSubmissionScreen() {
  const router = useRouter();
  const cameraRef = useRef(null);
  const lastTransientErrorKeyRef = useRef('');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isAnalyzerActive, setIsAnalyzerActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [cameraModalError, setCameraModalError] = useState('');
  const [nativeCameraPermission, setNativeCameraPermission] = useState('not-determined');
  const [liveFaceStatus, setLiveFaceStatus] = useState(getInitialLiveFaceStatus);
  const [liveFrameBrightness, setLiveFrameBrightness] = useState(-1);
  const [liveNoAccessories, setLiveNoAccessories] = useState(false);
  const lastLiveFaceStatusKeyRef = useRef('');
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const [selectedHistoryEntries, setSelectedHistoryEntries] = useState([]);
  const [resultConfirmationMode, setResultConfirmationMode] = useState('pending');
  const [retryCountdownSeconds, setRetryCountdownSeconds] = useState(0);
  const [transientErrorNotice, setTransientErrorNotice] = useState(null);
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
    savePhotoAssetForSlot,
    removePhoto,
    analyzePhotos,
    submitSubmission,
    clearAnalysisError,
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
  const donorProfileCompletionMeta = useMemo(() => buildProfileCompletionMeta({
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
  const isDonorProfileComplete = donorProfileCompletionMeta.isComplete;

  useEffect(() => {
    questionForm.setValue('questionnaireMode', questionnaireMode, {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: false,
    });
  }, [questionForm, questionnaireMode]);

  useEffect(() => {
    if (!isDonorProfileComplete && isAnalyzerActive) {
      setIsAnalyzerActive(false);
    }
  }, [isAnalyzerActive, isDonorProfileComplete]);

  useEffect(() => {
    if (!canUseNativeLiveCamera || !NativeVisionCamera?.getCameraPermissionStatus) return;

    let mounted = true;
    Promise.resolve(NativeVisionCamera.getCameraPermissionStatus())
      .then((status) => {
        if (mounted) setNativeCameraPermission(status || 'not-determined');
      })
      .catch(() => {
        if (mounted) setNativeCameraPermission('not-determined');
      });

    return () => {
      mounted = false;
    };
  }, [canUseNativeLiveCamera]);

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
  const canUseNativeLiveCamera = Boolean(
    Platform.OS !== 'web'
    && NativeVisionCamera
    && useNativeCameraDevice
    && useNativeFrameProcessor
    && useNativeFaceDetector
    && NativeWorklets?.createRunOnJS
  );
  const hasCameraPermission = canUseNativeLiveCamera
    ? nativeCameraPermission === 'granted'
    : Boolean(cameraPermission?.granted);

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
  const latestAnalyzedSubmission = useMemo(
    () => analysisHistory.find((submission) => Array.isArray(submission?.ai_screenings) && submission.ai_screenings.length) || null,
    [analysisHistory]
  );
  const latestSavedScreening = latestAnalyzedSubmission?.ai_screenings?.[0] || null;
  const hasSavedAnalysis = Boolean(latestAnalyzedSubmission && latestSavedScreening);
  const latestTrendLabel = useMemo(() => buildHistoryTrendLabel(analysisHistory), [analysisHistory]);
  const isRetryCooldownActive = Boolean(error?.retryUntil && retryCountdownSeconds > 0);
  const countdownErrorMessage = useMemo(
    () => buildRetryCountdownMessage(error, retryCountdownSeconds),
    [error, retryCountdownSeconds]
  );
  const pageErrorState = useMemo(
    () => error ? {
      ...error,
      message: countdownErrorMessage || error.message,
    } : null,
    [countdownErrorMessage, error]
  );

  const runFreshAnalysisAttempt = React.useCallback(async (source, options = {}) => {
    logAppEvent('donor_hair_submission.analysis_retry', 'Retry button tapped for a fresh donor hair analysis attempt.', {
      userId: user?.id || null,
      source,
      previousErrorTitle: error?.title || null,
      previousRetryUntil: error?.retryUntil ?? null,
    });

    clearAnalysisError();
    setTransientErrorNotice(null);
    setRetryCountdownSeconds(0);

    logAppEvent('donor_hair_submission.analysis_retry', 'Stale donor hair analysis state cleared before retry.', {
      userId: user?.id || null,
      source,
      clearedRetryState: true,
    });

    return await analyzePhotos({
      questionnaireAnswers: {
        ...questionForm.getValues(),
        questionnaireMode,
      },
      complianceContext: { acknowledged: Boolean(complianceAcknowledged) },
      historyContext: buildAnalysisHistoryContext(analysisHistory),
      correctedDetails: options.correctedDetails || null,
    });
  }, [
    analysisHistory,
    analyzePhotos,
    clearAnalysisError,
    complianceAcknowledged,
    error?.title,
    questionForm,
    questionnaireMode,
    error?.retryUntil,
    user?.id,
  ]);

  const runFreshAnalysisAttemptRef = useRef(null);
  runFreshAnalysisAttemptRef.current = runFreshAnalysisAttempt;
  const pendingAutoAnalysisRef = useRef(null);

  useEffect(() => {
    if (!pendingAutoAnalysisRef.current) return;
    if (stepIndex !== 3 || completedPhotoCount !== requiredViews.length || analysis || isAnalyzing) return;
    const source = pendingAutoAnalysisRef.current;
    pendingAutoAnalysisRef.current = null;
    runFreshAnalysisAttemptRef.current(source);
  }, [stepIndex, completedPhotoCount, requiredViews.length, analysis, isAnalyzing]);

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

  useEffect(() => {
    if (!error?.retryUntil) {
      setRetryCountdownSeconds(0);
      lastTransientErrorKeyRef.current = '';
      return undefined;
    }

    const activeRetryUntil = Number(error.retryUntil);
    let didClearExpiredState = false;

    logAppEvent('donor_hair_submission.analysis_retry', 'Countdown started for provider retry wait.', {
      userId: user?.id || null,
      retryUntil: activeRetryUntil,
      retryAfterSeconds: error?.retryAfterSeconds ?? null,
    });

    const updateCountdown = () => {
      const remainingSeconds = Math.max(0, Math.ceil((activeRetryUntil - Date.now()) / 1000));
      setRetryCountdownSeconds(remainingSeconds);

      if (remainingSeconds === 0 && !didClearExpiredState) {
        didClearExpiredState = true;
        logAppEvent('donor_hair_submission.analysis_retry', 'Countdown ended. Clearing stale provider error state.', {
          userId: user?.id || null,
          retryUntil: activeRetryUntil,
        });
        clearAnalysisError();
        setTransientErrorNotice(null);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [clearAnalysisError, error?.retryAfterSeconds, error?.retryUntil, user?.id]);

  useEffect(() => {
    if (!error) {
      lastTransientErrorKeyRef.current = '';
      setTransientErrorNotice(null);
      return undefined;
    }

    const transientErrorKey = `${error.title || 'error'}:${error.message || ''}:${error.retryUntil || 'none'}`;
    if (lastTransientErrorKeyRef.current === transientErrorKey) {
      return undefined;
    }

    lastTransientErrorKeyRef.current = transientErrorKey;
    logAppEvent('donor_hair_submission.analysis_retry', 'Transient provider error popup shown.', {
      userId: user?.id || null,
      title: error.title,
      retryUntil: error?.retryUntil ?? null,
    });
    setTransientErrorNotice({
      title: error.title,
      message: error.message,
    });
    return undefined;
  }, [error, user?.id]);

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
  const showFooterPrimaryAction = stepIndex !== 2 && !(stepIndex === 3 && Boolean(analysis));
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

    const result = await runFreshAnalysisAttempt('corrected_details_retry', {
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

  const requestLiveCameraPermission = React.useCallback(async () => {
    if (canUseNativeLiveCamera && NativeVisionCamera?.requestCameraPermission) {
      const status = await NativeVisionCamera.requestCameraPermission();
      setNativeCameraPermission(status || 'denied');
      return status === 'granted';
    }

    const permissionResult = await requestCameraPermission();
    return Boolean(permissionResult?.granted);
  }, [canUseNativeLiveCamera, requestCameraPermission]);

  const handleLiveFacesChange = React.useCallback((faces = [], brightness = -1) => {
    const nextStatus = resolveLiveFaceStatus(faces, currentView);
    const nextKey = `${nextStatus.valid}:${nextStatus.faceCount}:${nextStatus.message}`;
    if (lastLiveFaceStatusKeyRef.current !== nextKey) {
      lastLiveFaceStatusKeyRef.current = nextKey;
      setLiveFaceStatus(nextStatus);
    }
    setLiveFrameBrightness(brightness);
    const face = Array.isArray(faces) ? faces[0] : null;
    const leftEyeProb = Number(face?.leftEyeOpenProbability ?? -1);
    const rightEyeProb = Number(face?.rightEyeOpenProbability ?? -1);
    setLiveNoAccessories(leftEyeProb >= 0.65 && rightEyeProb >= 0.65 && nextStatus.valid);
  }, [currentView]);

  useEffect(() => {
    if (questionIndex > visibleQuestions.length - 1) {
      setQuestionIndex(Math.max(visibleQuestions.length - 1, 0));
    }
  }, [questionIndex, visibleQuestions.length]);

  useEffect(() => {
    if (stepIndex === 2) {
      const initialStatus = getInitialLiveFaceStatus(currentView);
      lastLiveFaceStatusKeyRef.current = '';
      setLiveFaceStatus(initialStatus);
      setLiveFrameBrightness(-1);
      setLiveNoAccessories(false);
    }
  }, [currentView, photoIndex, stepIndex]);

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

  const handleCapturePhoto = async (slotIndex = photoIndex) => {
    if (slotIndex == null) return;

    if (canUseNativeLiveCamera && !liveFaceStatus.valid) {
      setCameraModalError(liveFaceStatus.message || 'Center your face and hair before scanning.');
      return;
    }

    logAppEvent('donor_hair_submission.photo_camera', 'Camera capture requested from donation photo modal.', {
      userId: user?.id || null,
      slotIndex,
      viewKey: requiredViews[slotIndex]?.key || null,
      platform: Platform.OS,
      hasCameraPermission,
    });

    if (!hasCameraPermission) {
      const permissionGranted = await requestLiveCameraPermission();
      logAppEvent('donor_hair_submission.photo_camera', 'Camera permission re-requested before capture.', {
        userId: user?.id || null,
        slotIndex,
        granted: permissionGranted,
      });

      if (!permissionGranted) {
        setCameraModalError('Camera access was not granted. Allow camera access for live scanning, or use Upload instead.');
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
      const rawPhoto = typeof cameraRef.current.takePhoto === 'function'
        ? await cameraRef.current.takePhoto({ flash: 'off' })
        : await cameraRef.current.takePictureAsync({
            quality: 0.8,
            base64: true,
          });
      const photo = rawPhoto?.path
        ? {
            ...rawPhoto,
            uri: rawPhoto.path.startsWith('file://') ? rawPhoto.path : `file://${rawPhoto.path}`,
          }
        : rawPhoto;

      logAppEvent('donor_hair_submission.photo_camera', 'Camera photo captured from donation photo modal.', {
        userId: user?.id || null,
        slotIndex,
        viewKey: requiredViews[slotIndex]?.key || null,
        hasUri: Boolean(photo?.uri),
      });

      const saveResult = await savePhotoAssetForSlot(slotIndex, photo, 'capture');
      if (!saveResult?.success) {
        setCameraModalError(saveResult?.error || 'The captured photo could not be saved to this slot.');
        return;
      }

      const nextFilledSlots = photos.map((item, index) => (index === slotIndex ? true : Boolean(item)));
      const nextMissingIndex = nextFilledSlots.findIndex((isFilled) => !isFilled);

      if (nextMissingIndex >= 0) {
        setPhotoIndex(nextMissingIndex);
        return;
      }

      pendingAutoAnalysisRef.current = 'live_camera_all_views_complete';
      setStepIndex(3);
    } catch (captureError) {
      logAppEvent('donor_hair_submission.photo_camera', 'Camera capture failed from donation photo modal.', {
        userId: user?.id || null,
        slotIndex,
        viewKey: requiredViews[slotIndex]?.key || null,
        message: captureError?.message || 'Unknown camera capture error.',
      }, 'error');

      setCameraModalError('The camera could not capture a photo right now. Please try again, or use Upload instead.');
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleLiveUpload = async (slotIndex) => {
    setCameraModalError('');
    const result = await pickPhotoForSlot(slotIndex);
    if (result?.success) {
      const nextFilledSlots = photos.map((item, index) => (index === slotIndex ? true : Boolean(item)));
      const nextMissingIndex = nextFilledSlots.findIndex((isFilled) => !isFilled);

      if (nextMissingIndex >= 0) {
        setPhotoIndex(nextMissingIndex);
        return;
      }

      pendingAutoAnalysisRef.current = 'live_upload_all_views_complete';
      setStepIndex(3);
    }
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
        await runFreshAnalysisAttempt('step_2_complete');
      }
      return;
    }

    if (stepIndex === 3) {
      if (!analysis) {
        await runFreshAnalysisAttempt('step_4_retry');
        return;
      }
      return;
    }
  };

  const renderStepContent = () => {
    const invalidPhotoMessage = [
      analysis?.invalid_image_reason,
      ...(Array.isArray(analysis?.missing_views) && analysis.missing_views.length
        ? [`Missing or unclear views: ${analysis.missing_views.join(', ')}`]
        : []),
    ].filter(Boolean).join(' ');

    if (isAnalyzing && stepIndex === 3 && !analysis) {
      return <AnalysisLoadingSplash resolvedTheme={resolvedTheme} />;
    }

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
            <View style={styles.guideHeader}>
              <View style={styles.guideIcon}>
                <AppIcon name="camera" size="lg" state="active" />
              </View>
              <View style={styles.guideHeaderCopy}>
                <Text style={styles.stepTitle}>Before you take photos</Text>
                <Text style={styles.stepDescription}>Follow these rules first, then continue to camera or upload.</Text>
              </View>
            </View>

            <View style={styles.guideGrid}>
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
                <Text style={styles.guidelineTitle}>Required views</Text>
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
          <LiveHairCameraPanel
            currentView={currentView}
            currentPhoto={currentPhoto}
            photoIndex={photoIndex}
            photos={photos}
            requiredViews={requiredViews}
            completedPhotoCount={completedPhotoCount}
            hasCameraPermission={hasCameraPermission}
            cameraRef={cameraRef}
            liveFaceStatus={liveFaceStatus}
            canUseNativeLiveCamera={canUseNativeLiveCamera}
            liveFrameBrightness={liveFrameBrightness}
            liveNoAccessories={liveNoAccessories}
            isCapturing={isCapturingPhoto || isCapturingImages}
            isUploading={isPickingImages}
            isAnalyzing={isAnalyzing}
            cameraError={cameraModalError}
            onCapture={() => handleCapturePhoto(photoIndex)}
            onUpload={() => handleLiveUpload(photoIndex)}
            onRemove={() => removePhoto(photoIndex)}
            onSelectView={setPhotoIndex}
            onFacesChange={handleLiveFacesChange}
            onRequestPermission={async () => {
              const granted = await requestLiveCameraPermission();
              if (!granted) {
                setCameraModalError('Camera access was not granted. Allow camera access for live scanning, or use Upload instead.');
              } else {
                setCameraModalError('');
              }
            }}
          />
        );
      case 3:
        return analysis ? (
          <View style={styles.analysisResultPanel}>
            <View style={styles.analysisResultHero}>
              <View style={styles.analysisResultHeroCopy}>
                <Text style={styles.analysisResultLabel}>Hair condition</Text>
                <Text style={styles.analysisResultTitle}>{analysis.detected_condition || 'Review ready'}</Text>
                <Text style={styles.analysisResultSummary}>{analysis.summary || 'No summary was returned for this analysis.'}</Text>
              </View>
              <Text style={styles.analysisResultScore}>
                {analysis.confidence_score != null ? `${Math.round(Number(analysis.confidence_score) * 100)}%` : '--'}
              </Text>
            </View>
            <>
                <StatusBanner title={eligibility.status} message={eligibility.reasons[0] || eligibility.contextNote || 'The AI screening result is ready for review.'} variant={eligibility.tone} style={styles.bannerGap} />
                {invalidPhotoMessage ? (
                  <StatusBanner
                    title="Photo review note"
                    message={invalidPhotoMessage}
                    variant="info"
                    style={styles.bannerGap}
                  />
                ) : null}

                <View style={styles.analysisFactsRow}>
                  <ResultMetricCard label="Length" value={formatLengthLabel(analysis.estimated_length)} />
                  <ResultMetricCard label="Color" value={analysis.detected_color} />
                  <ResultMetricCard label="Texture" value={analysis.detected_texture} />
                </View>

                <View style={styles.analysisLevels}>
                  <AnalysisLevelRow label="Shine" value={analysis.shine_level} positive />
                  <AnalysisLevelRow label="Frizz" value={analysis.frizz_level} />
                  <AnalysisLevelRow label="Dryness" value={analysis.dryness_level} />
                  <AnalysisLevelRow label="Oiliness" value={analysis.oiliness_level} />
                  <AnalysisLevelRow label="Damage" value={analysis.damage_level} />
                </View>

                {analysis.visible_damage_notes || analysis.length_assessment || analysis.history_assessment ? (
                  <View style={styles.analysisNoteBlock}>
                    {analysis.visible_damage_notes ? <Text style={styles.analysisNoteText}>{analysis.visible_damage_notes}</Text> : null}
                    {analysis.length_assessment ? <Text style={styles.analysisNoteText}>{analysis.length_assessment}</Text> : null}
                    {analysis.history_assessment ? <Text style={styles.analysisNoteText}>{analysis.history_assessment}</Text> : null}
                  </View>
                ) : null}

                {(analysis?.recommendations || []).length ? (
                  <View style={styles.analysisRecommendationBlock}>
                    <Text style={styles.summaryLabel}>Improvement advice</Text>
                    <View style={styles.recommendationList}>
                      {(analysis.recommendations || []).map((recommendation, index) => (
                        <RecommendationCard key={`${recommendation.priority_order}-${recommendation.title || recommendation.recommendation_text.slice(0, 20)}`} recommendation={recommendation} isTopPriority={index === 0} />
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.confirmResultBlock}>
                  <Text style={styles.summaryLabel}>Confirm result</Text>
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
                </View>
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
                disabled={isAnalyzing || isSaving || isRetryCooldownActive}
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
          </View>
        ) : pageErrorState ? (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <View style={styles.errorStateHeader}>
              <View style={styles.errorStateIcon}>
                <AppIcon name="camera" size="lg" state="danger" />
              </View>
              <View style={styles.errorStateCopy}>
                <Text style={styles.stepTitle}>{pageErrorState.title || 'Hair analysis unavailable'}</Text>
                <Text style={styles.stepDescription}>
                  {countdownErrorMessage || error?.message || 'Cannot analyze hair right now. Please try again later.'}
                </Text>
              </View>
            </View>
            <View style={styles.postAnalysisActions}>
              <AppButton
                title="Retake photos"
                variant="outline"
                fullWidth={false}
                onPress={() => {
                  setStepIndex(2);
                  setPhotoIndex(0);
                  clearAnalysisError();
                }}
                disabled={isAnalyzing || isSaving}
              />
              <AppButton
                title={isRetryCooldownActive
                  ? `Try again in ${retryCountdownSeconds}s`
                  : isAnalyzing
                    ? 'Retrying...'
                    : 'Try again'}
                fullWidth={false}
                onPress={async () => {
                  await runFreshAnalysisAttempt('error_card_retry');
                }}
                loading={isAnalyzing}
                disabled={isAnalyzing || isSaving || isRetryCooldownActive}
              />
            </View>
          </AppCard>
        ) : (
          <AppCard variant="elevated" radius="xl" padding="lg">
            <Text style={styles.stepTitle}>Ready for AI analysis</Text>
            <Text style={styles.stepDescription}>
              Your answers and hair photos are ready. Run the analysis to continue.
            </Text>
            <View style={styles.postAnalysisActions}>
              <AppButton
                title={isAnalyzing ? 'Analyzing...' : 'Run analysis'}
                fullWidth={false}
                onPress={async () => {
                  await runFreshAnalysisAttempt('ready_state_retry');
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

  const latestSavedTone = normalizeConditionTone(latestSavedScreening?.detected_condition);
  const summaryHeroTitle = isReturningUser ? 'Start follow-up hair check' : 'Start first hair check';

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
      {transientErrorNotice && !isAnalyzerActive ? (
        <StatusBanner
          title={transientErrorNotice.title}
          message={transientErrorNotice.message}
          variant="error"
          presentation="floating"
          visible={Boolean(transientErrorNotice)}
          autoDismissMs={3000}
          onDismiss={() => {
            logAppEvent('donor_hair_submission.analysis_retry', 'Transient provider error popup dismissed.', {
              userId: user?.id || null,
              title: transientErrorNotice?.title || null,
            });
            setTransientErrorNotice(null);
          }}
        />
      ) : null}
      {successMessage ? <StatusBanner message={successMessage} variant="success" title="Hair check saved" style={styles.bannerGap} /> : null}
      {historyError ? <StatusBanner message={historyError} variant="info" style={styles.bannerGap} /> : null}
      {isLoadingContext ? <StatusBanner title="Loading CheckHair" message="Preparing your analyzer context." variant="info" style={styles.bannerGap} /> : null}

      {!isDonorProfileComplete ? (
        <View style={styles.summaryStage}>
          <ProfileSetupGate
            completionMeta={donorProfileCompletionMeta}
            onManageProfile={() => router.navigate('/profile')}
          />
        </View>
      ) : !isAnalyzerActive ? (
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

          <Pressable
            onPress={() => setIsAnalyzerActive(true)}
            disabled={isLoadingHistory}
            style={({ pressed }) => [styles.startHairWidget, pressed ? styles.interactivePressed : null]}
          >
            <View style={styles.summaryIconWrap}>
              <AppIcon name="checkHair" size="lg" state="active" />
            </View>
            <View style={styles.startHairCopy}>
              <Text style={styles.summaryHeroTitle}>{summaryHeroTitle}</Text>
              <Text style={styles.summaryHeroBody}>
                {hasSavedAnalysis ? `Latest: ${latestSavedTone.label}` : 'Answer, capture, analyze.'}
              </Text>
            </View>
            <AppIcon name="chevronRight" size="md" state="muted" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.wizardStage}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressText}>Step {stepIndex + 1} of {stepTitles.length}</Text>
              <Text style={styles.progressHelper}>{stepTitles[stepIndex] || progressLabel}</Text>
            </View>
            <Pressable onPress={() => setIsAnalyzerActive(false)} style={styles.iconNavButton}>
              <AppIcon name="close" size="md" state="muted" />
            </Pressable>
          </View>
          <View style={styles.stepProgressTrack} accessibilityRole="progressbar">
            <View style={[styles.stepProgressFill, { width: `${((stepIndex + 1) / stepTitles.length) * 100}%` }]} />
          </View>

          <View style={styles.stepContentWrap}>
            {renderStepContent()}
          </View>

          <View style={styles.footerNav}>
            <Pressable
              onPress={goPrevious}
              disabled={stepIndex === 0 && questionIndex === 0 && photoIndex === 0}
              style={[styles.iconNavButton, stepIndex === 0 && questionIndex === 0 && photoIndex === 0 ? styles.iconNavButtonDisabled : null]}
            >
              <AppIcon name="arrow-left" size="md" state="muted" />
            </Pressable>
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
    gap: theme.spacing.md,
    paddingBottom: 120,
  },
  summaryStage: {
    gap: theme.spacing.md,
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
  },
  flowRail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  flowStep: {
    minWidth: 126,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceCard,
  },
  flowStepActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  flowStepIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  flowStepIconActive: {
    backgroundColor: theme.colors.brandPrimary,
  },
  flowStepIconComplete: {
    backgroundColor: theme.colors.textSuccess,
  },
  flowStepCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  flowStepTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
  },
  flowStepTitleActive: {
    color: theme.colors.brandPrimary,
  },
  flowStepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 14,
    color: theme.colors.textSecondary,
  },
  profileGateCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  profileGateTop: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  profileGateIcon: {
    width: 54,
    height: 54,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  profileGateCopy: {
    flex: 1,
    gap: 5,
  },
  profileGateEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  profileGateTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  profileGateBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  profileGateProgressTrack: {
    height: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
    overflow: 'hidden',
  },
  profileGateProgressFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  profileGateMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  profileGateMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  missingFieldWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  missingFieldChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  missingFieldChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  summaryHeroCard: {
    borderColor: theme.colors.brandPrimaryMuted,
  },
  summaryHeroCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  summaryHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  summaryIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  summaryHeroBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  summaryHeroBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
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
  startHairWidget: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  startHairCopy: {
    flex: 1,
    gap: 3,
  },
  interactivePressed: {
    transform: [{ scale: 0.98 }],
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
    alignItems: 'center',
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
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
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
  calendarWidget: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  calendarLeadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.xl,
  },
  calendarEmotion: {
    fontSize: 36,
    lineHeight: 42,
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
    justifyContent: 'flex-end',
    marginBottom: theme.spacing.sm,
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
  calendarGridWeek: {
    flexWrap: 'nowrap',
    gap: 6,
  },
  calendarCell: {
    width: '13.5%',
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  calendarCellWeek: {
    flex: 1,
    width: undefined,
    minHeight: 82,
    borderRadius: 22,
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
  calendarCellEmoji: {
    minHeight: 20,
    fontSize: 17,
    lineHeight: 20,
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
  calendarModeSwitch: {
    flexDirection: 'row',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
    padding: 3,
  },
  calendarModeButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
  },
  calendarModeButtonActive: {
    backgroundColor: theme.colors.brandPrimary,
  },
  calendarModeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarModeTextActive: {
    color: theme.colors.textOnBrand,
  },
  calendarQuickStats: {
    gap: 4,
  },
  calendarQuickStat: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
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
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  guideIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  guideHeaderCopy: {
    flex: 1,
  },
  guideGrid: {
    gap: theme.spacing.md,
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
    marginBottom: theme.spacing.sm,
  },
  stepProgressTrack: {
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
  },
  stepProgressFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
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
  errorStateHeader: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  errorStateIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.errorSurface,
  },
  errorStateCopy: {
    flex: 1,
    minWidth: 0,
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
  liveCameraPanel: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  liveCameraStage: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundDark,
    position: 'relative',
  },
  liveCameraPreview: {
    width: '100%',
    height: '100%',
  },
  liveCameraPermission: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  liveCameraPermissionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  liveCameraPermissionBody: {
    maxWidth: 260,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  liveCameraTopBar: {
    position: 'absolute',
    top: theme.spacing.md,
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  liveStatusPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '78%',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  liveStatusPillSuccess: {
    backgroundColor: 'rgba(235,255,241,0.93)',
  },
  liveStatusPillWarning: {
    backgroundColor: 'rgba(255,248,225,0.94)',
  },
  liveStatusPillError: {
    backgroundColor: 'rgba(255,236,236,0.94)',
  },
  liveStatusDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.textSuccess,
  },
  liveStatusDotActive: {
    backgroundColor: theme.colors.brandPrimary,
  },
  liveStatusDotError: {
    backgroundColor: theme.colors.textError,
  },
  liveStatusDotValid: {
    backgroundColor: theme.colors.textSuccess,
  },
  liveStatusText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  liveCounterText: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.88)',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  liveFrameGuide: {
    position: 'absolute',
    top: 92,
    left: 38,
    right: 38,
    bottom: 46,
    borderRadius: 130,
  },
  liveFrameCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: theme.colors.backgroundPrimary,
    borderTopLeftRadius: 22,
  },
  liveFrameCornerTopRight: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: theme.colors.backgroundPrimary,
    borderTopRightRadius: 22,
  },
  liveFrameCornerBottomLeft: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 44,
    height: 44,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: theme.colors.backgroundPrimary,
    borderBottomLeftRadius: 22,
  },
  liveFrameCornerBottomRight: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 44,
    height: 44,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: theme.colors.backgroundPrimary,
    borderBottomRightRadius: 22,
  },
  liveCameraBottomSheet: {
    padding: theme.spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    gap: theme.spacing.xs,
  },
  liveAnalysisToast: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  liveAnalysisToastText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  liveStepLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
  },
  liveCameraTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  liveCameraBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  liveChecklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  liveChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
  liveChecklistText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textPrimary,
  },
  liveActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  livePrimaryAction: {
    flexGrow: 1,
    minWidth: 178,
  },
  liveSecondaryAction: {
    flexGrow: 1,
    minWidth: 132,
  },
  liveRemoveAction: {
    alignSelf: 'center',
  },
  liveThumbRail: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  liveThumbItem: {
    flex: 1,
    minHeight: 64,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  liveThumbItemActive: {
    borderColor: theme.colors.brandPrimary,
  },
  liveThumbItemDone: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  liveThumbImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.52,
  },
  liveThumbLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textSecondary,
  },
  liveThumbLabelActive: {
    color: theme.colors.brandPrimary,
  },
  metricCard: {
    flex: 1,
    minWidth: '30%',
    flexGrow: 1,
    padding: theme.spacing.sm,
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
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: 0,
    borderRadius: theme.radius.lg,
    borderBottomWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  recommendationCardPrimary: {
    borderColor: theme.colors.borderSubtle,
  },
  recommendationPill: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
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
  analysisSplash: {
    minHeight: 420,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  analysisSplashLogoWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analysisSplashLogo: {
    width: 86,
    height: 86,
  },
  analysisSplashProgress: {
    position: 'absolute',
  },
  analysisSplashTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  analysisSplashText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
  analysisResultPanel: {
    gap: theme.spacing.md,
  },
  analysisResultHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  analysisResultHeroCopy: {
    flex: 1,
    gap: 5,
  },
  analysisResultLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  analysisResultTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  analysisResultSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  analysisResultScore: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.brandPrimary,
  },
  analysisFactsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  analysisLevels: {
    gap: theme.spacing.sm,
  },
  analysisLevelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  analysisLevelLabel: {
    width: 68,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  analysisLevelTrack: {
    flex: 1,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
    overflow: 'hidden',
  },
  analysisLevelFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.textError,
  },
  analysisLevelFillPositive: {
    backgroundColor: theme.colors.brandPrimary,
  },
  analysisLevelValue: {
    width: 18,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textPrimary,
  },
  analysisNoteBlock: {
    gap: 6,
  },
  analysisNoteText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
  analysisRecommendationBlock: {
    gap: theme.spacing.xs,
  },
  confirmResultBlock: {
    gap: theme.spacing.sm,
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
    marginBottom: theme.spacing.xxl,
  },
  iconNavButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  iconNavButtonDisabled: {
    opacity: 0.35,
  },
});
