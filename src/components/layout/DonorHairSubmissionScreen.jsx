import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  'Keep hair centered and fully visible from the hairline to the ends.',
  'Capture the required front view, one side profile, and a close-up of the hair ends.',
  'Keep hair loose, centered, and visible from root or hairline to the lowest visible ends.',
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

const findFirstUnansweredQuestionIndex = (questions = [], answers = {}) => (
  questions.findIndex((question) => !isAnswered(question, answers))
);

const formatLengthLabel = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 'Not detected';
  const inches = numericValue / 2.54;
  return `${numericValue.toFixed(1)} cm / ${inches.toFixed(1)} in`;
};

const cmToInches = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0;
  return numericValue / 2.54;
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

const isSideProfileView = (view = {}) => String(view?.key || view?.label || '').toLowerCase().includes('side');
const isHairEndsView = (view = {}) => String(view?.key || view?.label || '').toLowerCase().includes('ends');

const getInitialLiveFaceStatus = (view = null) => ({
  valid: isHairEndsView(view),
  faceCount: 0,
  message: isHairEndsView(view)
    ? 'Frame the lowest hair ends closely with bright, even light.'
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
        message: 'Hair ends close-up ready. Keep the ends sharp and well lit.',
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
      message: 'Side profile detected. Keep hair length and ends visible.',
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
      : 'Front view detected. Keep your face and hair centered.',
    tone: 'success',
  };
};

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const buildLiveScanStatus = ({
  autoCaptureEnabled = false,
  brightness = -1,
  completedPhotoCount = 0,
  currentPhoto = null,
  currentView = null,
  isCapturing = false,
  liveFaceStatus = null,
  requiredCount = 1,
}) => {
  const viewLabel = isSideProfileView(currentView)
    ? 'Side view'
    : isHairEndsView(currentView)
      ? 'Hair ends'
      : 'Face front';
  const brightnessKnown = Number(brightness) >= 0;
  const brightnessReady = !brightnessKnown || Number(brightness) >= 82;
  const progressBase = requiredCount > 0 ? (completedPhotoCount / requiredCount) * 100 : 0;

  if (currentPhoto?.uri) {
    return {
      conditionLabel: 'Photo ready',
      instruction: 'Photo captured',
      lengthLabel: 'Captured',
      progress: clampPercent(Math.max(72, progressBase)),
      statusLabel: 'Photo ready',
      typeLabel: viewLabel,
    };
  }

  if (isCapturing) {
    return {
      conditionLabel: 'Saving...',
      instruction: 'Capturing automatically...',
      lengthLabel: 'Capturing',
      progress: 100,
      statusLabel: 'Capturing...',
      typeLabel: viewLabel,
    };
  }

  if (autoCaptureEnabled) {
    return {
      conditionLabel: 'Ready',
      instruction: 'Hold still. Auto capture will run now...',
      lengthLabel: 'Ready',
      progress: 96,
      statusLabel: 'Auto ready',
      typeLabel: viewLabel,
    };
  }

  if (!liveFaceStatus?.valid) {
    return {
      conditionLabel: liveFaceStatus?.message || 'Aligning...',
      instruction: liveFaceStatus?.message || 'Center your face and hair.',
      lengthLabel: 'Scanning',
      progress: 38,
      statusLabel: 'Scanning...',
      typeLabel: viewLabel,
    };
  }

  if (!brightnessReady) {
    return {
      conditionLabel: 'Need more light',
      instruction: 'Move near bright, even lighting.',
      lengthLabel: 'Measuring',
      progress: 68,
      statusLabel: 'More light',
      typeLabel: viewLabel,
    };
  }

  return {
    conditionLabel: 'Analyzing...',
    instruction: 'Hold still...',
    lengthLabel: 'Measuring',
    progress: 82,
    statusLabel: 'Scanning...',
    typeLabel: viewLabel,
  };
};

const getAnalysisHealthScore = (analysis = {}) => {
  const confidence = Number(analysis?.confidence_score);
  if (Number.isFinite(confidence) && confidence > 0) {
    return Math.max(0, Math.min(100, Math.round(confidence <= 1 ? confidence * 100 : confidence)));
  }

  const shine = Math.max(0, Math.min(10, Number(analysis?.shine_level) || 6));
  const frizz = Math.max(0, Math.min(10, Number(analysis?.frizz_level) || 4));
  const dryness = Math.max(0, Math.min(10, Number(analysis?.dryness_level) || 4));
  const oiliness = Math.max(0, Math.min(10, Number(analysis?.oiliness_level) || 3));
  const damage = Math.max(0, Math.min(10, Number(analysis?.damage_level) || 4));
  return Math.max(0, Math.min(100, Math.round(((shine + (10 - frizz) + (10 - dryness) + (10 - oiliness) + (10 - damage)) / 50) * 100)));
};

const getScoreLabel = (score) => {
  if (score >= 80) return 'GOOD';
  if (score >= 60) return 'FAIR';
  return 'NEEDS CARE';
};

const buildConditionInsights = (analysis = {}) => {
  const dryness = Number(analysis?.dryness_level);
  const damage = Number(analysis?.damage_level);
  const frizz = Number(analysis?.frizz_level);
  const density = String(analysis?.detected_density || '').trim();

  return [
    {
      key: 'scalp',
      icon: 'check-circle-outline',
      state: 'active',
      tone: 'primary',
      text: Number.isFinite(dryness) && dryness > 6 ? 'Scalp and ends need more moisture' : 'Healthy scalp',
    },
    {
      key: 'dryness',
      icon: Number.isFinite(dryness) && dryness > 5 ? 'information-outline' : 'check-circle-outline',
      state: Number.isFinite(dryness) && dryness > 5 ? 'muted' : 'active',
      tone: Number.isFinite(dryness) && dryness > 5 ? 'muted' : 'primary',
      text: Number.isFinite(dryness) && dryness > 5 ? 'Slight dryness at ends' : 'Moisture level looks balanced',
    },
    {
      key: 'damage',
      icon: Number.isFinite(damage) && damage > 5 ? 'information-outline' : 'check-circle-outline',
      state: Number.isFinite(damage) && damage > 5 ? 'muted' : 'active',
      tone: Number.isFinite(damage) && damage > 5 ? 'muted' : 'primary',
      text: Number.isFinite(damage) && damage > 5 ? 'Visible damage needs attention' : 'No structural damage',
    },
    {
      key: 'density',
      icon: 'check-circle-outline',
      state: 'active',
      tone: 'primary',
      text: density ? `${density} thickness` : (Number.isFinite(frizz) && frizz > 6 ? 'Frizz needs smoothing' : 'Good thickness'),
    },
  ];
};

const getRecommendationIconName = (recommendation = {}) => {
  const source = `${recommendation?.title || ''} ${recommendation?.recommendation_text || ''}`.toLowerCase();
  if (source.includes('protein') || source.includes('biotin') || source.includes('keratin')) return 'test-tube';
  if (source.includes('trim') || source.includes('cut')) return 'content-cut';
  if (source.includes('heat') || source.includes('dry')) return 'thermometer';
  return 'water-outline';
};

const buildDefaultRecommendations = (analysis = {}) => {
  const dryness = Number(analysis?.dryness_level);
  const damage = Number(analysis?.damage_level);
  const frizz = Number(analysis?.frizz_level);

  return [
    {
      title: 'Conditioning',
      recommendation_text: Number.isFinite(dryness) && dryness > 5
        ? 'Increase deep conditioning to 2x/week.'
        : 'Maintain weekly deep conditioning.',
      priority_order: 1,
    },
    {
      title: 'Protein/Biotin',
      recommendation_text: Number.isFinite(damage) && damage > 5
        ? 'Add a keratin-based serum to the ends.'
        : 'Use a light strengthening serum on wash days.',
      priority_order: 2,
    },
    {
      title: 'Trim',
      recommendation_text: Number.isFinite(damage) && damage > 4
        ? 'A 1-inch trim is recommended soon.'
        : 'No urgent trim needed before donation.',
      priority_order: 3,
    },
    {
      title: 'Reduce Heat',
      recommendation_text: Number.isFinite(frizz) && frizz > 5
        ? 'Minimize blow-drying to preserve natural oils.'
        : 'Keep heat styling low to preserve shine.',
      priority_order: 4,
    },
  ];
};

