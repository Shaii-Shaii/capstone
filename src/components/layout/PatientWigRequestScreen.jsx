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
import Constants from 'expo-constants';
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
import { resolveThemeRoles, theme } from '../../design-system/theme';
import { patientDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';
import { usePatientWigRequest } from '../../hooks/usePatientWigRequest';
import { useNotifications } from '../../hooks/useNotifications';
import { useProcessTracking } from '../../hooks/useProcessTracking';
import { ProcessStatusTracker } from '../tracking/ProcessStatusTracker';
import { wigRequestDefaultValues, wigRequestSchema } from '../../features/wigRequest.schema';
import { logAppError } from '../../utils/appErrors';

let NativeVisionCamera = null;
let useNativeCameraDevice = null;
let useNativeFrameProcessor = null;
let useNativeFaceDetector = null;
let NativeWorklets = null;
let MediaPipeCamera = null;
let useMediaPipeFaceLandmarkDetection = null;
let MediaPipeRunningMode = null;
let MediaPipeDelegate = null;
const isExpoGoRuntime = Constants?.appOwnership === 'expo';

try {
  if (!isExpoGoRuntime) {
    const visionCameraModule = require('react-native-vision-camera');
    NativeVisionCamera = visionCameraModule?.Camera || null;
    useNativeCameraDevice = visionCameraModule?.useCameraDevice || null;
    useNativeFrameProcessor = visionCameraModule?.useFrameProcessor || null;
  }
} catch {
  NativeVisionCamera = null;
  useNativeCameraDevice = null;
  useNativeFrameProcessor = null;
}

try {
  if (!isExpoGoRuntime) {
    const faceDetectorModule = require('react-native-vision-camera-face-detector');
    useNativeFaceDetector = faceDetectorModule?.useFaceDetector || null;
  }
} catch {
  useNativeFaceDetector = null;
}

try {
  if (!isExpoGoRuntime) {
    const workletsModule = require('react-native-worklets-core');
    NativeWorklets = workletsModule?.Worklets || null;
  }
} catch {
  NativeWorklets = null;
}

try {
  if (!isExpoGoRuntime) {
    const mediaPipeModule = require('react-native-mediapipe');
    MediaPipeCamera = mediaPipeModule?.MediapipeCamera || null;
    useMediaPipeFaceLandmarkDetection = mediaPipeModule?.useFaceLandmarkDetection || null;
    MediaPipeRunningMode = mediaPipeModule?.RunningMode || null;
    MediaPipeDelegate = mediaPipeModule?.Delegate || null;
  }
} catch {
  MediaPipeCamera = null;
  useMediaPipeFaceLandmarkDetection = null;
  MediaPipeRunningMode = null;
  MediaPipeDelegate = null;
}

const canUseMediaPipeTryOnCamera = Boolean(
  MediaPipeCamera
  && useMediaPipeFaceLandmarkDetection
  && MediaPipeRunningMode
  && MediaPipeDelegate
  && NativeVisionCamera
  && useNativeCameraDevice
);

const canUseNativeTryOnCamera = Boolean(
  NativeVisionCamera
  && useNativeCameraDevice
  && useNativeFrameProcessor
  && useNativeFaceDetector
  && NativeWorklets?.createRunOnJS
);

const canUseFaceTrackingTryOnCamera = canUseMediaPipeTryOnCamera || canUseNativeTryOnCamera;
const FACE_LANDMARKER_MODEL = 'face_landmarker.task';

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

const formatRequestStatus = (value) => {
  const raw = String(value || 'Pending').trim();
  if (!raw) return 'Pending';
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

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

const normalizeMatchText = (value) => String(value || '').trim().toLowerCase();

const collectWigSearchText = (wig) => normalizeMatchText([
  wig?.wig_name,
  wig?.fit_settings?.label,
  wig?.fit_settings?.style,
  wig?.fit_settings?.color,
  wig?.fit_settings?.length,
  wig?.fit_settings?.texture,
  wig?.fit_settings?.tags,
  wig?.fit_settings?.recommended_for,
  wig?.fit_settings?.recommendation_tags,
  wig?.pending_wig_name,
  wig?.pending_hair_color,
  wig?.pending_hair_texture,
  wig?.pending_hair_density,
  wig?.pending_cap_size,
  wig?.pending_style,
].flat().filter(Boolean).join(' '));

const getRecommendedWigIds = ({ wigs, preferredColor, preferredLength, hairTexture, recommendationTitle, recommendationFamily }) => {
  const preferenceTerms = [
    preferredColor,
    preferredLength,
    hairTexture,
    recommendationTitle,
    recommendationFamily,
  ]
    .map(normalizeMatchText)
    .filter(Boolean);

  if (!Array.isArray(wigs) || !wigs.length || !preferenceTerms.length) return new Set();

  const scored = wigs
    .map((wig) => {
      const searchText = collectWigSearchText(wig);
      const score = preferenceTerms.reduce((total, term) => {
        if (!term) return total;
        if (searchText.includes(term)) return total + 2;

        return total + term
          .split(/\s+/)
          .filter((part) => part.length > 2 && searchText.includes(part))
          .length;
      }, 0);

      return { wig, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score || 0;
  return new Set(
    scored
      .filter((item) => item.score === topScore || item.score >= 2)
      .slice(0, 3)
      .map((item) => item.wig.id)
  );
};

const LAYER_SETTING_KEYS = {
  fullWig: ['fullWig', 'full_wig', 'full-wig', 'FullWig', 'Full Wig', 'full_wig_layer'],
  backHair: ['backHair', 'back_hair', 'back-hair', 'BackHair', 'Back Hair', 'back_hair_layer'],
  frontBangs: ['frontBangs', 'front_bangs', 'front-bangs', 'FrontBangs', 'Front Bangs', 'front_bangs_layer'],
};

const getLayerSettingsCandidates = (fitSettings = {}, layerKey = 'fullWig') => {
  const keys = LAYER_SETTING_KEYS[layerKey] || [layerKey];
  const scopedSources = [
    fitSettings?.layers,
    fitSettings?.Layers,
    fitSettings?.layerSettings,
    fitSettings?.layer_settings,
    fitSettings,
  ].filter(Boolean);

  return [
    ...scopedSources.flatMap((source) => keys.map((key) => source?.[key])),
    fitSettings,
  ].filter(Boolean);
};

const resolveLayerFit = (fitSettings = {}, layerKey = 'fullWig') => {
  const candidates = getLayerSettingsCandidates(fitSettings, layerKey);
  const source = candidates[0] || {};
  const offsetSource = source.offset || source.position || source.translate || {};
  const width = source.width ?? source.w ?? (layerKey === 'fullWig' ? 72 : 64);
  const height = source.height ?? source.h ?? (layerKey === 'fullWig' ? 70 : 42);
  const x = source.x ?? source.left ?? offsetSource.x ?? source.offsetX ?? source.offset_x ?? (layerKey === 'fullWig' ? 14 : 18);
  const y = source.y ?? source.top ?? offsetSource.y ?? source.offsetY ?? source.offset_y ?? (layerKey === 'frontBangs' ? 18 : 12);
  const scale = Number(source.scale ?? fitSettings?.scale ?? 1) || 1;
  const rotation = source.rotation ?? source.rotate ?? fitSettings?.rotation ?? 0;
  const opacity = source.opacity ?? 1;
  const offsetX = Number(source.offsetX ?? source.offset_x ?? source.translateX ?? source.translate_x ?? source.xOffset ?? source.x_offset ?? offsetSource.x ?? 0) || 0;
  const offsetY = Number(source.offsetY ?? source.offset_y ?? source.translateY ?? source.translate_y ?? source.yOffset ?? source.y_offset ?? offsetSource.y ?? 0) || 0;

  return {
    width,
    height,
    x,
    y,
    scale,
    rotation,
    opacity,
    offsetX,
    offsetY,
  };
};

const toPercent = (value, fallback) => {
  if (typeof value === 'string') return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return `${fallback}%`;
  return `${numericValue > 1 ? numericValue : numericValue * 100}%`;
};

const buildTryOnLayerStyle = (fitSettings, layerKey, zIndex) => {
  const fit = resolveLayerFit(fitSettings, layerKey);

  return {
    position: 'absolute',
    left: toPercent(fit.x, 50),
    top: toPercent(fit.y, 12),
    width: toPercent(fit.width, 72),
    height: toPercent(fit.height, 70),
    opacity: fit.opacity,
    zIndex,
    elevation: zIndex,
    transform: [
      { scale: fit.scale },
      { rotate: typeof fit.rotation === 'number' ? `${fit.rotation}deg` : String(fit.rotation || '0deg') },
    ],
  };
};

const getFacePoint = (faceFrame, key) => {
  const point = faceFrame?.landmarks?.[key];
  const x = Number(point?.x);
  const y = Number(point?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const averagePoints = (points = []) => {
  const validPoints = points.filter(Boolean);
  if (!validPoints.length) return null;

  return {
    x: validPoints.reduce((total, point) => total + point.x, 0) / validPoints.length,
    y: validPoints.reduce((total, point) => total + point.y, 0) / validPoints.length,
  };
};

const distanceBetweenPoints = (a, b) => {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
};

const lerp = (from, to, amount = 0.35) => from + ((to - from) * amount);

const lerpPoint = (previous, next, amount) => {
  if (!previous || !next) return next || null;
  return {
    x: lerp(previous.x, next.x, amount),
    y: lerp(previous.y, next.y, amount),
  };
};

const smoothFaceFrame = (previous, next, amount = 0.35) => {
  if (!next) return null;
  if (!previous) return next;

  const nextBounds = next.bounds || next;
  const previousBounds = previous.bounds || previous;
  const landmarks = Object.keys(next.landmarks || {}).reduce((result, key) => ({
    ...result,
    [key]: lerpPoint(previous.landmarks?.[key], next.landmarks?.[key], amount),
  }), {});

  return {
    ...next,
    rollAngle: lerp(Number(previous.rollAngle || 0), Number(next.rollAngle || 0), amount),
    yawAngle: lerp(Number(previous.yawAngle || 0), Number(next.yawAngle || 0), amount),
    bounds: {
      x: lerp(Number(previousBounds.x ?? previousBounds.left ?? 0), Number(nextBounds.x ?? nextBounds.left ?? 0), amount),
      y: lerp(Number(previousBounds.y ?? previousBounds.top ?? 0), Number(nextBounds.y ?? nextBounds.top ?? 0), amount),
      width: lerp(Number(previousBounds.width || 0), Number(nextBounds.width || 0), amount),
      height: lerp(Number(previousBounds.height || 0), Number(nextBounds.height || 0), amount),
    },
    landmarks,
  };
};

const normalizeFaceTiltDegrees = (angle) => {
  let normalized = Number(angle) || 0;
  normalized = ((normalized + 180) % 360) - 180;
  if (normalized > 90) normalized -= 180;
  if (normalized < -90) normalized += 180;
  return normalized;
};

const rotateNormalizedMediaPipePoint = (point, rotation = 0) => {
  const normalizedRotation = ((Number(rotation) || 0) + 360) % 360;
  if (normalizedRotation === 90) return { x: point.y, y: 1 - point.x };
  if (normalizedRotation === 180) return { x: 1 - point.x, y: 1 - point.y };
  if (normalizedRotation === 270) return { x: 1 - point.y, y: point.x };
  return point;
};

const resolveRotatedFrameSize = (width, height, rotation = 0) => {
  const normalizedRotation = ((Number(rotation) || 0) + 360) % 360;
  if (normalizedRotation === 90 || normalizedRotation === 270) {
    return { width: height, height: width };
  }
  return { width, height };
};

const mapFramePointToView = (point, frameSize, viewSize, mirrored = false) => {
  if (!point || !frameSize?.width || !frameSize?.height || !viewSize?.width || !viewSize?.height) {
    return null;
  }

  const framePoint = {
    x: mirrored ? frameSize.width - point.x : point.x,
    y: point.y,
  };
  const frameRatio = frameSize.width / frameSize.height;
  const viewRatio = viewSize.width / viewSize.height;
  const scale = frameRatio > viewRatio
    ? viewSize.height / frameSize.height
    : viewSize.width / frameSize.width;
  const offsetX = frameRatio > viewRatio ? (viewSize.width - (frameSize.width * scale)) / 2 : 0;
  const offsetY = frameRatio > viewRatio ? 0 : (viewSize.height - (frameSize.height * scale)) / 2;

  return {
    x: (framePoint.x * scale) + offsetX,
    y: (framePoint.y * scale) + offsetY,
  };
};

const getNumericFitValue = (source, keys, fallback) => {
  const candidates = Array.isArray(keys) ? keys : [keys];
  for (const key of candidates) {
    const value = source?.[key];
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) return numericValue;
  }
  return fallback;
};

const resolveLayerAnchor = (fitSettings = {}, layerKey = 'fullWig') => {
  const layerFit = resolveLayerFit(fitSettings, layerKey);
  const layerSettings = getLayerSettingsCandidates(fitSettings, layerKey)[0] || {};
  const anchorSettings = layerSettings?.anchor || layerSettings?.face_anchor || fitSettings?.anchor || fitSettings?.face_anchor || {};

  return {
    faceCenterX: getNumericFitValue(
      anchorSettings,
      ['faceCenterX', 'face_center_x', 'cutoutCenterX', 'cutout_center_x', 'anchorX', 'anchor_x'],
      layerKey === 'frontBangs' ? 0.5 : 0.52
    ),
    foreheadY: getNumericFitValue(
      anchorSettings,
      ['foreheadY', 'forehead_y', 'hairlineY', 'hairline_y', 'anchorY', 'anchor_y'],
      layerKey === 'frontBangs' ? 0.42 : 0.34
    ),
    faceWidthRatio: getNumericFitValue(
      anchorSettings,
      ['faceWidthRatio', 'face_width_ratio', 'cutoutWidthRatio', 'cutout_width_ratio'],
      layerKey === 'frontBangs' ? 0.68 : 0.5
    ),
    faceHeightRatio: getNumericFitValue(
      anchorSettings,
      ['faceHeightRatio', 'face_height_ratio', 'cutoutHeightRatio', 'cutout_height_ratio'],
      layerKey === 'frontBangs' ? 0.38 : 0.62
    ),
    userOffsetX: layerFit.offsetX,
    userOffsetY: layerFit.offsetY,
  };
};

const resolveTryOnConfig = (fitSettings = {}, layerKey = 'fullWig') => {
  const globalConfig = fitSettings?.try_on || fitSettings?.tryOn || fitSettings?.filter || {};
  const layerKeys = LAYER_SETTING_KEYS[layerKey] || [layerKey];
  const layerConfig = [
    ...layerKeys.map((key) => globalConfig?.layers?.[key]),
    ...layerKeys.map((key) => globalConfig?.[key]),
    ...getLayerSettingsCandidates(fitSettings, layerKey).map((settings) => settings?.try_on || settings?.tryOn),
  ].filter(Boolean)[0] || {};
  const source = { ...globalConfig, ...layerConfig };
  const faceHoleSource = source?.faceHole || source?.face_hole || source?.faceOpening || source?.face_opening || {};
  const defaultFaceHole = layerKey === 'frontBangs'
    ? { x: 0.18, y: 0.24, width: 0.64, height: 0.62 }
    : { x: 0.24, y: 0.28, width: 0.52, height: 0.58 };

  return {
    scaleMultiplier: getNumericFitValue(
      source,
      ['scaleMultiplier', 'scale_multiplier', 'widthMultiplier', 'width_multiplier'],
      layerKey === 'frontBangs' ? 0.92 : 1
    ),
    scaleY: getNumericFitValue(
      source,
      ['scaleY', 'scale_y', 'heightScale', 'height_scale'],
      layerKey === 'frontBangs' ? 0.92 : 0.98
    ),
    heightMultiplier: getNumericFitValue(
      source,
      ['heightMultiplier', 'height_multiplier', 'aspectRatio', 'aspect_ratio'],
      layerKey === 'frontBangs' ? 0.42 : 1.9
    ),
    verticalOffset: getNumericFitValue(
      source,
      ['verticalOffset', 'vertical_offset', 'offsetYRatio', 'offset_y_ratio'],
      layerKey === 'frontBangs' ? -0.06 : -0.04
    ),
    horizontalOffset: getNumericFitValue(
      source,
      ['horizontalOffset', 'horizontal_offset', 'offsetXRatio', 'offset_x_ratio'],
      0
    ),
    rotationOffset: getNumericFitValue(
      source,
      ['rotationOffset', 'rotation_offset'],
      0
    ),
    anchor: source?.anchor || 'forehead',
    faceHole: {
      x: getNumericFitValue(faceHoleSource, ['x', 'left'], defaultFaceHole.x),
      y: getNumericFitValue(faceHoleSource, ['y', 'top'], defaultFaceHole.y),
      width: getNumericFitValue(faceHoleSource, ['width', 'w'], defaultFaceHole.width),
      height: getNumericFitValue(faceHoleSource, ['height', 'h'], defaultFaceHole.height),
    },
  };
};

const normalizeMediaPipeLandmarkPoint = (landmark, coordinateSpace) => {
  const x = Number(landmark?.x);
  const y = Number(landmark?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !coordinateSpace?.viewSize?.width || !coordinateSpace?.viewSize?.height) {
    return null;
  }

  const rotatedPoint = rotateNormalizedMediaPipePoint({ x, y }, coordinateSpace.rotation);
  const framePoint = {
    x: rotatedPoint.x * coordinateSpace.frameSize.width,
    y: rotatedPoint.y * coordinateSpace.frameSize.height,
  };

  return mapFramePointToView(
    framePoint,
    coordinateSpace.frameSize,
    coordinateSpace.viewSize,
    coordinateSpace.mirrored
  );
};

const averageMediaPipeLandmarks = (landmarks, indices, coordinateSpace) => (
  averagePoints(indices.map((index) => normalizeMediaPipeLandmarkPoint(landmarks?.[index], coordinateSpace)))
);

const buildMediaPipeFaceFrame = (resultBundle, viewSize, mirrored) => {
  const landmarks = resultBundle?.results?.[0]?.faceLandmarks?.[0];
  if (!Array.isArray(landmarks) || !landmarks.length || !viewSize?.width || !viewSize?.height) {
    return null;
  }

  const inputWidth = Number(resultBundle?.inputImageWidth || viewSize.width);
  const inputHeight = Number(resultBundle?.inputImageHeight || viewSize.height);
  const rotation = Number(resultBundle?.inputImageRotation || 0);
  const coordinateSpace = {
    frameSize: resolveRotatedFrameSize(inputWidth, inputHeight, rotation),
    mirrored,
    rotation,
    viewSize,
  };
  const points = landmarks
    .map((landmark) => normalizeMediaPipeLandmarkPoint(landmark, coordinateSpace))
    .filter(Boolean);
  if (!points.length) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const leftTemple = averageMediaPipeLandmarks(landmarks, [127, 234, 93], coordinateSpace);
  const rightTemple = averageMediaPipeLandmarks(landmarks, [356, 454, 323], coordinateSpace);

  return {
    mediapipe: true,
    autoMode: true,
    frameWidth: viewSize.width,
    frameHeight: viewSize.height,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
    landmarks: {
      LEFT_EYE: averageMediaPipeLandmarks(landmarks, [33, 133, 159, 145], coordinateSpace),
      RIGHT_EYE: averageMediaPipeLandmarks(landmarks, [263, 362, 386, 374], coordinateSpace),
      LEFT_EAR: leftTemple,
      RIGHT_EAR: rightTemple,
      LEFT_TEMPLE: leftTemple,
      RIGHT_TEMPLE: rightTemple,
      FOREHEAD: normalizeMediaPipeLandmarkPoint(landmarks[10], coordinateSpace),
      CHIN: normalizeMediaPipeLandmarkPoint(landmarks[152], coordinateSpace),
      NOSE: normalizeMediaPipeLandmarkPoint(landmarks[1], coordinateSpace),
    },
  };
};

const resolveFaceBoxInStage = (faceFrame, stageLayout) => {
  const faceBounds = faceFrame?.bounds || faceFrame;
  if (!faceBounds || !stageLayout?.width || !stageLayout?.height) {
    return null;
  }

  const stageWidth = Number(stageLayout.width || 0);
  const stageHeight = Number(stageLayout.height || 0);
  const rawX = Number(faceBounds.x ?? faceBounds.left ?? 0);
  const rawY = Number(faceBounds.y ?? faceBounds.top ?? 0);
  const rawWidth = Number(faceBounds.width || 0);
  const rawHeight = Number(faceBounds.height || 0);
  if (!rawWidth || !rawHeight) return null;

  const frameWidth = Number(faceFrame?.frameWidth || 0);
  const frameHeight = Number(faceFrame?.frameHeight || 0);
  if (!frameWidth || !frameHeight) {
    const scaleX = rawX + rawWidth > stageWidth ? stageWidth / Math.max(rawX + rawWidth, 1) : 1;
    const scaleY = rawY + rawHeight > stageHeight ? stageHeight / Math.max(rawY + rawHeight, 1) : 1;
    return {
      x: rawX * scaleX,
      y: rawY * scaleY,
      width: rawWidth * scaleX,
      height: rawHeight * scaleY,
    };
  }

  if (faceFrame?.autoMode) {
    return {
      x: rawX,
      y: rawY,
      width: rawWidth,
      height: rawHeight,
    };
  }

  // Vision Camera frame coordinates come from the camera buffer, while the UI
  // displays that buffer with cover scaling. Front camera preview is mirrored.
  const frameIsPortrait = frameHeight >= frameWidth;
  const viewIsPortrait = stageHeight >= stageWidth;
  const sourceWidth = frameIsPortrait === viewIsPortrait ? frameWidth : frameHeight;
  const sourceHeight = frameIsPortrait === viewIsPortrait ? frameHeight : frameWidth;
  const sourceX = frameIsPortrait === viewIsPortrait ? rawX : rawY;
  const sourceY = frameIsPortrait === viewIsPortrait ? rawY : rawX;
  const sourceFaceWidth = frameIsPortrait === viewIsPortrait ? rawWidth : rawHeight;
  const sourceFaceHeight = frameIsPortrait === viewIsPortrait ? rawHeight : rawWidth;
  const coverScale = Math.max(stageWidth / sourceWidth, stageHeight / sourceHeight);
  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const offsetX = (renderedWidth - stageWidth) / 2;
  const offsetY = (renderedHeight - stageHeight) / 2;
  const mirroredX = sourceWidth - sourceX - sourceFaceWidth;

  return {
    x: (mirroredX * coverScale) - offsetX,
    y: (sourceY * coverScale) - offsetY,
    width: sourceFaceWidth * coverScale,
    height: sourceFaceHeight * coverScale,
  };
};

const normalizeLayerScale = (scale) => {
  const numericScale = Number(scale);
  if (!Number.isFinite(numericScale)) return 1;
  return Math.min(1.18, Math.max(0.82, 1 + ((numericScale - 1) * 0.45)));
};

const normalizeLayerOffset = (offset, stageLayout) => {
  const numericOffset = Number(offset);
  if (!Number.isFinite(numericOffset)) return 0;
  const baseSize = Math.min(Number(stageLayout?.width || 0), Number(stageLayout?.height || 0));
  return numericOffset * (baseSize ? baseSize / 1024 : 1);
};

const resolveLandmarkHeadBox = ({
  fallbackFaceBox,
  forehead,
  chin,
  leftEye,
  rightEye,
  nose,
  leftTemple,
  rightTemple,
}) => {
  if (!fallbackFaceBox) return null;

  const eyeCenter = averagePoints([leftEye, rightEye]);
  const templeCenter = averagePoints([leftTemple, rightTemple]);
  const centerPoint = averagePoints([eyeCenter, nose, templeCenter]);
  const faceCenterX = centerPoint?.x || fallbackFaceBox.x + (fallbackFaceBox.width / 2);
  const templeDistance = distanceBetweenPoints(leftTemple, rightTemple);
  const eyeDistance = distanceBetweenPoints(leftEye, rightEye);
  const landmarkWidth = Math.max(templeDistance || 0, eyeDistance ? eyeDistance * 2.18 : 0);
  const faceWidth = landmarkWidth || fallbackFaceBox.width;
  const faceTop = forehead?.y ?? fallbackFaceBox.y;
  const faceBottom = chin?.y ?? fallbackFaceBox.y + fallbackFaceBox.height;
  const landmarkHeight = Math.max(faceBottom - faceTop, fallbackFaceBox.height * 0.72);
  const faceHeight = landmarkHeight || fallbackFaceBox.height;

  return {
    x: faceCenterX - (faceWidth / 2),
    y: faceTop - (faceHeight * 0.08),
    width: faceWidth,
    height: faceHeight * 1.08,
  };
};

const buildFaceAnchoredTryOnLayerStyle = (faceFrame, stageLayout, layerKey, zIndex, fitSettings = {}) => {
  const faceBox = resolveFaceBoxInStage(faceFrame, stageLayout);
  if (!faceBox) {
    return null;
  }
  const fit = resolveLayerFit(fitSettings, layerKey);
  const anchor = resolveLayerAnchor(fitSettings, layerKey);
  const tryOnConfig = resolveTryOnConfig(fitSettings, layerKey);

  const leftEye = getFacePoint(faceFrame, 'LEFT_EYE');
  const rightEye = getFacePoint(faceFrame, 'RIGHT_EYE');
  const leftEar = getFacePoint(faceFrame, 'LEFT_EAR');
  const rightEar = getFacePoint(faceFrame, 'RIGHT_EAR');
  const forehead = getFacePoint(faceFrame, 'FOREHEAD');
  const chin = getFacePoint(faceFrame, 'CHIN');
  const nose = getFacePoint(faceFrame, 'NOSE');
  const leftTemple = getFacePoint(faceFrame, 'LEFT_TEMPLE') || leftEar;
  const rightTemple = getFacePoint(faceFrame, 'RIGHT_TEMPLE') || rightEar;
  const eyeCenter = averagePoints([leftEye, rightEye]);
  const templeCenter = averagePoints([leftTemple, rightTemple]);
  const faceCenterPoint = averagePoints([eyeCenter, nose, templeCenter]);
  const faceCenterX = faceCenterPoint?.x || eyeCenter?.x || (faceBox.x + (faceBox.width / 2));
  const eyeLineY = eyeCenter?.y || (faceBox.y + (faceBox.height * 0.38));
  const earDistance = distanceBetweenPoints(leftEar, rightEar);
  const eyeDistance = distanceBetweenPoints(leftEye, rightEye);
  const templeDistance = distanceBetweenPoints(leftTemple, rightTemple);
  const anchorWidth = Math.max(
    faceBox.width,
    templeDistance || 0,
    earDistance || 0,
    eyeDistance ? eyeDistance * 2.35 : 0
  );
  const eyeRollAngle = leftEye && rightEye
    ? Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI)
    : 0;
  const rollAngle = normalizeFaceTiltDegrees(faceFrame?.rollAngle ?? eyeRollAngle ?? 0);
  const yawAngle = Math.abs(Number(faceFrame?.yawAngle || 0));
  const yawScale = Math.max(0.82, 1 - (yawAngle / 120));

  if (faceFrame?.mediapipe && forehead && chin) {
    const headBox = resolveLandmarkHeadBox({
      fallbackFaceBox: faceBox,
      forehead,
      chin,
      leftEye,
      rightEye,
      nose,
      leftTemple,
      rightTemple,
    }) || faceBox;
    const layerScale = normalizeLayerScale(fit.scale);
    const offsetX = normalizeLayerOffset(anchor.userOffsetX, stageLayout);
    const offsetY = normalizeLayerOffset(anchor.userOffsetY, stageLayout);
    const targetFaceWidth = headBox.width * tryOnConfig.scaleMultiplier;
    const targetFaceHeight = headBox.height * tryOnConfig.scaleY;
    const faceHole = tryOnConfig.faceHole;
    const layerWidth = (targetFaceWidth / Math.max(faceHole.width, 0.12)) * layerScale;
    const layerHeight = (targetFaceHeight / Math.max(faceHole.height, 0.12)) * layerScale;
    const faceHoleCenterX = faceHole.x + (faceHole.width / 2);
    const rotation = Number(fit.rotation || 0) + rollAngle + tryOnConfig.rotationOffset;

    return {
      position: 'absolute',
      left: Math.max(
        -stageLayout.width * 0.35,
        headBox.x + (headBox.width / 2) - (layerWidth * faceHoleCenterX) + (headBox.width * tryOnConfig.horizontalOffset) + offsetX
      ),
      top: Math.max(
        -stageLayout.height * 0.45,
        headBox.y - (layerHeight * faceHole.y) + (headBox.height * tryOnConfig.verticalOffset) + offsetY
      ),
      width: layerWidth,
      height: layerHeight,
      opacity: fit.opacity,
      zIndex,
      elevation: zIndex,
      transform: [{ rotate: `${rotation}deg` }],
    };
  }

  const layerSize = layerKey === 'frontBangs'
    ? {
        width: anchorWidth * 1.08 * yawScale * fit.scale,
        height: faceBox.height * 0.44 * fit.scale,
        top: eyeLineY - (faceBox.height * 0.5 * fit.scale),
      }
    : {
        width: anchorWidth * 1.62 * yawScale * fit.scale,
        height: faceBox.height * 1.26 * fit.scale,
        top: eyeLineY - (faceBox.height * 0.78 * fit.scale),
      };
  const left = faceCenterX - (layerSize.width / 2) + fit.offsetX;
  const top = layerSize.top + fit.offsetY;
  const rotation = Number(fit.rotation || 0) + rollAngle;

  if (faceFrame?.autoMode) {
    return {
      position: 'absolute',
      left: Math.max(-stageLayout.width * 0.25, left),
      top: Math.max(-stageLayout.height * 0.35, top),
      width: layerSize.width,
      height: layerSize.height,
      opacity: fit.opacity,
      zIndex,
      elevation: zIndex,
      transform: [{ rotate: `${rotation}deg` }],
    };
  }

  const faceX = faceBox.x;
  const faceY = faceBox.y;
  const faceWidth = faceBox.width;
  const faceHeight = faceBox.height;

  const widthMultiplier = (layerKey === 'frontBangs' ? 1.12 : 1.62) * fit.scale;
  const heightMultiplier = (layerKey === 'frontBangs' ? 0.48 : 1.26) * fit.scale;
  const topOffset = (layerKey === 'frontBangs' ? 0.28 : 0.66) * fit.scale;

  return {
    position: 'absolute',
    left: Math.max(-stageLayout.width * 0.25, faceX + (faceWidth / 2) - ((faceWidth * widthMultiplier) / 2) + fit.offsetX),
    top: Math.max(-stageLayout.height * 0.35, faceY - (faceHeight * topOffset) + fit.offsetY),
    width: faceWidth * widthMultiplier,
    height: faceHeight * heightMultiplier,
    opacity: fit.opacity,
    zIndex,
    elevation: zIndex,
    transform: [{ rotate: `${Number(fit.rotation || 0)}deg` }],
  };
};

const getPrimaryTryOnImageUrl = (wig) => (
  wig?.layer_full_wig_url
  || wig?.layer_front_bangs_url
  || wig?.layer_back_hair_url
  || ''
);

function WigLayerImage({ sourceUri, style }) {
  return (
    <Image
      source={{ uri: sourceUri }}
      resizeMode="contain"
      fadeDuration={0}
      style={style}
    />
  );
}

const getCameraRuntimeMessage = (error) => {
  const code = String(error?.code || '');
  if (code === 'system/camera-is-restricted') {
    return 'Camera is restricted by this device. Use upload instead or allow camera access in device policy/settings.';
  }
  if (code.includes('permission')) {
    return 'Camera permission is not available. Allow camera access or upload a photo.';
  }
  return 'Camera is unavailable right now. Use upload instead.';
};

function CameraUnavailablePlaceholder({ message }) {
  return (
    <View style={styles.captureStagePlaceholder}>
      <AppIcon name="camera" state="active" size="xl" />
      <Text style={styles.captureStagePlaceholderTitle}>Camera unavailable</Text>
      <Text style={styles.captureStagePlaceholderBody}>{message}</Text>
    </View>
  );
}

function MediaPipeTryOnFaceCamera({ cameraRef, onFaceBoundsChange, onCameraReady, onCameraUnavailable }) {
  const device = useNativeCameraDevice('front');
  const handleResults = React.useCallback((resultBundle, viewSize, mirrored) => {
    onFaceBoundsChange?.(buildMediaPipeFaceFrame(resultBundle, viewSize, mirrored));
  }, [onFaceBoundsChange]);

  const handleError = React.useCallback((error) => {
    logAppError('MediaPipe face landmark detection failed', error);
    onFaceBoundsChange?.(null);
  }, [onFaceBoundsChange]);

  const solution = useMediaPipeFaceLandmarkDetection(
    handleResults,
    handleError,
    MediaPipeRunningMode.LIVE_STREAM,
    FACE_LANDMARKER_MODEL,
    {
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      delegate: MediaPipeDelegate.GPU,
      mirrorMode: 'mirror-front-only',
    }
  );

  React.useEffect(() => {
    if (device) {
      solution.cameraDeviceChangeHandler(device);
      onCameraReady?.();
    }
  }, [device, onCameraReady, solution]);

  React.useEffect(() => {
    solution.resizeModeChangeHandler('cover');
  }, [solution]);

  const handleCameraRuntimeError = React.useCallback((error) => {
    logAppError('Vision camera unavailable for live wig try-on', error);
    onFaceBoundsChange?.(null);
    onCameraUnavailable?.(error);
  }, [onCameraUnavailable, onFaceBoundsChange]);

  if (!device) {
    return (
      <View style={styles.captureStagePlaceholder}>
        <AppIcon name="camera" state="active" size="xl" />
        <Text style={styles.captureStagePlaceholderTitle}>Camera starting</Text>
      </View>
    );
  }

  return (
    <NativeVisionCamera
      ref={cameraRef}
      style={styles.captureStageImage}
      device={device}
      isActive
      photo
      frameProcessor={solution.frameProcessor}
      onLayout={solution.cameraViewLayoutChangeHandler}
      onOutputOrientationChanged={solution.cameraOrientationChangedHandler}
      onError={handleCameraRuntimeError}
      resizeMode="cover"
      pixelFormat="rgb"
    />
  );
}

function NativeTryOnFaceCamera({ cameraRef, stageLayout, onFaceBoundsChange, onCameraReady, onCameraUnavailable }) {
  const device = useNativeCameraDevice('front');
  const faceDetectionOptions = React.useMemo(() => ({
    performanceMode: 'fast',
    landmarkMode: 'all',
    contourMode: 'all',
    classificationMode: 'none',
    minFaceSize: 0.16,
    trackingEnabled: false,
    cameraFacing: 'front',
    autoMode: true,
    windowWidth: Math.max(1, Number(stageLayout?.width || 1)),
    windowHeight: Math.max(1, Number(stageLayout?.height || 1)),
  }), [stageLayout?.height, stageLayout?.width]);
  const { detectFaces, stopListeners } = useNativeFaceDetector(faceDetectionOptions);
  const handleFacesOnJs = React.useMemo(
    () => NativeWorklets.createRunOnJS((faceFrame = null) => {
      onFaceBoundsChange?.(faceFrame);
    }),
    [onFaceBoundsChange]
  );
  const frameProcessor = useNativeFrameProcessor((frame) => {
    'worklet';
    const faces = detectFaces(frame);
    const face = Array.isArray(faces) && faces.length ? faces[0] : null;
    handleFacesOnJs(face?.bounds ? {
      ...face,
      autoMode: true,
      frameWidth: frame.width,
      frameHeight: frame.height,
    } : null);
  }, [detectFaces, handleFacesOnJs]);

  React.useEffect(() => (
    () => {
      stopListeners?.();
    }
  ), [stopListeners]);

  React.useEffect(() => {
    if (device) onCameraReady?.();
  }, [device, onCameraReady]);

  const handleCameraRuntimeError = React.useCallback((error) => {
    logAppError('Vision camera unavailable for fallback wig try-on', error);
    onFaceBoundsChange?.(null);
    onCameraUnavailable?.(error);
  }, [onCameraUnavailable, onFaceBoundsChange]);

  if (!device) {
    return (
      <View style={styles.captureStagePlaceholder}>
        <AppIcon name="camera" state="active" size="xl" />
        <Text style={styles.captureStagePlaceholderTitle}>Camera starting</Text>
      </View>
    );
  }

  return (
    <NativeVisionCamera
      ref={cameraRef}
      style={styles.captureStageImage}
      device={device}
      isActive
      photo
      frameProcessor={frameProcessor}
      pixelFormat="yuv"
      onError={handleCameraRuntimeError}
    />
  );
}

function PreferenceChipGroup({ control, name, title, options, roles }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.preferenceSection}>
          <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>{title}</Text>
          <View style={styles.preferenceChipWrap}>
            {options.map((option) => {
              const isSelected = field.value === option;
              return (
                <Pressable
                  key={`${name}-${option}`}
                  onPress={() => field.onChange(option)}
                  style={({ pressed }) => [
                    styles.preferenceChip,
                    {
                      borderColor: isSelected ? roles.primaryActionBackground : roles.defaultCardBorder,
                      backgroundColor: isSelected ? roles.iconPrimarySurface : roles.pageBackground,
                    },
                    pressed ? styles.preferencePressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.preferenceChipText,
                      { color: isSelected ? roles.iconPrimaryColor : roles.bodyText },
                      isSelected ? styles.preferenceChipTextSelected : null,
                    ]}
                  >
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

function StyleSelectionGroup({ control, roles }) {
  const options = [
    { value: 'Straight', icon: 'minus' },
    { value: 'Wavy', icon: 'waves' },
    { value: 'Curly', icon: 'gesture' },
  ];

  return (
    <Controller
      control={control}
      name="hairTexture"
      render={({ field }) => (
        <View style={styles.preferenceSection}>
          <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>Style Selection</Text>
          <View style={styles.styleSelectionGrid}>
            {options.map((option) => {
              const isSelected = field.value === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => field.onChange(option.value)}
                  style={({ pressed }) => [
                    styles.styleOption,
                    {
                      borderColor: isSelected ? roles.primaryActionBackground : roles.defaultCardBorder,
                      backgroundColor: isSelected ? roles.iconPrimarySurface : roles.defaultCardBackground,
                    },
                    pressed ? styles.preferencePressed : null,
                  ]}
                >
                  <AppIcon name={option.icon} size="xl" color={roles.iconPrimaryColor} />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.styleOptionText,
                      { color: isSelected ? roles.iconPrimaryColor : roles.headingText },
                      isSelected ? styles.preferenceChipTextSelected : null,
                    ]}
                  >
                    {option.value}
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

function ColorPaletteGroup({ control, roles }) {
  const colors = [
    { value: 'Natural black', color: '#1F1712' },
    { value: 'Dark brown', color: '#4B3621' },
    { value: 'Warm brown', color: '#8B4513' },
    { value: 'Light brown', color: '#B98255' },
    { value: 'Other', color: '#E9DDCF' },
  ];

  return (
    <Controller
      control={control}
      name="preferredColor"
      render={({ field }) => {
        const selected = colors.find((item) => item.value === field.value) || colors[0];

        return (
          <View style={styles.preferenceSection}>
            <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>Color Palette</Text>
            <View
              style={[
                styles.colorPaletteCard,
                {
                  backgroundColor: roles.defaultCardBackground,
                  borderColor: roles.defaultCardBorder,
                },
              ]}
            >
              <View style={styles.colorSwatchGrid}>
                {colors.map((item) => {
                  const isSelected = field.value === item.value || (!field.value && item.value === colors[0].value);
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="button"
                      accessibilityLabel={item.value}
                      onPress={() => field.onChange(item.value)}
                      style={({ pressed }) => [
                        styles.colorSwatchButton,
                        {
                          borderColor: isSelected ? roles.primaryActionBackground : 'transparent',
                        },
                        pressed ? styles.preferencePressed : null,
                      ]}
                    >
                      <View style={[styles.colorSwatch, { backgroundColor: item.color }]}>
                        {isSelected ? <AppIcon name="checkmark" size="sm" color={theme.colors.textInverse} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.colorSelectedText, { color: roles.bodyText }]}>
                Selected: {field.value || selected.value}
              </Text>
            </View>
          </View>
        );
      }}
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

function WigInfoRow({ label, value, roles }) {
  return (
    <View
      style={[
        styles.referralInfoRow,
        {
          backgroundColor: roles.supportCardBackground,
          borderColor: roles.supportCardBorder,
        },
      ]}
    >
      <Text style={[styles.referralInfoLabel, { color: roles.bodyText }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.referralInfoValue, { color: roles.headingText }]}>{value}</Text>
    </View>
  );
}

function CaptureModal({
  visible,
  referenceImage,
  availableWigs,
  selectedWig,
  selectedWigId,
  recommendedWigIds,
  isLoadingAvailableWigs,
  hasCameraPermission,
  cameraRef,
  onCameraReady,
  isCapturingPhoto,
  isPickingReference,
  onClose,
  onUpload,
  onCapture,
  onSelectWig,
  onGeneratePreview,
  onRequestPermission,
}) {
  const [stageLayout, setStageLayout] = useState({ width: 0, height: 320 });
  const [faceFrame, setFaceFrame] = useState(null);
  const [cameraRuntimeError, setCameraRuntimeError] = useState(null);
  const handleFaceFrameChange = React.useCallback((nextFaceFrame) => {
    setFaceFrame((previousFaceFrame) => smoothFaceFrame(previousFaceFrame, nextFaceFrame));
  }, []);

  useEffect(() => {
    if (visible && hasCameraPermission && (!canUseFaceTrackingTryOnCamera || cameraRuntimeError)) {
      onCameraReady?.();
    }
  }, [cameraRuntimeError, hasCameraPermission, onCameraReady, visible]);

  useEffect(() => {
    if (visible) {
      setCameraRuntimeError(null);
      setFaceFrame(null);
    }
  }, [visible]);

  if (!visible) return null;

  const primaryTryOnImageUrl = getPrimaryTryOnImageUrl(selectedWig);
  const shouldRenderFullWigLayer = Boolean(selectedWig?.layer_full_wig_url);
  const shouldRenderFrontWigLayer = false;
  const shouldUseSingleTryOnImage = Boolean(
    selectedWig
    && primaryTryOnImageUrl
    && !selectedWig.layer_full_wig_url
    && !selectedWig.layer_front_bangs_url
    && !selectedWig.layer_back_hair_url
  );
  const selectedWigNeedsLayer = Boolean(selectedWig && !primaryTryOnImageUrl);
  const isLiveCameraTryOn = Boolean(!referenceImage?.uri && hasCameraPermission && canUseFaceTrackingTryOnCamera && !cameraRuntimeError);
  const shouldRenderBackWigLayer = false;
  const isWaitingForFace = Boolean(isLiveCameraTryOn && selectedWig && primaryTryOnImageUrl && !faceFrame);
  const canCaptureLivePhoto = Boolean(!isLiveCameraTryOn || faceFrame);
  const canUseSelectedPhoto = Boolean(referenceImage?.uri && (!canUseFaceTrackingTryOnCamera || faceFrame || !hasCameraPermission || cameraRuntimeError));
  const cameraRuntimeMessage = getCameraRuntimeMessage(cameraRuntimeError);
  const getLayerStyle = (layerKey, zIndex) => {
    const faceAnchoredStyle = buildFaceAnchoredTryOnLayerStyle(faceFrame, stageLayout, layerKey, zIndex, selectedWig?.fit_settings);
    if (faceAnchoredStyle) return faceAnchoredStyle;
    if (isLiveCameraTryOn) return styles.tryOnLayerHidden;
    return buildTryOnLayerStyle(selectedWig?.fit_settings, layerKey, zIndex);
  };

  return (
    <Modal transparent={false} visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.captureFullScreen}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Front Photo</Text>
          <View style={styles.modalHeaderActions}>
            <Pressable onPress={onClose} style={styles.headerIconButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>
        </View>

          <View
            style={styles.captureStage}
            onLayout={(event) => setStageLayout({
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            })}
          >
            {referenceImage?.uri ? (
              <Image source={{ uri: referenceImage.uri }} style={styles.captureStageImage} />
            ) : cameraRuntimeError ? (
              <CameraUnavailablePlaceholder message={cameraRuntimeMessage} />
            ) : hasCameraPermission ? (
              canUseFaceTrackingTryOnCamera ? (
                canUseMediaPipeTryOnCamera ? (
                  <MediaPipeTryOnFaceCamera
                    cameraRef={cameraRef}
                    onFaceBoundsChange={handleFaceFrameChange}
                    onCameraReady={onCameraReady}
                    onCameraUnavailable={setCameraRuntimeError}
                  />
                ) : (
                  <NativeTryOnFaceCamera
                    cameraRef={cameraRef}
                    stageLayout={stageLayout}
                    onFaceBoundsChange={handleFaceFrameChange}
                    onCameraReady={onCameraReady}
                    onCameraUnavailable={setCameraRuntimeError}
                  />
                )
              ) : (
                <CameraView
                  ref={cameraRef}
                  style={styles.captureStageImage}
                  facing="front"
                  mode="picture"
                  animateShutter
                  onMountError={setCameraRuntimeError}
                />
              )
            ) : (
              <View style={styles.captureStagePlaceholder}>
                <AppIcon name="camera" state="active" size="xl" />
                <Text style={styles.captureStagePlaceholderTitle}>Camera access needed</Text>
                <Text style={styles.captureStagePlaceholderBody}>
                  Allow camera or upload a photo.
                </Text>
              </View>
            )}

            <View pointerEvents="none" style={styles.captureFrame}>
              <View style={styles.captureFaceGuide} />
              <View style={[styles.captureCorner, styles.captureCornerTopLeft]} />
              <View style={[styles.captureCorner, styles.captureCornerTopRight]} />
              <View style={[styles.captureCorner, styles.captureCornerBottomLeft]} />
              <View style={[styles.captureCorner, styles.captureCornerBottomRight]} />
              <View style={styles.captureHintPill}>
                <Text style={styles.captureHintText}>Front</Text>
              </View>
            </View>

            {selectedWig && primaryTryOnImageUrl ? (
              <View
                key={selectedWig.id || primaryTryOnImageUrl}
                pointerEvents="none"
                style={styles.tryOnLayerWrap}
                renderToHardwareTextureAndroid
                shouldRasterizeIOS
              >
                {shouldRenderBackWigLayer ? (
                  <WigLayerImage
                    sourceUri={selectedWig.layer_back_hair_url}
                    style={getLayerStyle('backHair', 1)}
                  />
                ) : null}
                {shouldRenderFullWigLayer ? (
                  <WigLayerImage
                    sourceUri={selectedWig.layer_full_wig_url}
                    style={getLayerStyle('fullWig', 3)}
                  />
                ) : null}
                {shouldRenderFrontWigLayer ? (
                  <Image
                    source={{ uri: selectedWig.layer_front_bangs_url }}
                    resizeMode="contain"
                    fadeDuration={0}
                    style={getLayerStyle('frontBangs', 4)}
                  />
                ) : null}
                {shouldUseSingleTryOnImage ? (
                  <WigLayerImage
                    sourceUri={primaryTryOnImageUrl}
                    style={getLayerStyle('fullWig', 3)}
                  />
                ) : null}
              </View>
            ) : null}
            {selectedWigNeedsLayer ? (
              <View pointerEvents="none" style={styles.tryOnLayerMissingBanner}>
                <Text style={styles.tryOnLayerMissingText}>
                  Try-on layer missing
                </Text>
              </View>
            ) : null}
            {isWaitingForFace ? (
              <View pointerEvents="none" style={styles.tryOnLayerMissingBanner}>
                <Text style={styles.tryOnLayerMissingText}>
                  Align your face to try this wig live
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.availableWigsSection}>
            <View style={styles.availableWigsHeader}>
              <Text style={styles.availableWigsTitle}>Available wigs</Text>
              {isLoadingAvailableWigs ? (
                <Text style={styles.availableWigsMeta}>Loading</Text>
              ) : (
                <Text style={styles.availableWigsMeta}>{availableWigs.length} active</Text>
              )}
            </View>

            {availableWigs.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.availableWigsRow}
              >
                {availableWigs.map((wig) => {
                  const isSelected = selectedWigId === wig.id;
                  const isRecommended = recommendedWigIds.has(wig.id);

                  return (
                    <Pressable
                      key={wig.id || `${wig.wig_id}-${wig.wig_name}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${wig.wig_name}${isRecommended ? ', AI recommended' : ''}`}
                      onPress={() => onSelectWig(wig.id)}
                      style={({ pressed }) => [
                        styles.tryOnWigCard,
                        isSelected ? styles.tryOnWigCardActive : null,
                        pressed ? styles.optionCardPressed : null,
                      ]}
                    >
                      <View style={styles.tryOnWigImageWrap}>
                        {wig.thumbnail_url ? (
                          <Image source={{ uri: wig.thumbnail_url }} resizeMode="cover" style={styles.tryOnWigImage} />
                        ) : (
                          <View style={styles.tryOnWigImagePlaceholder}>
                            <AppIcon name="image" size="lg" color={theme.colors.brandPrimary} />
                          </View>
                        )}
                        {isRecommended ? (
                          <View style={styles.tryOnRecommendedBadge}>
                            <AppIcon name="sparkle" size="sm" color={theme.colors.textInverse} />
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.tryOnWigName}>{wig.wig_name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.availableWigsEmpty}>
                <Text style={styles.availableWigsEmptyText}>
                  No active try-on wigs yet.
                </Text>
              </View>
            )}
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
              disabled={!canCaptureLivePhoto}
              onPress={hasCameraPermission ? onCapture : onRequestPermission}
              style={styles.captureButtonPrimary}
            />
            <View style={styles.captureControlsSpacer} />
          </View>

          <View style={styles.modalFooter}>
            <Text style={styles.modalFooterText}>
              {referenceImage?.uri
                ? 'Photo ready.'
                : 'Add a front photo.'}
            </Text>

            <AppButton
              title="Use Photo"
              disabled={!canUseSelectedPhoto}
              onPress={onGeneratePreview}
              leading={<AppIcon name="success" state="inverse" />}
            />
          </View>
      </View>
    </Modal>
  );
}

function AiMatcherSkeleton({ roles }) {
  return (
    <View
      style={[
        styles.matcherSkeletonCard,
        {
          backgroundColor: roles.supportCardBackground,
          borderColor: roles.supportCardBorder,
        },
      ]}
    >
      <View style={styles.matcherLoadingRow}>
        <View style={[styles.matcherLoadingDot, { backgroundColor: roles.primaryActionBackground }]} />
        <Text style={[styles.matcherLoadingText, { color: roles.iconPrimaryColor }]}>
          Analyzing styles...
        </Text>
      </View>
      <View style={styles.matcherSkeletonGrid}>
        <View style={styles.matcherSkeletonMain}>
          <View style={[styles.matcherSkeletonBlock, styles.matcherSkeletonHero]} />
          <View style={styles.matcherSkeletonPills}>
            <View style={[styles.matcherSkeletonBlock, styles.matcherSkeletonPillWide]} />
            <View style={[styles.matcherSkeletonBlock, styles.matcherSkeletonPill]} />
          </View>
        </View>
        <View style={styles.matcherSkeletonSide}>
          {[0, 1, 2, 3].map((item) => (
            <View key={item} style={[styles.matcherSkeletonBlock, styles.matcherSkeletonLine]} />
          ))}
        </View>
      </View>
    </View>
  );
}

function MatcherRecommendationCard({
  option,
  isActive,
  imageUri,
  onPress,
  roles,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.matcherCard,
        {
          backgroundColor: roles.defaultCardBackground,
          borderColor: isActive ? roles.primaryActionBackground : roles.defaultCardBorder,
        },
        pressed ? styles.preferencePressed : null,
      ]}
    >
      <View style={styles.matcherBadge}>
        <AppIcon name="sparkle" size="sm" color={roles.primaryActionText} />
        <Text style={[styles.matcherBadgeText, { color: roles.primaryActionText }]}>AI Match</Text>
      </View>

      <View style={[styles.matcherImageWrap, { backgroundColor: roles.supportCardBackground }]}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.matcherImage} />
        ) : (
          <View style={styles.matcherImagePlaceholder}>
            <AppIcon name="image" size="xl" color={roles.iconPrimaryColor} />
          </View>
        )}
      </View>

      <View style={styles.matcherCardBody}>
        <Text numberOfLines={1} style={[styles.matcherCardTitle, { color: roles.headingText }]}>
          {option.name}
        </Text>
        <Text numberOfLines={1} style={[styles.matcherCardMeta, { color: roles.bodyText }]}>
          {option.family || option.matchLabel || 'Personalized style'}
        </Text>
        <View style={styles.matcherCardFooter}>
          <Text style={[styles.matcherCardPrice, { color: roles.iconPrimaryColor }]}>
            {option.matchLabel || 'Recommended'}
          </Text>
          <View style={[styles.matcherFavoriteButton, { backgroundColor: roles.supportCardBackground }]}>
            <AppIcon name={isActive ? 'checkmarkCircle' : 'favorite'} size="md" color={roles.iconPrimaryColor} />
          </View>
        </View>
      </View>
    </Pressable>
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
  preferenceChoice,
  referenceImage,
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
  isGeneratingPreview,
  isSavingRequest,
  onClose,
  onBackToPatient,
  onContinueToDetails,
  onPreferenceChoiceChange,
  onOpenCamera,
  onRegenerate,
  onDownloadSelected,
  onSubmitRequest,
  onViewTimeline,
  roles,
}) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal transparent={false} visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.flowKeyboardWrap, { backgroundColor: roles.pageBackground }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom : 0}
      >
        <View style={styles.flowFullScreen}>
          <View style={styles.flowTopBar}>
            <Text style={[styles.flowTopTitle, { color: roles.headingText }]}>
              {step === 'summary' ? 'Wig Preview' : step === 'basicFit' ? 'Fitting Basics' : 'Wig Request'}
            </Text>
              <Pressable onPress={onClose} style={styles.headerIconButton}>
                <AppIcon name="close" state="muted" />
              </Pressable>
          </View>

            <ScrollView
              style={styles.flowScroll}
              contentContainerStyle={[
                styles.flowScrollContent,
                { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              {step === 'patient' ? (
                <View style={styles.flowSection}>
                  <Text style={styles.flowTitle}>Patient details</Text>

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
                          I agree to use my patient details and photo for this request.
                        </Text>
                      </Pressable>
                    )}
                  />
                  {errors.acceptedTerms?.message ? (
                    <Text style={styles.fieldError}>{errors.acceptedTerms.message}</Text>
                  ) : null}

                  <View style={styles.preferenceSection}>
                    <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>
                      Add wig preferences?
                    </Text>
                    <View style={styles.preferenceChoiceGrid}>
                      {[
                        { key: 'preferences', title: 'Yes', body: 'Choose style, color, and AI match.' },
                        { key: 'fitOnly', title: 'No', body: 'Only basic fitting details.' },
                      ].map((item) => {
                        const isSelected = preferenceChoice === item.key;
                        return (
                          <Pressable
                            key={item.key}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: isSelected }}
                            onPress={() => onPreferenceChoiceChange(item.key)}
                            style={({ pressed }) => [
                              styles.preferenceChoiceCard,
                              {
                                backgroundColor: isSelected ? roles.iconPrimarySurface : roles.defaultCardBackground,
                                borderColor: isSelected ? roles.primaryActionBackground : roles.defaultCardBorder,
                              },
                              pressed ? styles.preferencePressed : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.preferenceChoiceTitle,
                                { color: isSelected ? roles.iconPrimaryColor : roles.headingText },
                              ]}
                            >
                              {item.title}
                            </Text>
                            <Text style={[styles.preferenceChoiceBody, { color: roles.bodyText }]}>
                              {item.body}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

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

              {step === 'basicFit' ? (
                <View style={styles.preferencesFlow}>
                  <View style={styles.preferencesHeaderBlock}>
                    <Text style={[styles.preferencesTitle, { color: roles.headingText }]}>Fitting Basics</Text>
                    <Text style={[styles.preferencesBody, { color: roles.bodyText }]}>
                      Pick the closest cap size.
                    </Text>
                  </View>

                  <PreferenceChipGroup
                    control={control}
                    name="capSize"
                    title="Cap Size"
                    options={['Small', 'Medium', 'Large', 'Not sure']}
                    roles={roles}
                  />

                  <View style={styles.actionRow}>
                    <AppButton
                      title="Back"
                      variant="secondary"
                      onPress={onBackToPatient}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                    <AppButton
                      title="Submit Request"
                      loading={isSavingRequest}
                      onPress={onSubmitRequest}
                      fullWidth={false}
                      style={styles.actionButton}
                      leading={<AppIcon name="requests" state="inverse" />}
                    />
                  </View>
                </View>
              ) : null}

              {step === 'details' ? (
                <View style={styles.preferencesFlow}>
                  <View style={styles.preferencesHeaderBlock}>
                    <Text style={[styles.preferencesTitle, { color: roles.headingText }]}>Your Preferences</Text>
                    <Text style={[styles.preferencesBody, { color: roles.bodyText }]}>
                      Choose the look you want.
                    </Text>
                  </View>

                  <PreferenceChipGroup
                    control={control}
                    name="preferredLength"
                    title="Preferred Length"
                    options={['Short', 'Medium', 'Long']}
                    roles={roles}
                  />

                  <StyleSelectionGroup control={control} roles={roles} />

                  <ColorPaletteGroup control={control} roles={roles} />

                  <PreferenceChipGroup
                    control={control}
                    name="capSize"
                    title="Comfort Fit"
                    options={['Small', 'Medium', 'Large', 'Not sure']}
                    roles={roles}
                  />

                  <View style={styles.preferenceSection}>
                    <View style={styles.preferenceLabelRow}>
                      <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>Comfort Notes</Text>
                      <AppIcon name="information-outline" size="sm" color={roles.iconPrimaryColor} />
                    </View>
                    <Controller
                      control={control}
                      name="specialNotes"
                      render={({ field }) => (
                        <AppInput
                          placeholder="Sensitive scalp, lightweight fit, lace preference..."
                          variant="filled"
                          multiline={true}
                          numberOfLines={4}
                          value={field.value}
                          onChangeText={field.onChange}
                          onBlur={field.onBlur}
                          error={errors.specialNotes?.message}
                          inputStyle={styles.multilineInput}
                        />
                      )}
                    />
                    <Text style={[styles.preferenceHelperText, { color: roles.metaText }]}>
                      Shared with your wig specialist.
                    </Text>
                  </View>

                  <View style={styles.actionRow}>
                    <AppButton
                      title="Save Draft"
                      variant="secondary"
                      onPress={onBackToPatient}
                      fullWidth={false}
                      style={styles.actionButton}
                    />
                    <AppButton
                      title="Continue"
                      onPress={onOpenCamera}
                      fullWidth={false}
                      style={styles.actionButton}
                      leading={<AppIcon name="arrow-right" state="inverse" />}
                    />
                  </View>
                </View>
              ) : null}

              {step === 'summary' ? (
                <View style={styles.matcherFlow}>
                  <View style={styles.matcherHeroHeader}>
                    <Text style={[styles.matcherHeroTitle, { color: roles.headingText }]}>Finding Your Perfect Match</Text>
                    <Text style={[styles.matcherHeroBody, { color: roles.bodyText }]}>
                      AI recommendations based on your photo and preferences.
                    </Text>
                  </View>

                  {isGeneratingPreview ? (
                    <AiMatcherSkeleton roles={roles} />
                  ) : (
                    <>
                      {hasGeneratedPreview ? (
                        <View style={styles.matcherRecommendationsSection}>
                          <View style={styles.matcherSectionHeader}>
                            <Text style={[styles.matcherSectionTitle, { color: roles.headingText }]}>
                              Recommended for you
                            </Text>
                          </View>

                          <View style={styles.matcherCardsGrid}>
                            {recommendationOptions.map((option, index) => {
                              const optionImageUri = option.generatedImageUri || generatedImageUri || referenceImage?.uri || '';
                              const active = selectedOptionId === option.id || (!selectedOptionId && index === 0);
                              return (
                                <MatcherRecommendationCard
                                  key={option.id}
                                  option={option}
                                  isActive={active}
                                  imageUri={optionImageUri}
                                  onPress={() => onSelectOption(option.id)}
                                  roles={roles}
                                />
                              );
                            })}
                          </View>

                          <AppCard variant="soft" radius="xl" padding="lg" style={styles.matcherSelectedCard}>
                            <Text style={[styles.matcherSelectedTitle, { color: roles.headingText }]}>
                              {recommendationTitle}
                            </Text>
                            <Text style={[styles.matcherSelectedMeta, { color: roles.iconPrimaryColor }]}>
                              {recommendationFamily}
                            </Text>
                            <Text style={[styles.matcherSelectedSummary, { color: roles.bodyText }]}>
                              {recommendationSummary}
                            </Text>
                            <View style={styles.resultMetaRow}>
                              {preferredLength ? (
                                <View style={[styles.metaPill, { backgroundColor: roles.defaultCardBackground }]}>
                                  <Text style={styles.metaLabel}>Length</Text>
                                  <Text style={styles.metaValue}>{preferredLength}</Text>
                                </View>
                              ) : null}
                              {preferredColor ? (
                                <View style={[styles.metaPill, { backgroundColor: roles.defaultCardBackground }]}>
                                  <Text style={styles.metaLabel}>Color</Text>
                                  <Text style={styles.metaValue}>{preferredColor}</Text>
                                </View>
                              ) : null}
                            </View>
                          </AppCard>
                        </View>
                      ) : (
                        <AppCard variant="soft" radius="xl" padding="lg" style={styles.summaryNoteCard}>
                          <Text style={[styles.summaryNoteTitle, { color: roles.headingText }]}>AI preview skipped</Text>
                          <Text style={[styles.flowBody, { color: roles.bodyText }]}>
                            Your photo and preferences will be used.
                          </Text>
                        </AppCard>
                      )}
                    </>
                  )}

                  <AppButton
                    title="Submit Wig Request"
                    loading={isSavingRequest}
                    onPress={onSubmitRequest}
                    leading={<AppIcon name="requests" state="inverse" />}
                  />

                  {hasGeneratedPreview && generatedImageUri ? (
                    <AppButton
                      title="Save Selected Image"
                      variant="secondary"
                      onPress={onDownloadSelected}
                      leading={<AppIcon name="save" state="active" />}
                    />
                  ) : null}

                  <AppButton
                    title={hasGeneratedPreview ? 'Browse More Matches' : 'Generate AI Preview'}
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
                  <Text style={styles.flowBody}>Waiting for review.</Text>
                  <AppButton
                    title="View Timeline"
                    onPress={onViewTimeline}
                    leading={<AppIcon name="updates" state="inverse" />}
                  />
                </View>
              ) : null}
            </ScrollView>
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
  const [selectedWigFilterId, setSelectedWigFilterId] = useState('');
  const [isFlowOpen, setIsFlowOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [flowStep, setFlowStep] = useState('patient');
  const [activeWigTab, setActiveWigTab] = useState('request');
  const [requestPreferenceChoice, setRequestPreferenceChoice] = useState('preferences');
  const { user, profile, patientProfile, resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
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
    availableWigs,
    isLoadingAvailableWigs,
    pickReferenceImage,
    saveCapturedReferenceImage,
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
  const requestStatus = formatRequestStatus(latestWigRequest?.status || 'Pending');
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
  const hairTexture = latestWigSpecification?.hair_texture || draftValues?.hairTexture || '';
  const generatedImageUri = selectedOption?.generatedImageUri || preview?.generated_image_data_url || latestWigSpecification?.ai_wig_preview_url || '';
  const hasGeneratedPreview = Boolean(preview);
  const recommendedWigIds = useMemo(() => getRecommendedWigIds({
    wigs: availableWigs,
    preferredColor,
    preferredLength,
    hairTexture,
    recommendationTitle,
    recommendationFamily,
  }), [availableWigs, hairTexture, preferredColor, preferredLength, recommendationFamily, recommendationTitle]);
  const selectedWig = useMemo(
    () => availableWigs.find((wig) => wig.id === selectedWigFilterId) || availableWigs[0] || null,
    [availableWigs, selectedWigFilterId]
  );

  useEffect(() => {
    setSelectedOptionId(recommendationOptions[0]?.id || '');
  }, [latestWigSpecification?.ai_wig_preview_url, preview?.generated_image_data_url, recommendationOptions]);

  useEffect(() => {
    if (!availableWigs.length) {
      setSelectedWigFilterId('');
      return;
    }

    setSelectedWigFilterId((current) => {
      if (current && availableWigs.some((wig) => wig.id === current)) return current;
      const recommended = availableWigs.find((wig) => recommendedWigIds.has(wig.id));
      return recommended?.id || availableWigs[0]?.id || '';
    });
  }, [availableWigs, recommendedWigIds]);

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
      const photo = typeof cameraRef.current.takePhoto === 'function'
        ? await cameraRef.current.takePhoto().then((result) => ({
            ...result,
            uri: result?.uri || (result?.path ? `file://${result.path}` : ''),
          }))
        : await cameraRef.current.takePictureAsync({
            quality: 0.8,
            base64: true,
          });

      await saveCapturedReferenceImage(photo);
    } catch {
      await saveCapturedReferenceImage(null);
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

    const requestedWigId = requestPreferenceChoice === 'preferences'
      ? selectedWig?.wig_id || null
      : null;
    const result = await saveRequest(values, selectedOptionId, requestedWigId);

    if (result?.success) {
      await refreshTracking();
      setFlowStep('waiting');
      setIsTimelineOpen(true);
    }

    return result;
  });

  const openRequestFlow = () => {
    setRequestPreferenceChoice('preferences');
    setFlowStep('patient');
    setIsFlowOpen(true);
    setIsTimelineOpen(false);
  };

  const openAiPreviewFlow = () => {
    setRequestPreferenceChoice('preferences');
    setFlowStep('details');
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

    setFlowStep(requestPreferenceChoice === 'fitOnly' ? 'basicFit' : 'details');
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

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="requests"
      navVariant="patient"
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title={resolvedTheme?.brandName || 'Donivra'}
          subtitle=""
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={avatarUri}
          variant="patient"
          minimal={true}
          showAvatar={true}
          onProfilePress={() => router.navigate('/profile')}
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
          title="Checking request"
          message="Loading details."
          variant="info"
          presentation="floating"
          visible={isLoadingContext}
          autoDismissMs={1800}
        />
      ) : null}

      {error ? (
        <StatusBanner
          message={error.message}
          variant="error"
          title={error.title}
          presentation="floating"
          visible={Boolean(error)}
          autoDismissMs={4000}
        />
      ) : null}

      {successMessage ? (
        <StatusBanner
          message={successMessage}
          variant="success"
          title="Request updated"
          presentation="floating"
          visible={Boolean(successMessage)}
          autoDismissMs={3000}
        />
      ) : null}

      <View
        style={[
          styles.wigTabBar,
          {
            backgroundColor: roles.defaultCardBackground,
            borderColor: roles.defaultCardBorder,
          },
        ]}
      >
        {[
          { key: 'request', label: 'Request', icon: 'requests' },
          { key: 'ai', label: 'Wig Preview', icon: 'sparkle' },
        ].map((tab) => {
          const isActive = activeWigTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => setActiveWigTab(tab.key)}
              style={[
                styles.wigTabButton,
                isActive ? { backgroundColor: roles.primaryActionBackground } : null,
              ]}
            >
              <AppIcon
                name={tab.icon}
                size="md"
                color={isActive ? roles.primaryActionText : roles.metaText}
              />
              <Text style={[styles.wigTabText, { color: isActive ? roles.primaryActionText : roles.metaText }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeWigTab === 'request' ? (
        hasSubmittedRequest ? (
          <AppCard variant="patientTint" radius="xl" padding="lg" style={styles.currentRequestCard}>
            <View style={styles.currentRequestBody}>
              <View style={styles.currentRequestIcon}>
                <AppIcon name="requests" state="active" size="xl" />
              </View>
              <View style={styles.currentRequestCopy}>
                <Text style={[styles.currentRequestLabel, { color: roles.bodyText }]}>Current status</Text>
                <Text style={[styles.currentRequestTitle, { color: roles.headingText }]}>{requestStatus}</Text>
              </View>
              <Pressable
                onPress={() => setIsTimelineOpen((current) => !current)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={isTimelineOpen ? 'Hide timeline' : 'Show timeline'}
                style={({ pressed }) => [
                  styles.timelineIconButton,
                  { backgroundColor: roles.defaultCardBackground },
                  pressed ? styles.preferencePressed : null,
                ]}
              >
                <AppIcon
                  name={isTimelineOpen ? 'chevron-up' : 'timeline-clock-outline'}
                  color={roles.primaryActionBackground}
                  size="md"
                />
              </Pressable>
            </View>
          </AppCard>
        ) : (
          <AppCard variant="elevated" radius="xl" padding="lg" style={styles.simpleWigCard}>
            <View style={styles.simpleRecordHeader}>
              <View style={[styles.referralHospitalIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                <AppIcon name="hospital-building" size="xl" color={roles.iconPrimaryColor} />
              </View>
              <View style={styles.referralIdentityCopy}>
                <Text numberOfLines={1} style={[styles.referralHospitalName, { color: roles.headingText }]}>
                  {hospitalName || 'Patient Record'}
                </Text>
                <Text numberOfLines={1} style={[styles.referralHospitalMeta, { color: roles.bodyText }]}>
                  {medicalCondition || 'Ready to request'}
                </Text>
              </View>
            </View>

            <View style={styles.recordDetailSection}>
              <WigInfoRow label="Patient code" value={patientCode || 'Not assigned'} roles={roles} />
            </View>

            <View style={styles.recordActionRow}>
              <AppButton
                title="Start Request"
                onPress={openRequestFlow}
                leading={<AppIcon name="arrow-right" state="inverse" />}
              />
            </View>
          </AppCard>
        )
      ) : (
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.simpleWigCard}>
          <View style={[styles.aiTabIcon, { backgroundColor: roles.iconPrimarySurface }]}>
            <AppIcon name="face-recognition" size="xl" color={roles.iconPrimaryColor} />
          </View>
          <Text style={[styles.aiTabTitle, { color: roles.headingText }]}>Wig Preview</Text>
          <Text style={[styles.aiTabBody, { color: roles.bodyText }]}>
            Upload a front photo and get matched styles.
          </Text>
          <AppButton
            title="Start Preview"
            onPress={openAiPreviewFlow}
            leading={<AppIcon name="sparkle" state="inverse" />}
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
        preferenceChoice={requestPreferenceChoice}
        referenceImage={referenceImage}
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
        isGeneratingPreview={isGeneratingPreview}
        isSavingRequest={isSavingRequest}
        onClose={closeRequestFlow}
        onBackToPatient={() => setFlowStep('patient')}
        onContinueToDetails={handleContinueToDetails}
        onPreferenceChoiceChange={setRequestPreferenceChoice}
        onOpenCamera={handleStartPreview}
        onRegenerate={handleGeneratePreviewFromModal}
        onDownloadSelected={handleDownloadSelectedImage}
        onSubmitRequest={handleSaveRequest}
        onViewTimeline={() => {
          setIsFlowOpen(false);
          setIsTimelineOpen(true);
        }}
        roles={roles}
      />

      <CaptureModal
        visible={isCaptureOpen}
        referenceImage={referenceImage}
        availableWigs={availableWigs}
        selectedWig={selectedWig}
        selectedWigId={selectedWigFilterId}
        recommendedWigIds={recommendedWigIds}
        isLoadingAvailableWigs={isLoadingAvailableWigs}
        hasCameraPermission={hasCameraPermission}
        cameraRef={cameraRef}
        onCameraReady={() => {}}
        isCapturingPhoto={isCapturingPhoto}
        isPickingReference={isPickingReference}
        onClose={closeCaptureFlow}
        onUpload={pickReferenceImage}
        onCapture={handleCapturePhoto}
        onSelectWig={setSelectedWigFilterId}
        onGeneratePreview={handleGeneratePreviewFromModal}
        onRequestPermission={requestCameraPermission}
      />

    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  wigIntroSection: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  wigIntroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    lineHeight: theme.typography.semantic.titleMd * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  wigIntroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  wigTabBar: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.xl,
  },
  wigTabButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  wigTabText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  simpleWigCard: {
    gap: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  simpleRecordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xl,
  },
  aiTabIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTabTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  aiTabBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  currentRequestCard: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  currentRequestHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  currentRequestHeaderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  currentRequestBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  currentRequestIcon: {
    width: 54,
    height: 54,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  currentRequestCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timelineIconButton: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentRequestLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  currentRequestTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  requestChoiceGrid: {
    gap: theme.spacing.lg,
  },
  referralCard: {
    overflow: 'hidden',
  },
  referralCardHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  referralCardHeaderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  referralCardBody: {
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  referralIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  referralHospitalIcon: {
    width: 96,
    height: 96,
    borderRadius: theme.radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralIdentityCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.sm,
  },
  referralHospitalName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  referralHospitalMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  referralInfoList: {
    gap: theme.spacing.md,
  },
  recordDetailSection: {
    paddingTop: theme.spacing.sm,
  },
  referralInfoRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
  },
  recordActionRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  referralInfoLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  referralInfoValue: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    textAlign: 'right',
  },
  manualRequestCard: {
    gap: theme.spacing.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  manualRequestIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualRequestTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  manualRequestBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  manualActionColumn: {
    gap: theme.spacing.sm,
  },
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
  preferencesFlow: {
    gap: theme.spacing.xl,
  },
  preferencesHeaderBlock: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  preferencesTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    lineHeight: theme.typography.semantic.titleMd * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  preferencesBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  preferenceSection: {
    gap: theme.spacing.md,
  },
  preferenceSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  preferenceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  preferenceChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  preferenceChip: {
    minHeight: 42,
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  preferencePressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
  preferenceChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  preferenceChipTextSelected: {
    fontWeight: theme.typography.weights.bold,
  },
  styleSelectionGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  styleOption: {
    flex: 1,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.md,
  },
  styleOptionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  colorPaletteCard: {
    gap: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  colorSwatchGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  colorSwatchButton: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorSelectedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  preferenceHelperText: {
    marginTop: -theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontStyle: 'italic',
  },
  preferenceChoiceGrid: {
    gap: theme.spacing.sm,
  },
  preferenceChoiceCard: {
    gap: theme.spacing.xs,
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  preferenceChoiceTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  preferenceChoiceBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  matcherFlow: {
    gap: theme.spacing.xl,
  },
  matcherHeroHeader: {
    gap: theme.spacing.xs,
  },
  matcherHeroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    lineHeight: theme.typography.semantic.titleMd * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  matcherHeroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  matcherSkeletonCard: {
    gap: theme.spacing.xl,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  matcherLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  matcherLoadingDot: {
    width: 14,
    height: 14,
    borderRadius: theme.radius.full,
  },
  matcherLoadingText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  matcherSkeletonGrid: {
    gap: theme.spacing.md,
  },
  matcherSkeletonMain: {
    gap: theme.spacing.md,
  },
  matcherSkeletonSide: {
    gap: theme.spacing.sm,
  },
  matcherSkeletonBlock: {
    backgroundColor: theme.colors.borderSubtle,
    opacity: 0.72,
  },
  matcherSkeletonHero: {
    height: 180,
    borderRadius: theme.radius.xl,
  },
  matcherSkeletonPills: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  matcherSkeletonPillWide: {
    width: '40%',
    height: 22,
    borderRadius: theme.radius.full,
  },
  matcherSkeletonPill: {
    width: '28%',
    height: 22,
    borderRadius: theme.radius.full,
  },
  matcherSkeletonLine: {
    height: 44,
    borderRadius: theme.radius.lg,
  },
  matcherRecommendationsSection: {
    gap: theme.spacing.lg,
  },
  matcherSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matcherSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  matcherCardsGrid: {
    gap: theme.spacing.lg,
  },
  matcherCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    ...theme.shadows.soft,
  },
  matcherBadge: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    backgroundColor: theme.colors.brandPrimary,
  },
  matcherBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  matcherImageWrap: {
    width: '100%',
    aspectRatio: 0.82,
  },
  matcherImage: {
    width: '100%',
    height: '100%',
  },
  matcherImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matcherCardBody: {
    gap: theme.spacing.xs,
    padding: theme.spacing.lg,
  },
  matcherCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  matcherCardMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  matcherCardFooter: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  matcherCardPrice: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  matcherFavoriteButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matcherSelectedCard: {
    gap: theme.spacing.sm,
  },
  matcherSelectedTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  matcherSelectedMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  matcherSelectedSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
  captureFullScreen: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.backgroundCanvas,
  },
  flowKeyboardWrap: {
    flex: 1,
  },
  flowFullScreen: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
  },
  flowTopBar: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  flowTopTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  flowScroll: {
    flex: 1,
  },
  flowScrollContent: {
    gap: theme.spacing.lg,
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
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: 320,
  },
  tryOnLayerWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    elevation: 6,
  },
  tryOnLayerHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
  tryOnLayerMissingBanner: {
    position: 'absolute',
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.md,
    zIndex: 12,
    elevation: 12,
    alignItems: 'center',
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: 'rgba(17, 14, 17, 0.72)',
  },
  tryOnLayerMissingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  availableWigsSection: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  availableWigsHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  availableWigsTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  availableWigsMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  availableWigsRow: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.md,
  },
  tryOnWigCard: {
    width: 116,
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.backgroundPrimary,
    padding: theme.spacing.xs,
  },
  tryOnWigCardActive: {
    borderWidth: 2,
    borderColor: theme.colors.brandPrimary,
  },
  tryOnWigImageWrap: {
    position: 'relative',
    height: 86,
    overflow: 'hidden',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
  },
  tryOnWigImage: {
    width: '100%',
    height: '100%',
  },
  tryOnWigImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryOnRecommendedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimary,
  },
  tryOnWigName: {
    minHeight: 18,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  availableWigsEmpty: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  availableWigsEmptyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
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
    zIndex: 10,
    elevation: 10,
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
  captureFaceGuide: {
    position: 'absolute',
    top: 46,
    alignSelf: 'center',
    width: 142,
    height: 190,
    borderRadius: 72,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.68)',
    backgroundColor: 'rgba(255,255,255,0.04)',
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
