import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const CAPTURE_FRAME_INSET = 20;
const CAPTURE_FACE_GUIDE_TOP = 46;
const CAPTURE_FACE_GUIDE_WIDTH = 142;
const CAPTURE_FACE_GUIDE_HEIGHT = 190;
const CAPTURE_FACE_GUIDE_RADIUS = 72;
const DEFAULT_WIG_CALIBRATION = {
  offsetX: 0,
  offsetY: 0,
  scale: 1.08,
};

const formatRequestStatus = (value) => {
  const raw = String(value || 'Pending').trim();
  if (!raw) return 'Pending';
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const canCancelWigRequest = (request) => {
  if (!request?.req_id) return false;
  const status = String(request.status || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!status) return true;
  return ![
    'accepted',
    'approved',
    'in production',
    'to be release',
    'releasing',
    'released',
    'cancelled',
    'canceled',
    'rejected',
    'closed',
  ].some((token) => status.includes(token));
};

const formatPatientFieldValue = (value, fallback = 'Not provided') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

const formatPatientDateValue = (value) => {
  if (!value) return 'Not provided';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const getFileNameFromUrl = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';

  try {
    const url = new URL(normalized);
    const pathname = decodeURIComponent(url.pathname || '');
    return pathname.split('/').filter(Boolean).pop() || normalized;
  } catch {
    return normalized.split('/').filter(Boolean).pop() || normalized;
  }
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
          matchLabel: 'Selected',
          generatedImageUri: '',
        }
      : null,
    preview?.style_notes
      ? {
          id: 'fit-notes',
          name: 'Fit Notes',
          note: preview.style_notes,
          family: '',
          matchLabel: 'Note',
          generatedImageUri: '',
        }
      : null,
  ].filter(Boolean);

  return fallbackOptions.slice(0, 3);
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
    ? { x: 0.18, y: 0.28, width: 0.64, height: 0.58 }
    : { x: 0.2, y: 0.25, width: 0.6, height: 0.62 };

  return {
    scaleMultiplier: getNumericFitValue(
      source,
      ['scaleMultiplier', 'scale_multiplier', 'widthMultiplier', 'width_multiplier'],
      layerKey === 'frontBangs' ? 1 : 1.08
    ),
    scaleY: getNumericFitValue(
      source,
      ['scaleY', 'scale_y', 'heightScale', 'height_scale'],
      layerKey === 'frontBangs' ? 0.94 : 1
    ),
    heightMultiplier: getNumericFitValue(
      source,
      ['heightMultiplier', 'height_multiplier', 'aspectRatio', 'aspect_ratio'],
      layerKey === 'frontBangs' ? 0.42 : 1.9
    ),
    verticalOffset: getNumericFitValue(
      source,
      ['verticalOffset', 'vertical_offset', 'offsetYRatio', 'offset_y_ratio'],
      layerKey === 'frontBangs' ? -0.08 : -0.1
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

const getTouchDistance = (touches = []) => {
  if (!Array.isArray(touches) || touches.length < 2) return 0;
  const [firstTouch, secondTouch] = touches;
  return Math.hypot(
    Number(secondTouch.pageX || 0) - Number(firstTouch.pageX || 0),
    Number(secondTouch.pageY || 0) - Number(firstTouch.pageY || 0)
  );
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
  const landmarkWidth = Math.max(
    templeDistance ? templeDistance * 1.16 : 0,
    eyeDistance ? eyeDistance * 2.62 : 0,
    fallbackFaceBox.width * 1.06
  );
  const faceWidth = landmarkWidth || fallbackFaceBox.width;
  const faceTop = Math.min(
    forehead?.y ?? fallbackFaceBox.y,
    eyeCenter ? eyeCenter.y - (faceWidth * 0.34) : fallbackFaceBox.y
  );
  const faceBottom = chin?.y ?? fallbackFaceBox.y + fallbackFaceBox.height;
  const landmarkHeight = Math.max(faceBottom - faceTop, fallbackFaceBox.height * 0.72);
  const faceHeight = landmarkHeight || fallbackFaceBox.height;

  return {
    x: faceCenterX - (faceWidth / 2),
    y: faceTop - (faceHeight * 0.04),
    width: faceWidth,
    height: faceHeight * 1.04,
  };
};

const resolveGuideHeadBox = (stageLayout) => {
  const stageWidth = Number(stageLayout?.width || 0);
  const stageHeight = Number(stageLayout?.height || 0);
  if (!stageWidth || !stageHeight) return null;

  return {
    x: (stageWidth - CAPTURE_FACE_GUIDE_WIDTH) / 2,
    y: CAPTURE_FRAME_INSET + CAPTURE_FACE_GUIDE_TOP,
    width: CAPTURE_FACE_GUIDE_WIDTH,
    height: CAPTURE_FACE_GUIDE_HEIGHT,
  };
};

const buildGuideFaceFrame = (stageLayout) => {
  const guideHeadBox = resolveGuideHeadBox(stageLayout);
  if (!guideHeadBox) return null;

  return {
    autoMode: true,
    frameWidth: stageLayout.width,
    frameHeight: stageLayout.height,
    bounds: guideHeadBox,
    landmarks: {
      FOREHEAD: {
        x: guideHeadBox.x + (guideHeadBox.width / 2),
        y: guideHeadBox.y + (guideHeadBox.height * 0.04),
      },
      CHIN: {
        x: guideHeadBox.x + (guideHeadBox.width / 2),
        y: guideHeadBox.y + (guideHeadBox.height * 0.96),
      },
      NOSE: {
        x: guideHeadBox.x + (guideHeadBox.width / 2),
        y: guideHeadBox.y + (guideHeadBox.height * 0.5),
      },
      LEFT_EYE: {
        x: guideHeadBox.x + (guideHeadBox.width * 0.36),
        y: guideHeadBox.y + (guideHeadBox.height * 0.38),
      },
      RIGHT_EYE: {
        x: guideHeadBox.x + (guideHeadBox.width * 0.64),
        y: guideHeadBox.y + (guideHeadBox.height * 0.38),
      },
      LEFT_TEMPLE: {
        x: guideHeadBox.x + (guideHeadBox.width * 0.16),
        y: guideHeadBox.y + (guideHeadBox.height * 0.42),
      },
      RIGHT_TEMPLE: {
        x: guideHeadBox.x + (guideHeadBox.width * 0.84),
        y: guideHeadBox.y + (guideHeadBox.height * 0.42),
      },
    },
  };
};

const buildFaceAnchoredTryOnLayerStyle = (faceFrame, stageLayout, layerKey, zIndex, fitSettings = {}, userCalibration = DEFAULT_WIG_CALIBRATION) => {
  const faceBox = resolveFaceBoxInStage(faceFrame, stageLayout);
  if (!faceBox) {
    return null;
  }
  const fit = resolveLayerFit(fitSettings, layerKey);
  const anchor = resolveLayerAnchor(fitSettings, layerKey);
  const tryOnConfig = resolveTryOnConfig(fitSettings, layerKey);
  const calibrationScale = Math.min(1.6, Math.max(0.75, Number(userCalibration?.scale || 1)));
  const calibrationOffsetX = Number(userCalibration?.offsetX || 0);
  const calibrationOffsetY = Number(userCalibration?.offsetY || 0);

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
    const detectedHeadBox = resolveLandmarkHeadBox({
      fallbackFaceBox: faceBox,
      forehead,
      chin,
      leftEye,
      rightEye,
      nose,
      leftTemple,
      rightTemple,
    }) || faceBox;
    const headBox = detectedHeadBox;
    const layerScale = normalizeLayerScale(fit.scale);
    const offsetX = normalizeLayerOffset(anchor.userOffsetX, stageLayout) + calibrationOffsetX;
    const offsetY = normalizeLayerOffset(anchor.userOffsetY, stageLayout) + calibrationOffsetY;
    const targetFaceWidth = headBox.width * tryOnConfig.scaleMultiplier;
    const targetFaceHeight = headBox.height * tryOnConfig.scaleY;
    const faceHole = tryOnConfig.faceHole;
    const layerWidth = (targetFaceWidth / Math.max(faceHole.width, 0.12)) * layerScale * calibrationScale;
    const layerHeight = (targetFaceHeight / Math.max(faceHole.height, 0.12)) * layerScale * calibrationScale;
    const faceHoleCenterX = faceHole.x + (faceHole.width / 2);
    const rotation = Number(fit.rotation || 0) + rollAngle + tryOnConfig.rotationOffset;
    const rawLeft = headBox.x + (headBox.width / 2) - (layerWidth * faceHoleCenterX) + (headBox.width * tryOnConfig.horizontalOffset) + offsetX;
    const eyeLift = eyeCenter && forehead
      ? Math.max(0, (eyeCenter.y - forehead.y) * 0.18)
      : headBox.height * 0.04;
    const rawTop = headBox.y - (layerHeight * faceHole.y) + (headBox.height * tryOnConfig.verticalOffset) - eyeLift + offsetY;

    return {
      position: 'absolute',
      left: Math.min(stageLayout.width - (layerWidth * 0.18), Math.max(-stageLayout.width * 0.28, rawLeft)),
      top: Math.min(stageLayout.height - (layerHeight * 0.18), Math.max(0, rawTop)),
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
        width: anchorWidth * 1.08 * yawScale * fit.scale * calibrationScale,
        height: faceBox.height * 0.44 * fit.scale * calibrationScale,
        top: eyeLineY - (faceBox.height * 0.5 * fit.scale * calibrationScale),
      }
    : {
        width: anchorWidth * 1.82 * yawScale * fit.scale * calibrationScale,
        height: faceBox.height * 1.42 * fit.scale * calibrationScale,
        top: eyeLineY - (faceBox.height * 0.88 * fit.scale * calibrationScale),
      };
  const left = faceCenterX - (layerSize.width / 2) + fit.offsetX + calibrationOffsetX;
  const top = layerSize.top + fit.offsetY + calibrationOffsetY;
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

  const widthMultiplier = (layerKey === 'frontBangs' ? 1.16 : 1.82) * fit.scale * calibrationScale;
  const heightMultiplier = (layerKey === 'frontBangs' ? 0.5 : 1.42) * fit.scale * calibrationScale;
  const topOffset = (layerKey === 'frontBangs' ? 0.3 : 0.78) * fit.scale * calibrationScale;

  return {
    position: 'absolute',
    left: Math.max(-stageLayout.width * 0.25, faceX + (faceWidth / 2) - ((faceWidth * widthMultiplier) / 2) + fit.offsetX + calibrationOffsetX),
    top: Math.max(-stageLayout.height * 0.35, faceY - (faceHeight * topOffset) + fit.offsetY + calibrationOffsetY),
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

const toFriendlyPreferenceLabel = (value, name) => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';

  if (name === 'preferredLength') {
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return `${Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(1)} inches`;
    }
  }

  return rawValue
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const normalizeRecommendationKey = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const normalizeLengthRecommendation = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return normalizeRecommendationKey(value);
  }

  return normalizeRecommendationKey(Number.isInteger(numericValue) ? numericValue : Number(numericValue.toFixed(2)));
};

const normalizePreferenceMatchValue = (value, name) => (
  name === 'preferredLength'
    ? normalizeLengthRecommendation(value)
    : normalizeRecommendationKey(value)
);

const getWigPreferenceValue = (wig, name) => {
  const specification = wig?.physical_specification || {};

  if (name === 'preferredLength') return specification.length;
  if (name === 'preferredColor') return specification.color;
  if (name === 'hairTexture') return specification.hair_texture;
  if (name === 'hairDensity') return specification.hair_density;
  if (name === 'capSize') return specification.cap_size;
  if (name === 'stylePreference') return specification.style;

  return '';
};

const scoreWigRecommendation = (wig, values = {}) => {
  const fields = ['preferredLength', 'preferredColor', 'hairTexture', 'hairDensity', 'capSize', 'stylePreference'];
  const selectedFields = fields.filter((fieldName) => normalizePreferenceMatchValue(values?.[fieldName], fieldName));
  const stockScore = Number(wig?.stock_count || 0) > 0 ? 0.1 : 0;

  if (!selectedFields.length) return stockScore;

  return selectedFields.reduce((score, fieldName) => {
    const selectedValue = normalizePreferenceMatchValue(values?.[fieldName], fieldName);
    const wigValue = normalizePreferenceMatchValue(getWigPreferenceValue(wig, fieldName), fieldName);
    return score + (selectedValue && selectedValue === wigValue ? 1 : 0);
  }, stockScore);
};

function PreferenceChipGroup({ control, name, title, helperText, options, recommendedOptions, roles }) {
  if (!Array.isArray(options) || !options.length) return null;
  const recommendedOptionKeys = new Set(
    (recommendedOptions || []).map((option) => normalizePreferenceMatchValue(option, name)).filter(Boolean)
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.preferenceSection}>
          <View style={styles.preferenceSectionHeader}>
            <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>{title}</Text>
            {helperText ? (
              <Text style={[styles.preferenceSectionHint, { color: roles.bodyText }]}>{helperText}</Text>
            ) : null}
          </View>
          <View style={styles.preferenceChipWrap}>
            {options.map((option) => {
              const isSelected = field.value === option;
              const isAiRecommended = recommendedOptionKeys.has(normalizePreferenceMatchValue(option, name));
              const label = toFriendlyPreferenceLabel(option, name);
              return (
                <Pressable
                  key={`${name}-${option}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${title}: ${label}`}
                  onPress={() => field.onChange(option)}
                  style={({ pressed }) => [
                    styles.preferenceChip,
                    {
                      borderColor: isSelected || isAiRecommended ? roles.primaryActionBackground : roles.defaultCardBorder,
                      backgroundColor: isSelected ? roles.iconPrimarySurface : roles.pageBackground,
                    },
                    isAiRecommended && !isSelected ? styles.preferenceChipRecommended : null,
                    pressed ? styles.preferencePressed : null,
                  ]}
                >
                  {isSelected ? <AppIcon name="success" size="sm" color={roles.iconPrimaryColor} /> : null}
                  <Text
                    style={[
                      styles.preferenceChipText,
                      { color: isSelected ? roles.iconPrimaryColor : roles.bodyText },
                      isSelected ? styles.preferenceChipTextSelected : null,
                    ]}
                  >
                    {label}
                  </Text>
                  {isAiRecommended ? (
                    <View style={styles.aiChipBadge}>
                      <AppIcon name="sparkle" size="sm" color={roles.iconPrimaryColor} />
                      <Text style={[styles.aiChipBadgeText, { color: roles.iconPrimaryColor }]}>AI</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {field.value ? (
            <Text style={[styles.preferenceSelectedText, { color: roles.metaText }]}>
              Selected: {toFriendlyPreferenceLabel(field.value, name)}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

const resolveHairColorSwatch = (value) => {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('black')) return '#1F1712';
  if (normalized.includes('brown')) return normalized.includes('light') ? '#B98255' : '#4B3621';
  if (normalized.includes('blonde') || normalized.includes('gold')) return '#C99A4A';
  if (normalized.includes('gray') || normalized.includes('grey') || normalized.includes('silver')) return '#A8A8A8';
  if (normalized.includes('red') || normalized.includes('auburn')) return '#8F3D2D';
  return theme.colors.borderStrong;
};

function ColorPaletteGroup({ control, roles, options, recommendedOptions }) {
  const colors = Array.isArray(options)
    ? options.filter(Boolean).map((value) => ({ value, color: resolveHairColorSwatch(value) }))
    : [];
  const recommendedOptionKeys = new Set(
    (recommendedOptions || []).map((option) => normalizePreferenceMatchValue(option, 'preferredColor')).filter(Boolean)
  );

  if (!colors.length) return null;

  return (
    <Controller
      control={control}
      name="preferredColor"
      render={({ field }) => {
        const selected = colors.find((item) => item.value === field.value);

        return (
          <View style={styles.preferenceSection}>
            <View style={styles.preferenceSectionHeader}>
              <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>Hair Color</Text>
              <Text style={[styles.preferenceSectionHint, { color: roles.bodyText }]}>
                Pick the closest available color.
              </Text>
            </View>
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
                  const isSelected = field.value === item.value;
                  const isAiRecommended = recommendedOptionKeys.has(normalizePreferenceMatchValue(item.value, 'preferredColor'));
                  const label = toFriendlyPreferenceLabel(item.value, 'preferredColor');
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="button"
                      accessibilityLabel={`Hair color: ${label}`}
                      onPress={() => field.onChange(item.value)}
                      style={({ pressed }) => [
                        styles.colorSwatchButton,
                        {
                          borderColor: isSelected || isAiRecommended ? roles.primaryActionBackground : 'transparent',
                        },
                        isAiRecommended && !isSelected ? styles.preferenceChipRecommended : null,
                        pressed ? styles.preferencePressed : null,
                      ]}
                    >
                      <View style={[styles.colorSwatch, { backgroundColor: item.color }]}>
                        {isSelected ? <AppIcon name="checkmark" size="sm" color={theme.colors.textInverse} /> : null}
                      </View>
                      {isAiRecommended ? (
                        <View style={styles.colorAiBadge}>
                          <AppIcon name="sparkle" size="sm" color={roles.iconPrimaryColor} />
                        </View>
                      ) : null}
                      <Text numberOfLines={1} style={[styles.colorSwatchLabel, { color: roles.bodyText }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.colorSelectedText, { color: roles.bodyText }]}>
                Selected: {selected ? toFriendlyPreferenceLabel(selected.value, 'preferredColor') : 'None'}
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

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function CalibrationSlider({
  label,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
  const normalizedPercent = clamp(percent, 0, 100);
  const commitFromLocation = React.useCallback((locationX) => {
    if (!trackWidth) return;
    const raw = min + (clamp(locationX, 0, trackWidth) / trackWidth) * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.round(clamp(stepped, min, max) * 100) / 100);
  }, [max, min, onChange, step, trackWidth]);
  const sliderPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      commitFromLocation(Number(event.nativeEvent.locationX || 0));
    },
    onPanResponderMove: (event) => {
      commitFromLocation(Number(event.nativeEvent.locationX || 0));
    },
  }), [commitFromLocation]);

  return (
    <View style={styles.calibrationControl}>
      <View style={styles.calibrationControlHeader}>
        <Text style={styles.calibrationControlLabel}>{label}</Text>
        <Text style={styles.calibrationValue}>{formatValue(value)}</Text>
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        style={styles.calibrationSliderTouchArea}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        {...sliderPanResponder.panHandlers}
      >
        <View style={styles.calibrationSliderTrack}>
          <View style={[styles.calibrationSliderFill, { width: `${normalizedPercent}%` }]} />
          <View style={[styles.calibrationSliderThumb, { left: `${normalizedPercent}%` }]} />
        </View>
      </View>
    </View>
  );
}

function WigInfoRow({ label, value, roles }) {
  return (
    <View
      style={[
        styles.referralInfoRow,
        {
          borderColor: roles.defaultCardBorder,
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
  recommendedWigId,
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
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [wigCalibration, setWigCalibration] = useState(DEFAULT_WIG_CALIBRATION);
  const gestureStartRef = useRef({
    ...DEFAULT_WIG_CALIBRATION,
    distance: 0,
  });
  const handleFaceFrameChange = React.useCallback((nextFaceFrame) => {
    setFaceFrame((previousFaceFrame) => smoothFaceFrame(previousFaceFrame, nextFaceFrame));
  }, []);
  const setCalibrationValue = React.useCallback((key, value) => {
    setWigCalibration((current) => {
      return {
        ...current,
        [key]: Math.round(Number(value || 0) * 100) / 100,
      };
    });
  }, []);
  const resetCalibration = React.useCallback(() => {
    setWigCalibration(DEFAULT_WIG_CALIBRATION);
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

  useEffect(() => {
    setWigCalibration(DEFAULT_WIG_CALIBRATION);
  }, [selectedWigId]);

  const primaryTryOnImageUrl = getPrimaryTryOnImageUrl(selectedWig);
  const calibrationPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (event) => Boolean(
      selectedWig
      && primaryTryOnImageUrl
      && (event.nativeEvent.touches || []).length >= 2
    ),
    onStartShouldSetPanResponderCapture: (event) => Boolean(
      selectedWig
      && primaryTryOnImageUrl
      && (event.nativeEvent.touches || []).length >= 2
    ),
    onMoveShouldSetPanResponder: (event, gestureState) => Boolean(
      selectedWig
      && primaryTryOnImageUrl
      && (
        (event.nativeEvent.touches || []).length >= 2
        || Math.abs(gestureState.dx) > 2
        || Math.abs(gestureState.dy) > 2
      )
    ),
    onMoveShouldSetPanResponderCapture: (event, gestureState) => Boolean(
      selectedWig
      && primaryTryOnImageUrl
      && (
        (event.nativeEvent.touches || []).length >= 2
        || Math.abs(gestureState.dx) > 2
        || Math.abs(gestureState.dy) > 2
      )
    ),
    onPanResponderGrant: (event) => {
      gestureStartRef.current = {
        ...wigCalibration,
        distance: getTouchDistance(event.nativeEvent.touches),
      };
    },
    onPanResponderMove: (event, gestureState) => {
      const touches = event.nativeEvent.touches || [];
      const start = gestureStartRef.current || DEFAULT_WIG_CALIBRATION;
      if (touches.length >= 2) {
        const currentDistance = getTouchDistance(touches);
        if (!start.distance) {
          gestureStartRef.current = {
            ...wigCalibration,
            distance: currentDistance,
          };
          return;
        }
        const nextScale = Math.min(1.6, Math.max(0.75, start.scale * (currentDistance / start.distance)));
        setWigCalibration((current) => ({
          ...current,
          scale: Math.round(nextScale * 100) / 100,
        }));
        return;
      }

      setWigCalibration((current) => ({
        ...current,
        offsetX: Math.round(Math.min(140, Math.max(-140, start.offsetX + gestureState.dx))),
        offsetY: Math.round(Math.min(140, Math.max(-140, start.offsetY + gestureState.dy))),
      }));
    },
  }), [primaryTryOnImageUrl, selectedWig, wigCalibration]);

  if (!visible) return null;

  const shouldShowReferencePhoto = Boolean(referenceImage?.uri);
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
  const isLiveCameraTryOn = Boolean(!shouldShowReferencePhoto && hasCameraPermission && canUseFaceTrackingTryOnCamera && !cameraRuntimeError);
  const activeFaceFrame = faceFrame || buildGuideFaceFrame(stageLayout);
  const shouldRenderBackWigLayer = false;
  const canCaptureLivePhoto = true;
  const canUseSelectedPhoto = Boolean(referenceImage?.uri);
  const shouldShowWigLayer = Boolean(selectedWig && primaryTryOnImageUrl);
  const cameraRuntimeMessage = getCameraRuntimeMessage(cameraRuntimeError);
  const getLayerStyle = (layerKey, zIndex) => {
    const faceAnchoredStyle = buildFaceAnchoredTryOnLayerStyle(activeFaceFrame, stageLayout, layerKey, zIndex, selectedWig?.fit_settings, wigCalibration);
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
            {selectedWig ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Adjust wig calibration"
                onPress={() => setIsCalibrationOpen(true)}
                style={styles.headerIconButton}
              >
                <AppIcon name="settings" state="muted" />
              </Pressable>
            ) : null}
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
            {shouldShowReferencePhoto ? (
              <Image
                source={{ uri: referenceImage.uri }}
                resizeMode="contain"
                style={styles.captureStagePhotoPreview}
              />
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

            {shouldShowWigLayer ? (
              <View
                key={selectedWig.id || primaryTryOnImageUrl}
                pointerEvents="auto"
                style={styles.tryOnLayerWrap}
                renderToHardwareTextureAndroid
                shouldRasterizeIOS
                {...calibrationPanResponder.panHandlers}
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
                  const isAiRecommended = recommendedWigId === wig.id;

                  return (
                    <Pressable
                      key={wig.id || `${wig.wig_id}-${wig.wig_name}`}
                      accessibilityRole="button"
                      accessibilityLabel={wig.wig_name}
                      onPress={() => onSelectWig(wig.id)}
                      style={({ pressed }) => [
                        styles.tryOnWigCard,
                        isSelected ? styles.tryOnWigCardActive : null,
                        pressed ? styles.optionCardPressed : null,
                      ]}
                    >
                      <View style={styles.tryOnWigImageWrap}>
                        {isAiRecommended ? (
                          <View style={styles.tryOnWigAiBadge}>
                            <AppIcon name="sparkle" size="sm" color={theme.colors.textInverse} />
                            <Text style={styles.tryOnWigAiBadgeText}>AI</Text>
                          </View>
                        ) : null}
                        {wig.thumbnail_url ? (
                          <Image source={{ uri: wig.thumbnail_url }} resizeMode="cover" style={styles.tryOnWigImage} />
                        ) : (
                          <View style={styles.tryOnWigImagePlaceholder}>
                            <AppIcon name="image" size="lg" color={theme.colors.brandPrimary} />
                          </View>
                        )}
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
              onPress={() => {
                onUpload?.();
              }}
            />
            <IconCircleButton
              icon="camera"
              accessibilityLabel="Capture front photo"
              variant="primary"
              loading={isCapturingPhoto}
              disabled={!canCaptureLivePhoto}
              onPress={hasCameraPermission
                ? () => onCapture?.({
                  faceFrame: activeFaceFrame,
                  stageLayout,
                  wigCalibration,
                })
                : onRequestPermission}
              style={styles.captureButtonPrimary}
            />
            <View style={styles.captureControlsSpacer} />
          </View>

          <View style={styles.modalFooter}>
            <Text style={styles.modalFooterText}>
              {referenceImage?.uri
                ? 'Photo ready.'
                : selectedWig
                  ? 'Wig is placed automatically.'
                  : 'Add a front photo.'}
            </Text>

            {referenceImage?.uri ? (
              <AppButton
                title="Use Photo"
                disabled={!canUseSelectedPhoto}
                onPress={onGeneratePreview}
                leading={<AppIcon name="success" state="inverse" />}
              />
            ) : null}
          </View>
      </View>
      <Modal
        transparent
        visible={isCalibrationOpen}
        animationType="fade"
        onRequestClose={() => setIsCalibrationOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close wig calibration"
            style={styles.modalBackdrop}
            onPress={() => setIsCalibrationOpen(false)}
          />
          <View style={styles.calibrationCard}>
            <View style={styles.calibrationHeader}>
              <Text style={styles.calibrationTitle}>Wig calibration</Text>
              <Pressable onPress={() => setIsCalibrationOpen(false)} style={styles.headerIconButton}>
                <AppIcon name="close" state="muted" />
              </Pressable>
            </View>
            <CalibrationSlider
              label="Horizontal"
              value={wigCalibration.offsetX}
              min={-140}
              max={140}
              step={2}
              formatValue={(value) => `${Math.round(value)}px`}
              onChange={(value) => setCalibrationValue('offsetX', value)}
            />
            <CalibrationSlider
              label="Vertical"
              value={wigCalibration.offsetY}
              min={-140}
              max={140}
              step={2}
              formatValue={(value) => `${Math.round(value)}px`}
              onChange={(value) => setCalibrationValue('offsetY', value)}
            />
            <CalibrationSlider
              label="Scale"
              value={wigCalibration.scale}
              min={0.75}
              max={1.6}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => setCalibrationValue('scale', value)}
            />
            <View style={styles.calibrationActions}>
              <AppButton title="Reset" variant="secondary" fullWidth={false} onPress={resetCalibration} />
              <AppButton title="Done" fullWidth={false} onPress={() => setIsCalibrationOpen(false)} />
            </View>
          </View>
        </View>
      </Modal>
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
  selectedWig,
  onPress,
  roles,
}) {
  const [previewLayout, setPreviewLayout] = useState({ width: 0, height: 0 });
  const selectedWigLayerUrl = getPrimaryTryOnImageUrl(selectedWig);
  const placement = option?.placement || null;
  const selectedWigLayerStyle = placement?.faceFrame && previewLayout.width && previewLayout.height
    ? buildFaceAnchoredTryOnLayerStyle(
      placement.faceFrame,
      previewLayout,
      'fullWig',
      3,
      selectedWig?.fit_settings,
      placement.wigCalibration || DEFAULT_WIG_CALIBRATION
    )
    : buildTryOnLayerStyle(selectedWig?.fit_settings, 'fullWig', 3);

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
      <View
        style={[styles.matcherImageWrap, { backgroundColor: roles.supportCardBackground }]}
        onLayout={(event) => setPreviewLayout({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })}
      >
        {imageUri ? (
          <>
            <Image source={{ uri: imageUri }} style={styles.matcherImage} />
            {selectedWigLayerUrl ? (
              <Image
                source={{ uri: selectedWigLayerUrl }}
                resizeMode="contain"
                fadeDuration={0}
                style={[selectedWigLayerStyle, styles.matcherWigOverlay]}
              />
            ) : null}
          </>
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
            {option.matchLabel || 'Selected'}
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
  flowSource,
  control,
  errors,
  patientName,
  patientDetails,
  patientCode,
  hospitalName,
  medicalCondition,
  preferenceChoice,
  referenceImage,
  selectedWig,
  recommendedPreferenceOptions,
  recommendationOptions,
  selectedOptionId,
  onSelectOption,
  wigPreferenceOptions,
  isLoadingWigPreferenceOptions,
  generatedImageUri,
  hasGeneratedPreview,
  isGeneratingPreview,
  isSavingRequest,
  onClose,
  onContinueToDetails,
  onPreferenceChoiceChange,
  onOpenCamera,
  onSubmitRequest,
  onViewTimeline,
  onEditPatientDetails,
  onOpenPatientPhoto,
  onOpenMedicalDocument,
  roles,
}) {
  const insets = useSafeAreaInsets();
  const hasPreferenceOptions = Boolean(
    wigPreferenceOptions?.lengths?.length
    || wigPreferenceOptions?.colors?.length
    || wigPreferenceOptions?.textures?.length
    || wigPreferenceOptions?.densities?.length
    || wigPreferenceOptions?.capSizes?.length
    || wigPreferenceOptions?.styles?.length
  );
  const hasCapSizeOptions = Boolean(wigPreferenceOptions?.capSizes?.length);
  const patientPicture = patientDetails?.patient_picture || '';
  const medicalDocument = patientDetails?.medical_document || '';
  const patientRows = [
    { key: 'hospital', label: 'Hospital', value: hospitalName },
    { key: 'medical_condition', label: 'Medical condition', value: medicalCondition || patientDetails?.medical_condition },
    { key: 'date_of_diagnosis', label: 'Date of diagnosis', value: formatPatientDateValue(patientDetails?.date_of_diagnosis) },
    { key: 'guardian', label: 'Guardian', value: patientDetails?.guardian },
  ];

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
              {step === 'summary' || flowSource === 'preview' ? 'Preview' : step === 'basicFit' ? 'Fit' : 'Request'}
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
                  <View style={styles.patientReviewHeader}>
                    <Text style={styles.flowTitle}>Confirm Details</Text>
                    <AppButton
                      title="Edit"
                      variant="secondary"
                      fullWidth={false}
                      onPress={onEditPatientDetails}
                      leading={<AppIcon name="editProfile" state="active" />}
                      style={styles.patientEditButton}
                    />
                  </View>

                  <View style={styles.previewGrid}>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Patient</Text>
                      <Text style={styles.previewValue}>{patientName || 'Patient account'}</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>Patient code</Text>
                      <Text style={styles.previewValue}>{patientCode || 'Not assigned'}</Text>
                    </View>
                    {patientRows.map((row) => (
                      <View key={row.key} style={styles.previewRow}>
                        <Text style={styles.previewLabel}>{row.label}</Text>
                        <Text style={styles.previewValue}>
                          {formatPatientFieldValue(row.value, row.key === 'patient_code' ? 'Not assigned' : row.key === 'hospital' ? 'Not linked' : 'Not provided')}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.patientMediaGrid}>
                    <AppCard variant="soft" radius="lg" padding="md" style={styles.patientMediaCard}>
                      <View style={styles.patientMediaHeader}>
                        <Text style={[styles.patientMediaTitle, { color: roles.headingText }]}>Photo</Text>
                        <AppIcon name="image" size="sm" color={roles.iconPrimaryColor} />
                      </View>
                      {patientPicture ? (
                        <>
                          <Image source={{ uri: patientPicture }} style={styles.patientPhotoPreview} resizeMode="cover" />
                          <AppButton
                            title="View"
                            variant="secondary"
                            fullWidth={false}
                            onPress={onOpenPatientPhoto}
                            leading={<AppIcon name="eye" state="active" />}
                          />
                        </>
                      ) : (
                        <View style={styles.patientMediaEmpty}>
                          <AppIcon name="image" size="lg" color={roles.metaText} />
                          <Text style={[styles.patientMediaEmptyText, { color: roles.metaText }]}>No photo</Text>
                        </View>
                      )}
                    </AppCard>

                    <AppCard variant="soft" radius="lg" padding="md" style={styles.patientMediaCard}>
                      <View style={styles.patientMediaHeader}>
                        <Text style={[styles.patientMediaTitle, { color: roles.headingText }]}>Document</Text>
                        <AppIcon name="requests" size="sm" color={roles.iconPrimaryColor} />
                      </View>
                      <Text numberOfLines={2} style={[styles.patientDocumentName, { color: roles.bodyText }]}>
                        {medicalDocument ? getFileNameFromUrl(medicalDocument) : 'No document'}
                      </Text>
                      <AppButton
                        title="View"
                        variant="secondary"
                        fullWidth={false}
                        disabled={!medicalDocument}
                        onPress={onOpenMedicalDocument}
                        leading={<AppIcon name="eye" state="active" />}
                      />
                    </AppCard>
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
                          I confirm these details.
                        </Text>
                      </Pressable>
                    )}
                  />
                  {errors.acceptedTerms?.message ? (
                    <Text style={styles.fieldError}>{errors.acceptedTerms.message}</Text>
                  ) : null}

                  <View style={styles.preferenceSection}>
                    <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>
                      Preferences
                    </Text>
                    <View style={styles.preferenceChoiceGrid}>
                      {[
                        { key: 'preferences', title: 'Choose style', body: '' },
                        { key: 'fitOnly', title: 'Fit only', body: '' },
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
                            <View style={styles.preferenceChoiceHeader}>
                              <Text
                                style={[
                                  styles.preferenceChoiceTitle,
                                  { color: isSelected ? roles.iconPrimaryColor : roles.headingText },
                                ]}
                              >
                                {item.title}
                              </Text>
                              {isSelected ? <AppIcon name="success" size="sm" color={roles.iconPrimaryColor} /> : null}
                            </View>
                            {item.body ? (
                              <Text style={[styles.preferenceChoiceBody, { color: roles.bodyText }]}>
                                {item.body}
                              </Text>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.singleActionRow}>
                    <AppButton
                      title="Next"
                      onPress={onContinueToDetails}
                      fullWidth={true}
                    />
                  </View>
                </View>
              ) : null}

              {step === 'basicFit' ? (
                <View style={styles.preferencesFlow}>
                  <View style={styles.fitPanel}>
                    <View style={[styles.fitNoticeIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                      <AppIcon name="information-outline" size="md" color={roles.iconPrimaryColor} />
                    </View>
                    <View style={styles.fitNoticeCopy}>
                      <Text style={[styles.fitNoticeTitle, { color: roles.headingText }]}>Standard size</Text>
                      <Text style={[styles.fitNoticeBody, { color: roles.bodyText }]}>21.5-22.5 in (54-57 cm)</Text>
                      {!hasCapSizeOptions ? (
                        <View style={styles.fitInlineNotice}>
                          <AppIcon name="information-outline" size="sm" color={roles.iconPrimaryColor} />
                          <Text style={[styles.fitInlineNoticeText, { color: roles.bodyText }]}>No size options yet.</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {hasCapSizeOptions ? (
                    <PreferenceChipGroup
                      control={control}
                      name="capSize"
                      title="Cap Size"
                      options={wigPreferenceOptions?.capSizes || []}
                      recommendedOptions={recommendedPreferenceOptions?.capSize || []}
                      roles={roles}
                    />
                  ) : null}

                  <View style={styles.singleActionRow}>
                    <AppButton
                      title="Submit"
                      loading={isSavingRequest}
                      onPress={onSubmitRequest}
                      fullWidth={true}
                      leading={<AppIcon name="requests" state="inverse" />}
                    />
                  </View>
                </View>
              ) : null}

              {step === 'details' ? (
                <View style={styles.preferencesFlow}>
                  <View style={styles.preferencesHeaderBlock}>
                    <Text style={[styles.preferencesTitle, { color: roles.headingText }]}>Style</Text>
                  </View>

                  {isLoadingWigPreferenceOptions ? (
                    <Text style={[styles.preferenceHelperText, { color: roles.metaText }]}>
                      Loading options.
                    </Text>
                  ) : null}

                  {!isLoadingWigPreferenceOptions && !hasPreferenceOptions ? (
                    <Text style={[styles.preferenceHelperText, { color: roles.metaText }]}>
                      No options yet.
                    </Text>
                  ) : null}

                  <PreferenceChipGroup
                    control={control}
                    name="preferredLength"
                    title="Length"
                    options={wigPreferenceOptions?.lengths || []}
                    recommendedOptions={recommendedPreferenceOptions?.preferredLength || []}
                    roles={roles}
                  />

                  <PreferenceChipGroup
                    control={control}
                    name="hairTexture"
                    title="Texture"
                    options={wigPreferenceOptions?.textures || []}
                    recommendedOptions={recommendedPreferenceOptions?.hairTexture || []}
                    roles={roles}
                  />

                  <PreferenceChipGroup
                    control={control}
                    name="hairDensity"
                    title="Fullness"
                    options={wigPreferenceOptions?.densities || []}
                    recommendedOptions={recommendedPreferenceOptions?.hairDensity || []}
                    roles={roles}
                  />

                  <PreferenceChipGroup
                    control={control}
                    name="stylePreference"
                    title="Style"
                    options={wigPreferenceOptions?.styles || []}
                    recommendedOptions={recommendedPreferenceOptions?.stylePreference || []}
                    roles={roles}
                  />

                  <ColorPaletteGroup
                    control={control}
                    roles={roles}
                    options={wigPreferenceOptions?.colors || []}
                    recommendedOptions={recommendedPreferenceOptions?.preferredColor || []}
                  />

                  <PreferenceChipGroup
                    control={control}
                    name="capSize"
                    title="Cap Size"
                    options={wigPreferenceOptions?.capSizes || []}
                    recommendedOptions={recommendedPreferenceOptions?.capSize || []}
                    roles={roles}
                  />

                  <View style={styles.preferenceSection}>
                    <View style={styles.preferenceLabelRow}>
                      <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>Notes</Text>
                      <AppIcon name="information-outline" size="sm" color={roles.iconPrimaryColor} />
                    </View>
                    <Controller
                      control={control}
                      name="specialNotes"
                      render={({ field }) => (
                        <AppInput
                          placeholder="Optional notes"
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
                  </View>

                  <View style={styles.singleActionRow}>
                    <AppButton
                      title="Preview"
                      onPress={onOpenCamera}
                      fullWidth={true}
                      leading={<AppIcon name="arrow-right" state="inverse" />}
                    />
                  </View>
                </View>
              ) : null}

              {step === 'summary' ? (
                <View style={styles.matcherFlow}>
                  <View style={styles.matcherHeroHeader}>
                    <Text style={[styles.matcherHeroTitle, { color: roles.headingText }]}>Selected Wig</Text>
                  </View>

                  {isGeneratingPreview ? (
                    <AiMatcherSkeleton roles={roles} />
                  ) : (
                    <>
                      {hasGeneratedPreview ? (
                        <View style={styles.matcherRecommendationsSection}>
                          <View style={styles.matcherCardsGrid}>
                            {recommendationOptions.slice(0, 1).map((option, index) => {
                              const optionImageUri = option.generatedImageUri || generatedImageUri || referenceImage?.uri || '';
                              const active = selectedOptionId === option.id || (!selectedOptionId && index === 0);
                              return (
                                <MatcherRecommendationCard
                                  key={option.id}
                                  option={option}
                                  isActive={active}
                                  imageUri={optionImageUri}
                                  selectedWig={selectedWig}
                                  onPress={() => onSelectOption(option.id)}
                                  roles={roles}
                                />
                              );
                            })}
                          </View>

                        </View>
                      ) : (
                        <AppCard variant="soft" radius="xl" padding="lg" style={styles.summaryNoteCard}>
                          <Text style={[styles.summaryNoteTitle, { color: roles.headingText }]}>No wig selected</Text>
                          <Text style={[styles.flowBody, { color: roles.bodyText }]}>
                            Choose one wig first.
                          </Text>
                        </AppCard>
                      )}
                    </>
                  )}

                  <AppButton
                    title="Submit"
                    loading={isSavingRequest}
                    onPress={onSubmitRequest}
                    leading={<AppIcon name="requests" state="inverse" />}
                  />

                </View>
              ) : null}

              {step === 'waiting' ? (
                <View style={styles.waitingState}>
                  <AppIcon name="success" state="active" size="xl" />
                  <Text style={styles.flowTitle}>Submitted</Text>
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
  const [flowSource, setFlowSource] = useState('request');
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
    patientDetails,
    latestWigRequest,
    latestWigSpecification,
    requestHospital,
    hasSubmittedRequest,
    referenceImage,
    preview,
    error,
    successMessage,
    isLoadingContext,
    isPickingReference,
    isGeneratingPreview,
    isSavingRequest,
    isCancellingRequest,
    availableWigs,
    isLoadingAvailableWigs,
    wigPreferenceOptions,
    isLoadingWigPreferenceOptions,
    pickReferenceImage,
    saveCapturedReferenceImage,
    generatePreview,
    saveRequest,
    cancelRequest,
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
  const requestPatientDetails = patientDetails || patientProfile || {};
  const patientCode = requestPatientDetails?.patient_code || '';
  const hospitalName = requestHospital?.hospital_name || patientProfile?.hospital_name || patientProfile?.hospital?.hospital_name || '';
  const medicalCondition = requestPatientDetails?.medical_condition || '';
  const requestStatus = formatRequestStatus(latestWigRequest?.status || 'Pending');
  const requestCode = latestWigRequest?.request_code || '';
  const canCancelLatestRequest = canCancelWigRequest(latestWigRequest);
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
  const generatedImageUri = selectedOption?.generatedImageUri || preview?.generated_image_data_url || latestWigSpecification?.ai_wig_preview_url || '';
  const hasGeneratedPreview = Boolean(preview);
  const aiRecommendedWig = useMemo(() => {
    if (!availableWigs.length) return null;

    return availableWigs.reduce((best, wig) => {
      const score = scoreWigRecommendation(wig, draftValues);
      if (!best) return { wig, score };
      if (score > best.score) return { wig, score };

      const bestStock = Number(best.wig?.stock_count || 0);
      const wigStock = Number(wig?.stock_count || 0);
      if (score === best.score && wigStock > bestStock) return { wig, score };

      return best;
    }, null)?.wig || availableWigs[0] || null;
  }, [availableWigs, draftValues]);
  const aiRecommendedWigId = aiRecommendedWig?.id || '';
  const recommendedPreferenceOptions = useMemo(() => ({
    preferredLength: [getWigPreferenceValue(aiRecommendedWig, 'preferredLength')].filter(Boolean),
    preferredColor: [getWigPreferenceValue(aiRecommendedWig, 'preferredColor')].filter(Boolean),
    hairTexture: [getWigPreferenceValue(aiRecommendedWig, 'hairTexture')].filter(Boolean),
    hairDensity: [getWigPreferenceValue(aiRecommendedWig, 'hairDensity')].filter(Boolean),
    capSize: [getWigPreferenceValue(aiRecommendedWig, 'capSize')].filter(Boolean),
    stylePreference: [getWigPreferenceValue(aiRecommendedWig, 'stylePreference')].filter(Boolean),
  }), [aiRecommendedWig]);
  const selectedWig = useMemo(
    () => availableWigs.find((wig) => wig.id === selectedWigFilterId) || aiRecommendedWig || availableWigs[0] || null,
    [aiRecommendedWig, availableWigs, selectedWigFilterId]
  );
  const activeSelectedWigId = selectedWigFilterId || selectedWig?.id || aiRecommendedWigId || '';

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
      return '';
    });
  }, [availableWigs]);

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

  const handleCapturePhoto = async (placement = null) => {
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

      await saveCapturedReferenceImage(photo, placement);
    } catch {
      await saveCapturedReferenceImage(null);
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleGeneratePreviewFromModal = handleSubmit(async (values) => {
    const result = await generatePreview(values, selectedWig);

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

  const handleCancelLatestRequest = () => {
    Alert.alert(
      'Cancel request?',
      'This will close your pending wig request.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel request',
          style: 'destructive',
          onPress: async () => {
            const result = await cancelRequest();
            if (result?.success) {
              await refreshTracking();
              setIsTimelineOpen(false);
            }
          },
        },
      ]
    );
  };

  const openRequestFlow = () => {
    setFlowSource('request');
    setRequestPreferenceChoice('preferences');
    setFlowStep('patient');
    setIsFlowOpen(true);
    setIsTimelineOpen(false);
  };

  const openAiPreviewFlow = () => {
    setFlowSource('preview');
    setRequestPreferenceChoice('preferences');
    setFlowStep('details');
    setIsFlowOpen(true);
    setIsTimelineOpen(false);
  };

  const closeRequestFlow = () => {
    setIsFlowOpen(false);
    setFlowSource('request');
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

  const handleStartPreview = async () => {
    await openCaptureFlow();
  };

  const handleEditPatientDetails = () => {
    setIsFlowOpen(false);
    router.navigate('/profile');
  };

  const handleOpenMedicalDocument = async () => {
    await openPatientFileUrl(requestPatientDetails?.medical_document, 'patientWigRequest.openMedicalDocument');
  };

  const openPatientFileUrl = async (url, source) => {
    const targetUrl = String(url || '').trim();
    if (!targetUrl) return;

    try {
      const canOpen = await Linking.canOpenURL(targetUrl);
      if (canOpen) {
        await Linking.openURL(targetUrl);
      }
    } catch (openError) {
      logAppError(source, openError, { userId: user?.id });
    }
  };

  const handleOpenPatientPhoto = async () => {
    await openPatientFileUrl(requestPatientDetails?.patient_picture, 'patientWigRequest.openPatientPhoto');
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
          <>
            <AppCard variant="patientTint" radius="xl" padding="lg" style={styles.currentRequestCard}>
              <View style={styles.currentRequestBody}>
                <View style={styles.currentRequestIcon}>
                  <AppIcon name="requests" state="active" size="xl" />
                </View>
                <View style={styles.currentRequestCopy}>
                  <Text style={[styles.currentRequestLabel, { color: roles.bodyText }]}>
                    {requestCode || 'Current status'}
                  </Text>
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

              {canCancelLatestRequest ? (
                <View style={styles.currentRequestActions}>
                  <AppButton
                    title={isCancellingRequest ? 'Cancelling...' : 'Cancel request'}
                    variant="outline"
                    size="sm"
                    onPress={handleCancelLatestRequest}
                    loading={isCancellingRequest}
                    leading={<AppIcon name="closeCircle" state="danger" size="sm" />}
                    textColorOverride={theme.colors.textError}
                    borderColorOverride={theme.colors.borderSubtle}
                    backgroundColorOverride={roles.defaultCardBackground}
                  />
                </View>
              ) : null}
            </AppCard>
          </>
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
        flowSource={flowSource}
        control={control}
        errors={errors}
        patientName={patientFullName}
        patientDetails={requestPatientDetails}
        patientCode={patientCode}
        hospitalName={hospitalName}
        medicalCondition={medicalCondition}
        preferenceChoice={requestPreferenceChoice}
        referenceImage={referenceImage}
        selectedWig={selectedWig}
        recommendedPreferenceOptions={recommendedPreferenceOptions}
        recommendationOptions={recommendationOptions}
        selectedOptionId={selectedOptionId}
        onSelectOption={setSelectedOptionId}
        wigPreferenceOptions={wigPreferenceOptions}
        isLoadingWigPreferenceOptions={isLoadingWigPreferenceOptions}
        generatedImageUri={generatedImageUri}
        hasGeneratedPreview={hasGeneratedPreview}
        isGeneratingPreview={isGeneratingPreview}
        isSavingRequest={isSavingRequest}
        onClose={closeRequestFlow}
        onContinueToDetails={handleContinueToDetails}
        onPreferenceChoiceChange={setRequestPreferenceChoice}
        onOpenCamera={handleStartPreview}
        onSubmitRequest={handleSaveRequest}
        onViewTimeline={() => {
          setIsFlowOpen(false);
          setIsTimelineOpen(true);
        }}
        onEditPatientDetails={handleEditPatientDetails}
        onOpenPatientPhoto={handleOpenPatientPhoto}
        onOpenMedicalDocument={handleOpenMedicalDocument}
        roles={roles}
      />

      <CaptureModal
        visible={isCaptureOpen}
        referenceImage={referenceImage}
        availableWigs={availableWigs}
        selectedWig={selectedWig}
        selectedWigId={activeSelectedWigId}
        recommendedWigId={aiRecommendedWigId}
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
  currentRequestActions: {
    marginTop: theme.spacing.md,
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
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: theme.spacing.sm,
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
    maxWidth: '62%',
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
  singleActionRow: {
    width: '100%',
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
  fitPanel: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderMuted,
  },
  fitNoticeIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitNoticeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  fitNoticeTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  fitNoticeBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  fitInlineNotice: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  fitInlineNoticeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  preferenceSection: {
    gap: theme.spacing.sm,
  },
  preferenceSectionHeader: {
    gap: 2,
  },
  preferenceSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  preferenceSectionHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 2,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  preferenceChipRecommended: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  aiChipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  aiChipBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
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
  preferenceSelectedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
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
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  colorSwatchButton: {
    position: 'relative',
    width: 82,
    minHeight: 82,
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
  },
  colorAiBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
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
  colorSwatchLabel: {
    maxWidth: '100%',
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
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
  preferenceChoiceHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
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
    position: 'relative',
    width: '100%',
    aspectRatio: 0.82,
  },
  matcherImage: {
    width: '100%',
    height: '100%',
  },
  matcherWigOverlay: {
    position: 'absolute',
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
  calibrationCard: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 420,
    gap: theme.spacing.md,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.backgroundPrimary,
    ...theme.shadows.lg,
  },
  calibrationHeader: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  calibrationTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  calibrationControl: {
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  calibrationControlHeader: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  calibrationControlLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  calibrationValue: {
    minWidth: 58,
    textAlign: 'right',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  calibrationSliderTouchArea: {
    minHeight: 34,
    justifyContent: 'center',
  },
  calibrationSliderTrack: {
    position: 'relative',
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceDisabled,
  },
  calibrationSliderFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  calibrationSliderThumb: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 24,
    marginLeft: -12,
    borderRadius: theme.radius.full,
    borderWidth: 3,
    borderColor: theme.colors.backgroundPrimary,
    backgroundColor: theme.colors.brandPrimary,
    ...theme.shadows.soft,
  },
  calibrationActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
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
  patientReviewHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  patientEditButton: {
    minWidth: 92,
  },
  patientMediaGrid: {
    gap: theme.spacing.md,
  },
  patientMediaCard: {
    gap: theme.spacing.sm,
  },
  patientMediaHeader: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  patientMediaTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  patientPhotoPreview: {
    width: '100%',
    height: 210,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
  },
  patientMediaEmpty: {
    minHeight: 148,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  patientMediaEmptyText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  patientDocumentName: {
    minHeight: 40,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
  captureStagePhotoPreview: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: 320,
    backgroundColor: '#090909',
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
  tryOnWigAiBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: theme.radius.full,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: theme.colors.brandPrimary,
  },
  tryOnWigAiBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
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
    top: CAPTURE_FRAME_INSET,
    right: CAPTURE_FRAME_INSET,
    bottom: CAPTURE_FRAME_INSET,
    left: CAPTURE_FRAME_INSET,
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
    top: CAPTURE_FACE_GUIDE_TOP,
    alignSelf: 'center',
    width: CAPTURE_FACE_GUIDE_WIDTH,
    height: CAPTURE_FACE_GUIDE_HEIGHT,
    borderRadius: CAPTURE_FACE_GUIDE_RADIUS,
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
  faceScanPanel: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.backgroundPrimary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  faceScanStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.textWarning,
  },
  faceScanStatusDotComplete: {
    backgroundColor: theme.colors.textSuccess,
  },
  faceScanCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  faceScanTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  faceScanBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
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