const buildDonationAssessment = ({ analysis = {}, donationRequirement = null }) => {
  const totalLengthCm = Number(analysis?.estimated_length);
  const configuredMinimumCm = Number(donationRequirement?.minimum_hair_length);
  const minimumLengthCm = Math.max(
    35.56,
    Number.isFinite(configuredMinimumCm) && configuredMinimumCm > 0 ? configuredMinimumCm : 0,
  );
  const totalInches = cmToInches(totalLengthCm);
  const minimumInches = cmToInches(minimumLengthCm);
  const isLengthDetected = Number.isFinite(totalLengthCm) && totalLengthCm > 0;
  const meetsLengthRequirement = isLengthDetected && totalLengthCm >= minimumLengthCm;
  const isDonationReady = meetsLengthRequirement && analysis?.decision !== 'Improve hair condition';
  const donatableLengthCm = meetsLengthRequirement ? minimumLengthCm : 0;
  const neededLengthCm = isLengthDetected ? Math.max(0, minimumLengthCm - totalLengthCm) : null;
  const cutLineBottomPercent = meetsLengthRequirement && totalLengthCm > 0
    ? Math.max(24, Math.min(82, (donatableLengthCm / totalLengthCm) * 100))
    : 18;
  const hairLengthLabel = isLengthDetected
    ? `${totalInches.toFixed(1)} inches`
    : 'Not detected';
  const donatableLengthLabel = meetsLengthRequirement
    ? `${cmToInches(donatableLengthCm).toFixed(1)} inches`
    : isLengthDetected
      ? `${cmToInches(neededLengthCm).toFixed(1)} inches more needed`
      : 'Not detected';

  return {
    cutLineBottomPercent,
    donatableLengthLabel,
    hairLengthLabel,
    isDonationReady,
    meetsLengthRequirement,
    minimumLengthLabel: `${minimumInches.toFixed(1)} inches`,
    summary: isDonationReady
      ? (analysis?.donation_readiness_note || 'Your hair condition and visible length are suited for donation based on this scan.')
      : meetsLengthRequirement
        ? 'Your scanned hair length appears long enough for donation, but the condition still needs review or improvement before proceeding.'
        : (analysis?.donation_readiness_note || 'Your hair is not ready for donation yet. Follow the recommendations and scan again.'),
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
            <View style={[styles.choiceIconWrap, isActive ? styles.choiceIconWrapActive : null]}>
              <MaterialCommunityIcons
                name={isActive ? 'check-circle' : option.value === 'no' ? 'close-circle-outline' : 'check-circle-outline'}
                size={22}
                color={isActive ? theme.colors.textOnBrand : theme.colors.textSecondary}
              />
            </View>
            <Text style={[styles.choiceLabel, isActive ? styles.choiceLabelActive : null]}>{option.label}</Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={isActive ? theme.colors.brandPrimary : theme.colors.textMuted}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function LiveHairCameraPanel({
  autoCaptureEnabled,
  cameraFacing,
  currentView,
  currentPhoto,
  flashMode,
  requiredViews,
  completedPhotoCount,
  hasCameraPermission,
  cameraRef,
  liveScanStatus,
  liveFaceStatus,
  canUseNativeLiveCamera,
  isCapturing,
  isUploading,
  isAnalyzing,
  onCapture,
  onToggleCamera,
  onToggleFlash,
  onUpload,
  onRemove,
  onClose,
  onRequestPermission,
  onFacesChange,
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cameraStageWidth = Math.min(Math.max(windowWidth - theme.spacing.sm * 2, 320), 520);
  const cameraStageHeight = Math.min(Math.max(windowWidth * 1.28, 460), 620);
  const scanLineProgress = useRef(new Animated.Value(0)).current;
  const statusToneStyle = liveFaceStatus?.valid
    ? styles.liveStatusPillSuccess
    : liveFaceStatus?.tone === 'error'
      ? styles.liveStatusPillError
      : styles.liveStatusPillWarning;
  const liveStatusDotStyle = liveFaceStatus?.valid
    ? styles.liveStatusDotValid
    : liveFaceStatus?.tone === 'error' || !canUseNativeLiveCamera
      ? styles.liveStatusDotError
      : styles.liveStatusDotActive;
  const shortViewHint = isSideProfileView(currentView)
    ? 'Side view'
    : isHairEndsView(currentView)
      ? 'Hair ends'
      : 'Face front';

  useEffect(() => {
    if (currentPhoto?.uri) return undefined;

    scanLineProgress.setValue(0);
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineProgress, {
          toValue: 1,
          duration: 1650,
          useNativeDriver: true,
        }),
        Animated.timing(scanLineProgress, {
          toValue: 0,
          duration: 1650,
          useNativeDriver: true,
        }),
      ])
    );
    scanLoop.start();

    return () => {
      scanLoop.stop();
    };
  }, [currentPhoto?.uri, scanLineProgress]);

  const scanLineTravel = Math.max(cameraStageHeight - 220, 120);
  const scanLineStyle = {
    transform: [
      {
        translateY: scanLineProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, scanLineTravel],
        }),
      },
    ],
  };

  return (
    <View style={styles.liveCameraPanel}>
      <View style={[styles.liveCameraStage, { width: cameraStageWidth, height: cameraStageHeight }]}>
        {currentPhoto?.uri ? (
          <>
            <Image source={{ uri: currentPhoto.uri }} style={styles.liveCameraPreview} resizeMode="cover" />
            <View style={styles.livePhotoOverlayActions}>
              <Pressable
                onPress={onRemove}
                disabled={isCapturing || isUploading || isAnalyzing}
                style={({ pressed }) => [styles.livePhotoIconButton, pressed ? styles.livePhotoIconButtonPressed : null]}
              >
                <AppIcon name="refresh" size="sm" state="inverse" />
                <Text style={styles.livePhotoIconText}>Retake</Text>
              </Pressable>
              <Pressable
                onPress={onUpload}
                disabled={isCapturing || isUploading || isAnalyzing}
                style={({ pressed }) => [styles.livePhotoIconButton, pressed ? styles.livePhotoIconButtonPressed : null]}
              >
                <AppIcon name="upload" size="sm" state="inverse" />
                <Text style={styles.livePhotoIconText}>Change</Text>
              </Pressable>
            </View>
          </>
        ) : hasCameraPermission ? (
          canUseNativeLiveCamera ? (
            <NativeLiveFaceCamera
              cameraRef={cameraRef}
              facing={cameraFacing}
              flashMode={flashMode}
              isActive
              onFacesChange={onFacesChange}
            />
          ) : (
            <CameraView
              ref={cameraRef}
              style={styles.liveCameraPreview}
              facing={cameraFacing}
              enableTorch={flashMode === 'on' && cameraFacing === 'back'}
              flash={flashMode === 'on' && cameraFacing === 'back' ? 'on' : 'off'}
              mode="picture"
              animateShutter
            />
          )
        ) : (
          <View style={styles.liveCameraPermission}>
            <AppIcon name="camera" size="xl" state="active" />
            <Text style={styles.liveCameraPermissionTitle}>Camera access needed</Text>
            <Text style={styles.liveCameraPermissionBody}>Allow camera access for live hair scanning, or upload this required view.</Text>
            <AppButton
              title="Allow camera access"
              fullWidth={false}
              leading={<AppIcon name="camera" size="md" state="inverse" />}
              onPress={onRequestPermission}
              disabled={isCapturing || isUploading || isAnalyzing}
              style={styles.livePermissionAction}
            />
          </View>
        )}

        <View style={styles.liveCameraTopBar}>
          <Pressable
            onPress={currentPhoto ? onRemove : onClose}
            disabled={isCapturing || isUploading || isAnalyzing}
            style={styles.liveCameraOverlayIcon}
          >
            <AppIcon name="close" size="sm" state="inverse" />
          </Pressable>
          <View style={[styles.liveStatusPill, statusToneStyle]}>
            <View style={[styles.liveStatusDot, liveStatusDotStyle, isAnalyzing ? styles.liveStatusDotActive : null]} />
            <Text style={styles.liveStatusText}>{isAnalyzing ? 'AI analyzing' : liveScanStatus.statusLabel}</Text>
          </View>
          <Pressable
            onPress={onToggleFlash}
            disabled={isCapturing || isUploading || isAnalyzing || currentPhoto?.uri}
            style={styles.liveCameraOverlayIcon}
          >
            <AppIcon name={flashMode === 'on' ? 'flash' : 'flash-off'} size="sm" state="inverse" />
          </Pressable>
        </View>

        <View style={styles.liveScanFloatingCard}>
          <View style={styles.liveScanMetricRow}>
            <Text style={styles.liveScanMetricLabel}>Hair Length</Text>
            <Text style={styles.liveScanMetricValue}>{liveScanStatus.lengthLabel}</Text>
          </View>
          <View style={styles.liveScanMetricRow}>
            <Text style={styles.liveScanMetricLabel}>Hair Type</Text>
            <Text style={styles.liveScanMetricValue}>{liveScanStatus.typeLabel || shortViewHint}</Text>
          </View>
          <View style={styles.liveScanMetricRow}>
            <Text style={styles.liveScanMetricLabel}>Condition</Text>
            <Text style={styles.liveScanMetricValueAccent} numberOfLines={2}>{liveScanStatus.conditionLabel}</Text>
          </View>
          <View style={styles.liveScanProgressTrack}>
            <View style={[styles.liveScanProgressFill, { width: `${liveScanStatus.progress}%` }]} />
          </View>
        </View>

        <View style={styles.liveFrameGuide} pointerEvents="none">
          {!currentPhoto ? (
            <Animated.View style={[styles.liveScanLine, scanLineStyle]} />
          ) : null}
          <View style={styles.liveFrameCornerTopLeft} />
          <View style={styles.liveFrameCornerTopRight} />
          <View style={styles.liveFrameCornerBottomLeft} />
          <View style={styles.liveFrameCornerBottomRight} />
        </View>

      </View>

      <View style={styles.liveCameraBottomSheet}>
        <Text style={styles.liveHoldStillText}>{liveScanStatus.instruction}</Text>
        <View style={styles.liveCaptureControls}>
          <Pressable
            onPress={onUpload}
            disabled={isCapturing || isUploading || isAnalyzing}
            style={styles.liveRoundControl}
          >
            <AppIcon name="image" size="md" state="inverse" />
          </Pressable>
          <Pressable
            onPress={currentPhoto ? onRemove : hasCameraPermission ? onCapture : onRequestPermission}
            disabled={isCapturing || isUploading || isAnalyzing}
            style={[
              styles.liveCaptureButton,
              autoCaptureEnabled ? styles.liveCaptureButtonReady : null,
              (isCapturing || isAnalyzing) ? styles.liveCaptureButtonDisabled : null,
            ]}
          >
            {isCapturing ? <ActivityIndicator color={theme.colors.brandPrimary} /> : null}
          </Pressable>
          <Pressable
            onPress={onToggleCamera}
            disabled={isCapturing || isUploading || isAnalyzing}
            style={styles.liveRoundControl}
          >
            <AppIcon name="camera-retake-outline" size="md" state="inverse" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function NativeLiveFaceCamera({ cameraRef, facing = 'front', flashMode = 'off', isActive, onFacesChange }) {
  const normalizedFacing = facing === 'back' ? 'back' : 'front';
  const device = useNativeCameraDevice(normalizedFacing);
  const supportsTorch = Boolean(device?.hasTorch || device?.hasFlash);
  const safeTorchMode = flashMode === 'on' && supportsTorch ? 'on' : 'off';
  const faceDetectionOptions = React.useMemo(() => ({
    performanceMode: 'fast',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'all',
    minFaceSize: 0.18,
    trackingEnabled: true,
    cameraFacing: normalizedFacing,
  }), [normalizedFacing]);
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
        <Text style={styles.liveCameraPermissionBody}>
          {nativeVisionCameraLoadError || nativeFaceCameraLoadError || 'Camera device is not ready yet. You can still upload a photo for this view.'}
        </Text>
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
      torch={safeTorchMode}
    />
  );
}

function ConditionInsightRow({ item }) {
  return (
    <View style={styles.conditionInsightRow}>
      <AppIcon name={item.icon} size="md" state={item.state} />
      <Text style={[styles.conditionInsightText, item.tone === 'muted' ? styles.conditionInsightTextMuted : null]}>{item.text}</Text>
    </View>
  );
}

function AiRecommendationRow({ recommendation }) {
  return (
    <View style={styles.aiRecommendationRow}>
      <View style={styles.aiRecommendationIcon}>
        <AppIcon name={getRecommendationIconName(recommendation)} size="md" state="active" />
      </View>
      <View style={styles.aiRecommendationCopy}>
        <Text style={styles.aiRecommendationTitle}>{recommendation.title || 'Hair care'}</Text>
        <Text style={styles.aiRecommendationText}>{recommendation.recommendation_text}</Text>
      </View>
    </View>
  );
}

function AnalysisLoadingSplash({ resolvedTheme, photos = [], completedPhotoCount = 0 }) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const primaryPhoto = photos.find((photo) => photo?.uri);
  const progressPercent = Math.min(95, Math.max(35, 35 + completedPhotoCount * 18));

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    <View style={styles.analysisSplash}>
      <View style={styles.analysisScanHeader}>
        <View>
          <Text style={styles.analysisSplashTitle}>Analyzing hair</Text>
          <Text style={styles.analysisSplashText}>Checking photos, length, texture, and condition.</Text>
        </View>
        <Text style={styles.analysisScanPercent}>{progressPercent}%</Text>
      </View>

      <View style={styles.analysisScanRow}>
        <View style={styles.analysisScanPreview}>
          {primaryPhoto?.uri ? (
            <Image source={{ uri: primaryPhoto.uri }} style={styles.analysisScanImage} resizeMode="cover" />
          ) : (
            <Image
              source={logoSource}
              style={styles.analysisSplashLogo}
              resizeMode="contain"
              onError={() => setImageFailed(true)}
            />
          )}
          <View style={styles.analysisScanGrid} pointerEvents="none" />
          <View style={styles.analysisScanBadge}>
            <View style={styles.analysisScanDot} />
            <Text style={styles.analysisScanBadgeText}>AI scan</Text>
          </View>
        </View>

        <View style={styles.analysisScanChecks}>
          {[
            ['hair-dryer-outline', 'Texture'],
            ['ruler', 'Length'],
            ['checkHair', 'Condition'],
          ].map(([icon, label], index) => (
            <View key={label} style={styles.analysisScanCheck}>
              {index < 2 ? (
                <AppIcon name="check-circle-outline" size="sm" state="success" />
              ) : (
                <ActivityIndicator size="small" color={resolvedTheme?.primaryColor || theme.colors.brandPrimary} />
              )}
              <Text style={styles.analysisScanCheckText}>{label}</Text>
              <AppIcon name={icon} size="sm" state="muted" />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.analysisScanProgressTrack}>
        <View style={[styles.analysisScanProgressFill, { width: `${progressPercent}%` }]} />
      </View>
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

const getChoiceDisplayLabel = (optionsKey, value) => {
  if (Array.isArray(value)) {
    return value.map((item) => getChoiceDisplayLabel(optionsKey, item)).filter(Boolean).join(', ');
  }

  const option = (hairAnalyzerQuestionChoices[optionsKey] || []).find((item) => item.value === value);
  return option?.label || value || 'Not answered';
};

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
    return {
      dotColor: '#4FAE71',
      label: 'Healthy',
      icon: 'check-decagram-outline',
      iconColor: '#2B7A4B',
      toneSurface: '#E9F8EE',
    };
  }

  if (normalized.includes('dry') || normalized.includes('damaged')) {
    return {
      dotColor: '#E49C49',
      label: 'Needs care',
      icon: 'alert-circle-outline',
      iconColor: '#9B5F1B',
      toneSurface: '#FFF4E8',
    };
  }

  if (normalized.includes('treated') || normalized.includes('rebonded') || normalized.includes('colored')) {
    return {
      dotColor: '#7A8AE6',
      label: 'Treated',
      icon: 'palette-outline',
      iconColor: '#485CC5',
      toneSurface: '#EEF1FF',
    };
  }

  return {
    dotColor: theme.colors.brandPrimary,
    label: condition || 'Checked',
    icon: 'line-scan',
    iconColor: theme.colors.brandPrimary,
    toneSurface: theme.colors.brandPrimaryMuted,
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
        <View style={[styles.calendarLeadIconWrap, { backgroundColor: latestTone.toneSurface }]}>
          <AppIcon name={latestTone.icon} size="lg" color={latestTone.iconColor} />
        </View>
        <View style={styles.calendarLeadCopy}>
          <Text style={styles.calendarLeadTitle}>{latestTone.label}</Text>
          <Text style={styles.calendarLeadBody} numberOfLines={1}>
            {latestSummary}
          </Text>
        </View>
        <View style={styles.calendarLeadMeta}>
          <Text style={styles.calendarLeadMetaValue}>{formatCalendarDayLabel(history.latestScreening?.created_at)}</Text>
          <View style={[styles.calendarLeadStatusChip, { backgroundColor: latestTone.toneSurface }]}>
            <View style={[styles.conditionDot, { backgroundColor: latestTone.dotColor }]} />
            <Text style={[styles.calendarLeadStatusText, { color: latestTone.iconColor }]}>{latestTone.label}</Text>
          </View>
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
              {screening ? (
                <View style={[styles.calendarCellIconWrap, { backgroundColor: tone.toneSurface }]}>
                  <AppIcon name={tone.icon} size="sm" color={tone.iconColor} />
                </View>
              ) : (
                <View style={styles.calendarCellPlaceholder} />
              )}
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
  const [isAnalyzerActive, setIsAnalyzerActive] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [, setCameraModalError] = useState('');
  const [nativeCameraPermission, setNativeCameraPermission] = useState('not-determined');
  const [cameraFacing, setCameraFacing] = useState('front');
  const [flashMode, setFlashMode] = useState('off');
  const [previewImageUri, setPreviewImageUri] = useState('');
  const [liveFaceStatus, setLiveFaceStatus] = useState(getInitialLiveFaceStatus);
  const [liveFrameBrightness, setLiveFrameBrightness] = useState(-1);
  const lastLiveFaceStatusKeyRef = useRef('');
  const autoCaptureTimeoutRef = useRef(null);
  const autoCaptureCooldownUntilRef = useRef(0);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [selectedHistoryDate, setSelectedHistoryDate] = useState('');
  const [selectedHistoryEntries, setSelectedHistoryEntries] = useState([]);
  const [, setResultConfirmationMode] = useState('pending');
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
    pickPhotoForSlot,
    savePhotoAssetForSlot,
    removePhoto,
    analyzePhotos,
    submitSubmission,
    resetFlow,
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
  const [questionnaireDraftAnswers, setQuestionnaireDraftAnswers] = useState(() => ({
    ...hairAnalyzerQuestionDefaultValues,
  }));
  const questionnaireValues = useWatch({ control: questionForm.control });
  const complianceAcknowledged = useWatch({ control: complianceForm.control, name: 'acknowledged' });
  const savedHistory = useMemo(() => buildHairConditionHistory(analysisHistory), [analysisHistory]);
  const isReturningUser = savedHistory.entries.length > 0;
  const questionnaireMode = isReturningUser ? 'returning_follow_up' : 'first_time';
  const effectiveQuestionnaireValues = useMemo(() => ({
    ...hairAnalyzerQuestionDefaultValues,
    ...questionForm.getValues(),
    ...(questionnaireValues || {}),
    ...questionnaireDraftAnswers,
    questionnaireMode,
  }), [questionForm, questionnaireDraftAnswers, questionnaireMode, questionnaireValues]);
  const getCurrentQuestionnaireAnswers = React.useCallback((overrides = {}) => ({
    ...hairAnalyzerQuestionDefaultValues,
    ...questionForm.getValues(),
    ...(questionnaireValues || {}),
    ...questionnaireDraftAnswers,
    questionnaireMode,
    ...overrides,
  }), [questionForm, questionnaireDraftAnswers, questionnaireMode, questionnaireValues]);
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
    setQuestionnaireDraftAnswers((current) => ({
      ...current,
      questionnaireMode,
    }));
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
    () => getVisibleQuestions(effectiveQuestionnaireValues, questionnaireMode),
    [effectiveQuestionnaireValues, questionnaireMode]
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
  const toggleCameraFacing = React.useCallback(() => {
    setCameraFacing((current) => (current === 'front' ? 'back' : 'front'));
    setFlashMode('off');
    const initialStatus = getInitialLiveFaceStatus(currentView);
    lastLiveFaceStatusKeyRef.current = '';
    setLiveFaceStatus(initialStatus);
    setLiveFrameBrightness(-1);
  }, [currentView]);
  const toggleFlashMode = React.useCallback(() => {
    if (cameraFacing !== 'back') {
      setFlashMode('off');
      setCameraModalError('Flash is available only on supported rear cameras.');
      return;
    }
    setCameraModalError('');
    setFlashMode((current) => (current === 'on' ? 'off' : 'on'));
  }, [cameraFacing]);

  const stepTitles = useMemo(() => ([
    'Hair History',
    'Scan Readiness',
    'Camera Scan',
    'AI Result',
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

    const currentAnswers = getCurrentQuestionnaireAnswers();
    return await analyzePhotos({
      questionnaireAnswers: {
        ...currentAnswers,
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
    getCurrentQuestionnaireAnswers,
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

  const closeAnalyzerToHome = React.useCallback(() => {
    setIsAnalyzerActive(false);
    router.replace('/donor/donations');
  }, [router]);

  useEffect(() => {
    logAppEvent('donor_hair_submission.flow', 'Donor screening flow initialized without intro wizard steps.', {
      userId: user?.id || null,
      databaseUserId: profile?.user_id || null,
      visibleSteps: stepTitles,
    });
  }, [profile?.user_id, stepTitles, user?.id]);

  const canMovePastQuestion = isAnswered(currentQuestion, effectiveQuestionnaireValues);
  const isAutoAdvanceQuestion = stepIndex === 0 && currentQuestion?.type === 'choice';
  const isCurrentPhotoComplete = Boolean(photos[photoIndex]);
  const showFooterPrimaryAction = stepIndex !== 1 && stepIndex !== 2 && !(stepIndex === 3 && Boolean(analysis));
  const isNextDisabled = (
    (stepIndex === 0 && !canMovePastQuestion)
    || (stepIndex === 2 && !isCurrentPhotoComplete)
    || (stepIndex === 3 && (!analysis || isAnalyzing || isSaving))
  );

  const nextButtonTitle = useMemo(() => {
    if (stepIndex === 0) return questionIndex === visibleQuestions.length - 1 ? 'Continue' : 'Next';
    if (stepIndex === 1) return 'Start Camera Scan';
    if (stepIndex === 2) return photoIndex === requiredViews.length - 1 ? 'Analyze' : 'Next';
    return analysis ? (isSaving ? 'Saving...' : 'Save to hair log') : 'Retry analysis';
  }, [analysis, isSaving, photoIndex, questionIndex, requiredViews.length, stepIndex, visibleQuestions.length]);

  const saveConfirmedAnalysis = async () => {
    if (!analysis) return;

    logAppEvent('donor_hair_submission.confirmation', 'User confirmed AI result for saving.', {
      userId: user?.id || null,
      analysisKeys: Object.keys(analysis || {}),
    });

    const currentAnswers = getCurrentQuestionnaireAnswers();
    const result = await submitSubmission(buildHairReviewDefaultValues(analysis, currentAnswers), {
      questionnaireAnswers: {
        ...currentAnswers,
      },
      donationModeValue: '',
    });

    if (result?.success) {
      questionForm.reset({
        ...hairAnalyzerQuestionDefaultValues,
        questionnaireMode,
      });
      setQuestionnaireDraftAnswers({
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
      router.replace('/donor/donations');
    }
  };

  const goToNextQuestionStep = (answersSnapshot = null, currentQuestionKey = currentQuestion?.key) => {
    const currentAnswersSnapshot = answersSnapshot || getCurrentQuestionnaireAnswers();
    const nextVisibleQuestions = getVisibleQuestions({
      ...currentAnswersSnapshot,
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

    questionForm.setValue(fieldName, nextValue, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: false,
    });
    setQuestionnaireDraftAnswers((current) => ({
      ...current,
      [fieldName]: nextValue,
      questionnaireMode,
    }));
    if (typeof fieldOnChange === 'function') {
      fieldOnChange(nextValue);
    }

    const nextAnswers = getCurrentQuestionnaireAnswers({ [fieldName]: nextValue });
    const isValid = isAnswered(currentQuestion, nextAnswers);

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
      if (status !== 'granted' && Platform.OS !== 'web') {
        try {
          await Linking.openSettings();
        } catch (_settingsError) {
          // The app settings shortcut is best-effort; the permission message remains visible.
        }
      }
      return status === 'granted';
    }

    const permissionResult = await requestCameraPermission();
    if (!permissionResult?.granted && Platform.OS !== 'web' && permissionResult?.canAskAgain === false) {
      try {
        await Linking.openSettings();
      } catch (_settingsError) {
        // The app settings shortcut is best-effort; the permission message remains visible.
      }
    }
    return Boolean(permissionResult?.granted);
  }, [canUseNativeLiveCamera, requestCameraPermission]);

  const handleLiveFacesChange = React.useCallback((faces = [], brightness = -1) => {
    const baseStatus = resolveLiveFaceStatus(faces, currentView);
    const nextStatus = brightness >= 0 && brightness < 82
      ? {
          ...baseStatus,
          valid: false,
          tone: 'warning',
          message: 'Lighting is too low for a reliable scan. Move near bright indirect light and keep hair visible from root to ends.',
        }
      : baseStatus;
    const nextKey = `${nextStatus.valid}:${nextStatus.faceCount}:${nextStatus.message}`;
    if (lastLiveFaceStatusKeyRef.current !== nextKey) {
      lastLiveFaceStatusKeyRef.current = nextKey;
      setLiveFaceStatus(nextStatus);
    }
    setLiveFrameBrightness(brightness);
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
    }
  }, [cameraFacing, currentView, photoIndex, stepIndex]);

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
              value={effectiveQuestionnaireValues?.[fieldName] ?? field.value}
              onChangeText={(nextValue) => {
                questionForm.setValue(fieldName, nextValue, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: false,
                });
                setQuestionnaireDraftAnswers((current) => ({
                  ...current,
                  [fieldName]: nextValue,
                  questionnaireMode,
                }));
                field.onChange(nextValue);
              }}
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
              value={effectiveQuestionnaireValues?.[fieldName] ?? field.value}
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

                questionForm.setValue(fieldName, nextValue, {
                  shouldDirty: true,
                  shouldTouch: true,
                  shouldValidate: true,
                });
                setQuestionnaireDraftAnswers((current) => ({
                  ...current,
                  [fieldName]: nextValue,
                  questionnaireMode,
                }));
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

  const handleCapturePhoto = React.useCallback(async (slotIndex = photoIndex, captureSource = 'manual') => {
    if (slotIndex == null) return;

    if (captureSource === 'auto' && canUseNativeLiveCamera && !liveFaceStatus.valid) {
      setCameraModalError(liveFaceStatus.message || 'Center your face and hair before scanning.');
      return;
    }

    logAppEvent('donor_hair_submission.photo_camera', 'Camera capture requested from donation photo modal.', {
      userId: user?.id || null,
      slotIndex,
      viewKey: requiredViews[slotIndex]?.key || null,
      platform: Platform.OS,
      hasCameraPermission,
      captureSource,
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
      let rawPhoto;
      try {
        rawPhoto = typeof cameraRef.current.takePhoto === 'function'
          ? await cameraRef.current.takePhoto({ flash: flashMode })
          : await cameraRef.current.takePictureAsync({
              quality: 0.8,
              base64: true,
            });
      } catch (flashCaptureError) {
        if (flashMode !== 'on' || typeof cameraRef.current.takePhoto !== 'function') throw flashCaptureError;
        rawPhoto = await cameraRef.current.takePhoto({ flash: 'off' });
      }
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
        captureSource,
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
  }, [
    canUseNativeLiveCamera,
    flashMode,
    hasCameraPermission,
    isCapturingPhoto,
    photoIndex,
    photos,
    requiredViews,
    requestLiveCameraPermission,
    savePhotoAssetForSlot,
    user?.id,
    liveFaceStatus.valid,
    liveFaceStatus.message,
  ]);

  const autoCaptureEnabled = useMemo(() => {
    if (stepIndex !== 2) return false;
    if (!hasCameraPermission) return false;
    if (Boolean(currentPhoto)) return false;
    if (isCapturingPhoto || isCapturingImages || isPickingImages || isAnalyzing) return false;

    if (!canUseNativeLiveCamera) return true;

    const brightnessReady = liveFrameBrightness < 0 || liveFrameBrightness >= 82;
    return Boolean(liveFaceStatus?.valid && brightnessReady);
  }, [
    canUseNativeLiveCamera,
    currentPhoto,
    hasCameraPermission,
    isAnalyzing,
    isCapturingImages,
    isCapturingPhoto,
    isPickingImages,
    liveFaceStatus?.valid,
    liveFrameBrightness,
    stepIndex,
  ]);

  const liveScanStatus = useMemo(() => buildLiveScanStatus({
    autoCaptureEnabled,
    brightness: liveFrameBrightness,
    completedPhotoCount,
    currentPhoto,
    currentView,
    isCapturing: isCapturingPhoto || isCapturingImages,
    liveFaceStatus,
    requiredCount: requiredViews.length,
  }), [
    autoCaptureEnabled,
    completedPhotoCount,
    currentPhoto,
    currentView,
    isCapturingImages,
    isCapturingPhoto,
    liveFaceStatus,
    liveFrameBrightness,
    requiredViews.length,
  ]);

  useEffect(() => {
    if (autoCaptureTimeoutRef.current) {
      clearTimeout(autoCaptureTimeoutRef.current);
      autoCaptureTimeoutRef.current = null;
    }

    if (!autoCaptureEnabled) return undefined;
    if (Date.now() < autoCaptureCooldownUntilRef.current) return undefined;

    autoCaptureTimeoutRef.current = setTimeout(() => {
      autoCaptureCooldownUntilRef.current = Date.now() + 3500;
      handleCapturePhoto(photoIndex, 'auto');
    }, canUseNativeLiveCamera ? 1200 : 2600);

    return () => {
      if (autoCaptureTimeoutRef.current) {
        clearTimeout(autoCaptureTimeoutRef.current);
        autoCaptureTimeoutRef.current = null;
      }
    };
  }, [autoCaptureEnabled, canUseNativeLiveCamera, handleCapturePhoto, photoIndex]);

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
      const answersSnapshot = getCurrentQuestionnaireAnswers();
      const isValid = fieldName ? isAnswered(currentQuestion, answersSnapshot) : false;
      if (!isValid) return;

      logAppEvent('donor_hair_submission.questionnaire', 'Manual question advance triggered.', {
        userId: user?.id || null,
        questionKey: fieldName || null,
        questionType: currentQuestion?.type || null,
      });

      goToNextQuestionStep(answersSnapshot, fieldName);
      return;
    }

    if (stepIndex === 1) {
      complianceForm.setValue('acknowledged', true, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
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
      return (
        <AnalysisLoadingSplash
          resolvedTheme={resolvedTheme}
          photos={photos}
          completedPhotoCount={completedPhotoCount}
        />
      );
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
          <View style={styles.questionnaireStage}>
            <View style={styles.questionProgressBlock}>
              <View style={styles.questionProgressLabels}>
                <Text style={styles.questionProgressText}>Step {questionIndex + 1} of {visibleQuestions.length}</Text>
                <Text style={styles.questionProgressMeta}>Hair History</Text>
              </View>
              <View style={styles.questionProgressTrack}>
                <View style={[styles.questionProgressFill, { width: `${((questionIndex + 1) / visibleQuestions.length) * 100}%` }]} />
              </View>
            </View>

            <View style={styles.questionPanel}>
              {renderQuestionInput()}
            </View>

            <View style={styles.questionInfoCard}>
              <AppIcon name="information-outline" size="md" state="active" />
              <View style={styles.questionInfoCopy}>
                <Text style={styles.questionInfoTitle}>Why does this matter?</Text>
                <Text style={styles.questionInfoBody}>
                  Your answers help the AI compare your photos with donation readiness rules before it checks length, texture, dryness, and visible damage.
                </Text>
              </View>
            </View>
          </View>
        );
      case 1:
        {
          const reviewAnswers = getCurrentQuestionnaireAnswers();
          const reviewVisibleQuestions = getVisibleQuestions(reviewAnswers, questionnaireMode);
          const answerRows = reviewVisibleQuestions.map((question) => ({
            key: question.key,
            label: question.title,
            value: getChoiceDisplayLabel(question.optionsKey, reviewAnswers?.[question.key]),
          }));
          const chemicalQuestion = reviewVisibleQuestions.find((question) => (
            question.key === 'chemicalProcessHistory' || question.key === 'chemicalTreatmentSinceLastCheck'
          ));
          const textureAnswer = getChoiceDisplayLabel('hairProgress', reviewAnswers?.hairConditionProgress);
          const bleachValue = chemicalQuestion
            ? getChoiceDisplayLabel(chemicalQuestion.optionsKey, reviewAnswers?.[chemicalQuestion.key])
            : 'No Bleach';
          const heatValue = getChoiceDisplayLabel(
            questionnaireMode === 'returning_follow_up' ? 'heatUseFrequency' : 'heatUseFrequency',
            questionnaireMode === 'returning_follow_up'
              ? reviewAnswers?.heatUseSinceLastCheck
              : reviewAnswers?.heatUse
          );

        return (
          <View style={styles.readinessStage}>
            <View style={styles.questionProgressBlock}>
              <View style={styles.questionProgressLabels}>
                <Text style={styles.questionProgressText}>Step 3 of 3</Text>
                <Text style={styles.questionProgressMeta}>Final Review</Text>
              </View>
              <View style={styles.questionProgressTrack}>
                <View style={[styles.questionProgressFill, { width: '100%' }]} />
              </View>
            </View>

            <View style={styles.readinessHeader}>
              <Text style={styles.readinessTitle}>Ready to Scan</Text>
              <Text style={styles.readinessBody}>
                We have gathered your answers. Check the summary before opening the camera scanner.
              </Text>
            </View>

            <View style={styles.readinessGrid}>
              <View style={styles.recapCard}>
                <View style={styles.recapHeader}>
                  <AppIcon name="water-outline" size="md" state="active" />
                  <Text style={styles.recapTitle}>Chemical History</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Bleach / treatment</Text>
                  <Text style={styles.recapPill}>{bleachValue}</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Heat use</Text>
                  <Text style={styles.recapPill}>{heatValue}</Text>
                </View>
              </View>

              <View style={styles.recapCard}>
                <View style={styles.recapHeader}>
                  <AppIcon name="ruler" size="md" state="active" />
                  <Text style={styles.recapTitle}>Physical Traits</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Current length</Text>
                  <Text style={styles.recapPill}>To be scanned</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Texture</Text>
                  <Text style={styles.recapPill}>{textureAnswer || 'To be scanned'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>Tips for a perfect scan</Text>
              {PHOTO_GUIDELINE_ITEMS.slice(0, 3).map((item) => (
                <View key={item} style={styles.tipRow}>
                  <AppIcon name="check-circle-outline" size="sm" state="active" />
                  <Text style={styles.tipText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.answerSummaryCompact}>
              {answerRows.slice(0, 3).map((item) => (
                <Text key={item.key} numberOfLines={1} style={styles.answerSummaryItem}>
                  {item.label}: {item.value}
                </Text>
              ))}
            </View>

            <AppButton
              title="Start Camera Scan"
              onPress={async () => {
                const reviewAnswers = getCurrentQuestionnaireAnswers();
                const reviewQuestions = getVisibleQuestions(reviewAnswers, questionnaireMode);
                const firstUnansweredIndex = findFirstUnansweredQuestionIndex(reviewQuestions, reviewAnswers);

                if (firstUnansweredIndex >= 0) {
                  setQuestionIndex(firstUnansweredIndex);
                  setStepIndex(0);
                  return;
                }

                Object.entries(reviewAnswers).forEach(([key, value]) => {
                  questionForm.setValue(key, value, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: false,
                  });
                });

                const isValid = await questionForm.trigger();
                if (!isValid) {
                  const latestAnswers = getCurrentQuestionnaireAnswers();
                  const latestQuestions = getVisibleQuestions(latestAnswers, questionnaireMode);
                  const latestMissingIndex = findFirstUnansweredQuestionIndex(latestQuestions, latestAnswers);
                  setQuestionIndex(Math.max(latestMissingIndex, 0));
                  setStepIndex(0);
                  return;
                }

                complianceForm.setValue('acknowledged', true, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
                await requestLiveCameraPermission();
                setStepIndex(2);
              }}
              leading={<AppIcon name="camera" state="inverse" />}
              fullWidth
            />
            <AppButton
              title="Edit Answers"
              variant="ghost"
              onPress={() => {
                setQuestionIndex(0);
                setStepIndex(0);
              }}
              fullWidth
            />
          </View>
        );
        }
      case 2:
        return (
          <LiveHairCameraPanel
            autoCaptureEnabled={autoCaptureEnabled}
            cameraFacing={cameraFacing}
            currentView={currentView}
            currentPhoto={currentPhoto}
            flashMode={flashMode}
            requiredViews={requiredViews}
            completedPhotoCount={completedPhotoCount}
            hasCameraPermission={hasCameraPermission}
            cameraRef={cameraRef}
            liveScanStatus={liveScanStatus}
            liveFaceStatus={liveFaceStatus}
            canUseNativeLiveCamera={canUseNativeLiveCamera}
            isCapturing={isCapturingPhoto || isCapturingImages}
            isUploading={isPickingImages}
            isAnalyzing={isAnalyzing}
            onCapture={() => handleCapturePhoto(photoIndex)}
            onToggleCamera={toggleCameraFacing}
            onToggleFlash={toggleFlashMode}
            onUpload={() => handleLiveUpload(photoIndex)}
            onRemove={() => removePhoto(photoIndex)}
            onClose={closeAnalyzerToHome}
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
        if (analysis) {
          const healthScore = getAnalysisHealthScore(analysis);
          const scoreLabel = getScoreLabel(healthScore);
          const conditionInsights = buildConditionInsights(analysis);
          const recommendations = (analysis.recommendations || []).length
            ? analysis.recommendations
            : buildDefaultRecommendations(analysis);
          const donationAssessment = buildDonationAssessment({ analysis, donationRequirement });
          const sideProfileIndex = requiredViews.findIndex((view) => view?.key === 'side_profile');
          const frontViewIndex = requiredViews.findIndex((view) => view?.key === 'front_view');
          const scanPhoto = photos[sideProfileIndex]?.uri
            ? photos[sideProfileIndex]
            : photos[frontViewIndex]?.uri
              ? photos[frontViewIndex]
              : photos.find((photo) => photo?.uri);

          return (
            <View style={styles.analysisResultPanel}>
              <View style={styles.analysisResultTopBar}>
                <Pressable onPress={() => setStepIndex(2)} style={styles.resultHeaderButton}>
                  <AppIcon name="arrow-left" size="md" state="default" />
                </Pressable>
                <Text style={styles.analysisResultScreenTitle}>Analysis Results</Text>
                <Pressable style={styles.resultHeaderButton}>
                  <AppIcon name="share-variant-outline" size="md" state="default" />
                </Pressable>
              </View>

              <View style={styles.resultSectionCard}>
                <View style={styles.resultSectionHeader}>
                  <Text style={styles.resultSectionTitle}>Your Hair Condition</Text>
                  <View style={styles.conditionBadge}>
                    <View style={styles.conditionBadgeDot} />
                    <Text style={styles.conditionBadgeText}>{scoreLabel}</Text>
                  </View>
                </View>
                <View style={styles.healthScoreBlock}>
                  <View style={styles.healthScoreRow}>
                    <Text style={styles.healthScoreValue}>{healthScore}</Text>
                    <Text style={styles.healthScoreMax}>/100</Text>
                  </View>
                  <View style={styles.healthScoreTrack}>
                    <View style={[styles.healthScoreFill, { width: `${healthScore}%` }]} />
                  </View>
                </View>
                <View style={styles.conditionInsightList}>
                  {conditionInsights.map((item) => <ConditionInsightRow key={item.key} item={item} />)}
                </View>
              </View>

              <View style={styles.resultSectionCard}>
                <Text style={styles.resultSectionTitle}>AI Recommendations</Text>
                <View style={styles.aiRecommendationList}>
                  {recommendations.slice(0, 4).map((recommendation, index) => (
                    <AiRecommendationRow
                      key={`${recommendation.priority_order || index}-${recommendation.title || recommendation.recommendation_text}`}
                      recommendation={recommendation}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.donationAssessmentCard}>
                <Pressable
                  onPress={scanPhoto?.uri ? () => setPreviewImageUri(scanPhoto.uri) : undefined}
                  disabled={!scanPhoto?.uri}
                  style={({ pressed }) => [
                    styles.cutLineImageWrap,
                    scanPhoto?.uri ? styles.cutLineImageTouchable : null,
                    pressed ? styles.pressedMuted : null,
                  ]}
                  accessibilityRole={scanPhoto?.uri ? 'imagebutton' : 'image'}
                  accessibilityLabel={scanPhoto?.uri ? 'Open full hair scan photo preview' : 'Hair scan photo unavailable'}
                >
                  {scanPhoto?.uri ? (
                    <>
                      <Image source={{ uri: scanPhoto.uri }} style={styles.cutLineImage} resizeMode="cover" />
                      <View style={styles.cutLinePreviewHint} pointerEvents="none">
                        <AppIcon name="image-search-outline" size="sm" state="inverse" />
                        <Text style={styles.cutLinePreviewHintText}>Preview</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.cutLineImageFallback}>
                      <AppIcon name="image" size="xl" state="muted" />
                    </View>
                  )}
                  {donationAssessment.meetsLengthRequirement ? (
                    <>
                      <View style={styles.cutLineLabel} pointerEvents="none">
                        <Text style={styles.cutLineLabelText}>
                          Cut guide - {donationAssessment.donatableLengthLabel} donatable
                        </Text>
                      </View>
                      <View
                        pointerEvents="none"
                        style={[styles.cutLineOverlay, { bottom: `${donationAssessment.cutLineBottomPercent}%` }]}
                      >
                        <View style={styles.cutLineDashed} />
                        <View style={styles.cutLineScissorBadge}>
                          <AppIcon name="content-cut" size="sm" state="inverse" />
                        </View>
                        <View style={styles.cutLineDashed} />
                      </View>
                    </>
                  ) : null}
                </Pressable>
                <View style={styles.donationAssessmentBody}>
                  <Text style={styles.resultSectionTitle}>Hair Donation Assessment</Text>
                  <View style={styles.assessmentRows}>
                    <View style={styles.assessmentRow}>
                      <Text style={styles.assessmentLabel}>Donatable Length</Text>
                      <Text style={styles.assessmentValue}>{donationAssessment.donatableLengthLabel}</Text>
                    </View>
                    <View style={styles.assessmentRow}>
                      <Text style={styles.assessmentLabel}>Hair Length</Text>
                      <Text style={styles.assessmentValue}>{donationAssessment.hairLengthLabel}</Text>
                    </View>
                  </View>
                  <View style={styles.assessmentNote}>
                    <AppIcon name="donations" size="md" state="active" />
                    <Text style={styles.assessmentNoteText}>{donationAssessment.summary}</Text>
                  </View>
                </View>
              </View>

              {invalidPhotoMessage ? (
                <StatusBanner
                  title="Photo review note"
                  message={invalidPhotoMessage}
                  variant="info"
                  style={styles.bannerGap}
                />
              ) : null}

              <View style={styles.resultActions}>
                {donationAssessment.isDonationReady ? (
                  <AppButton
                    title="Find Donation Drives"
                    onPress={() => router.replace('/donor/home?tab=drives')}
                    disabled={isSaving || isAnalyzing}
                    fullWidth
                  />
                ) : null}
                <AppButton
                  title={isSaving ? 'Saving...' : 'Save Results'}
                  variant={donationAssessment.isDonationReady ? 'outline' : 'primary'}
                  onPress={saveConfirmedAnalysis}
                  loading={isSaving}
                  disabled={isSaving || isAnalyzing}
                  fullWidth
                />
                <Pressable
                  onPress={() => {
                    resetFlow();
                    correctionForm.reset(buildHairResultCorrectionDefaultValues(null));
                    setResultConfirmationMode('pending');
                    setPhotoIndex(0);
                    setQuestionIndex(0);
                    setStepIndex(0);
                  }}
                  disabled={isSaving || isAnalyzing}
                  style={styles.scanAgainLink}
                >
                  <Text style={styles.scanAgainText}>Scan Again</Text>
                </Pressable>
              </View>
            </View>
          );
        }

        return pageErrorState ? (
          <View style={styles.analysisResultPanel}>
            <View style={styles.analysisResultTopBar}>
              <Pressable
                onPress={() => {
                  setStepIndex(2);
                  setPhotoIndex(0);
                  clearAnalysisError();
                }}
                style={styles.resultHeaderButton}
              >
                <AppIcon name="arrow-left" size="md" state="default" />
              </Pressable>
              <Text style={styles.analysisResultScreenTitle}>Analysis Results</Text>
              <View style={styles.resultHeaderButtonPlaceholder} />
            </View>

            <View style={styles.resultSectionCard}>
              <View style={styles.resultSectionHeader}>
                <Text style={styles.resultSectionTitle}>Analysis needs a clearer scan</Text>
                <View style={styles.conditionBadge}>
                  <View style={styles.conditionBadgeDotWarning} />
                  <Text style={styles.conditionBadgeText}>RETAKE</Text>
                </View>
              </View>
              <Text style={styles.resultErrorBody}>
                The AI could not complete a reliable hair result from the current photos. Retake the required views in bright light with your hair centered, then run the analysis again.
              </Text>
              <View style={styles.resultActions}>
                <AppButton
                  title="Retake photos"
                  variant="outline"
                  onPress={() => {
                    setStepIndex(2);
                    setPhotoIndex(0);
                    clearAnalysisError();
                  }}
                  disabled={isAnalyzing || isSaving}
                  fullWidth
                />
                <AppButton
                  title={isRetryCooldownActive
                    ? `Try again in ${retryCountdownSeconds}s`
                    : isAnalyzing
                      ? 'Retrying...'
                      : 'Try again'}
                  onPress={async () => {
                    await runFreshAnalysisAttempt('error_result_retry');
                  }}
                  loading={isAnalyzing}
                  disabled={isAnalyzing || isSaving || isRetryCooldownActive}
                  fullWidth
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.analysisResultPanel}>
            <View style={styles.analysisResultTopBar}>
              <Pressable onPress={() => setStepIndex(2)} style={styles.resultHeaderButton}>
                <AppIcon name="arrow-left" size="md" state="default" />
              </Pressable>
              <Text style={styles.analysisResultScreenTitle}>Analysis Results</Text>
              <View style={styles.resultHeaderButtonPlaceholder} />
            </View>
            <View style={styles.resultSectionCard}>
              <Text style={styles.resultSectionTitle}>Ready for AI analysis</Text>
              <Text style={styles.resultErrorBody}>
                Your answers and hair photos are ready. Run the analysis to generate your hair condition, recommendations, and donation assessment.
              </Text>
              <AppButton
                title={isAnalyzing ? 'Analyzing...' : 'Run analysis'}
                onPress={async () => {
                  await runFreshAnalysisAttempt('ready_state_retry');
                }}
                loading={isAnalyzing}
                disabled={isAnalyzing || isSaving}
                fullWidth
              />
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  if (isDonorProfileComplete && isAnalyzerActive) {
    const analyzerContent = (
      <View style={stepIndex === 2 ? styles.cameraWizardStage : styles.wizardStage}>
        {stepIndex === 2 ? null : (
          <View style={styles.closeOnlyHeader}>
            <Pressable onPress={closeAnalyzerToHome} style={styles.iconNavButton}>
              <AppIcon name="close" size="md" state="muted" />
            </Pressable>
          </View>
        )}

        <View style={styles.stepContentWrap}>
          {renderStepContent()}
        </View>

        {stepIndex === 1 || stepIndex === 2 || stepIndex === 3 ? null : (
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
        )}
      </View>
    );

    return (
      <View style={styles.analyzerStandalone}>
        {stepIndex === 2 ? analyzerContent : (
          <ScrollView
            style={styles.analyzerScroll}
            contentContainerStyle={styles.analyzerScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {analyzerContent}
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <DashboardLayout
      showSupportChat
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
        </View>
      ) : (
        <View style={stepIndex === 2 ? styles.cameraWizardStage : styles.wizardStage}>
          {stepIndex === 2 ? null : (
            <View style={styles.closeOnlyHeader}>
              <Pressable onPress={closeAnalyzerToHome} style={styles.iconNavButton}>
                <AppIcon name="close" size="md" state="muted" />
              </Pressable>
            </View>
          )}

          <View style={styles.stepContentWrap}>
            {renderStepContent()}
          </View>

          {stepIndex === 1 || stepIndex === 2 || stepIndex === 3 ? null : (
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
          )}
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

      <Modal
        transparent
        visible={Boolean(previewImageUri)}
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setPreviewImageUri('')}
      >
        <View style={styles.imagePreviewOverlay}>
          <Pressable style={styles.imagePreviewBackdrop} onPress={() => setPreviewImageUri('')} />
          <View style={styles.imagePreviewCard}>
            <View style={styles.imagePreviewHeader}>
              <Text style={styles.imagePreviewTitle}>Photo Preview</Text>
              <Pressable
                onPress={() => setPreviewImageUri('')}
                style={({ pressed }) => [styles.imagePreviewClose, pressed ? styles.pressedMuted : null]}
                accessibilityRole="button"
                accessibilityLabel="Close photo preview"
              >
                <AppIcon name="close" size="sm" state="inverse" />
              </Pressable>
            </View>
            {previewImageUri ? (
              <Image source={{ uri: previewImageUri }} style={styles.imagePreviewImage} resizeMode="contain" />
            ) : null}
          </View>
        </View>
      </Modal>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  analyzerStandalone: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  analyzerScroll: {
    flex: 1,
  },
  analyzerScrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  wizardStage: {
    width: '100%',
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  cameraWizardStage: {
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 0,
  },
  closeOnlyHeader: {
    alignItems: 'flex-end',
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
  checkHairVoiceBar: {
    minHeight: 42,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  checkHairVoiceButton: {
    flex: 1,
    minHeight: 32,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSoft,
  },
  checkHairVoiceButtonDisabled: {
    opacity: 0.55,
  },
  checkHairVoiceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  checkHairVoiceToggle: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  checkHairVoiceReply: {
    flex: 1.2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    maxWidth: 160,
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
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
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
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
    textAlign: 'left',
  },
  summaryHeroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    textAlign: 'left',
  },
  startHairWidget: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
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
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
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
    minHeight: 124,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
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
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    ...theme.shadows.soft,
  },
  calendarLeadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceCardMuted,
    borderRadius: theme.radius.xl,
  },
  calendarLeadIconWrap: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
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
    gap: 6,
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
  calendarLeadStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  calendarLeadStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarHeaderCopy: {
    flex: 1,
  },
  calendarMonthLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
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
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  calendarCellWeek: {
    flex: 1,
    width: undefined,
    minHeight: 86,
    borderRadius: 20,
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
    fontSize: 13,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  calendarCellIconWrap: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCellPlaceholder: {
    width: 22,
    height: 22,
  },
  conditionDot: {
    width: 8,
    height: 8,
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
    backgroundColor: theme.colors.surfaceCardMuted,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  calendarModeButton: {
    minHeight: 34,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
  },
  calendarModeButtonActive: {
    backgroundColor: theme.colors.brandPrimary,
    ...theme.shadows.pressed,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
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
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  choiceLabelActive: {
    fontWeight: theme.typography.weights.semibold,
  },
  choiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  choiceIconWrapActive: {
    backgroundColor: theme.colors.brandPrimary,
  },
  questionnaireStage: {
    gap: theme.spacing.lg,
  },
  questionProgressBlock: {
    gap: theme.spacing.xs,
  },
  questionProgressLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  questionProgressText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  questionProgressMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    textTransform: 'uppercase',
  },
  questionProgressTrack: {
    height: 8,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
  },
  questionProgressFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  questionPanel: {
    padding: theme.spacing.lg,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    ...theme.shadows.soft,
  },
  questionInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  questionInfoCopy: {
    flex: 1,
    gap: 3,
  },
  questionInfoTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  questionInfoBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  readinessStage: {
    gap: theme.spacing.lg,
  },
  readinessHeader: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  readinessTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleLg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
    textAlign: 'center',
  },
  readinessBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  readinessGrid: {
    gap: theme.spacing.md,
  },
  recapCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    ...theme.shadows.soft,
  },
  recapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  recapTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  recapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  recapLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  recapPill: {
    overflow: 'hidden',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    backgroundColor: theme.colors.surfaceSoft,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  tipsCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  tipsTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  tipText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  answerSummaryCompact: {
    gap: theme.spacing.xs,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  stepProgressTrack: {
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
    overflow: 'hidden',
    marginBottom: theme.spacing.xs,
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
    gap: theme.spacing.sm,
    paddingBottom: 0,
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  liveCameraStage: {
    alignSelf: 'center',
    borderRadius: 0,
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
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  liveCameraPermissionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.body,
    color: theme.colors.textPrimary,
  },
  liveCameraPermissionBody: {
    maxWidth: 220,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  livePermissionAction: {
    marginTop: theme.spacing.xs,
    minWidth: 190,
  },
  liveCameraTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.45)',
    zIndex: 4,
  },
  liveCameraOverlayIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  liveStatusPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '52%',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(17,17,17,0.58)',
  },
  liveStatusPillSuccess: {
    backgroundColor: 'rgba(17,17,17,0.58)',
  },
  liveStatusPillWarning: {
    backgroundColor: 'rgba(17,17,17,0.58)',
  },
  liveStatusPillError: {
    backgroundColor: 'rgba(17,17,17,0.58)',
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
    color: theme.colors.textInverse,
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
    top: 118,
    left: 48,
    right: 48,
    bottom: 210,
    borderRadius: 18,
  },
  liveLengthGuide: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  liveLengthGuideLine: {
    flex: 1,
    width: 2,
    marginVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  liveLengthGuideLabelTop: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
    textTransform: 'uppercase',
  },
  liveLengthGuideLabelBottom: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
    textTransform: 'uppercase',
  },
  liveScanLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 16,
    height: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
    shadowColor: theme.colors.brandPrimary,
    shadowOpacity: 0.45,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 2,
  },
  liveFrameCornerTopLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 44,
    height: 44,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: theme.colors.brandPrimary,
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
    borderColor: theme.colors.brandPrimary,
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
    borderColor: theme.colors.brandPrimary,
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
    borderColor: theme.colors.brandPrimary,
    borderBottomRightRadius: 22,
  },
  liveCameraBottomSheet: {
    width: '100%',
    padding: theme.spacing.md,
    borderRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#111111',
    gap: theme.spacing.xs,
  },
  liveScanFloatingCard: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: 118,
    zIndex: 3,
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  liveScanMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  liveScanMetricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
  },
  liveScanMetricValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  liveScanMetricValueAccent: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  liveScanProgressTrack: {
    height: 7,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSoft,
  },
  liveScanProgressFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  liveHoldStillText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textInverse,
    marginTop: theme.spacing.xs,
  },
  liveCaptureControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  liveRoundControl: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  liveCaptureButton: {
    width: 68,
    height: 68,
    borderRadius: theme.radius.full,
    borderWidth: 5,
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.backgroundPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadows.md,
  },
  liveCaptureButtonReady: {
    borderColor: theme.colors.textSuccess,
    shadowColor: theme.colors.textSuccess,
  },
  liveCaptureButtonDisabled: {
    opacity: 0.6,
  },
  liveAnalysisToast: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  liveAnalysisToastText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
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
  liveViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  liveViewHint: {
    overflow: 'hidden',
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    backgroundColor: theme.colors.surfaceSoft,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  liveCameraTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textInverse,
  },
  liveCameraBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: 'rgba(255,255,255,0.78)',
  },
  liveChecklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: 0,
  },
  liveChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  liveChecklistText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textInverse,
  },
  liveAutoCaptureText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.brandPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  liveActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  livePrimaryAction: {
    flex: 1,
    minWidth: 0,
  },
  liveSecondaryAction: {
    flex: 1,
    minWidth: 0,
  },
  liveRemoveAction: {
    alignSelf: 'center',
  },
  livePhotoOverlayActions: {
    position: 'absolute',
    right: theme.spacing.sm,
    bottom: 58,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  livePhotoIconButton: {
    minWidth: 74,
    minHeight: 38,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(17,17,17,0.72)',
  },
  livePhotoIconButtonPressed: {
    opacity: 0.78,
  },
  livePhotoIconText: {
    color: theme.colors.textInverse,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  liveThumbRail: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    width: '100%',
  },
  liveThumbItem: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.10)',
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
    color: theme.colors.textInverse,
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
    width: '100%',
    minHeight: 360,
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  analysisScanHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  analysisSplashLogo: {
    width: 70,
    height: 70,
  },
  analysisSplashTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  analysisSplashText: {
    maxWidth: 280,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  analysisScanPercent: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  analysisScanRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: theme.spacing.md,
  },
  analysisScanPreview: {
    flex: 1,
    aspectRatio: 1,
    minWidth: 148,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  analysisScanImage: {
    width: '100%',
    height: '100%',
  },
  analysisScanGrid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  analysisScanBadge: {
    position: 'absolute',
    left: theme.spacing.sm,
    bottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
    backgroundColor: 'rgba(17,17,17,0.72)',
  },
  analysisScanDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  analysisScanBadgeText: {
    color: theme.colors.textInverse,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    textTransform: 'uppercase',
  },
  analysisScanChecks: {
    width: 132,
    gap: theme.spacing.sm,
  },
  analysisScanCheck: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  analysisScanCheckText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  analysisScanProgressTrack: {
    height: 8,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  analysisScanProgressFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  analysisResultPanel: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  analysisResultTopBar: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  resultHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  analysisResultScreenTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  resultSectionCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundPrimary,
    ...theme.shadows.soft,
  },
  resultSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  resultSectionTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  conditionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceCardMuted,
  },
  conditionBadgeDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  conditionBadgeDotWarning: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.textError,
  },
  conditionBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  healthScoreBlock: {
    gap: theme.spacing.xs,
  },
  healthScoreRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  healthScoreValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 38,
    lineHeight: 44,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  healthScoreMax: {
    paddingBottom: 5,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  healthScoreTrack: {
    height: 8,
    borderRadius: theme.radius.full,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
  },
  healthScoreFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  conditionInsightList: {
    gap: theme.spacing.sm,
  },
  conditionInsightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  conditionInsightText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  conditionInsightTextMuted: {
    color: theme.colors.textSecondary,
  },
  aiRecommendationList: {
    gap: theme.spacing.md,
  },
  aiRecommendationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  aiRecommendationIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  aiRecommendationCopy: {
    flex: 1,
    gap: 2,
  },
  aiRecommendationTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  aiRecommendationText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  donationAssessmentCard: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundPrimary,
    ...theme.shadows.soft,
  },
  cutLineImageWrap: {
    height: 224,
    backgroundColor: theme.colors.surfaceSoft,
    position: 'relative',
  },
  cutLineImageTouchable: {
    overflow: 'hidden',
  },
  cutLineImage: {
    width: '100%',
    height: '100%',
  },
  cutLinePreviewHint: {
    position: 'absolute',
    right: theme.spacing.sm,
    bottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  cutLinePreviewHintText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  cutLineImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cutLineOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cutLineDashed: {
    flex: 1,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: theme.colors.brandPrimary,
  },
  cutLineScissorBadge: {
    width: 34,
    height: 34,
    marginHorizontal: theme.spacing.xs,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
    ...theme.shadows.soft,
  },
  cutLineLabel: {
    position: 'absolute',
    top: theme.spacing.sm,
    alignSelf: 'center',
    maxWidth: '88%',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
    ...theme.shadows.soft,
  },
  cutLineLabelText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textOnBrand,
  },
  donationAssessmentBody: {
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  imagePreviewOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
  },
  imagePreviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  imagePreviewCard: {
    flex: 1,
    maxHeight: '92%',
    borderRadius: 18,
    overflow: 'hidden',
  },
  imagePreviewHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  imagePreviewTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  imagePreviewClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  imagePreviewImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  assessmentRows: {
    gap: theme.spacing.xs,
  },
  assessmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  assessmentLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textSecondary,
  },
  assessmentValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  assessmentNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  assessmentNoteText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  resultActions: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  resultErrorBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  resultHeaderButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  scanAgainLink: {
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
  },
  scanAgainText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
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
  donationInstructionCard: {
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  donationInstructionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  donationInstructionIcon: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  donationInstructionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  donationInstructionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  donationInstructionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  donationSteps: {
    gap: theme.spacing.sm,
  },
  donationStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  donationStepBadge: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  donationStepBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.brandPrimary,
  },
  donationStepText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textPrimary,
  },
  destinationBox: {
    gap: 4,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  destinationLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  destinationText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
  },
  destinationMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
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
    marginTop: theme.spacing.xs,
    marginBottom: 0,
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
