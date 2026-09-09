import { zodResolver } from "@hookform/resolvers/zod";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useFocusEffect } from "@react-navigation/native";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Image,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { patientDashboardNavItems } from "../../constants/dashboard";
import { resolvePatientThemeRoles, theme } from "../../design-system/theme";
import {
    wigRequestDefaultValues,
    wigRequestSchema,
} from "../../features/wigRequest.schema";
import { upsertPatientWigSafetyAssessment } from "../../features/wigRequest.api";
import { useNotifications } from "../../hooks/useNotifications";
import { usePatientWigRequest } from "../../hooks/usePatientWigRequest";
import { useProcessTracking } from "../../hooks/useProcessTracking";
import { useAuth } from "../../providers/AuthProvider";
import { verifyMedicalCertificateAsset } from "../../features/patientMedicalCertificate.service";
import { getWigRequestCancellationEligibility } from "../../features/wigRequest.service";
import { logAppError } from "../../utils/appErrors";
import { DonorTopBar } from "../donor/DonorTopBar";
import { LegalDocumentPreview } from "../legal/LegalDocumentPreview";
import { AppButton } from "../ui/AppButton";
import { AppCard } from "../ui/AppCard";
import { AppIcon } from "../ui/AppIcon";
import { AppInput } from "../ui/AppInput";
import { StatusBanner } from "../ui/StatusBanner";
import { DashboardHeaderSurface } from "./DashboardHeaderSurface";
import { DashboardLayout } from "./DashboardLayout";
import { fetchActiveLegalDocument, fetchActiveLegalDocuments } from "../../features/donorCompliance.service";

let NativeVisionCamera = null;
let useNativeCameraDevice = null;
let useNativeFrameProcessor = null;
let useNativeFaceDetector = null;
let NativeWorklets = null;
let MediaPipeCamera = null;
let useMediaPipeFaceLandmarkDetection = null;
let MediaPipeRunningMode = null;
let MediaPipeDelegate = null;
let viewShotCaptureRef = null;
let didTryLoadViewShot = false;
const isExpoGoRuntime = Constants?.appOwnership === "expo";
let Pdf = null;

const SAFETY_ASSESSMENT_DEFAULTS = {
  hasKnownAllergies: null,
  allergyDetails: "",
  hasSensitiveScalp: null,
  hasScalpIrritation: null,
  hasOpenScalpWounds: null,
  hasMedicalRestriction: null,
  medicalRestrictionDetails: "",
  informationConfirmed: false,
};

const getPatientGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const wigRequestGuideSteps = [
  {
    key: "details",
    icon: "clipboard-account-outline",
    label: "Confirm details",
  },
  {
    key: "preference",
    icon: "creation-outline",
    label: "Choose a style",
  },
  {
    key: "review",
    icon: "shield-check-outline",
    label: "Submit for review",
  },
];

try {
  if (!isExpoGoRuntime) {
    const pdfModule = require("react-native-pdf");
    Pdf = pdfModule?.default || pdfModule;
  }
} catch {
  Pdf = null;
}

try {
  if (!isExpoGoRuntime) {
    const visionCameraModule = require("react-native-vision-camera");
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
    const faceDetectorModule = require("react-native-vision-camera-face-detector");
    useNativeFaceDetector = faceDetectorModule?.useFaceDetector || null;
  }
} catch {
  useNativeFaceDetector = null;
}

try {
  if (!isExpoGoRuntime) {
    const workletsModule = require("react-native-worklets-core");
    NativeWorklets = workletsModule?.Worklets || null;
  }
} catch {
  NativeWorklets = null;
}

try {
  if (!isExpoGoRuntime) {
    const mediaPipeModule = require("react-native-mediapipe");
    MediaPipeCamera = mediaPipeModule?.MediapipeCamera || null;
    useMediaPipeFaceLandmarkDetection =
      mediaPipeModule?.useFaceLandmarkDetection || null;
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
  MediaPipeCamera &&
  useMediaPipeFaceLandmarkDetection &&
  MediaPipeRunningMode &&
  MediaPipeDelegate &&
  NativeVisionCamera &&
  useNativeCameraDevice,
);

const canUseNativeTryOnCamera = Boolean(
  NativeVisionCamera &&
  useNativeCameraDevice &&
  useNativeFrameProcessor &&
  useNativeFaceDetector &&
  NativeWorklets?.createRunOnJS,
);

const canUseFaceTrackingTryOnCamera =
  canUseMediaPipeTryOnCamera || canUseNativeTryOnCamera;

const getViewShotCaptureRef = () => {
  if (didTryLoadViewShot) return viewShotCaptureRef;
  didTryLoadViewShot = true;

  try {
    viewShotCaptureRef = require("react-native-view-shot")?.captureRef || null;
  } catch {
    viewShotCaptureRef = null;
  }

  return viewShotCaptureRef;
};

const FACE_LANDMARKER_MODEL = "face_landmarker.task";
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
  const raw = String(value || "Pending").trim();
  if (!raw) return "Pending";
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const formatPatientFieldValue = (value, fallback = "Not provided") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const getFileNameFromUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    const pathname = decodeURIComponent(url.pathname || "");
    return pathname.split("/").filter(Boolean).pop() || normalized;
  } catch {
    return normalized.split("/").filter(Boolean).pop() || normalized;
  }
};

const isImageDocumentUrl = (value = "") => (
  /^data:image\//i.test(String(value || ""))
  || /\.(png|jpe?g|webp|gif)(?:\?|#|$)/i.test(String(value || ""))
);

const isPdfDocumentUrl = (value = "") => (
  /^data:application\/pdf/i.test(String(value || ""))
  || /\.pdf(?:\?|#|$)/i.test(String(value || ""))
);

const buildRecommendationOptions = ({
  preview,
  specification,
  draftValues,
}) => {
  if (Array.isArray(preview?.options) && preview.options.length) {
    return preview.options.slice(0, 3).map((option, index) => ({
      id: option.id || `option-${index}`,
      name: option.name || `Style ${index + 1}`,
      note: option.note || "Suggested wig option",
      summary: option.summary || option.note || "",
      styleNotes: option.style_notes || option.note || "",
      family: option.family || "",
      matchLabel: index === 0
        ? "#1 - Best overall match"
        : index === 1
          ? "#2 - Second choice"
          : "#3 - Third choice",
      suitabilityReason: option.suitability_reason || option.note || "",
      selectedWig: option.selected_wig || option.selectedWig || null,
      optionIndex: option.option_index || index + 1,
      generatedImageUri:
        option.generated_image_data_url || option.generatedImageDataUrl || "",
      previewUrl:
        option.preview_url ||
        option.generated_image_data_url ||
        option.generatedImageDataUrl ||
        "",
    }));
  }

  const fallbackOptions = [
    specification?.preferred_length || draftValues?.preferredLength
      ? {
          id: "preferred-length",
          name: specification?.preferred_length || draftValues?.preferredLength,
          note: "Suggested length direction",
          family: "",
          matchLabel: "Suggested",
          generatedImageUri: "",
        }
      : null,
    specification?.preferred_color || draftValues?.preferredColor
      ? {
          id: "preferred-color",
          name: specification?.preferred_color || draftValues?.preferredColor,
          note: "Suggested color direction",
          family: "",
          matchLabel: "Selected",
          generatedImageUri: "",
        }
      : null,
    preview?.style_notes
      ? {
          id: "fit-notes",
          name: "Fit Notes",
          note: preview.style_notes,
          family: "",
          matchLabel: "Note",
          generatedImageUri: "",
        }
      : null,
  ].filter(Boolean);

  return fallbackOptions.slice(0, 3);
};

const LAYER_SETTING_KEYS = {
  fullWig: [
    "fullWig",
    "full_wig",
    "full-wig",
    "FullWig",
    "Full Wig",
    "full_wig_layer",
  ],
  backHair: [
    "backHair",
    "back_hair",
    "back-hair",
    "BackHair",
    "Back Hair",
    "back_hair_layer",
  ],
  frontBangs: [
    "frontBangs",
    "front_bangs",
    "front-bangs",
    "FrontBangs",
    "Front Bangs",
    "front_bangs_layer",
  ],
};

const getLayerSettingsCandidates = (fitSettings = {}, layerKey = "fullWig") => {
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

const resolveLayerFit = (fitSettings = {}, layerKey = "fullWig") => {
  const candidates = getLayerSettingsCandidates(fitSettings, layerKey);
  const source = candidates[0] || {};
  const offsetSource =
    source.offset || source.position || source.translate || {};
  const width = source.width ?? source.w ?? (layerKey === "fullWig" ? 72 : 64);
  const height =
    source.height ?? source.h ?? (layerKey === "fullWig" ? 70 : 42);
  const x =
    source.x ??
    source.left ??
    offsetSource.x ??
    source.offsetX ??
    source.offset_x ??
    (layerKey === "fullWig" ? 14 : 18);
  const y =
    source.y ??
    source.top ??
    offsetSource.y ??
    source.offsetY ??
    source.offset_y ??
    (layerKey === "frontBangs" ? 18 : 12);
  const scale = Number(source.scale ?? fitSettings?.scale ?? 1) || 1;
  const rotation =
    source.rotation ?? source.rotate ?? fitSettings?.rotation ?? 0;
  const opacity = source.opacity ?? 1;
  const offsetX =
    Number(
      source.offsetX ??
        source.offset_x ??
        source.translateX ??
        source.translate_x ??
        source.xOffset ??
        source.x_offset ??
        offsetSource.x ??
        0,
    ) || 0;
  const offsetY =
    Number(
      source.offsetY ??
        source.offset_y ??
        source.translateY ??
        source.translate_y ??
        source.yOffset ??
        source.y_offset ??
        offsetSource.y ??
        0,
    ) || 0;

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
  if (typeof value === "string") return value;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return `${fallback}%`;
  return `${numericValue > 1 ? numericValue : numericValue * 100}%`;
};

const buildTryOnLayerStyle = (fitSettings, layerKey, zIndex) => {
  const fit = resolveLayerFit(fitSettings, layerKey);

  return {
    position: "absolute",
    left: toPercent(fit.x, 50),
    top: toPercent(fit.y, 12),
    width: toPercent(fit.width, 72),
    height: toPercent(fit.height, 70),
    opacity: fit.opacity,
    zIndex,
    elevation: zIndex,
    transform: [
      { scale: fit.scale },
      {
        rotate:
          typeof fit.rotation === "number"
            ? `${fit.rotation}deg`
            : String(fit.rotation || "0deg"),
      },
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
    x:
      validPoints.reduce((total, point) => total + point.x, 0) /
      validPoints.length,
    y:
      validPoints.reduce((total, point) => total + point.y, 0) /
      validPoints.length,
  };
};

const distanceBetweenPoints = (a, b) => {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
};

const lerp = (from, to, amount = 0.35) => from + (to - from) * amount;

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
  const landmarks = Object.keys(next.landmarks || {}).reduce(
    (result, key) => ({
      ...result,
      [key]: lerpPoint(
        previous.landmarks?.[key],
        next.landmarks?.[key],
        amount,
      ),
    }),
    {},
  );

  return {
    ...next,
    rollAngle: lerp(
      Number(previous.rollAngle || 0),
      Number(next.rollAngle || 0),
      amount,
    ),
    yawAngle: lerp(
      Number(previous.yawAngle || 0),
      Number(next.yawAngle || 0),
      amount,
    ),
    bounds: {
      x: lerp(
        Number(previousBounds.x ?? previousBounds.left ?? 0),
        Number(nextBounds.x ?? nextBounds.left ?? 0),
        amount,
      ),
      y: lerp(
        Number(previousBounds.y ?? previousBounds.top ?? 0),
        Number(nextBounds.y ?? nextBounds.top ?? 0),
        amount,
      ),
      width: lerp(
        Number(previousBounds.width || 0),
        Number(nextBounds.width || 0),
        amount,
      ),
      height: lerp(
        Number(previousBounds.height || 0),
        Number(nextBounds.height || 0),
        amount,
      ),
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
  if (
    !point ||
    !frameSize?.width ||
    !frameSize?.height ||
    !viewSize?.width ||
    !viewSize?.height
  ) {
    return null;
  }

  const framePoint = {
    x: mirrored ? frameSize.width - point.x : point.x,
    y: point.y,
  };
  const frameRatio = frameSize.width / frameSize.height;
  const viewRatio = viewSize.width / viewSize.height;
  const scale =
    frameRatio > viewRatio
      ? viewSize.height / frameSize.height
      : viewSize.width / frameSize.width;
  const offsetX =
    frameRatio > viewRatio ? (viewSize.width - frameSize.width * scale) / 2 : 0;
  const offsetY =
    frameRatio > viewRatio
      ? 0
      : (viewSize.height - frameSize.height * scale) / 2;

  return {
    x: framePoint.x * scale + offsetX,
    y: framePoint.y * scale + offsetY,
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

const resolveLayerAnchor = (fitSettings = {}, layerKey = "fullWig") => {
  const layerFit = resolveLayerFit(fitSettings, layerKey);
  const layerSettings =
    getLayerSettingsCandidates(fitSettings, layerKey)[0] || {};
  const anchorSettings =
    layerSettings?.anchor ||
    layerSettings?.face_anchor ||
    fitSettings?.anchor ||
    fitSettings?.face_anchor ||
    {};

  return {
    faceCenterX: getNumericFitValue(
      anchorSettings,
      [
        "faceCenterX",
        "face_center_x",
        "cutoutCenterX",
        "cutout_center_x",
        "anchorX",
        "anchor_x",
      ],
      layerKey === "frontBangs" ? 0.5 : 0.52,
    ),
    foreheadY: getNumericFitValue(
      anchorSettings,
      [
        "foreheadY",
        "forehead_y",
        "hairlineY",
        "hairline_y",
        "anchorY",
        "anchor_y",
      ],
      layerKey === "frontBangs" ? 0.42 : 0.34,
    ),
    faceWidthRatio: getNumericFitValue(
      anchorSettings,
      [
        "faceWidthRatio",
        "face_width_ratio",
        "cutoutWidthRatio",
        "cutout_width_ratio",
      ],
      layerKey === "frontBangs" ? 0.68 : 0.5,
    ),
    faceHeightRatio: getNumericFitValue(
      anchorSettings,
      [
        "faceHeightRatio",
        "face_height_ratio",
        "cutoutHeightRatio",
        "cutout_height_ratio",
      ],
      layerKey === "frontBangs" ? 0.38 : 0.62,
    ),
    userOffsetX: layerFit.offsetX,
    userOffsetY: layerFit.offsetY,
  };
};

const resolveTryOnConfig = (fitSettings = {}, layerKey = "fullWig") => {
  const globalConfig =
    fitSettings?.try_on || fitSettings?.tryOn || fitSettings?.filter || {};
  const layerKeys = LAYER_SETTING_KEYS[layerKey] || [layerKey];
  const layerConfig =
    [
      ...layerKeys.map((key) => globalConfig?.layers?.[key]),
      ...layerKeys.map((key) => globalConfig?.[key]),
      ...getLayerSettingsCandidates(fitSettings, layerKey).map(
        (settings) => settings?.try_on || settings?.tryOn,
      ),
    ].filter(Boolean)[0] || {};
  const source = { ...globalConfig, ...layerConfig };
  const faceHoleSource =
    source?.faceHole ||
    source?.face_hole ||
    source?.faceOpening ||
    source?.face_opening ||
    {};
  const defaultFaceHole =
    layerKey === "frontBangs"
      ? { x: 0.18, y: 0.28, width: 0.64, height: 0.58 }
      : { x: 0.2, y: 0.25, width: 0.6, height: 0.62 };

  return {
    scaleMultiplier: getNumericFitValue(
      source,
      [
        "scaleMultiplier",
        "scale_multiplier",
        "widthMultiplier",
        "width_multiplier",
      ],
      layerKey === "frontBangs" ? 1 : 1.08,
    ),
    scaleY: getNumericFitValue(
      source,
      ["scaleY", "scale_y", "heightScale", "height_scale"],
      layerKey === "frontBangs" ? 0.94 : 1,
    ),
    heightMultiplier: getNumericFitValue(
      source,
      ["heightMultiplier", "height_multiplier", "aspectRatio", "aspect_ratio"],
      layerKey === "frontBangs" ? 0.42 : 1.9,
    ),
    verticalOffset: getNumericFitValue(
      source,
      ["verticalOffset", "vertical_offset", "offsetYRatio", "offset_y_ratio"],
      layerKey === "frontBangs" ? -0.08 : -0.1,
    ),
    horizontalOffset: getNumericFitValue(
      source,
      [
        "horizontalOffset",
        "horizontal_offset",
        "offsetXRatio",
        "offset_x_ratio",
      ],
      0,
    ),
    rotationOffset: getNumericFitValue(
      source,
      ["rotationOffset", "rotation_offset"],
      0,
    ),
    anchor: source?.anchor || "forehead",
    faceHole: {
      x: getNumericFitValue(faceHoleSource, ["x", "left"], defaultFaceHole.x),
      y: getNumericFitValue(faceHoleSource, ["y", "top"], defaultFaceHole.y),
      width: getNumericFitValue(
        faceHoleSource,
        ["width", "w"],
        defaultFaceHole.width,
      ),
      height: getNumericFitValue(
        faceHoleSource,
        ["height", "h"],
        defaultFaceHole.height,
      ),
    },
  };
};

const normalizeMediaPipeLandmarkPoint = (landmark, coordinateSpace) => {
  const x = Number(landmark?.x);
  const y = Number(landmark?.y);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !coordinateSpace?.viewSize?.width ||
    !coordinateSpace?.viewSize?.height
  ) {
    return null;
  }

  const rotatedPoint = rotateNormalizedMediaPipePoint(
    { x, y },
    coordinateSpace.rotation,
  );
  const framePoint = {
    x: rotatedPoint.x * coordinateSpace.frameSize.width,
    y: rotatedPoint.y * coordinateSpace.frameSize.height,
  };

  return mapFramePointToView(
    framePoint,
    coordinateSpace.frameSize,
    coordinateSpace.viewSize,
    coordinateSpace.mirrored,
  );
};

const averageMediaPipeLandmarks = (landmarks, indices, coordinateSpace) =>
  averagePoints(
    indices.map((index) =>
      normalizeMediaPipeLandmarkPoint(landmarks?.[index], coordinateSpace),
    ),
  );

const buildMediaPipeFaceFrame = (resultBundle, viewSize, mirrored) => {
  const landmarks = resultBundle?.results?.[0]?.faceLandmarks?.[0];
  if (
    !Array.isArray(landmarks) ||
    !landmarks.length ||
    !viewSize?.width ||
    !viewSize?.height
  ) {
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
    .map((landmark) =>
      normalizeMediaPipeLandmarkPoint(landmark, coordinateSpace),
    )
    .filter(Boolean);
  if (!points.length) return null;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const leftTemple = averageMediaPipeLandmarks(
    landmarks,
    [127, 234, 93],
    coordinateSpace,
  );
  const rightTemple = averageMediaPipeLandmarks(
    landmarks,
    [356, 454, 323],
    coordinateSpace,
  );

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
      LEFT_EYE: averageMediaPipeLandmarks(
        landmarks,
        [33, 133, 159, 145],
        coordinateSpace,
      ),
      RIGHT_EYE: averageMediaPipeLandmarks(
        landmarks,
        [263, 362, 386, 374],
        coordinateSpace,
      ),
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
    const scaleX =
      rawX + rawWidth > stageWidth
        ? stageWidth / Math.max(rawX + rawWidth, 1)
        : 1;
    const scaleY =
      rawY + rawHeight > stageHeight
        ? stageHeight / Math.max(rawY + rawHeight, 1)
        : 1;
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
  const sourceWidth =
    frameIsPortrait === viewIsPortrait ? frameWidth : frameHeight;
  const sourceHeight =
    frameIsPortrait === viewIsPortrait ? frameHeight : frameWidth;
  const sourceX = frameIsPortrait === viewIsPortrait ? rawX : rawY;
  const sourceY = frameIsPortrait === viewIsPortrait ? rawY : rawX;
  const sourceFaceWidth =
    frameIsPortrait === viewIsPortrait ? rawWidth : rawHeight;
  const sourceFaceHeight =
    frameIsPortrait === viewIsPortrait ? rawHeight : rawWidth;
  const coverScale = Math.max(
    stageWidth / sourceWidth,
    stageHeight / sourceHeight,
  );
  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const offsetX = (renderedWidth - stageWidth) / 2;
  const offsetY = (renderedHeight - stageHeight) / 2;
  const mirroredX = sourceWidth - sourceX - sourceFaceWidth;

  return {
    x: mirroredX * coverScale - offsetX,
    y: sourceY * coverScale - offsetY,
    width: sourceFaceWidth * coverScale,
    height: sourceFaceHeight * coverScale,
  };
};

const mapStaticImagePointToStage = (point, frameSize, stageLayout) => {
  if (
    !point ||
    !frameSize?.width ||
    !frameSize?.height ||
    !stageLayout?.width ||
    !stageLayout?.height
  ) {
    return null;
  }

  const coverScale = Math.max(
    stageLayout.width / frameSize.width,
    stageLayout.height / frameSize.height,
  );
  const renderedWidth = frameSize.width * coverScale;
  const renderedHeight = frameSize.height * coverScale;
  const offsetX = (renderedWidth - stageLayout.width) / 2;
  const offsetY = (renderedHeight - stageLayout.height) / 2;

  return {
    x: Number(point.x || 0) * coverScale - offsetX,
    y: Number(point.y || 0) * coverScale - offsetY,
  };
};

const mapStaticImageFaceFrameToStage = (faceFrame, stageLayout) => {
  if (
    faceFrame?.source !== "ai_photo_detection" &&
    faceFrame?.source !== "mediapipe_static_image"
  ) {
    return faceFrame;
  }

  const frameSize = {
    width: Number(faceFrame.frameWidth || 0),
    height: Number(faceFrame.frameHeight || 0),
  };
  const bounds = faceFrame.bounds || {};
  const topLeft = mapStaticImagePointToStage(
    { x: bounds.x, y: bounds.y },
    frameSize,
    stageLayout,
  );
  const bottomRight = mapStaticImagePointToStage(
    {
      x: Number(bounds.x || 0) + Number(bounds.width || 0),
      y: Number(bounds.y || 0) + Number(bounds.height || 0),
    },
    frameSize,
    stageLayout,
  );
  if (!topLeft || !bottomRight) return null;

  const landmarks = Object.entries(faceFrame.landmarks || {}).reduce(
    (result, [key, point]) => {
      const mappedPoint = mapStaticImagePointToStage(point, frameSize, stageLayout);
      return mappedPoint ? { ...result, [key]: mappedPoint } : result;
    },
    {},
  );

  return {
    ...faceFrame,
    autoMode: true,
    frameWidth: stageLayout.width,
    frameHeight: stageLayout.height,
    bounds: {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    },
    landmarks,
  };
};

const normalizeLayerScale = (scale) => {
  const numericScale = Number(scale);
  if (!Number.isFinite(numericScale)) return 1;
  return Math.min(1.18, Math.max(0.82, 1 + (numericScale - 1) * 0.45));
};

const normalizeLayerOffset = (offset, stageLayout) => {
  const numericOffset = Number(offset);
  if (!Number.isFinite(numericOffset)) return 0;
  const baseSize = Math.min(
    Number(stageLayout?.width || 0),
    Number(stageLayout?.height || 0),
  );
  return numericOffset * (baseSize ? baseSize / 1024 : 1);
};

const getTouchDistance = (touches = []) => {
  if (!Array.isArray(touches) || touches.length < 2) return 0;
  const [firstTouch, secondTouch] = touches;
  return Math.hypot(
    Number(secondTouch.pageX || 0) - Number(firstTouch.pageX || 0),
    Number(secondTouch.pageY || 0) - Number(firstTouch.pageY || 0),
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
  const faceCenterX =
    centerPoint?.x || fallbackFaceBox.x + fallbackFaceBox.width / 2;
  const templeDistance = distanceBetweenPoints(leftTemple, rightTemple);
  const eyeDistance = distanceBetweenPoints(leftEye, rightEye);
  const landmarkWidth = Math.max(
    templeDistance ? templeDistance * 1.16 : 0,
    eyeDistance ? eyeDistance * 2.62 : 0,
    fallbackFaceBox.width * 1.06,
  );
  const faceWidth = landmarkWidth || fallbackFaceBox.width;
  const faceTop = Math.min(
    forehead?.y ?? fallbackFaceBox.y,
    eyeCenter ? eyeCenter.y - faceWidth * 0.34 : fallbackFaceBox.y,
  );
  const faceBottom = chin?.y ?? fallbackFaceBox.y + fallbackFaceBox.height;
  const landmarkHeight = Math.max(
    faceBottom - faceTop,
    fallbackFaceBox.height * 0.72,
  );
  const faceHeight = landmarkHeight || fallbackFaceBox.height;

  return {
    x: faceCenterX - faceWidth / 2,
    y: faceTop - faceHeight * 0.04,
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
        x: guideHeadBox.x + guideHeadBox.width / 2,
        y: guideHeadBox.y + guideHeadBox.height * 0.04,
      },
      CHIN: {
        x: guideHeadBox.x + guideHeadBox.width / 2,
        y: guideHeadBox.y + guideHeadBox.height * 0.96,
      },
      NOSE: {
        x: guideHeadBox.x + guideHeadBox.width / 2,
        y: guideHeadBox.y + guideHeadBox.height * 0.5,
      },
      LEFT_EYE: {
        x: guideHeadBox.x + guideHeadBox.width * 0.36,
        y: guideHeadBox.y + guideHeadBox.height * 0.38,
      },
      RIGHT_EYE: {
        x: guideHeadBox.x + guideHeadBox.width * 0.64,
        y: guideHeadBox.y + guideHeadBox.height * 0.38,
      },
      LEFT_TEMPLE: {
        x: guideHeadBox.x + guideHeadBox.width * 0.16,
        y: guideHeadBox.y + guideHeadBox.height * 0.42,
      },
      RIGHT_TEMPLE: {
        x: guideHeadBox.x + guideHeadBox.width * 0.84,
        y: guideHeadBox.y + guideHeadBox.height * 0.42,
      },
    },
  };
};

const buildFaceAnchoredTryOnLayerStyle = (
  faceFrame,
  stageLayout,
  layerKey,
  zIndex,
  fitSettings = {},
  userCalibration = DEFAULT_WIG_CALIBRATION,
) => {
  const faceBox = resolveFaceBoxInStage(faceFrame, stageLayout);
  if (!faceBox) {
    return null;
  }
  const fit = resolveLayerFit(fitSettings, layerKey);
  const anchor = resolveLayerAnchor(fitSettings, layerKey);
  const tryOnConfig = resolveTryOnConfig(fitSettings, layerKey);
  const calibrationScale = Math.min(
    1.6,
    Math.max(0.75, Number(userCalibration?.scale || 1)),
  );
  const calibrationOffsetX = Number(userCalibration?.offsetX || 0);
  const calibrationOffsetY = Number(userCalibration?.offsetY || 0);

  const leftEye = getFacePoint(faceFrame, "LEFT_EYE");
  const rightEye = getFacePoint(faceFrame, "RIGHT_EYE");
  const leftEar = getFacePoint(faceFrame, "LEFT_EAR");
  const rightEar = getFacePoint(faceFrame, "RIGHT_EAR");
  const forehead = getFacePoint(faceFrame, "FOREHEAD");
  const chin = getFacePoint(faceFrame, "CHIN");
  const nose = getFacePoint(faceFrame, "NOSE");
  const leftTemple = getFacePoint(faceFrame, "LEFT_TEMPLE") || leftEar;
  const rightTemple = getFacePoint(faceFrame, "RIGHT_TEMPLE") || rightEar;
  const eyeCenter = averagePoints([leftEye, rightEye]);
  const templeCenter = averagePoints([leftTemple, rightTemple]);
  const faceCenterPoint = averagePoints([eyeCenter, nose, templeCenter]);
  const faceCenterX =
    faceCenterPoint?.x || eyeCenter?.x || faceBox.x + faceBox.width / 2;
  const eyeLineY = eyeCenter?.y || faceBox.y + faceBox.height * 0.38;
  const earDistance = distanceBetweenPoints(leftEar, rightEar);
  const eyeDistance = distanceBetweenPoints(leftEye, rightEye);
  const templeDistance = distanceBetweenPoints(leftTemple, rightTemple);
  const anchorWidth = Math.max(
    faceBox.width,
    templeDistance || 0,
    earDistance || 0,
    eyeDistance ? eyeDistance * 2.35 : 0,
  );
  const eyeRollAngle =
    leftEye && rightEye
      ? Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) *
        (180 / Math.PI)
      : 0;
  const rollAngle = normalizeFaceTiltDegrees(
    faceFrame?.rollAngle ?? eyeRollAngle ?? 0,
  );
  const yawAngle = Math.abs(Number(faceFrame?.yawAngle || 0));
  const yawScale = Math.max(0.82, 1 - yawAngle / 120);

  if (faceFrame?.mediapipe && forehead && chin) {
    const detectedHeadBox =
      resolveLandmarkHeadBox({
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
    const offsetX =
      normalizeLayerOffset(anchor.userOffsetX, stageLayout) +
      calibrationOffsetX;
    const offsetY =
      normalizeLayerOffset(anchor.userOffsetY, stageLayout) +
      calibrationOffsetY;
    const targetFaceWidth = headBox.width * tryOnConfig.scaleMultiplier;
    const targetFaceHeight = headBox.height * tryOnConfig.scaleY;
    const faceHole = tryOnConfig.faceHole;
    const layerWidth =
      (targetFaceWidth / Math.max(faceHole.width, 0.12)) *
      layerScale *
      calibrationScale;
    const layerHeight =
      (targetFaceHeight / Math.max(faceHole.height, 0.12)) *
      layerScale *
      calibrationScale;
    const faceHoleCenterX = faceHole.x + faceHole.width / 2;
    const rotation =
      Number(fit.rotation || 0) + rollAngle + tryOnConfig.rotationOffset;
    const rawLeft =
      headBox.x +
      headBox.width / 2 -
      layerWidth * faceHoleCenterX +
      headBox.width * tryOnConfig.horizontalOffset +
      offsetX;
    const eyeLift =
      eyeCenter && forehead
        ? Math.max(0, (eyeCenter.y - forehead.y) * 0.18)
        : headBox.height * 0.04;
    const rawTop =
      headBox.y -
      layerHeight * faceHole.y +
      headBox.height * tryOnConfig.verticalOffset -
      eyeLift +
      offsetY;

    return {
      position: "absolute",
      left: Math.min(
        stageLayout.width - layerWidth * 0.18,
        Math.max(-stageLayout.width * 0.28, rawLeft),
      ),
      top: Math.min(
        stageLayout.height - layerHeight * 0.18,
        Math.max(0, rawTop),
      ),
      width: layerWidth,
      height: layerHeight,
      opacity: fit.opacity,
      zIndex,
      elevation: zIndex,
      transform: [{ rotate: `${rotation}deg` }],
    };
  }

  const layerSize =
    layerKey === "frontBangs"
      ? {
          width: anchorWidth * 1.08 * yawScale * fit.scale * calibrationScale,
          height: faceBox.height * 0.44 * fit.scale * calibrationScale,
          top: eyeLineY - faceBox.height * 0.5 * fit.scale * calibrationScale,
        }
      : {
          width: anchorWidth * 1.82 * yawScale * fit.scale * calibrationScale,
          height: faceBox.height * 1.42 * fit.scale * calibrationScale,
          top: eyeLineY - faceBox.height * 0.88 * fit.scale * calibrationScale,
        };
  const left =
    faceCenterX - layerSize.width / 2 + fit.offsetX + calibrationOffsetX;
  const top = layerSize.top + fit.offsetY + calibrationOffsetY;
  const rotation = Number(fit.rotation || 0) + rollAngle;

  if (faceFrame?.autoMode) {
    return {
      position: "absolute",
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

  const widthMultiplier =
    (layerKey === "frontBangs" ? 1.16 : 1.82) * fit.scale * calibrationScale;
  const heightMultiplier =
    (layerKey === "frontBangs" ? 0.5 : 1.42) * fit.scale * calibrationScale;
  const topOffset =
    (layerKey === "frontBangs" ? 0.3 : 0.78) * fit.scale * calibrationScale;

  return {
    position: "absolute",
    left: Math.max(
      -stageLayout.width * 0.25,
      faceX +
        faceWidth / 2 -
        (faceWidth * widthMultiplier) / 2 +
        fit.offsetX +
        calibrationOffsetX,
    ),
    top: Math.max(
      -stageLayout.height * 0.35,
      faceY - faceHeight * topOffset + fit.offsetY + calibrationOffsetY,
    ),
    width: faceWidth * widthMultiplier,
    height: faceHeight * heightMultiplier,
    opacity: fit.opacity,
    zIndex,
    elevation: zIndex,
    transform: [{ rotate: `${Number(fit.rotation || 0)}deg` }],
  };
};

const getPrimaryTryOnImageUrl = (wig) =>
  wig?.layer_full_wig_url ||
  wig?.layer_front_bangs_url ||
  wig?.layer_back_hair_url ||
  "";

const getWigPreviewImageUrl = (wig) =>
  wig?.thumbnail_url ||
  wig?.layer_full_wig_url ||
  wig?.layer_front_bangs_url ||
  wig?.layer_back_hair_url ||
  "";

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
  const code = String(error?.code || "");
  if (code === "system/camera-is-restricted") {
    return "Camera is restricted by this device. Use upload instead or allow camera access in device policy/settings.";
  }
  if (code.includes("permission")) {
    return "Camera permission is not available. Allow camera access or upload a photo.";
  }
  return "Camera is unavailable right now. Use upload instead.";
};

function CameraUnavailablePlaceholder({ message }) {
  return (
    <View style={styles.captureStagePlaceholder}>
      <AppIcon name="camera" state="active" size="xl" />
      <Text style={styles.captureStagePlaceholderTitle}>
        Camera unavailable
      </Text>
      <Text style={styles.captureStagePlaceholderBody}>{message}</Text>
    </View>
  );
}

function MediaPipeTryOnFaceCamera({
  cameraRef,
  onFaceBoundsChange,
  onCameraReady,
  onCameraUnavailable,
}) {
  const device = useNativeCameraDevice("front");
  const handleResults = React.useCallback(
    (resultBundle, viewSize, mirrored) => {
      onFaceBoundsChange?.(
        buildMediaPipeFaceFrame(resultBundle, viewSize, mirrored),
      );
    },
    [onFaceBoundsChange],
  );

  const handleError = React.useCallback(
    (error) => {
      logAppError("MediaPipe face landmark detection failed", error);
      onFaceBoundsChange?.(null);
    },
    [onFaceBoundsChange],
  );

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
      mirrorMode: "mirror-front-only",
    },
  );

  React.useEffect(() => {
    if (device) {
      solution.cameraDeviceChangeHandler(device);
      onCameraReady?.();
    }
  }, [device, onCameraReady, solution]);

  React.useEffect(() => {
    solution.resizeModeChangeHandler("cover");
  }, [solution]);

  const handleCameraRuntimeError = React.useCallback(
    (error) => {
      logAppError("Vision camera unavailable for live wig try-on", error);
      onFaceBoundsChange?.(null);
      onCameraUnavailable?.(error);
    },
    [onCameraUnavailable, onFaceBoundsChange],
  );

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

function NativeTryOnFaceCamera({
  cameraRef,
  stageLayout,
  onFaceBoundsChange,
  onCameraReady,
  onCameraUnavailable,
}) {
  const device = useNativeCameraDevice("front");
  const faceDetectionOptions = React.useMemo(
    () => ({
      performanceMode: "fast",
      landmarkMode: "all",
      contourMode: "all",
      classificationMode: "none",
      minFaceSize: 0.16,
      trackingEnabled: false,
      cameraFacing: "front",
      autoMode: true,
      windowWidth: Math.max(1, Number(stageLayout?.width || 1)),
      windowHeight: Math.max(1, Number(stageLayout?.height || 1)),
    }),
    [stageLayout?.height, stageLayout?.width],
  );
  const { detectFaces, stopListeners } =
    useNativeFaceDetector(faceDetectionOptions);
  const handleFacesOnJs = React.useMemo(
    () =>
      NativeWorklets.createRunOnJS((faceFrame = null) => {
        onFaceBoundsChange?.(faceFrame);
      }),
    [onFaceBoundsChange],
  );
  const frameProcessor = useNativeFrameProcessor(
    (frame) => {
      "worklet";
      const faces = detectFaces(frame);
      const face = Array.isArray(faces) && faces.length ? faces[0] : null;
      handleFacesOnJs(
        face?.bounds
          ? {
              ...face,
              autoMode: true,
              frameWidth: frame.width,
              frameHeight: frame.height,
            }
          : null,
      );
    },
    [detectFaces, handleFacesOnJs],
  );

  React.useEffect(
    () => () => {
      stopListeners?.();
    },
    [stopListeners],
  );

  React.useEffect(() => {
    if (device) onCameraReady?.();
  }, [device, onCameraReady]);

  const handleCameraRuntimeError = React.useCallback(
    (error) => {
      logAppError("Vision camera unavailable for fallback wig try-on", error);
      onFaceBoundsChange?.(null);
      onCameraUnavailable?.(error);
    },
    [onCameraUnavailable, onFaceBoundsChange],
  );

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
  const rawValue = String(value ?? "").trim();
  if (!rawValue) return "";

  if (name === "preferredLength") {
    const numericValue = Number(rawValue);
    if (Number.isFinite(numericValue) && numericValue > 0) {
      return `${Number.isInteger(numericValue) ? numericValue : numericValue.toFixed(1)} inches`;
    }
  }

  return rawValue
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const normalizeRecommendationKey = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeLengthRecommendation = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return normalizeRecommendationKey(value);
  }

  return normalizeRecommendationKey(
    Number.isInteger(numericValue)
      ? numericValue
      : Number(numericValue.toFixed(2)),
  );
};

const normalizePreferenceMatchValue = (value, name) =>
  name === "preferredLength"
    ? normalizeLengthRecommendation(value)
    : normalizeRecommendationKey(value);

const normalizeCapSizeValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "s" || normalized.includes("small")) return "small";
  if (normalized === "m" || normalized.includes("medium")) return "medium";
  if (normalized === "l" || normalized.includes("large")) return "large";
  return normalizeRecommendationKey(normalized);
};

const formatExpectedRelease = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    date: new Intl.DateTimeFormat("en-PH", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("en-PH", {
      hour: "numeric",
      minute: "2-digit",
    }).format(date),
  };
};

const getWigPreferenceValue = (wig, name) => {
  const specification = wig?.physical_specification || {};

  if (name === "preferredLength") return specification.length;
  if (name === "preferredColor") return specification.color;
  if (name === "hairTexture") return specification.hair_texture;
  if (name === "hairDensity") return specification.hair_density;
  if (name === "capSize") return specification.cap_size;
  if (name === "stylePreference") return specification.style;

  return "";
};

const scoreWigRecommendation = (wig, values = {}) => {
  const fields = [
    "preferredLength",
    "preferredColor",
    "hairTexture",
    "hairDensity",
    "capSize",
    "stylePreference",
  ];
  const selectedFields = fields.filter((fieldName) =>
    normalizePreferenceMatchValue(values?.[fieldName], fieldName),
  );
  const hasPreviewAsset = Boolean(
    wig?.layer_full_wig_url ||
      wig?.layer_front_bangs_url ||
      wig?.layer_back_hair_url ||
      wig?.thumbnail_url,
  );
  const stockScore = Number(wig?.stock_count || 0) > 0 ? 0.1 : hasPreviewAsset ? 0.05 : 0;

  if (!selectedFields.length) return stockScore;

  return selectedFields.reduce((score, fieldName) => {
    const selectedValue = normalizePreferenceMatchValue(
      values?.[fieldName],
      fieldName,
    );
    const wigValue = normalizePreferenceMatchValue(
      getWigPreferenceValue(wig, fieldName),
      fieldName,
    );
    return score + (selectedValue && selectedValue === wigValue ? 1 : 0);
  }, stockScore);
};

const validateAiTryOnPhoto = (photo) => {
  if (!photo?.uri) {
    return {
      valid: false,
      message: "Take a clear front-facing photo first.",
    };
  }

  const mimeType = String(photo?.mimeType || "").toLowerCase();
  const uri = String(photo?.uri || "").toLowerCase();
  const hasAcceptedFormat =
    mimeType.includes("jpeg") ||
    mimeType.includes("jpg") ||
    mimeType.includes("png") ||
    uri.endsWith(".jpg") ||
    uri.endsWith(".jpeg") ||
    uri.endsWith(".png") ||
    uri.startsWith("file:") ||
    uri.startsWith("content:");

  if (!hasAcceptedFormat) {
    return {
      valid: false,
      message: "Use a JPG, JPEG, or PNG photo.",
    };
  }

  const width = Number(photo?.width || 0);
  const height = Number(photo?.height || 0);
  if ((width && width < 512) || (height && height < 512)) {
    return {
      valid: false,
      message: "The photo resolution is too low. Retake a sharper photo.",
    };
  }

  if (width && height) {
    const aspectRatio = width / height;
    if (aspectRatio < 0.45 || aspectRatio > 2.1) {
      return {
        valid: false,
        message: "Make sure your full head is visible and not cropped.",
      };
    }
  }

  const faceFrame = photo?.placement?.faceFrame;
  const bounds = faceFrame?.bounds || faceFrame;
  if (bounds?.width && bounds?.height) {
    const left = Number(bounds.x ?? bounds.left ?? 0);
    const top = Number(bounds.y ?? bounds.top ?? 0);
    const faceWidth = Number(bounds.width || 0);
    const faceHeight = Number(bounds.height || 0);
    const stageWidth = Number(photo?.placement?.stageLayout?.width || width || 0);
    const stageHeight = Number(photo?.placement?.stageLayout?.height || height || 0);
    const isSeverelyOutsideFrame =
      stageWidth &&
      stageHeight &&
      (left < -stageWidth * 0.03 ||
        top < -stageHeight * 0.03 ||
        left + faceWidth > stageWidth * 1.03 ||
        top + faceHeight > stageHeight * 1.03);
    const faceFillsTooMuchFrame =
      stageWidth &&
      stageHeight &&
      (faceWidth > stageWidth * 0.92 || faceHeight > stageHeight * 0.92);

    if (isSeverelyOutsideFrame || faceFillsTooMuchFrame) {
      return {
        valid: false,
        message: "Your head appears cropped. Retake the photo with your full head visible.",
      };
    }
  }

  return {
    valid: true,
    message: "Review the photo, then use it or retake it.",
  };
};

function CapSizeOptionButton({ label, isSelected, onPress, roles }) {
  const scale = useRef(new Animated.Value(1)).current;
  const normalizedLabel = String(label || "").trim().toLowerCase();
  const measurement = normalizedLabel.includes("small")
    ? '21"'
    : normalizedLabel.includes("medium")
      ? '22"–22.5"'
      : normalizedLabel.includes("large")
        ? '23"–23.5"'
        : "";
  const animateScale = (value, useSpring = false) => {
    const animation = useSpring
      ? Animated.spring(scale, {
          toValue: value,
          damping: 16,
          stiffness: 240,
          mass: 0.7,
          useNativeDriver: true,
        })
      : Animated.timing(scale, {
          toValue: value,
          duration: 90,
          useNativeDriver: true,
        });
    animation.start();
  };

  return (
    <Animated.View style={[styles.capSizeOptionShell, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`Cap size: ${label}`}
        accessibilityHint={isSelected ? "Currently selected" : "Select this cap size"}
        onPress={onPress}
        onPressIn={() => animateScale(0.96)}
        onPressOut={() => animateScale(1, true)}
        style={[
          styles.capSizeOption,
          {
            borderColor: isSelected
              ? roles.primaryActionBackground
              : roles.defaultCardBorder,
          },
        ]}
      >
        <LinearGradient
          colors={isSelected
            ? [theme.colors.palette.wine600, theme.colors.palette.wine900]
            : [theme.colors.palette.white, theme.colors.palette.warm50]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.capSizeOptionGradient}
        >
          <View style={[
            styles.capSizeOptionIcon,
            {
              backgroundColor: isSelected
                ? "rgba(255,255,255,0.18)"
                : roles.iconPrimarySurface,
            },
          ]}>
            <MaterialCommunityIcons
              name="tape-measure"
              size={19}
              color={isSelected ? "#FFFFFF" : roles.iconPrimaryColor}
            />
          </View>
          <Text style={[
            styles.capSizeOptionText,
            { color: isSelected ? "#FFFFFF" : roles.headingText },
          ]}>
            {label}
          </Text>
          {measurement ? (
            <View style={[
              styles.capSizeMeasurementPill,
              {
                backgroundColor: isSelected
                  ? "rgba(255,255,255,0.16)"
                  : roles.iconPrimarySurface,
              },
            ]}>
              <Text style={[
                styles.capSizeMeasurementText,
                { color: isSelected ? "#FFFFFF" : roles.iconPrimaryColor },
              ]}>
                {measurement}
              </Text>
            </View>
          ) : null}
          <Text style={[
            styles.capSizeOptionState,
            { color: isSelected ? "rgba(255,255,255,0.84)" : roles.metaText },
          ]}>
            {isSelected ? "Selected" : "Tap to select"}
          </Text>
          <View style={[
            styles.capSizeRadio,
            {
              borderColor: isSelected ? "rgba(255,255,255,0.72)" : roles.defaultCardBorder,
              backgroundColor: isSelected ? "rgba(255,255,255,0.18)" : roles.pageBackground,
            },
          ]}>
            {isSelected ? <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" /> : null}
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function PreferenceChipGroup({
  control,
  name,
  title,
  helperText,
  options,
  recommendedOptions,
  roles,
  variant = "default",
}) {
  if (!Array.isArray(options) || !options.length) return null;
  const isSizeSelector = variant === "size";
  const displayOptions = isSizeSelector
    ? [...options].sort((left, right) => {
        const order = { small: 0, medium: 1, large: 2 };
        return (order[String(left).toLowerCase()] ?? 99) - (order[String(right).toLowerCase()] ?? 99);
      })
    : options;
  const recommendedOptionKeys = new Set(
    (recommendedOptions || [])
      .map((option) => normalizePreferenceMatchValue(option, name))
      .filter(Boolean),
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={styles.preferenceSection}>
          {isSizeSelector ? (
            <View style={styles.capSizeSectionHeader}>
              <View style={[styles.capSizeSelectionIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons name="head-outline" size={23} color={roles.iconPrimaryColor} />
              </View>
              <View style={styles.capSizeSectionHeaderCopy}>
                <Text style={[styles.capSizeEyebrow, { color: roles.iconPrimaryColor }]}>CAP SIZE</Text>
                <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>{title}</Text>
                {helperText ? (
                  <Text style={[styles.preferenceSectionHint, { color: roles.bodyText }]}>{helperText}</Text>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.preferenceSectionHeader}>
              <Text style={[styles.preferenceSectionTitle, { color: roles.headingText }]}>{title}</Text>
              {helperText ? (
                <Text style={[styles.preferenceSectionHint, { color: roles.bodyText }]}>{helperText}</Text>
              ) : null}
            </View>
          )}
          <View style={[styles.preferenceChipWrap, isSizeSelector ? styles.capSizeOptionGrid : null]}>
            {displayOptions.map((option) => {
              const isSelected = field.value === option;
              const isAiRecommended = recommendedOptionKeys.has(
                normalizePreferenceMatchValue(option, name),
              );
              const label = toFriendlyPreferenceLabel(option, name);
              if (isSizeSelector) {
                return (
                  <CapSizeOptionButton
                    key={`${name}-${option}`}
                    label={label}
                    isSelected={isSelected}
                    onPress={() => field.onChange(option)}
                    roles={roles}
                  />
                );
              }
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
                      borderColor:
                        isSelected || isAiRecommended
                          ? roles.primaryActionBackground
                          : roles.defaultCardBorder,
                      backgroundColor: isSelected
                        ? roles.iconPrimarySurface
                        : roles.pageBackground,
                    },
                    isAiRecommended && !isSelected
                      ? styles.preferenceChipRecommended
                      : null,
                    pressed ? styles.preferencePressed : null,
                  ]}
                >
                  {isSelected ? (
                    <AppIcon
                      name="success"
                      size="sm"
                      color={roles.iconPrimaryColor}
                    />
                  ) : null}
                  <Text
                        style={[
                          styles.preferenceChipText,
                          {
                            color: isSelected
                              ? roles.iconPrimaryColor
                              : roles.bodyText,
                          },
                          isSelected ? styles.preferenceChipTextSelected : null,
                        ]}
                      >
                        {label}
                      </Text>
                  {isAiRecommended ? (
                    <View
                      style={[
                        styles.aiChipBadge,
                        {
                          backgroundColor: roles.pageBackground,
                          borderColor: roles.defaultCardBorder,
                        },
                      ]}
                    >
                      <AppIcon name="sparkle" size="sm" color={roles.iconPrimaryColor} />
                      <Text style={[styles.aiChipBadgeText, { color: roles.iconPrimaryColor }]}>AI</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {field.value ? (
            isSizeSelector ? (
              <View style={[styles.capSizeSelectionConfirmation, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons name="check-circle" size={16} color={roles.iconPrimaryColor} />
                <Text style={[styles.capSizeSelectionConfirmationText, { color: roles.iconPrimaryColor }]}>
                  {toFriendlyPreferenceLabel(field.value, name)} cap size selected
                </Text>
              </View>
            ) : (
              <Text style={[styles.preferenceSelectedText, { color: roles.metaText }]}>
                Selected: {toFriendlyPreferenceLabel(field.value, name)}
              </Text>
            )
          ) : null}
        </View>
      )}
    />
  );
}

const resolveHairColorSwatch = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("black")) return "#1F1712";
  if (normalized.includes("brown"))
    return normalized.includes("light") ? "#B98255" : "#4B3621";
  if (normalized.includes("blonde") || normalized.includes("gold"))
    return "#C99A4A";
  if (
    normalized.includes("gray") ||
    normalized.includes("grey") ||
    normalized.includes("silver")
  )
    return "#A8A8A8";
  if (normalized.includes("red") || normalized.includes("auburn"))
    return "#8F3D2D";
  return theme.colors.borderStrong;
};

function ColorPaletteGroup({ control, roles, options, recommendedOptions }) {
  const colors = Array.isArray(options)
    ? options
        .filter(Boolean)
        .map((value) => ({ value, color: resolveHairColorSwatch(value) }))
    : [];
  const recommendedOptionKeys = new Set(
    (recommendedOptions || [])
      .map((option) => normalizePreferenceMatchValue(option, "preferredColor"))
      .filter(Boolean),
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
              <Text
                style={[
                  styles.preferenceSectionTitle,
                  { color: roles.headingText },
                ]}
              >
                Hair Color
              </Text>
              <Text
                style={[
                  styles.preferenceSectionHint,
                  { color: roles.bodyText },
                ]}
              >
                Pick the closest available color.
              </Text>
            </View>
            <View
              style={[
                styles.colorPaletteCard,
                {
                  backgroundColor: roles.pageBackground,
                  borderColor: roles.defaultCardBorder,
                },
              ]}
            >
              <View style={styles.colorSwatchGrid}>
                {colors.map((item) => {
                  const isSelected = field.value === item.value;
                  const isAiRecommended = recommendedOptionKeys.has(
                    normalizePreferenceMatchValue(item.value, "preferredColor"),
                  );
                  const label = toFriendlyPreferenceLabel(
                    item.value,
                    "preferredColor",
                  );
                  return (
                    <Pressable
                      key={item.value}
                      accessibilityRole="button"
                      accessibilityLabel={`Hair color: ${label}`}
                      onPress={() => field.onChange(item.value)}
                      style={({ pressed }) => [
                        styles.colorSwatchButton,
                        {
                          borderColor:
                            isSelected || isAiRecommended
                              ? roles.primaryActionBackground
                              : "transparent",
                        },
                        isAiRecommended && !isSelected
                          ? styles.preferenceChipRecommended
                          : null,
                        pressed ? styles.preferencePressed : null,
                      ]}
                    >
                      <View
                        style={[
                          styles.colorSwatch,
                          { backgroundColor: item.color },
                        ]}
                      >
                        {isSelected ? (
                          <AppIcon
                            name="checkmark"
                            size="sm"
                            color={theme.colors.textInverse}
                          />
                        ) : null}
                      </View>
                      {isAiRecommended ? (
                        <View
                          style={[
                            styles.colorAiBadge,
                            {
                              backgroundColor: roles.defaultCardBackground,
                              borderColor: roles.defaultCardBorder,
                            },
                          ]}
                        >
                          <AppIcon
                            name="sparkle"
                            size="sm"
                            color={roles.iconPrimaryColor}
                          />
                        </View>
                      ) : null}
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.colorSwatchLabel,
                          { color: roles.bodyText },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text
                style={[styles.colorSelectedText, { color: roles.bodyText }]}
              >
                Selected:{" "}
                {selected
                  ? toFriendlyPreferenceLabel(selected.value, "preferredColor")
                  : "None"}
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
  variant = "secondary",
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconCircleButton,
        isPrimary
          ? styles.iconCircleButtonPrimary
          : styles.iconCircleButtonSecondary,
        pressed ? styles.iconCircleButtonPressed : null,
        disabled || loading ? styles.iconCircleButtonDisabled : null,
        style,
      ]}
    >
      <AppIcon
        name={icon}
        state={isPrimary ? "inverse" : "active"}
        size={isPrimary ? "xl" : "lg"}
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
  const commitFromLocation = React.useCallback(
    (locationX) => {
      if (!trackWidth) return;
      const raw =
        min + (clamp(locationX, 0, trackWidth) / trackWidth) * (max - min);
      const stepped = Math.round(raw / step) * step;
      onChange(Math.round(clamp(stepped, min, max) * 100) / 100);
    },
    [max, min, onChange, step, trackWidth],
  );
  const sliderPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          commitFromLocation(Number(event.nativeEvent.locationX || 0));
        },
        onPanResponderMove: (event) => {
          commitFromLocation(Number(event.nativeEvent.locationX || 0));
        },
      }),
    [commitFromLocation],
  );

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
          <View
            style={[
              styles.calibrationSliderFill,
              { width: `${normalizedPercent}%` },
            ]}
          />
          <View
            style={[
              styles.calibrationSliderThumb,
              { left: `${normalizedPercent}%` },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function WigInfoList({ rows, roles }) {
  const visibleRows = rows.filter((row) => {
    const normalizedValue = String(row?.value ?? "").trim().toLowerCase();
    return normalizedValue && normalizedValue !== "not provided" && normalizedValue !== "pending";
  });

  if (!visibleRows.length) {
    return (
      <View style={styles.requestedWigPendingNote}>
        <AppIcon name="requests" size="sm" color={roles.primaryActionBackground} />
        <Text style={[styles.requestedWigPendingText, { color: roles.bodyText }]}>
          Wig preferences will appear after your request is reviewed.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.inlineWigDetailsList}>
      {visibleRows.map((row, index) => (
        <View key={row.label}>
          <View style={styles.inlineWigDetailRow}>
            <Text style={[styles.inlineWigDetailLabel, { color: roles.metaText }]}>{row.label}</Text>
            <Text numberOfLines={2} style={[styles.inlineWigDetailValue, { color: roles.headingText }]}>{row.value}</Text>
          </View>
          {index < visibleRows.length - 1 ? (
            <View style={[styles.inlineWigDetailDivider, { backgroundColor: roles.defaultCardBorder }]} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function InlineWigDetails({ rows, code, imageUrl, selectedStyle, roles }) {
  return (
    <View style={styles.inlineWigDetailsSection}>
      <View style={styles.inlineWigDetailsHeader}>
        <LinearGradient
          colors={[theme.colors.palette.wine600, theme.colors.palette.wine900]}
          style={styles.inlineWigDetailsIcon}
        >
          <MaterialCommunityIcons name="creation-outline" size={22} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.inlineWigDetailsHeaderCopy}>
          <Text style={[styles.inlineWigDetailsTitle, { color: roles.headingText }]}>Wig details</Text>
          <Text style={[styles.inlineWigDetailsHint, { color: roles.metaText }]}>Your selected wig preferences</Text>
        </View>
        {code && code !== "Pending" ? (
          <View style={[styles.inlineWigCodePill, { backgroundColor: roles.iconPrimarySurface }]}>
            <Text numberOfLines={1} style={[styles.inlineWigCodeText, { color: roles.iconPrimaryColor }]}>{code}</Text>
          </View>
        ) : null}
      </View>

      {imageUrl ? (
        <View style={styles.inlineWigSelection}>
          <Image source={{ uri: imageUrl }} style={styles.inlineWigSelectionImage} resizeMode="contain" />
          <View style={styles.inlineWigSelectionCopy}>
            <Text style={[styles.inlineWigSelectionLabel, { color: roles.metaText }]}>SELECTED STYLE</Text>
            <Text numberOfLines={2} style={[styles.inlineWigSelectionName, { color: roles.headingText }]}>{selectedStyle || "Selected wig"}</Text>
            <Text style={[styles.inlineWigSelectionHint, { color: roles.bodyText }]}>Preview saved with your request</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.inlineWigDetailsDivider, { backgroundColor: roles.defaultCardBorder }]} />
      <WigInfoList rows={rows} roles={roles} />
    </View>
  );
}

const wigJourneyIcons = {
  approval: "clipboard-check-outline",
  preparing: "creation-outline",
  dropoff: "truck-delivery-outline",
  received: "account-check-outline",
  "request-submitted": "file-document-check-outline",
  "under-review": "clipboard-search-outline",
  production: "creation-outline",
  allocated: "check-decagram-outline",
  "expected-release": "calendar-clock-outline",
  "ready-pickup": "package-variant-closed-check",
  "preparing-release": "package-variant",
  releasing: "truck-delivery-outline",
  released: "package-check",
  "confirm-receipt": "gesture-tap-button",
  "problem-reported": "message-alert-outline",
  "appeal-review": "clipboard-clock-outline",
  "appeal-approved": "check-decagram-outline",
  "appeal-rejected": "close-circle-outline",
};

const getPatientAppealStatusLabel = (status = "") => {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "pending staff review") return "Appeal Under Review";
  if (normalized === "approved for replacement") return "Appeal Approved";
  if (normalized === "rejected") return "Appeal Rejected";
  return "Appeal submitted";
};

const formatHistoryDateTime = (value, fallback = "Not available") => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const getHistoryRequestStatus = (request) => {
  const status = String(request?.status || "").trim().toLowerCase();
  const receipt = request?.latest_release_receipt;
  if (status === "released" && receipt?.received_confirmed_at) return "Received";
  if (status === "released") return "Released - Confirmation Required";
  if (status === "returned - completed") return "Return Completed";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (status === "rejected") return "Rejected";
  return formatRequestStatus(request?.status || "Request completed");
};

const HISTORY_RELEASE_CYCLE_CARD_WIDTH = 278;
const HISTORY_RELEASE_CYCLE_GAP = 12;

export function WigJourneyTimeline({ tracker, roles }) {
  const enterAnimation = useRef(new Animated.Value(0)).current;
  const pulseAnimation = useRef(new Animated.Value(0)).current;
  const steps = tracker?.steps?.length ? tracker.steps : [{
    key: "approval",
    title: "Request submitted",
    state: "current",
  }];
  const currentIndex = steps.findIndex((step) => (
    step?.state === "current" || step?.state === "attention"
  ));
  const nextIndex = steps.findIndex((step) => step?.state !== "completed");
  const effectiveCurrentIndex = currentIndex >= 0
    ? currentIndex
    : nextIndex >= 0
      ? nextIndex
      : Math.max(0, steps.length - 1);
  const currentStep = steps[effectiveCurrentIndex] || steps[0] || null;
  const gradientColors = [
    theme.colors.palette.wine900,
    theme.colors.palette.wine700,
    theme.colors.palette.wine600,
  ];
  const referenceValue = String(tracker?.summary?.referenceValue || "").trim();
  const shouldShowReference = Boolean(
    referenceValue
    && !["not assigned", "pending", "not available", "n/a"].includes(referenceValue.toLowerCase())
  );

  useEffect(() => {
    Animated.timing(enterAnimation, {
      toValue: 1,
      duration: theme.motion.cardEnter,
      useNativeDriver: true,
    }).start();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnimation, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(pulseAnimation, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => pulse.stop();
  }, [enterAnimation, pulseAnimation]);

  return (
    <Animated.View style={[
      styles.wigJourneyAnimatedHost,
      Platform.OS === "web" ? {
        backgroundColor: roles.pageBackground,
      } : null,
      {
        opacity: enterAnimation,
        transform: [{
          translateY: enterAnimation.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
        }],
      },
    ]}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.wigJourneyCard, { borderColor: roles.heroBorder }]}
      >
        <View pointerEvents="none" style={styles.wigJourneyShade} />
        <View pointerEvents="none" style={styles.wigJourneyGlow} />
        <View style={styles.wigJourneyTopRow}>
          <View style={styles.wigJourneyHeaderIdentity}>
            <View style={styles.wigJourneyTopIcon}>
              <MaterialCommunityIcons name="creation-outline" size={21} color="#FFFFFF" />
            </View>
            <View style={styles.wigJourneyHeaderCopy}>
              <Text style={styles.wigJourneyHeaderEyebrow}>WIG REQUEST</Text>
              <Text style={styles.wigJourneyHeaderTitle}>Journey progress</Text>
            </View>
          </View>
        </View>

        <View style={styles.wigJourneyHeadingCopy}>
          <Text style={styles.wigJourneyEyebrow}>CURRENT STAGE</Text>
          <Text numberOfLines={2} style={styles.wigJourneyTitle}>
            {currentStep?.title || "Request in progress"}
          </Text>
          {shouldShowReference ? (
            <Text numberOfLines={1} style={styles.wigJourneyReference}>
              {tracker?.summary?.referenceLabel || "Patient code"}: {referenceValue}
            </Text>
          ) : null}
        </View>

        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.wigJourneyTimelineContent}
        >
          {steps.map((step, index) => {
            const isCompleted = step.state === "completed";
            const isCurrent = index === effectiveCurrentIndex;
            const isExpectedRelease = step.key === "expected-release";
            const isReached = isCompleted || isCurrent || isExpectedRelease;
            const iconName = isCompleted ? "check" : (wigJourneyIcons[step.key] || "circle-small");
            const marker = (
              <View style={[
                styles.wigJourneyStageMarker,
                {
                  backgroundColor: isReached ? roles.defaultCardBackground : "rgba(255,255,255,0.16)",
                  borderColor: isReached ? roles.defaultCardBackground : "rgba(255,255,255,0.34)",
                },
              ]}>
                <MaterialCommunityIcons
                  name={iconName}
                  size={16}
                  color={isReached ? roles.primaryActionBackground : roles.primaryActionText}
                />
              </View>
            );
            return (
              <View key={step.key || `${step.title}-${index}`} style={styles.wigJourneyStage}>
                {index > 0 ? (
                  <View style={[
                    styles.wigJourneyConnector,
                    { backgroundColor: index <= effectiveCurrentIndex ? roles.primaryActionText : "rgba(255,255,255,0.24)" },
                  ]} />
                ) : null}
                {isCurrent ? (
                  <Animated.View style={{
                    transform: [{ scale: pulseAnimation.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
                  }}>
                    {marker}
                  </Animated.View>
                ) : marker}
                <Text numberOfLines={2} style={[styles.wigJourneyStageLabel, { color: roles.primaryActionText }]}>
                  {step.title}
                </Text>
                {isExpectedRelease && step.description ? (
                  <Text numberOfLines={3} style={styles.wigJourneyStageEstimate}>{step.description}</Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      </LinearGradient>
    </Animated.View>
  );
}

function WigReceiptConfirmationModal({ visible, request, receipt, wig, isSaving, onClose, onConfirm, roles }) {
  const [photo, setPhoto] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [releaseTermsDocument, setReleaseTermsDocument] = useState(null);
  const [isLoadingReleaseTerms, setIsLoadingReleaseTerms] = useState(false);
  const [releaseTermsError, setReleaseTermsError] = useState("");

  useEffect(() => {
    if (!visible) return;
    setPhoto(null);
    setAccepted(false);
  }, [visible, receipt?.receipt_id]);

  const loadReleaseTerms = React.useCallback(async () => {
    setIsLoadingReleaseTerms(true);
    setReleaseTermsError("");
    setReleaseTermsDocument(null);

    const preferredResult = await fetchActiveLegalDocument("wig_release_terms");
    const result = preferredResult.data
      ? preferredResult
      : await fetchActiveLegalDocument("wig_request_terms");
    const selectedDocument = result.data || null;

    setIsLoadingReleaseTerms(false);
    if (result.error || !selectedDocument) {
      setReleaseTermsError(
        result.error?.message || "No active wig release terms document is available right now.",
      );
      return;
    }

    setReleaseTermsDocument(selectedDocument);
  }, []);

  useEffect(() => {
    if (!visible) return;
    void loadReleaseTerms();
  }, [loadReleaseTerms, receipt?.receipt_id, visible]);

  const choosePhoto = async (camera = false) => {
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", `Allow ${camera ? "camera" : "photo library"} access to add the received wig photo.`);
      return;
    }
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.86 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.86, selectionLimit: 1 });
    if (!result.canceled && result.assets?.[0]) setPhoto(result.assets[0]);
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={isSaving ? undefined : onClose}>
      <View style={styles.releaseModalRoot}>
        <Pressable style={styles.cancelRequestModalBackdrop} disabled={isSaving} onPress={onClose} />
        <View style={[styles.releaseModalCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.releaseModalContent}>
            <Text style={[styles.releaseModalTitle, { color: roles.headingText }]}>Confirm Wig Receipt</Text>
            <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Please confirm that you physically received your wig. You may also upload a photo for your records.</Text>
            <View style={[styles.releaseSummary, { borderColor: roles.defaultCardBorder }]}>
              <Text style={[styles.releaseSummaryText, { color: roles.headingText }]}>Request {request?.request_code || ""}</Text>
              <Text style={[styles.releaseSummaryText, { color: roles.bodyText }]}>{wig?.wig_name || "Allocated wig"}{wig?.wig_code ? ` • ${wig.wig_code}` : ""}</Text>
              <Text style={[styles.releaseSummaryText, { color: roles.metaText }]}>Released {receipt?.released_at ? new Date(receipt.released_at).toLocaleDateString("en-PH") : "date unavailable"} • Cycle {receipt?.release_cycle || 1}</Text>
            </View>
            <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>1. RECEIVED WIG PHOTO (OPTIONAL)</Text>
            {photo?.uri ? <Image source={{ uri: photo.uri }} style={styles.receiptPhotoPreview} /> : null}
            <View style={styles.releasePhotoActions}>
              <View style={styles.releasePhotoActionCell}><AppButton title={photo ? "Retake Photo" : "Take Photo"} variant="outline" onPress={() => choosePhoto(true)} fullWidth={true} /></View>
              <View style={styles.releasePhotoActionCell}><AppButton title={photo ? "Replace Photo" : "Choose Gallery"} variant="outline" onPress={() => choosePhoto(false)} fullWidth={true} /></View>
            </View>
            <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>2. RELEASE TERMS</Text>
            {isLoadingReleaseTerms ? (
              <View style={[styles.releaseTermsLoadingCard, { backgroundColor: roles.supportCardBackground }]}>
                <ActivityIndicator color={roles.primaryActionBackground} />
                <Text style={[styles.releaseTermsLoadingText, { color: roles.bodyText }]}>Loading release terms...</Text>
              </View>
            ) : releaseTermsDocument ? (
              <LegalDocumentPreview
                document={releaseTermsDocument}
                roles={roles}
                viewportHeight={142}
                actionLabel="Enlarge"
                showContentPreview
              />
            ) : (
              <View style={[styles.releaseTermsErrorCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
                <MaterialCommunityIcons name="file-alert-outline" size={22} color={roles.primaryActionBackground} />
                <View style={styles.releaseTermsErrorCopy}>
                  <Text style={[styles.releaseTermsErrorTitle, { color: roles.headingText }]}>Release terms unavailable</Text>
                  <Text style={[styles.releaseTermsErrorText, { color: roles.bodyText }]}>{releaseTermsError}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading release terms"
                  onPress={() => void loadReleaseTerms()}
                  style={[styles.releaseTermsRetry, { backgroundColor: roles.iconPrimarySurface }]}
                >
                  <MaterialCommunityIcons name="refresh" size={19} color={roles.primaryActionBackground} />
                </Pressable>
              </View>
            )}
            <Pressable
              disabled={!releaseTermsDocument || isLoadingReleaseTerms || isSaving}
              onPress={() => setAccepted((value) => !value)}
              style={[
                styles.releaseCheckboxRow,
                !releaseTermsDocument || isLoadingReleaseTerms ? styles.releaseCheckboxRowDisabled : null,
              ]}
            >
              <MaterialCommunityIcons name={accepted ? "checkbox-marked" : "checkbox-blank-outline"} size={24} color={roles.primaryActionBackground} />
              <Text style={[styles.releaseCheckboxText, { color: roles.bodyText }]}>I confirm that I received this wig and accept the active release terms{releaseTermsDocument?.version ? ` (Version ${releaseTermsDocument.version})` : ""}.</Text>
            </Pressable>
            <View style={styles.cancelRequestModalActions}>
              <AppButton title="Not Yet" variant="outline" onPress={onClose} disabled={isSaving} fullWidth={true} />
              <AppButton title="Confirm Receipt" onPress={() => onConfirm?.({ confirmationPhoto: photo })} loading={isSaving} disabled={isSaving || !accepted || !releaseTermsDocument} fullWidth={true} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function FinishedWigRequestDetailsModal({ visible, details, isLoading, onClose, onDownload, onReportProblem, roles }) {
  const [releaseCycleIndex, setReleaseCycleIndex] = useState(0);
  const request = details?.request || null;
  const wig = details?.wig || null;
  const actualWigImageUrl = wig?.catalog_image_url || "";
  const specification = wig?.physical_specification || details?.specification || null;
  const receipts = details?.receipts || [];
  const appeals = details?.appeals || [];
  const latestReceipt = receipts[0] || null;
  const latestAppeal = latestReceipt
    ? appeals.find((appeal) => String(appeal.receipt_id) === String(latestReceipt.receipt_id)) || null
    : null;
  const canReportProblem = Boolean(
    latestReceipt?.received_confirmed_at
    && !latestAppeal
    && new Date(latestReceipt.appeal_deadline).getTime() >= Date.now()
  );
  const wigRows = [
    { label: "Wig name", value: wig?.wig_name || "Not available" },
    { label: "Wig code", value: wig?.wig_code || "Not available" },
    { label: "Cap size", value: specification?.cap_size || request?.requested_cap_size || "Not provided" },
    { label: "Hair color", value: specification?.color || specification?.preferred_color || "Not provided" },
    { label: "Hair length", value: specification?.length != null ? `${specification.length} inches` : specification?.preferred_length || "Not provided" },
    { label: "Hair texture", value: specification?.hair_texture || "Not provided" },
    { label: "Style", value: specification?.style || specification?.style_preference || "Not provided" },
  ];

  useEffect(() => {
    if (visible) setReleaseCycleIndex(0);
  }, [visible, request?.req_id]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.releaseModalRoot}>
        <Pressable style={styles.cancelRequestModalBackdrop} onPress={onClose} />
        <View
          style={[styles.releaseModalCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.releaseModalContent}>
            <View style={styles.historyDetailsHeader}>
              <View style={styles.historyDetailsHeaderCopy}>
                <Text style={[styles.releaseModalTitle, { color: roles.headingText }]}>Request Details</Text>
                <Text style={[styles.historyRequestCode, { color: roles.primaryActionBackground }]}>{request?.request_code || "Wig request"}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close request details" onPress={onClose} style={[styles.historyCloseButton, { backgroundColor: roles.iconPrimarySurface }]}>
                <MaterialCommunityIcons name="close" size={20} color={roles.primaryActionBackground} />
              </Pressable>
            </View>
            {isLoading ? (
              <ActivityIndicator color={roles.primaryActionBackground} style={styles.historyDetailsLoading} />
            ) : request ? (
              <>
                <View style={[styles.historyStatusPanel, { borderColor: roles.defaultCardBorder }]}>
                  <Text style={[styles.historyStatusTitle, { color: roles.headingText }]}>{getHistoryRequestStatus({ ...request, latest_release_receipt: latestReceipt })}</Text>
                  <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Requested {formatHistoryDateTime(request.request_date)}</Text>
                  {request.status_reason ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>{request.status_reason}</Text> : null}
                </View>
                <View style={[styles.historyWigHero, {
                  backgroundColor: roles.supportCardBackground,
                  borderColor: roles.defaultCardBorder,
                }]}
                >
                  <View style={[styles.historyWigImageFrame, { backgroundColor: roles.defaultCardBackground }]}>
                    {actualWigImageUrl ? (
                      <Image source={{ uri: actualWigImageUrl }} style={styles.historyWigImage} resizeMode="contain" />
                    ) : (
                      <MaterialCommunityIcons name="account" size={42} color={roles.metaText} />
                    )}
                  </View>
                  <View style={styles.historyWigHeroCopy}>
                    <Text style={[styles.historyWigEyebrow, { color: roles.metaText }]}>ACTUAL SELECTED WIG</Text>
                    <Text numberOfLines={2} style={[styles.historyWigName, { color: roles.headingText }]}>{wig?.wig_name || "Selected wig"}</Text>
                    {wig?.wig_code ? <Text style={[styles.historyWigCode, { color: roles.primaryActionBackground }]}>{wig.wig_code}</Text> : null}
                    <Text numberOfLines={2} style={[styles.historyWigSummary, { color: roles.bodyText }]}>
                      {[specification?.style || specification?.style_preference, specification?.color || specification?.preferred_color, specification?.cap_size || request.requested_cap_size]
                        .filter(Boolean)
                        .join(" • ") || "Wig details are shown below."}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>REQUEST INFORMATION</Text>
                <WigInfoList rows={[
                  { label: "Status", value: getHistoryRequestStatus({ ...request, latest_release_receipt: latestReceipt }) },
                  { label: "Approved", value: formatHistoryDateTime(request.approved_at) },
                  { label: "Fulfillment", value: formatRequestStatus(request.fulfillment_status || "Not available") },
                ]} roles={roles} />
                <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>WIG INFORMATION</Text>
                <WigInfoList rows={wigRows} roles={roles} />
                {receipts.length ? (
                  <>
                    <View style={styles.historyReleaseHeader}>
                      <View style={styles.historyDetailsHeaderCopy}>
                        <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>RELEASE HISTORY</Text>
                        <Text style={[styles.releaseModalSubtitle, { color: roles.metaText }]}>Swipe sideways to view each release cycle.</Text>
                      </View>
                      <View style={[styles.historyCycleCounter, { backgroundColor: roles.iconPrimarySurface }]}>
                        <Text style={[styles.historyCycleCounterText, { color: roles.primaryActionBackground }]}>{releaseCycleIndex + 1}/{receipts.length}</Text>
                      </View>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      decelerationRate="fast"
                      snapToInterval={HISTORY_RELEASE_CYCLE_CARD_WIDTH + HISTORY_RELEASE_CYCLE_GAP}
                      snapToAlignment="start"
                      contentContainerStyle={styles.historyReleaseCarousel}
                      onMomentumScrollEnd={(event) => {
                        const offset = event.nativeEvent.contentOffset.x;
                        const index = Math.round(offset / (HISTORY_RELEASE_CYCLE_CARD_WIDTH + HISTORY_RELEASE_CYCLE_GAP));
                        setReleaseCycleIndex(Math.max(0, Math.min(index, receipts.length - 1)));
                      }}
                    >
                {receipts.map((receipt) => {
                  const appeal = appeals.find((item) => String(item.receipt_id) === String(receipt.receipt_id));
                  return (
                    <View key={receipt.receipt_id} style={[styles.historyReceiptCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.defaultCardBorder }]}>
                      <View style={styles.historyReceiptTopRow}>
                        <View style={[styles.historyReceiptIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                          <MaterialCommunityIcons name="package-variant-closed-check" size={21} color={roles.primaryActionBackground} />
                        </View>
                        <View style={styles.historyReceiptHeadingCopy}>
                          <Text style={[styles.historyReceiptTitle, { color: roles.headingText }]}>Release Cycle {receipt.release_cycle || 1}</Text>
                          <Text style={[styles.releaseModalSubtitle, { color: roles.metaText }]}>{receipt.received_confirmed_at ? "Receipt confirmed" : "Confirmation pending"}</Text>
                        </View>
                      </View>
                      <WigInfoList rows={[
                        { label: "Released", value: formatHistoryDateTime(receipt.released_at) },
                        { label: "Received", value: formatHistoryDateTime(receipt.received_confirmed_at, "Not confirmed") },
                        { label: "Terms accepted", value: formatHistoryDateTime(receipt.terms_accepted_at, "Not confirmed") },
                        { label: "Appeal deadline", value: formatHistoryDateTime(receipt.appeal_deadline) },
                      ]} roles={roles} />
                      {receipt.pdf_path ? <AppButton title="Download Receipt PDF" variant="outline" onPress={() => onDownload?.(receipt)} fullWidth={true} /> : null}
                      {appeal ? (
                        <View style={[styles.historyAppealPanel, { backgroundColor: roles.iconPrimarySurface }]}>
                          <Text style={[styles.historyReceiptTitle, { color: roles.headingText }]}>{getPatientAppealStatusLabel(appeal.status)}</Text>
                          <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>{appeal.reason} · {appeal.requested_resolution}</Text>
                          <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>{appeal.description}</Text>
                          <Text style={[styles.releaseModalSubtitle, { color: roles.metaText }]}>Submitted: {formatHistoryDateTime(appeal.submitted_at)}</Text>
                          {appeal.decision_note ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Decision: {appeal.decision_note}</Text> : null}
                          {appeal.return_status ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Return status: {appeal.return_status}</Text> : null}
                          {appeal.return_courier || appeal.return_tracking_number ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Tracking: {[appeal.return_courier, appeal.return_tracking_number].filter(Boolean).join(" · ")}</Text> : null}
                          {appeal.return_shipped_at ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Return shipped: {formatHistoryDateTime(appeal.return_shipped_at)}</Text> : null}
                          {appeal.return_received_at ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Return received: {formatHistoryDateTime(appeal.return_received_at)}</Text> : null}
                          {appeal.repair_started_at ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Repair started: {formatHistoryDateTime(appeal.repair_started_at)}</Text> : null}
                          {appeal.repair_completed_at ? <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Repair completed: {formatHistoryDateTime(appeal.repair_completed_at)}</Text> : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                    </ScrollView>
                    {receipts.length > 1 ? (
                      <View style={styles.historyCycleDots}>
                        {receipts.map((receipt, index) => (
                          <View
                            key={`release-dot-${receipt.receipt_id}`}
                            style={[styles.historyCycleDot, {
                              backgroundColor: index === releaseCycleIndex ? roles.primaryActionBackground : roles.defaultCardBorder,
                              width: index === releaseCycleIndex ? 20 : 7,
                            }]}
                          />
                        ))}
                      </View>
                    ) : null}
                  </>
                ) : null}
                {canReportProblem ? <AppButton title="Report a Wig Problem" onPress={() => onReportProblem?.({ request, receipt: latestReceipt })} fullWidth={true} /> : null}
              </>
            ) : (
              <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Request details are unavailable.</Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function WigReleaseAppealModal({ visible, isSaving, onClose, onSubmit, roles }) {
  const [reason, setReason] = useState("");
  const [requestedResolution, setRequestedResolution] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState([]);
  const reasons = ["Damaged on Receipt", "Wrong Wig", "Poor Fit", "Other"];

  useEffect(() => {
    if (!visible) return;
    setReason("");
    setRequestedResolution("");
    setDescription("");
    setPhotos([]);
  }, [visible]);

  const addPhotos = async (camera = false) => {
    if (photos.length >= 4) return;
    const permission = camera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.84 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.84, allowsMultipleSelection: true, selectionLimit: 4 - photos.length });
    if (!result.canceled) setPhotos((current) => [...current, ...(result.assets || [])].slice(0, 4));
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={isSaving ? undefined : onClose}>
      <View style={styles.cancelRequestModalRoot}>
        <Pressable style={styles.cancelRequestModalBackdrop} disabled={isSaving} onPress={onClose} />
        <View style={[styles.releaseModalCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.releaseModalContent}>
          <Text style={[styles.releaseModalTitle, { color: roles.headingText }]}>Report a wig problem</Text>
          <Text style={[styles.releaseModalSubtitle, { color: roles.bodyText }]}>Tell us the problem, choose what you need, and attach at least one photo.</Text>
          <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>1. CHOOSE A REASON</Text>
          <View style={styles.photoTipsRow}>
            {reasons.map((item) => (
              <Pressable
                key={item}
                onPress={() => setReason(item)}
                style={[styles.photoTipPill, {
                  backgroundColor: reason === item ? roles.primaryActionBackground : roles.supportCardBackground,
                  borderColor: roles.defaultCardBorder,
                }]}
              >
                <Text style={[styles.photoTipText, { color: reason === item ? roles.primaryActionText : roles.bodyText }]}>{item}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>2. WHAT WOULD YOU LIKE US TO DO?</Text>
          {["Repair or Replace", "Return and Close"].map((resolution) => (
            <Pressable key={resolution} onPress={() => setRequestedResolution(resolution)} style={[styles.appealResolution, { borderColor: requestedResolution === resolution ? roles.primaryActionBackground : roles.defaultCardBorder }]}>
              <Text style={[styles.appealResolutionTitle, { color: roles.headingText }]}>{resolution}</Text>
              <Text style={[styles.appealResolutionText, { color: roles.metaText }]}>{resolution === "Repair or Replace" ? "Return the wig so Staff can repair or replace it." : "Return the wig and permanently close this request."}</Text>
            </Pressable>
          ))}
          <AppInput
            label="Describe the problem"
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us what happened and provide any important details."
            multiline
            numberOfLines={4}
          />
          <Text style={[styles.releaseSectionLabel, { color: roles.headingText }]}>3. ATTACH WIG PHOTOS (REQUIRED)</Text>
          <Text style={[styles.releaseModalSubtitle, { color: roles.metaText }]}>Attach 1 to 4 clear photos. {photos.length} selected.</Text>
          <View style={styles.appealPhotoGrid}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.appealPhotoItem}>
                <Image source={{ uri: photo.uri }} style={styles.appealPhotoImage} />
                <Pressable onPress={() => setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.appealPhotoRemove}>
                  <MaterialCommunityIcons name="close" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
          <View style={styles.releasePhotoActions}>
            <View style={styles.releasePhotoActionCell}><AppButton title="Camera" variant="outline" onPress={() => addPhotos(true)} disabled={photos.length >= 4} fullWidth={true} /></View>
            <View style={styles.releasePhotoActionCell}><AppButton title="Gallery" variant="outline" onPress={() => addPhotos(false)} disabled={photos.length >= 4} fullWidth={true} /></View>
          </View>
          <View style={styles.cancelRequestModalActions}>
            <AppButton title="Cancel" variant="outline" onPress={onClose} disabled={isSaving} fullWidth={true} />
            <AppButton
              title="Submit Appeal"
              onPress={() => onSubmit?.({ reason, requestedResolution, description: description.trim(), photos })}
              loading={isSaving}
              disabled={isSaving || !reason || !requestedResolution || !description.trim() || !photos.length}
              fullWidth={true}
            />
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function CancelWigRequestModal({
  visible,
  requestCode,
  daysRemaining,
  isCancelling,
  onClose,
  onConfirm,
  roles,
}) {
  const remainingLabel = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={isCancelling ? undefined : onClose}>
      <View style={styles.cancelRequestModalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Keep wig request"
          disabled={isCancelling}
          onPress={onClose}
          style={styles.cancelRequestModalBackdrop}
        />
        <View
          accessibilityRole="alert"
          style={[
            styles.cancelRequestModalCard,
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
          ]}
        >
          <View style={styles.cancelRequestModalIcon}>
            <MaterialCommunityIcons name="clipboard-remove-outline" size={28} color={theme.colors.actionDanger} />
          </View>

          <View style={styles.cancelRequestModalCopy}>
            <Text style={[styles.cancelRequestModalTitle, { color: roles.headingText }]}>Cancel this wig request?</Text>
            <Text style={[styles.cancelRequestModalText, { color: roles.bodyText }]}>Your active request will be closed. You can submit a new request later if you still need one.</Text>
          </View>

          <View style={[styles.cancelRequestPolicyCard, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
            <MaterialCommunityIcons name="calendar-clock-outline" size={21} color={roles.primaryActionBackground} />
            <View style={styles.cancelRequestPolicyCopy}>
              <Text style={[styles.cancelRequestPolicyTitle, { color: roles.headingText }]}>Cancellation window</Text>
              <Text style={[styles.cancelRequestPolicyText, { color: roles.bodyText }]}>You have {remainingLabel} remaining. Cancellation is available only within seven days and before wig preparation begins.</Text>
            </View>
          </View>

          {requestCode && requestCode !== "Pending" ? (
            <Text style={[styles.cancelRequestCode, { color: roles.metaText }]}>Request {requestCode}</Text>
          ) : null}

          <View style={styles.cancelRequestModalActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Keep wig request"
              disabled={isCancelling}
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelRequestKeepButton,
                pressed && !isCancelling ? styles.cancelRequestActionPressed : null,
              ]}
            >
              <LinearGradient
                colors={[theme.colors.actionPrimary, theme.colors.actionPrimaryPressed]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cancelRequestActionGradient}
              >
                <MaterialCommunityIcons name="arrow-left-circle-outline" size={19} color="#FFFFFF" />
                <Text style={styles.cancelRequestKeepText}>Keep request</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm cancellation"
              disabled={isCancelling}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.cancelRequestConfirmButton,
                pressed && !isCancelling ? styles.cancelRequestActionPressed : null,
              ]}
            >
              <LinearGradient
                colors={[theme.colors.actionDanger, theme.colors.actionDangerPressed]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cancelRequestActionGradient}
              >
                {isCancelling ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <MaterialCommunityIcons name="close-circle-outline" size={19} color="#FFFFFF" />
                )}
                <Text style={styles.cancelRequestConfirmText}>{isCancelling ? "Cancelling..." : "Cancel request"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function RequestFlowHeader({ title, onBack, canGoBack = true, roles }) {
  return (
    <View style={styles.requestFlowHeader}>
      {canGoBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to the previous wig request step"
          accessibilityHint="Keeps your wig request open"
          onPress={onBack}
          style={({ pressed }) => [
            styles.requestFlowBackButton,
            pressed ? styles.preferencePressed : null,
          ]}
        >
          <AppIcon name="arrowLeft" size="md" color={roles.primaryActionText} />
        </Pressable>
      ) : (
        <View style={styles.requestFlowHeaderSpacer} />
      )}
      <Text
        numberOfLines={1}
        style={[
          styles.requestFlowHeaderTitle,
          { color: roles.primaryActionText },
        ]}
      >
        {title}
      </Text>
      <View style={styles.requestFlowHeaderSpacer} />
    </View>
  );
}

function SafetyChoiceRow({ label, value, onChange, roles }) {
  return (
    <View style={[styles.safetyChoiceRow, { borderBottomColor: roles.defaultCardBorder }]}>
      <Text style={[styles.safetyChoiceLabel, { color: roles.headingText }]}>{label}</Text>
      <View style={styles.safetyChoiceActions}>
        {[true, false].map((choice) => {
          const selected = value === choice;
          return (
            <Pressable
              key={String(choice)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(choice)}
              style={[
                styles.safetyChoiceButton,
                {
                  backgroundColor: selected ? roles.primaryActionBackground : roles.pageBackground,
                  borderColor: selected ? roles.primaryActionBackground : roles.defaultCardBorder,
                },
              ]}
            >
              <Text style={[
                styles.safetyChoiceButtonText,
                { color: selected ? roles.primaryActionText : roles.headingText },
              ]}>
                {choice ? "Yes" : "No"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SafetyAssessmentAnswersModal({ visible, assessment, onClose, roles, resolvedTheme }) {
  if (!assessment) return null;

  const answerRows = [
    ["Known allergies", assessment.has_known_allergies],
    ["Sensitive scalp", assessment.has_sensitive_scalp],
    ["Scalp irritation", assessment.has_scalp_irritation],
    ["Open scalp wounds", assessment.has_open_scalp_wounds],
    ["Medical restriction", assessment.has_medical_restriction],
    ["Information confirmed", assessment.information_confirmed],
  ];
  const formatAnswer = (value) => (
    typeof value === "boolean" ? (value ? "Yes" : "No") : "Not answered"
  );
  const gradientColors = [
    resolvedTheme?.primaryColor || roles.primaryActionBackground || theme.colors.palette.wine700,
    resolvedTheme?.secondaryColor || resolvedTheme?.tertiaryColor || theme.colors.palette.wine900,
  ];

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.safetyAnswersModalRoot}>
        <Pressable style={styles.safetyAnswersBackdrop} onPress={onClose} />
        <View style={[
          styles.safetyAnswersSheet,
          {
            backgroundColor: roles.pageBackground,
            borderColor: roles.defaultCardBorder,
          },
        ]}>
          <View style={styles.safetyAnswersHandle} />
          <LinearGradient colors={gradientColors} style={styles.safetyAnswersHeader}>
            <View style={styles.safetyAnswersHeaderIcon}>
              <MaterialCommunityIcons name="shield-check-outline" size={23} color={roles.primaryActionText} />
            </View>
            <View style={styles.safetyAnswersHeaderCopy}>
              <Text style={[styles.safetyAnswersTitle, { color: roles.primaryActionText }]}>Safety information</Text>
              <Text style={[styles.safetyAnswersStatus, { color: roles.primaryActionText }]}>
                {assessment.review_status || "Pending review"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close safety assessment"
              onPress={onClose}
              hitSlop={10}
              style={styles.safetyAnswersClose}
            >
              <MaterialCommunityIcons name="close" size={22} color={roles.primaryActionText} />
            </Pressable>
          </LinearGradient>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.safetyAnswersList}>
            {answerRows.map(([label, value]) => (
              <View
                key={label}
                style={[
                  styles.safetyAnswerRow,
                  { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder },
                ]}
              >
                <View style={[styles.safetyAnswerIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                  <MaterialCommunityIcons
                    name={value === true ? "check" : value === false ? "minus" : "help"}
                    size={16}
                    color={roles.iconPrimaryColor}
                  />
                </View>
                <Text style={[styles.safetyAnswerLabel, { color: roles.headingText }]}>{label}</Text>
                <View style={[styles.safetyAnswerPill, { backgroundColor: roles.iconPrimarySurface }]}>
                  <Text style={[styles.safetyAnswerValue, { color: roles.iconPrimaryColor }]}>{formatAnswer(value)}</Text>
                </View>
              </View>
            ))}
            {assessment.has_known_allergies ? (
              <View style={[styles.safetyAnswerDetails, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
                <Text style={[styles.safetyAnswerLabel, { color: roles.headingText }]}>Allergy details</Text>
                <Text style={[styles.safetyAnswerDetailsText, { color: roles.bodyText }]}>
                  {assessment.allergy_details || "No details provided"}
                </Text>
              </View>
            ) : null}
            {assessment.has_medical_restriction ? (
              <View style={[styles.safetyAnswerDetails, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
                <Text style={[styles.safetyAnswerLabel, { color: roles.headingText }]}>Medical restriction details</Text>
                <Text style={[styles.safetyAnswerDetailsText, { color: roles.bodyText }]}>
                  {assessment.medical_restriction_details || "No details provided"}
                </Text>
              </View>
            ) : null}
            {assessment.review_notes ? (
              <View style={[styles.safetyAnswerDetails, { backgroundColor: roles.supportCardBackground, borderColor: roles.supportCardBorder }]}>
                <Text style={[styles.safetyAnswerLabel, { color: roles.headingText }]}>Review notes</Text>
                <Text style={[styles.safetyAnswerDetailsText, { color: roles.bodyText }]}>
                  {assessment.review_notes}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// eslint-disable-next-line no-unused-vars
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
  roles,
}) {
  const insets = useSafeAreaInsets();
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
    setFaceFrame((previousFaceFrame) =>
      smoothFaceFrame(previousFaceFrame, nextFaceFrame),
    );
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
    if (
      visible &&
      hasCameraPermission &&
      (!canUseFaceTrackingTryOnCamera || cameraRuntimeError)
    ) {
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
  const calibrationPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) =>
          Boolean(
            selectedWig &&
            primaryTryOnImageUrl &&
            (event.nativeEvent.touches || []).length >= 2,
          ),
        onStartShouldSetPanResponderCapture: (event) =>
          Boolean(
            selectedWig &&
            primaryTryOnImageUrl &&
            (event.nativeEvent.touches || []).length >= 2,
          ),
        onMoveShouldSetPanResponder: (event, gestureState) =>
          Boolean(
            selectedWig &&
            primaryTryOnImageUrl &&
            ((event.nativeEvent.touches || []).length >= 2 ||
              Math.abs(gestureState.dx) > 2 ||
              Math.abs(gestureState.dy) > 2),
          ),
        onMoveShouldSetPanResponderCapture: (event, gestureState) =>
          Boolean(
            selectedWig &&
            primaryTryOnImageUrl &&
            ((event.nativeEvent.touches || []).length >= 2 ||
              Math.abs(gestureState.dx) > 2 ||
              Math.abs(gestureState.dy) > 2),
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
            const nextScale = Math.min(
              1.6,
              Math.max(0.75, start.scale * (currentDistance / start.distance)),
            );
            setWigCalibration((current) => ({
              ...current,
              scale: Math.round(nextScale * 100) / 100,
            }));
            return;
          }

          setWigCalibration((current) => ({
            ...current,
            offsetX: Math.round(
              Math.min(140, Math.max(-140, start.offsetX + gestureState.dx)),
            ),
            offsetY: Math.round(
              Math.min(140, Math.max(-140, start.offsetY + gestureState.dy)),
            ),
          }));
        },
      }),
    [primaryTryOnImageUrl, selectedWig, wigCalibration],
  );

  if (!visible) return null;

  const shouldShowReferencePhoto = Boolean(referenceImage?.uri);
  const shouldRenderFullWigLayer = Boolean(selectedWig?.layer_full_wig_url);
  const shouldRenderFrontWigLayer = false;
  const shouldUseSingleTryOnImage = Boolean(
    selectedWig &&
    primaryTryOnImageUrl &&
    !selectedWig.layer_full_wig_url &&
    !selectedWig.layer_front_bangs_url &&
    !selectedWig.layer_back_hair_url,
  );
  const selectedWigNeedsLayer = Boolean(selectedWig && !primaryTryOnImageUrl);
  const isLiveCameraTryOn = Boolean(
    !shouldShowReferencePhoto &&
    hasCameraPermission &&
    canUseFaceTrackingTryOnCamera &&
    !cameraRuntimeError,
  );
  const activeFaceFrame = faceFrame || buildGuideFaceFrame(stageLayout);
  const shouldRenderBackWigLayer = false;
  const canCaptureLivePhoto = true;
  const canUseSelectedPhoto = Boolean(referenceImage?.uri);
  const shouldShowWigLayer = Boolean(selectedWig && primaryTryOnImageUrl);
  const cameraRuntimeMessage = getCameraRuntimeMessage(cameraRuntimeError);
  const getLayerStyle = (layerKey, zIndex) => {
    const faceAnchoredStyle = buildFaceAnchoredTryOnLayerStyle(
      activeFaceFrame,
      stageLayout,
      layerKey,
      zIndex,
      selectedWig?.fit_settings,
      wigCalibration,
    );
    if (faceAnchoredStyle) return faceAnchoredStyle;
    if (isLiveCameraTryOn) return styles.tryOnLayerHidden;
    return buildTryOnLayerStyle(selectedWig?.fit_settings, layerKey, zIndex);
  };

  return (
    <Modal
      transparent={false}
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.captureFullScreen,
          { backgroundColor: roles.pageBackground },
        ]}
      >
        <View
          style={[
            styles.captureHeaderBar,
            {
              backgroundColor: roles.primaryActionBackground,
              paddingTop: insets.top,
            },
          ]}
        >
          <View style={styles.captureHeaderRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={onClose}
              style={({ pressed }) => [
                styles.captureHeaderButton,
                { backgroundColor: "rgba(255, 255, 255, 0.10)" },
                pressed ? styles.preferencePressed : null,
              ]}
            >
              <AppIcon
                name="arrowLeft"
                size="md"
                color={roles.primaryActionText}
              />
            </Pressable>

            <Text
              numberOfLines={1}
              style={[
                styles.captureHeaderTitle,
                { color: roles.primaryActionText },
              ]}
            >
              Front Photo
            </Text>

            <View style={styles.captureHeaderActions}>
              {selectedWig ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Adjust wig calibration"
                  onPress={() => setIsCalibrationOpen(true)}
                  style={({ pressed }) => [
                    styles.captureHeaderButton,
                    { backgroundColor: "rgba(255, 255, 255, 0.10)" },
                    pressed ? styles.preferencePressed : null,
                  ]}
                >
                  <AppIcon
                    name="settings"
                    state="muted"
                    color={roles.primaryActionText}
                  />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close front photo"
                onPress={onClose}
                style={({ pressed }) => [
                  styles.captureHeaderButton,
                  { backgroundColor: "rgba(255, 255, 255, 0.10)" },
                  pressed ? styles.preferencePressed : null,
                ]}
              >
                <AppIcon
                  name="close"
                  state="muted"
                  color={roles.primaryActionText}
                />
              </Pressable>
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.captureScroll}
          contentContainerStyle={[
            styles.captureScrollContent,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.xl) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={styles.captureStage}
            onLayout={(event) =>
              setStageLayout({
                width: event.nativeEvent.layout.width,
                height: event.nativeEvent.layout.height,
              })
            }
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
                <Text style={styles.captureStagePlaceholderTitle}>
                  Camera access needed
                </Text>
                <Text style={styles.captureStagePlaceholderBody}>
                  Allow camera or upload a photo.
                </Text>
              </View>
            )}

            <View pointerEvents="none" style={styles.captureFrame}>
              <View style={styles.captureFaceGuide} />
              <View
                style={[styles.captureCorner, styles.captureCornerTopLeft]}
              />
              <View
                style={[styles.captureCorner, styles.captureCornerTopRight]}
              />
              <View
                style={[styles.captureCorner, styles.captureCornerBottomLeft]}
              />
              <View
                style={[styles.captureCorner, styles.captureCornerBottomRight]}
              />
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
                    style={getLayerStyle("backHair", 1)}
                  />
                ) : null}
                {shouldRenderFullWigLayer ? (
                  <WigLayerImage
                    sourceUri={selectedWig.layer_full_wig_url}
                    style={getLayerStyle("fullWig", 3)}
                  />
                ) : null}
                {shouldRenderFrontWigLayer ? (
                  <Image
                    source={{ uri: selectedWig.layer_front_bangs_url }}
                    resizeMode="contain"
                    fadeDuration={0}
                    style={getLayerStyle("frontBangs", 4)}
                  />
                ) : null}
                {shouldUseSingleTryOnImage ? (
                  <WigLayerImage
                    sourceUri={primaryTryOnImageUrl}
                    style={getLayerStyle("fullWig", 3)}
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
                <Text style={styles.availableWigsMeta}>
                  {availableWigs.length} active
                </Text>
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
                            <AppIcon
                              name="sparkle"
                              size="sm"
                              color={theme.colors.textInverse}
                            />
                            <Text style={styles.tryOnWigAiBadgeText}>AI</Text>
                          </View>
                        ) : null}
                        {wig.thumbnail_url ? (
                          <Image
                            source={{ uri: wig.thumbnail_url }}
                            resizeMode="cover"
                            style={styles.tryOnWigImage}
                          />
                        ) : (
                          <View style={styles.tryOnWigImagePlaceholder}>
                            <AppIcon
                              name="image"
                              size="lg"
                              color={theme.colors.brandPrimary}
                            />
                          </View>
                        )}
                      </View>
                      <Text numberOfLines={1} style={styles.tryOnWigName}>
                        {wig.wig_name}
                      </Text>
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
              onPress={
                hasCameraPermission
                  ? () =>
                      onCapture?.({
                        faceFrame: activeFaceFrame,
                        stageLayout,
                        wigCalibration,
                      })
                  : onRequestPermission
              }
              style={styles.captureButtonPrimary}
            />
            <View style={styles.captureControlsSpacer} />
          </View>

          <View style={styles.modalFooter}>
            <Text style={styles.modalFooterText}>
              {referenceImage?.uri
                ? "Photo ready."
                : selectedWig
                  ? "Wig is placed automatically."
                  : "Add a front photo."}
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
        </ScrollView>
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
              <Pressable
                onPress={() => setIsCalibrationOpen(false)}
                style={styles.headerIconButton}
              >
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
              onChange={(value) => setCalibrationValue("offsetX", value)}
            />
            <CalibrationSlider
              label="Vertical"
              value={wigCalibration.offsetY}
              min={-140}
              max={140}
              step={2}
              formatValue={(value) => `${Math.round(value)}px`}
              onChange={(value) => setCalibrationValue("offsetY", value)}
            />
            <CalibrationSlider
              label="Scale"
              value={wigCalibration.scale}
              min={0.75}
              max={1.6}
              step={0.01}
              formatValue={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) => setCalibrationValue("scale", value)}
            />
            <View style={styles.calibrationActions}>
              <AppButton
                title="Reset"
                variant="secondary"
                fullWidth={false}
                onPress={resetCalibration}
              />
              <AppButton
                title="Done"
                fullWidth={false}
                onPress={() => setIsCalibrationOpen(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

// eslint-disable-next-line no-unused-vars
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
        <View
          style={[
            styles.matcherLoadingDot,
            { backgroundColor: roles.primaryActionBackground },
          ]}
        />
        <Text
          style={[styles.matcherLoadingText, { color: roles.iconPrimaryColor }]}
        >
          Analyzing styles...
        </Text>
      </View>
      <View style={styles.matcherSkeletonGrid}>
        <View style={styles.matcherSkeletonMain}>
          <View
            style={[styles.matcherSkeletonBlock, styles.matcherSkeletonHero]}
          />
          <View style={styles.matcherSkeletonPills}>
            <View
              style={[
                styles.matcherSkeletonBlock,
                styles.matcherSkeletonPillWide,
              ]}
            />
            <View
              style={[styles.matcherSkeletonBlock, styles.matcherSkeletonPill]}
            />
          </View>
        </View>
        <View style={styles.matcherSkeletonSide}>
          {[0, 1, 2, 3].map((item) => (
            <View
              key={item}
              style={[styles.matcherSkeletonBlock, styles.matcherSkeletonLine]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function AiWigCompositePreview({
  baseImageUri,
  selectedWig,
  placement,
  previewCaptureRef,
  roles,
  compact = false,
}) {
  const [previewLayout, setPreviewLayout] = useState({ width: 0, height: 0 });
  const [manualFit, setManualFit] = useState({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
  const holdDelayRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const detectedFaceFrame =
    previewLayout.width && previewLayout.height
      ? mapStaticImageFaceFrameToStage(placement?.faceFrame, previewLayout)
      : null;
  const activeFaceFrame =
    detectedFaceFrame ||
    (previewLayout.width && previewLayout.height ? buildGuideFaceFrame(previewLayout) : null);
  const mainWigUrl = selectedWig?.layer_full_wig_url || getPrimaryTryOnImageUrl(selectedWig);
  const faceBox =
    activeFaceFrame && previewLayout.width && previewLayout.height
      ? resolveFaceBoxInStage(activeFaceFrame, previewLayout)
      : null;
  const forehead = getFacePoint(activeFaceFrame, "FOREHEAD");
  const chin = getFacePoint(activeFaceFrame, "CHIN");
  const leftEye = getFacePoint(activeFaceFrame, "LEFT_EYE");
  const rightEye = getFacePoint(activeFaceFrame, "RIGHT_EYE");
  const leftTemple = getFacePoint(activeFaceFrame, "LEFT_TEMPLE");
  const rightTemple = getFacePoint(activeFaceFrame, "RIGHT_TEMPLE");
  const leftEar = getFacePoint(activeFaceFrame, "LEFT_EAR");
  const rightEar = getFacePoint(activeFaceFrame, "RIGHT_EAR");
  const nose = getFacePoint(activeFaceFrame, "NOSE");
  const eyeCenter = averagePoints([leftEye, rightEye]);
  const templeCenter = averagePoints([leftTemple, rightTemple]);
  const earCenter = averagePoints([leftEar, rightEar]);
  const faceCenter = averagePoints([templeCenter, earCenter, eyeCenter, nose]);
  const templeDistance = distanceBetweenPoints(leftTemple, rightTemple);
  const earDistance = distanceBetweenPoints(leftEar, rightEar);
  const eyeDistance = distanceBetweenPoints(leftEye, rightEye);
  const landmarkFaceWidth = Math.max(
    earDistance ? earDistance * 0.94 : 0,
    templeDistance ? templeDistance * 1.08 : 0,
    eyeDistance ? eyeDistance * 2.32 : 0,
    faceBox?.width ? faceBox.width * 0.96 : 0,
  );
  const landmarkFaceTop =
    forehead?.y ??
    (eyeCenter && landmarkFaceWidth
      ? eyeCenter.y - landmarkFaceWidth * 0.34
      : faceBox?.y);
  const landmarkFaceBottom = chin?.y ?? (faceBox ? faceBox.y + faceBox.height : 0);
  const landmarkFaceHeight = Math.max(
    landmarkFaceBottom - landmarkFaceTop,
    faceBox?.height || 0,
  );
  const mainWigStyle = faceBox
    ? (() => {
        const centerX = faceCenter?.x || faceBox.x + faceBox.width / 2;
        const faceWidth = landmarkFaceWidth || faceBox.width;
        const faceTop = landmarkFaceTop ?? faceBox.y;
        const faceHeight = landmarkFaceHeight || faceBox.height;
        const fitSettings = selectedWig?.fit_settings || {};
        const layerFit = resolveLayerFit(fitSettings, "fullWig");
        const tryOnConfig = resolveTryOnConfig(fitSettings, "fullWig");
        const faceHole = tryOnConfig.faceHole || {
          x: 0.24,
          y: 0.26,
          width: 0.52,
          height: 0.66,
        };
        const layerScale = normalizeLayerScale(layerFit.scale);
        const targetFaceWidth = faceWidth * 0.9;
        const targetFaceHeight = faceHeight * 0.98;
        const baseWidth =
          (targetFaceWidth / Math.max(faceHole.width, 0.18)) *
          layerScale *
          manualFit.scale;
        const baseHeight =
          (targetFaceHeight / Math.max(faceHole.height, 0.24)) *
          layerScale *
          manualFit.scale;
        const faceHoleCenterX = faceHole.x + faceHole.width / 2;
        const hairlineLift = -faceHeight * 0.08;
        return {
          position: "absolute",
          left:
            centerX -
            baseWidth * faceHoleCenterX +
            faceWidth * 0.005 +
            manualFit.offsetX +
            normalizeLayerOffset(layerFit.offsetX, previewLayout),
          top:
            faceTop -
            baseHeight * faceHole.y -
            hairlineLift +
            manualFit.offsetY +
            normalizeLayerOffset(layerFit.offsetY, previewLayout),
          width: baseWidth,
          height: baseHeight,
          zIndex: 3,
          elevation: 3,
        };
      })()
    : buildTryOnLayerStyle(selectedWig?.fit_settings, "fullWig", 3);
  const nudge = (key, amount) => {
    setManualFit((current) => ({
      ...current,
      [key]: key === "scale"
        ? Math.min(1.35, Math.max(0.7, current.scale + amount))
        : current[key] + amount,
    }));
  };
  const resetFit = () => setManualFit({ offsetX: 0, offsetY: 0, scale: 1 });
  const stopHold = () => {
    if (holdDelayRef.current) {
      clearTimeout(holdDelayRef.current);
      holdDelayRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  };
  const startHold = (action) => {
    stopHold();
    holdDelayRef.current = setTimeout(() => {
      action();
      holdIntervalRef.current = setInterval(action, 70);
    }, 300);
  };

  useEffect(() => () => {
    if (holdDelayRef.current) clearTimeout(holdDelayRef.current);
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
  }, []);

  return (
    <View style={styles.aiCompositeShell}>
      <View
        ref={previewCaptureRef}
        collapsable={false}
        style={[
          styles.aiResultImage,
          styles.aiCompositeFrame,
          compact ? styles.aiCompositeFrameCompact : null,
          { backgroundColor: roles.supportCardBackground },
        ]}
        onLayout={(event) =>
          setPreviewLayout({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })
        }
      >
        {baseImageUri ? (
          <Image
            source={{ uri: baseImageUri }}
            resizeMode="cover"
            style={styles.aiCompositeBaseImage}
          />
        ) : null}
        {mainWigUrl ? (
          <WigLayerImage
            sourceUri={mainWigUrl}
            style={[mainWigStyle, styles.matcherWigOverlay]}
          />
        ) : null}
      </View>
      <Text style={[styles.wigFitSectionLabel, { color: roles.headingText }]}>Adjust fit</Text>
      <View style={styles.wigFitControls}>
        {[
          { key: "left", label: "Move left", icon: "arrow-left", action: () => nudge("offsetX", -8) },
          { key: "up", label: "Move up", icon: "arrow-up", action: () => nudge("offsetY", -8) },
          { key: "down", label: "Move down", icon: "arrow-down", action: () => nudge("offsetY", 8) },
          { key: "right", label: "Move right", icon: "arrow-right", action: () => nudge("offsetX", 8) },
          { key: "smaller", label: "Make smaller", icon: "minus", action: () => nudge("scale", -0.05) },
          { key: "larger", label: "Make larger", icon: "plus", action: () => nudge("scale", 0.05) },
          { key: "reset", label: "Reset fit", icon: "restore", action: resetFit },
        ].map((control) => (
          <Pressable
            key={control.key}
            accessibilityRole="button"
            accessibilityLabel={control.label}
            onPress={control.action}
            onPressIn={control.key === "reset" ? undefined : () => startHold(control.action)}
            onPressOut={control.key === "reset" ? undefined : stopHold}
            style={({ pressed }) => [
              styles.wigFitButton,
              {
                backgroundColor: roles.pageBackground,
                borderColor: roles.defaultCardBorder,
              },
              pressed ? styles.preferencePressed : null,
            ]}
          >
            <MaterialCommunityIcons name={control.icon} size={18} color={roles.primaryActionBackground} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function RequestFlowModal({
  visible,
  step,
  control,
  errors,
  patientName,
  patientDetails,
  medicalCondition,
  availableWigs,
  referenceImage,
  selectedWig,
  selectedWigs,
  selectedWigIds,
  recommendedPreferenceOptions,
  recommendationOptions,
  catalogRecommendations,
  selectedOptionId,
  onSelectOption,
  wigPreferenceOptions,
  isLoadingAvailableWigs,
  isLoadingWigPreferenceOptions,
  generatedImageUri,
  preview,
  hasGeneratedPreview,
  isGeneratingPreview,
  isRankingWigs,
  isSavingRequest,
  isCapturingPhoto,
  certificateVerification,
  isVerifyingCertificate,
  termsDocument,
  isLoadingTermsDocument,
  termsDocumentError,
  onRetryTermsDocument,
  photoValidation,
  hasCameraPermission,
  cameraRef,
  onBack,
  onContinueToDetails,
  onCapturePhoto,
  onUploadCertificate,
  onScanCertificate,
  onRequestCameraPermission,
  onContinueToWigs,
  onSubmitCapSize,
  onChangeCapSize,
  onReviewChoices,
  onBackToStyles,
  onStartGeneration,
  onTryAnotherWig,
  onUploadAnotherPhoto,
  onDownloadImage,
  previewCaptureRef,
  onSubmitRequest,
  onSelectWig,
  safetyAssessment,
  isSavingSafety,
  onChangeSafety,
  onSubmitSafety,
  roles,
}) {
  const insets = useSafeAreaInsets();
  const { width: requestViewportWidth } = useWindowDimensions();
  const [isRetakingPhoto, setIsRetakingPhoto] = useState(false);
  const [documentPreviewUri, setDocumentPreviewUri] = useState("");
  const [documentPreviewFailed, setDocumentPreviewFailed] = useState(false);
  const [isDocumentPreviewLoading, setIsDocumentPreviewLoading] = useState(false);
  const [isPatientApproveDocked, setIsPatientApproveDocked] = useState(true);
  const flowScrollRef = useRef(null);
  const previewCarouselRef = useRef(null);
  const previewCarouselScrollX = useRef(new Animated.Value(0)).current;
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const stepTranslateY = useRef(new Animated.Value(0)).current;
  const patientScrollMetricsRef = useRef({
    contentHeight: 0,
    viewportHeight: 0,
    offsetY: 0,
  });
  const hasPreferenceOptions = Boolean(
    wigPreferenceOptions?.lengths?.length ||
    wigPreferenceOptions?.colors?.length ||
    wigPreferenceOptions?.textures?.length ||
    wigPreferenceOptions?.densities?.length ||
    wigPreferenceOptions?.capSizes?.length ||
    wigPreferenceOptions?.styles?.length,
  );
  const hasAvailableWigs =
    Array.isArray(availableWigs) && availableWigs.length > 0;
  const previewCarouselCardWidth = Math.min(
    278,
    Math.max(232, requestViewportWidth - (theme.spacing.xxl * 2) - 44),
  );
  const previewCarouselGap = theme.spacing.md;
  const previewCarouselSnapInterval = previewCarouselCardWidth + previewCarouselGap;
  const catalogRecommendationByWigId = new Map(
    (catalogRecommendations || []).map((recommendation, index) => [
      String(recommendation?.selectedWig?.wig_id || recommendation?.selected_wig?.wig_id || recommendation?.id || ""),
      { ...recommendation, rank: index + 1 },
    ]),
  );
  const displayedWigs = [...(availableWigs || [])].sort((left, right) => {
    const leftRank = catalogRecommendationByWigId.get(String(left?.wig_id || left?.id || ""))?.rank || 99;
    const rightRank = catalogRecommendationByWigId.get(String(right?.wig_id || right?.id || ""))?.rank || 99;
    return leftRank - rightRank;
  });
  const activeRecommendation = (recommendationOptions || []).find(
    (option) => option.id === selectedOptionId,
  ) || recommendationOptions?.[0] || null;
  const activeSelectedWig = activeRecommendation?.selectedWig || selectedWig;
  const selectRecommendationAtIndex = (index) => {
    const boundedIndex = Math.max(
      0,
      Math.min(index, Math.max(0, (recommendationOptions || []).length - 1)),
    );
    const option = recommendationOptions?.[boundedIndex];
    if (!option) return;
    onSelectOption?.(option.id);
  };
  const patientPicture = patientDetails?.patient_picture || "";
  const medicalDocument = patientDetails?.medical_document || "";
  const patientHeroName = patientName || "Patient account";
  const patientHeroNameSize =
    patientHeroName.length > 24
      ? theme.typography.semantic.body
      : theme.typography.semantic.titleSm;

  const syncPatientApproveDocking = React.useCallback(() => {
    if (step !== "patient") return;
    const { contentHeight, viewportHeight, offsetY } = patientScrollMetricsRef.current;
    if (!contentHeight || !viewportHeight) return;
    const canScroll = contentHeight > viewportHeight + 24;
    const distanceFromEnd = Math.max(0, contentHeight - viewportHeight - offsetY);
    setIsPatientApproveDocked(canScroll && distanceFromEnd > 72);
  }, [step]);
  const medicalDocumentName = medicalDocument
    ? getFileNameFromUrl(medicalDocument)
    : "No document uploaded";
  const hasMedicalDocumentPreview = Boolean(medicalDocument);
  const isMedicalDocumentImage = isImageDocumentUrl(medicalDocument);
  const isMedicalDocumentPdf = isPdfDocumentUrl(medicalDocument);
  const persistedVerificationStatus = patientDetails?.medical_document_verification_status || "";
  const effectiveVerification = certificateVerification || {
    status: persistedVerificationStatus,
    doctorName: patientDetails?.doctor_name || "",
    licenseNumber: patientDetails?.doctor_license_number || "",
  };
  const certificatePassed = ["ocr_passed_prc_pending", "verified", "prc_verified"].includes(
    String(effectiveVerification?.status || "").toLowerCase(),
  );
  const medicalDocumentStatus = certificatePassed
    ? "OCR passed"
    : medicalDocument
      ? "Needs OCR"
      : "Required";
  const shouldShowCapturedPhoto = Boolean(referenceImage?.uri && !isRetakingPhoto);
  const captureButtonTitle = !hasCameraPermission
    ? "Allow Camera"
    : isCapturingPhoto
      ? "Capturing..."
      : shouldShowCapturedPhoto
        ? "Retake Photo"
        : "Take Photo";
  const handleCameraAction = () => {
    if (!hasCameraPermission) {
      onRequestCameraPermission?.();
      return;
    }

    if (shouldShowCapturedPhoto) {
      setIsRetakingPhoto(true);
      return;
    }

    onCapturePhoto?.();
  };

  useEffect(() => {
    if (referenceImage?.uri) {
      setIsRetakingPhoto(false);
    }
  }, [referenceImage?.uri]);

  useEffect(() => {
    flowScrollRef.current?.scrollTo({ y: 0, animated: false });
    stepOpacity.stopAnimation();
    stepTranslateY.stopAnimation();
    stepOpacity.setValue(0);
    stepTranslateY.setValue(12);
    Animated.parallel([
      Animated.timing(stepOpacity, {
        toValue: 1,
        duration: theme.motion.contentSwap,
        useNativeDriver: true,
      }),
      Animated.spring(stepTranslateY, {
        toValue: 0,
        ...theme.motion.spring,
        useNativeDriver: true,
      }),
    ]).start();
  }, [step, stepOpacity, stepTranslateY]);

  useEffect(() => {
    setDocumentPreviewFailed(false);
    setIsDocumentPreviewLoading(Boolean(medicalDocument && isMedicalDocumentImage));
  }, [isMedicalDocumentImage, medicalDocument]);

  const patientIdentityWidget = (
    <LinearGradient
      colors={[theme.colors.palette.wine900, theme.colors.palette.wine700, theme.colors.palette.wine600]}
      start={{ x: 0.05, y: 0 }}
      end={{ x: 0.95, y: 1 }}
      style={styles.confirmDetailsHero}
    >
      <View pointerEvents="none" style={styles.confirmDetailsGlow} />
      <View style={styles.patientRecordPill}>
        <MaterialCommunityIcons name="shield-account-outline" size={13} color="#FFFFFF" />
        <Text style={styles.confirmDetailsEyebrow}>PATIENT RECORD</Text>
      </View>
      <View style={styles.patientHeroRow}>
        <View
          style={[
            styles.patientAvatarCircle,
            {
              backgroundColor: "#FFFFFF",
              borderColor: "rgba(255,255,255,0.76)",
            },
          ]}
        >
          {patientPicture ? (
            <Image source={{ uri: patientPicture }} style={styles.patientAvatarImage} resizeMode="cover" />
          ) : (
            <AppIcon name="image" size="md" color={theme.colors.palette.wine700} />
          )}
        </View>
        <View style={styles.patientHeroCopy}>
          <Text
            style={[styles.patientHeroName, { color: "#FFFFFF", fontSize: patientHeroNameSize }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {patientHeroName}
          </Text>
          <Text style={[styles.patientHeroMeta, { color: "#F7DDE4" }]} numberOfLines={1}>
            {medicalCondition || patientDetails?.medical_condition || "Medical condition"}
          </Text>
        </View>
        <View style={styles.patientIdentityVerifiedBadge}>
          <MaterialCommunityIcons name="check-decagram" size={19} color={theme.colors.palette.wine800} />
        </View>
      </View>
    </LinearGradient>
  );

  if (!visible) return null;

  return (
    <Modal
      transparent={false}
      visible={visible}
      animationType="slide"
      onRequestClose={onBack}
    >
      <KeyboardAvoidingView
        style={[
          styles.flowKeyboardWrap,
          { backgroundColor: roles.pageBackground },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.bottom : 0}
      >
        <View
          style={[
            styles.flowFullScreen,
            {
              paddingTop: insets.top,
              backgroundColor: roles.pageBackground,
            },
          ]}
        >
          <LinearGradient
            colors={[theme.colors.palette.wine900, theme.colors.palette.wine700, theme.colors.palette.wine600]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.flowTopBar}
          >
            <View pointerEvents="none" style={styles.flowTopBarGlow} />
            <RequestFlowHeader
              title="Request Wig"
              onBack={onBack}
              canGoBack={step !== "generating" && !isRankingWigs}
              roles={roles}
            />
          </LinearGradient>

          {step === "patient" ? (
            <View style={[styles.patientIdentityStickyHost, { backgroundColor: roles.pageBackground }]}>
              {patientIdentityWidget}
            </View>
          ) : null}

          <Animated.ScrollView
            ref={flowScrollRef}
            style={[
              styles.flowScroll,
              {
                opacity: stepOpacity,
                transform: [{ translateY: stepTranslateY }],
              },
            ]}
            contentContainerStyle={[
              styles.flowScrollContent,
              {
                paddingBottom:
                  Math.max(insets.bottom, theme.spacing.xl) +
                  (["styles", "confirmChoices", "summary"].includes(step) ? 112 : 0),
              },
            ]}
            onLayout={(event) => {
              if (step !== "patient") return;
              patientScrollMetricsRef.current.viewportHeight = event.nativeEvent.layout.height;
              syncPatientApproveDocking();
            }}
            onContentSizeChange={(_width, height) => {
              if (step !== "patient") return;
              patientScrollMetricsRef.current.contentHeight = height;
              syncPatientApproveDocking();
            }}
            onScroll={(event) => {
              if (step !== "patient") return;
              patientScrollMetricsRef.current.offsetY = event.nativeEvent.contentOffset.y;
              syncPatientApproveDocking();
            }}
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            showsVerticalScrollIndicator={false}
          >
            {step === "patient" ? (
              <View style={styles.flowSection}>
                <LinearGradient
                  colors={[roles.defaultCardBackground, roles.supportCardBackground]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.documentPreviewCard,
                    {
                      borderColor: roles.defaultCardBorder,
                    },
                  ]}
                >
                  <View style={styles.documentPreviewHeader}>
                    <View style={styles.documentRowIcon}>
                      <MaterialCommunityIcons
                        name="file-document-outline"
                        size={18}
                        color={roles.primaryActionBackground}
                      />
                    </View>
                    <View style={styles.documentRowCopy}>
                      <Text style={[styles.documentRowLabel, { color: roles.bodyText }]}>
                        Medical certificate
                      </Text>
                      <Text style={[styles.documentModuleHint, { color: roles.metaText }]}>Review or replace your uploaded record.</Text>
                    </View>
                    <View style={[styles.documentStatusPill, { backgroundColor: roles.iconPrimarySurface }]}>
                      <MaterialCommunityIcons
                        name={certificatePassed ? "check-circle-outline" : "clock-outline"}
                        size={13}
                        color={certificatePassed ? roles.successText : roles.primaryActionBackground}
                      />
                      <Text
                        style={[
                          styles.documentRowStatus,
                          { color: certificatePassed ? roles.successText : roles.primaryActionBackground },
                        ]}
                        numberOfLines={1}
                      >
                        {medicalDocumentStatus}
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.documentFileRow, { backgroundColor: roles.iconPrimarySurface }]}>
                    <MaterialCommunityIcons name="file-pdf-box" size={18} color={roles.primaryActionBackground} />
                    <Text style={[styles.documentFileName, { color: roles.headingText }]} numberOfLines={2}>
                      {medicalDocumentName}
                    </Text>
                  </View>

                  {hasMedicalDocumentPreview && isMedicalDocumentPdf ? (
                    <LegalDocumentPreview
                      document={{
                        title: "Medical Certificate",
                        document_type: "medical_certificate",
                        content: medicalDocumentName,
                        pdf_url: medicalDocument,
                      }}
                      roles={roles}
                      showFooter={false}
                      viewportHeight={190}
                      actionLabel="Preview"
                      actionPlacement="bottomCenter"
                    />
                  ) : (
                    <View style={[styles.documentPreviewFrame, { backgroundColor: roles.pageBackground, borderColor: roles.defaultCardBorder }]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Open medical certificate preview"
                      disabled={!hasMedicalDocumentPreview}
                      onPress={() => setDocumentPreviewUri(medicalDocument)}
                      style={({ pressed }) => [
                        styles.documentPreviewPressable,
                        pressed ? styles.preferencePressed : null,
                      ]}
                    >
                      {hasMedicalDocumentPreview && isMedicalDocumentImage && !documentPreviewFailed ? (
                        <Image
                          source={{ uri: medicalDocument }}
                          style={styles.documentPreviewImage}
                          resizeMode="contain"
                          onLoadStart={() => setIsDocumentPreviewLoading(true)}
                          onLoadEnd={() => setIsDocumentPreviewLoading(false)}
                          onError={() => {
                            setDocumentPreviewFailed(true);
                            setIsDocumentPreviewLoading(false);
                          }}
                        />
                      ) : (
                        <View style={styles.documentPreviewPlaceholder}>
                          <MaterialCommunityIcons
                            name={hasMedicalDocumentPreview ? "file-document-outline" : "file-upload-outline"}
                            size={34}
                            color={roles.primaryActionBackground}
                          />
                          <Text style={[styles.documentPreviewPlaceholderText, { color: roles.bodyText }]}>
                            {hasMedicalDocumentPreview
                              ? documentPreviewFailed
                                ? "The thumbnail is unavailable. Tap Preview to open the certificate."
                                : "Tap Preview to open the uploaded certificate."
                              : "Upload or scan the medical certificate."}
                          </Text>
                        </View>
                      )}
                      {isDocumentPreviewLoading ? (
                        <View pointerEvents="none" style={[styles.documentPreviewLoading, { backgroundColor: roles.pageBackground }]}>
                          <ActivityIndicator color={roles.primaryActionBackground} />
                          <Text style={[styles.documentPreviewLoadingText, { color: roles.metaText }]}>Preparing certificate preview…</Text>
                        </View>
                      ) : null}
                      {hasMedicalDocumentPreview ? (
                        <View pointerEvents="none" style={styles.documentPreviewZoomAnchor}>
                          <View style={[styles.documentPreviewZoomBadge, { backgroundColor: roles.primaryActionBackground }]}>
                            <MaterialCommunityIcons name="fullscreen" size={15} color={roles.primaryActionText} />
                            <Text style={[styles.documentPreviewZoomText, { color: roles.primaryActionText }]}>Preview</Text>
                          </View>
                        </View>
                      ) : null}
                    </Pressable>
                    </View>
                  )}

                  <View style={styles.certificateActionRow}>
                    <View style={styles.certificateActionCell}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Upload medical certificate"
                        disabled={isVerifyingCertificate}
                        onPress={onUploadCertificate}
                        style={({ pressed }) => [
                          styles.certificateActionButton,
                          pressed ? styles.preferencePressed : null,
                          isVerifyingCertificate ? styles.certificateIconButtonDisabled : null,
                        ]}
                      >
                        <LinearGradient
                          colors={[roles.iconPrimarySurface, roles.defaultCardBackground]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.certificateActionGradient, { borderColor: roles.primaryActionBackground }]}
                        >
                          <MaterialCommunityIcons
                            name="file-upload-outline"
                            size={19}
                            color={roles.primaryActionBackground}
                          />
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                            style={[styles.certificateActionText, { color: roles.primaryActionBackground }]}
                          >
                            Replace document
                          </Text>
                        </LinearGradient>
                      </Pressable>
                    </View>
                    <View style={styles.certificateActionCell}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Scan medical certificate"
                        disabled={isVerifyingCertificate}
                        onPress={onScanCertificate}
                        style={({ pressed }) => [
                          styles.certificateActionButton,
                          pressed ? styles.preferencePressed : null,
                          isVerifyingCertificate ? styles.certificateIconButtonDisabled : null,
                        ]}
                      >
                        <LinearGradient
                          colors={[theme.colors.palette.wine600, theme.colors.palette.wine800, theme.colors.palette.wine900]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.certificateActionGradient, { borderColor: theme.colors.palette.wine700 }]}
                        >
                          {isVerifyingCertificate ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <MaterialCommunityIcons name="camera-outline" size={19} color={roles.primaryActionText} />
                              <Text
                                numberOfLines={1}
                                adjustsFontSizeToFit
                                minimumFontScale={0.72}
                                style={[styles.certificateActionText, { color: roles.primaryActionText }]}
                              >
                                Scan document
                              </Text>
                            </>
                          )}
                        </LinearGradient>
                      </Pressable>
                    </View>
                  </View>
                </LinearGradient>

                <View style={styles.termsAgreementCard}>
                  <LinearGradient
                    colors={[theme.colors.palette.wine900, theme.colors.palette.wine700, theme.colors.palette.wine600]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.termsAgreementHeader}
                  >
                    <View style={styles.termsAgreementHeaderGlow} />
                    <View style={styles.termsAgreementIcon}>
                      <MaterialCommunityIcons name="file-sign" size={20} color="#FFFFFF" />
                    </View>
                    <View style={styles.termsAgreementHeaderCopy}>
                      <Text style={styles.termsAgreementTitle} numberOfLines={2}>
                        {termsDocument?.title || "Terms and agreement"}
                      </Text>
                      <Text style={styles.termsAgreementHint}>Tap the preview to read the active legal document.</Text>
                    </View>
                    {termsDocument?.version ? (
                      <View style={styles.termsVersionPill}>
                        <Text style={styles.termsVersionText}>v{termsDocument.version}</Text>
                      </View>
                    ) : null}
                  </LinearGradient>

                  {isLoadingTermsDocument ? (
                    <View style={styles.termsLoadingRow}>
                      <ActivityIndicator size="small" color={roles.primaryActionBackground} />
                      <Text style={[styles.termsLoadingText, { color: roles.bodyText }]}>Loading the active agreement…</Text>
                    </View>
                  ) : termsDocumentError ? (
                    <View style={[styles.termsErrorRow, { backgroundColor: roles.supportCardBackground }]}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={19} color={roles.primaryActionBackground} />
                      <Text style={[styles.termsErrorText, { color: roles.bodyText }]}>{termsDocumentError}</Text>
                      <Pressable accessibilityRole="button" onPress={onRetryTermsDocument} style={styles.termsRetryButton}>
                        <Text style={[styles.termsRetryText, { color: roles.primaryActionBackground }]}>Retry</Text>
                      </Pressable>
                    </View>
                  ) : termsDocument ? (
                    <LegalDocumentPreview document={termsDocument} roles={roles} />
                  ) : null}

                  <Controller
                    control={control}
                    name="acceptedTerms"
                    render={({ field }) => (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{
                          checked: Boolean(field.value),
                          disabled: !termsDocument || isLoadingTermsDocument,
                        }}
                        disabled={!termsDocument || isLoadingTermsDocument}
                        onPress={() => field.onChange(!field.value)}
                        style={({ pressed }) => [
                          styles.agreementRowCompact,
                          styles.termsAgreementCheckRow,
                          {
                            backgroundColor: field.value ? roles.iconPrimarySurface : roles.pageBackground,
                            borderColor: field.value ? roles.primaryActionBackground : roles.defaultCardBorder,
                          },
                          pressed ? styles.preferencePressed : null,
                          !termsDocument || isLoadingTermsDocument
                            ? styles.termsAgreementCheckRowDisabled
                            : null,
                        ]}
                      >
                        <View style={styles.termsAgreementContentRow}>
                          <View style={[
                            styles.checkBox,
                            styles.termsAgreementCheckBox,
                            field.value ? styles.checkBoxActive : null,
                          ]}>
                            {field.value ? <AppIcon name="success" state="inverse" size="sm" /> : null}
                          </View>
                          <Text style={[styles.termsAgreementLabel, { color: roles.headingText }]}>I agree to the terms above.</Text>
                          <View style={[styles.termsRequiredPill, { backgroundColor: roles.defaultCardBackground }]}>
                            <Text style={[styles.termsRequiredText, { color: roles.primaryActionBackground }]}>Required</Text>
                          </View>
                        </View>
                      </Pressable>
                    )}
                  />
                  {errors.acceptedTerms?.message ? <Text style={styles.fieldError}>{errors.acceptedTerms.message}</Text> : null}
                </View>

                <View style={styles.patientInlineApproveSlot}>
                  {!isPatientApproveDocked ? (
                    <AppButton
                      title="Approve Details"
                      onPress={onContinueToDetails}
                      fullWidth={true}
                      leading={<AppIcon name="success" state="inverse" />}
                    />
                  ) : null}
                </View>

              </View>
            ) : null}

            {step === "photo" ? (
              <View style={[styles.flowSection, styles.photoFlowSection]}>
                <LinearGradient
                  colors={[
                    theme.colors.palette.wine900,
                    theme.colors.palette.wine700,
                    theme.colors.palette.wine600,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.photoGuideCard}
                >
                  <View pointerEvents="none" style={styles.photoGuideGlow} />
                  <View style={styles.photoGuideIcon}>
                    <MaterialCommunityIcons name="camera-outline" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.photoGuideCopy}>
                    <Text style={styles.photoGuideEyebrow}>PHOTO FOR YOUR WIG PREVIEW</Text>
                    <Text style={styles.photoGuideTitle}>Take a clear front photo</Text>
                    <Text style={styles.photoGuideBody}>
                      Center your full head in soft, even lighting.
                    </Text>
                  </View>
                </LinearGradient>

                <View
                  style={[
                    styles.aiPhotoStage,
                    {
                      backgroundColor: roles.supportCardBackground,
                      borderColor: roles.supportCardBorder,
                    },
                  ]}
                >
                  {shouldShowCapturedPhoto ? (
                    <Image
                      source={{ uri: referenceImage.uri }}
                      resizeMode="cover"
                      style={styles.aiPhotoPreview}
                    />
                  ) : hasCameraPermission ? (
                    <CameraView
                      ref={cameraRef}
                      style={styles.aiPhotoPreview}
                      facing="front"
                      mirror={true}
                    />
                  ) : (
                    <View style={styles.aiPhotoPlaceholder}>
                      <View
                        style={[
                          styles.aiPhotoPlaceholderIcon,
                          { backgroundColor: roles.iconPrimarySurface },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="face-recognition"
                          size={34}
                          color={roles.iconPrimaryColor}
                        />
                      </View>
                      <View style={styles.aiPhotoPlaceholderCopy}>
                        <Text style={[styles.aiPhotoPlaceholderTitle, { color: roles.headingText }]}>
                          Camera access needed
                        </Text>
                        <Text style={[styles.aiPhotoPlaceholderText, { color: roles.bodyText }]}>
                          Use the front camera to take your photo.
                        </Text>
                      </View>
                      <View style={styles.photoTipsRow}>
                        {["Front view", "Full head", "Good light"].map((tip) => (
                          <View
                            key={tip}
                            style={[
                              styles.photoTipPill,
                              {
                                backgroundColor: roles.defaultCardBackground,
                                borderColor: roles.defaultCardBorder,
                              },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name="check"
                              size={13}
                              color={roles.primaryActionBackground}
                            />
                            <Text style={[styles.photoTipText, { color: roles.bodyText }]}>{tip}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {hasCameraPermission && !shouldShowCapturedPhoto ? (
                    <View pointerEvents="none" style={styles.photoCameraGuideOverlay}>
                      <View style={styles.photoFaceGuide} />
                      <View style={styles.photoCameraGuidePill}>
                        <MaterialCommunityIcons name="account-check-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.photoCameraGuideText}>Center your face and full head</Text>
                      </View>
                    </View>
                  ) : null}

                  {shouldShowCapturedPhoto ? (
                    <View pointerEvents="none" style={styles.photoReadyPill}>
                      <MaterialCommunityIcons name="check-circle" size={16} color="#FFFFFF" />
                      <Text style={styles.photoReadyText}>Photo ready</Text>
                    </View>
                  ) : null}
                </View>

                {photoValidation?.message ? (
                  <StatusBanner
                    title={photoValidation.valid ? "Photo ready" : "Photo needs review"}
                    message={photoValidation.message}
                    variant={photoValidation.valid ? "success" : "error"}
                    presentation="inline"
                    visible={true}
                  />
                ) : null}

                {shouldShowCapturedPhoto ? (
                  <View style={styles.photoReviewActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Retake photo"
                      onPress={handleCameraAction}
                      style={({ pressed }) => [
                        styles.photoReviewActionCell,
                        pressed ? styles.photoReviewActionPressed : null,
                      ]}
                    >
                      <LinearGradient
                        colors={[theme.colors.palette.white, theme.colors.palette.blush100]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.photoReviewActionGradient, { borderColor: roles.defaultCardBorder }]}
                      >
                        <MaterialCommunityIcons name="camera-retake-outline" size={20} color={roles.iconPrimaryColor} />
                        <Text style={[styles.photoReviewSecondaryText, { color: roles.iconPrimaryColor }]}>Retake</Text>
                      </LinearGradient>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Continue to cap size"
                      accessibilityState={{ disabled: !photoValidation?.valid }}
                      disabled={!photoValidation?.valid}
                      onPress={onContinueToWigs}
                      style={({ pressed }) => [
                        styles.photoReviewActionCell,
                        pressed && photoValidation?.valid ? styles.photoReviewActionPressed : null,
                        !photoValidation?.valid ? styles.photoReviewActionDisabled : null,
                      ]}
                    >
                      <LinearGradient
                        colors={[theme.colors.palette.wine600, theme.colors.palette.wine900]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.photoReviewActionGradient}
                      >
                        <MaterialCommunityIcons name="check-circle-outline" size={20} color="#FFFFFF" />
                        <Text numberOfLines={1} style={styles.photoReviewPrimaryText}>Continue</Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                ) : (
                  <AppButton
                    title={captureButtonTitle}
                    loading={isCapturingPhoto}
                    onPress={handleCameraAction}
                    fullWidth={true}
                    leading={<AppIcon name="camera" state="inverse" />}
                    style={styles.photoCameraAction}
                  />
                )}

              </View>
            ) : null}

            {step === "cap" ? (
              <View style={styles.flowSection}>
                <LinearGradient
                  colors={[theme.colors.palette.wine900, theme.colors.palette.wine700, theme.colors.palette.wine600]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.photoGuideCard}
                >
                  <View pointerEvents="none" style={styles.photoGuideGlow} />
                  <View style={styles.photoGuideIcon}>
                    <MaterialCommunityIcons name="tape-measure" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.photoGuideCopy}>
                    <Text style={styles.photoGuideEyebrow}>COMFORTABLE FIT</Text>
                    <Text style={styles.photoGuideTitle}>Choose your cap size</Text>
                    <Text style={styles.photoGuideBody}>We will show catalog wigs made in this size.</Text>
                  </View>
                </LinearGradient>

                <LinearGradient
                  colors={[
                    theme.colors.palette.white,
                    theme.colors.palette.blush100,
                    theme.colors.palette.warm50,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.capSizeSelectionCard,
                    { borderColor: roles.defaultCardBorder },
                  ]}
                >
                  <View pointerEvents="none" style={styles.capSizeCardGlow} />
                  <PreferenceChipGroup
                    control={control}
                    name="capSize"
                    title="Select your fit"
                    helperText="Choose the size recommended by your care provider."
                    options={wigPreferenceOptions?.capSizes || []}
                    recommendedOptions={[]}
                    roles={roles}
                    variant="size"
                  />
                </LinearGradient>

                <AppButton
                  title={isRankingWigs ? "Finding Your Best Matches..." : "Find My Best Wig Matches"}
                  onPress={onSubmitCapSize}
                  loading={isSavingRequest || isRankingWigs}
                  disabled={isSavingRequest || isRankingWigs || !(wigPreferenceOptions?.capSizes || []).length}
                  fullWidth={true}
                  leading={<MaterialCommunityIcons name="view-grid-outline" size={20} color={roles.primaryActionText} />}
                  trailing={<MaterialCommunityIcons name="arrow-right" size={20} color={roles.primaryActionText} />}
                  style={styles.wigFlowPrimaryButton}
                />
              </View>
            ) : null}

            {step === "styles" ? (
              <View style={styles.flowSection}>
                <LinearGradient
                  colors={[theme.colors.palette.wine900, theme.colors.palette.wine700, theme.colors.palette.wine600]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.wigGalleryIntroCard}
                >
                  <View pointerEvents="none" style={styles.photoGuideGlow} />
                  <View style={styles.wigGalleryIntroIcon}>
                    <MaterialCommunityIcons name="view-grid-outline" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.wigGalleryIntroCopy}>
                    <Text style={styles.photoGuideEyebrow}>AI FACIAL-FIT PICKS</Text>
                    <Text style={styles.photoGuideTitle}>Choose three looks</Text>
                    <Text style={styles.photoGuideBody}>AI picks appear first with a friendly reason. You can still choose any three.</Text>
                  </View>
                  <View style={styles.wigGallerySelectionCount}>
                    <Text style={styles.wigGallerySelectionCountText}>{selectedWigIds?.length || 0}/3</Text>
                  </View>
                </LinearGradient>

                {isLoadingAvailableWigs ? (
                  <LinearGradient
                    colors={[theme.colors.palette.white, theme.colors.palette.blush100]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.wigGalleryStatusCard, { borderColor: roles.defaultCardBorder }]}
                  >
                    <ActivityIndicator size="small" color={roles.primaryActionBackground} />
                    <View style={styles.wigGalleryStatusCopy}>
                      <Text style={[styles.availableWigsEmptyText, { color: roles.headingText }]}>Loading matching wigs</Text>
                      <Text style={[styles.flowBody, { color: roles.bodyText }]}>Preparing the gallery for your selected cap size.</Text>
                    </View>
                  </LinearGradient>
                ) : hasAvailableWigs ? (
                  <View style={styles.wigGalleryGrid}>
                    {displayedWigs.map((wig) => {
                      const selectionIndex = (selectedWigIds || []).indexOf(wig.id);
                      const isSelected = selectionIndex >= 0;
                      const aiRecommendation = catalogRecommendationByWigId.get(String(wig?.wig_id || wig?.id || ""));
                      const wigSpec = wig?.physical_specification || {};
                      const colorAndLength = [
                        wigSpec?.color || "",
                        wigSpec?.length != null ? `${wigSpec.length} in` : "",
                      ].filter(Boolean).join(" • ");
                      const styleAndTexture = [wigSpec?.style, wigSpec?.hair_texture]
                        .filter(Boolean)
                        .join(" • ");
                      const previewUrl = getWigPreviewImageUrl(wig);

                      return (
                        <View key={wig.id || `${wig.wig_id}-${wig.wig_name}`} style={styles.wigGalleryCell}>
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityLabel={`${wig.wig_name}${colorAndLength ? `, ${colorAndLength}` : ""}`}
                            accessibilityHint="Adds or removes this wig from your three try-on choices"
                            accessibilityState={{ checked: isSelected }}
                            onPress={() => onSelectWig?.(wig.id)}
                            style={({ pressed }) => [
                              styles.wigGalleryCard,
                              {
                                backgroundColor: isSelected
                                  ? roles.supportCardBackground
                                  : roles.pageBackground,
                                borderColor: isSelected
                                  ? roles.primaryActionBackground
                                  : roles.defaultCardBorder,
                              },
                              isSelected ? styles.wigGalleryCardSelected : null,
                              pressed ? styles.wigGalleryCardPressed : null,
                            ]}
                          >
                            <View style={styles.wigGalleryImageWrap}>
                            {previewUrl ? (
                              <Image
                                source={{ uri: previewUrl }}
                                resizeMode="contain"
                                style={styles.wigGalleryImage}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.wigGalleryImage,
                                  styles.wigStyleThumbPlaceholder,
                                  {
                                    backgroundColor:
                                      roles.supportCardBackground,
                                  },
                                ]}
                              >
                                <AppIcon
                                  name="image"
                                  size="md"
                                  color={roles.primaryActionBackground}
                                />
                              </View>
                            )}
                            <LinearGradient
                              pointerEvents="none"
                              colors={["transparent", "rgba(54,4,16,0.60)", "rgba(54,4,16,0.94)"]}
                              locations={[0, 0.32, 1]}
                              style={styles.wigGalleryInfoOverlay}
                            >
                              <View style={styles.wigGalleryInfoCopy}>
                                <Text
                                  style={styles.wigGalleryOverlayTitle}
                                >
                                  {wig.wig_name}
                                </Text>
                                {colorAndLength ? (
                                  <View style={styles.wigGalleryMetaRow}>
                                    <MaterialCommunityIcons name="palette-outline" size={13} color="#FFFFFF" />
                                    <Text style={styles.wigGalleryOverlayMeta}>
                                      {colorAndLength}
                                    </Text>
                                  </View>
                                ) : null}
                                {styleAndTexture ? (
                                  <Text style={styles.wigGalleryOverlayDescription}>
                                    {styleAndTexture}
                                  </Text>
                                ) : null}
                                <View style={styles.wigGalleryOverlayAvailability}>
                                  <View style={[styles.wigGalleryAvailabilityDot, {
                                    backgroundColor: wig.is_available ? "#8EE6B7" : theme.colors.palette.blush100,
                                  }]} />
                                  <Text style={styles.wigGalleryOverlayAvailabilityText}>
                                    {wig.is_available ? "Available" : "Wish option"}
                                  </Text>
                                </View>
                              </View>
                            </LinearGradient>
                            <View style={[styles.wigGalleryChoiceBadge, isSelected ? styles.wigGalleryChoiceBadgeSelected : null]}>
                              <MaterialCommunityIcons
                                name={isSelected ? "check-circle" : "plus-circle-outline"}
                                size={15}
                                color={isSelected ? "#FFFFFF" : theme.colors.palette.wine800}
                              />
                              <Text style={[styles.wigGalleryChoiceBadgeText, isSelected ? styles.wigGalleryChoiceBadgeTextSelected : null]}>
                                {isSelected ? `Choice ${selectionIndex + 1}` : "Choose"}
                              </Text>
                            </View>
                            {aiRecommendation ? (
                              <View style={styles.wigGalleryAiBadge}>
                                <MaterialCommunityIcons name="creation" size={13} color={theme.colors.palette.wine800} />
                                <Text style={styles.wigGalleryAiBadgeText}>AI PICK #{aiRecommendation.rank}</Text>
                              </View>
                            ) : null}
                          </View>
                          {aiRecommendation?.suitabilityReason ? (
                            <View style={[styles.wigGalleryReason, { backgroundColor: roles.iconPrimarySurface }]}>
                              <MaterialCommunityIcons name="creation-outline" size={14} color={roles.iconPrimaryColor} />
                              <Text style={[styles.wigGalleryReasonText, { color: roles.bodyText }]}>
                                {aiRecommendation.suitabilityReason}
                              </Text>
                            </View>
                          ) : null}
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <LinearGradient
                    colors={[theme.colors.palette.white, theme.colors.palette.blush100]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[
                      styles.wigGalleryEmptyCard,
                      { borderColor: roles.defaultCardBorder },
                    ]}
                  >
                    <View style={[styles.wigGalleryEmptyIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                      <MaterialCommunityIcons name="hanger" size={25} color={roles.iconPrimaryColor} />
                    </View>
                    <View style={styles.wigGalleryEmptyCopy}>
                      <Text style={[styles.availableWigsEmptyText, { color: roles.headingText }]}>No matching previews yet</Text>
                      <Text style={[styles.flowBody, { color: roles.bodyText }]}>Try another cap size to see available gallery styles.</Text>
                    </View>
                    <AppButton
                      title="Choose Another Cap Size"
                      variant="outline"
                      onPress={onChangeCapSize}
                      fullWidth={true}
                    />
                  </LinearGradient>
                )}

                {!isLoadingAvailableWigs && hasAvailableWigs && availableWigs.length < 3 ? (
                  <View style={[
                    styles.availableWigsEmpty,
                    { borderColor: roles.defaultCardBorder, backgroundColor: roles.defaultCardBackground },
                  ]}>
                    <Text style={[styles.availableWigsEmptyText, { color: roles.headingText }]}>Three wigs are required</Text>
                    <Text style={[styles.flowBody, { color: roles.bodyText }]}>This cap size has fewer than three preview-ready styles.</Text>
                    <AppButton title="Choose Another Cap Size" variant="outline" onPress={onChangeCapSize} fullWidth={true} />
                  </View>
                ) : null}

              </View>
            ) : null}

            {step === "generating" ? (
              <View style={styles.aiGeneratingState}>
                <ActivityIndicator
                  size="large"
                  color={roles.primaryActionBackground}
                />
                <Text style={[styles.flowTitle, { textAlign: "center" }]}>
                  AI is ranking facial-fit styles and generating three try-on images...
                </Text>
              </View>
            ) : null}

            {step === "customSpec" ? (
              <View style={styles.flowSection}>
                <View style={styles.requestFlowSectionHeader}>
                  <Text style={[styles.flowTitle, { color: roles.headingText }]}>Custom Wig Specification</Text>
                  <Text style={[styles.flowBody, { color: roles.bodyText }]}>
                    Provide the wig details if none of the stock styles fit.
                  </Text>
                </View>

                {isLoadingWigPreferenceOptions ? (
                  <Text
                    style={[
                      styles.preferenceHelperText,
                      { color: roles.metaText },
                    ]}
                  >
                    Loading specification options.
                  </Text>
                ) : null}

                {!isLoadingWigPreferenceOptions && !hasPreferenceOptions ? (
                  <Text
                    style={[
                      styles.preferenceHelperText,
                      { color: roles.metaText },
                    ]}
                  >
                    No specification options yet.
                  </Text>
                ) : null}

                <PreferenceChipGroup
                  control={control}
                  name="preferredLength"
                  title="Length"
                  options={wigPreferenceOptions?.lengths || []}
                  recommendedOptions={
                    recommendedPreferenceOptions?.preferredLength || []
                  }
                  roles={roles}
                />

                <ColorPaletteGroup
                  control={control}
                  roles={roles}
                  options={wigPreferenceOptions?.colors || []}
                  recommendedOptions={
                    recommendedPreferenceOptions?.preferredColor || []
                  }
                />

                <PreferenceChipGroup
                  control={control}
                  name="hairTexture"
                  title="Texture"
                  options={wigPreferenceOptions?.textures || []}
                  recommendedOptions={
                    recommendedPreferenceOptions?.hairTexture || []
                  }
                  roles={roles}
                />

                <PreferenceChipGroup
                  control={control}
                  name="hairDensity"
                  title="Density"
                  options={wigPreferenceOptions?.densities || []}
                  recommendedOptions={
                    recommendedPreferenceOptions?.hairDensity || []
                  }
                  roles={roles}
                />

                <PreferenceChipGroup
                  control={control}
                  name="capSize"
                  title="Cap Size"
                  options={wigPreferenceOptions?.capSizes || []}
                  recommendedOptions={
                    recommendedPreferenceOptions?.capSize || []
                  }
                  roles={roles}
                />

                <PreferenceChipGroup
                  control={control}
                  name="stylePreference"
                  title="Style"
                  options={wigPreferenceOptions?.styles || []}
                  recommendedOptions={
                    recommendedPreferenceOptions?.stylePreference || []
                  }
                  roles={roles}
                />

                <View style={styles.preferenceSection}>
                  <View style={styles.preferenceLabelRow}>
                    <Text
                      style={[
                        styles.preferenceSectionTitle,
                        { color: roles.headingText },
                      ]}
                    >
                      Additional notes
                    </Text>
                  </View>
                  <Controller
                    control={control}
                    name="specialNotes"
                    render={({ field }) => (
                      <AppInput
                        placeholder="Any sizing, color, or production notes"
                        variant="default"
                        multiline={true}
                        numberOfLines={4}
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        error={errors.specialNotes?.message}
                        shellStyle={[
                          styles.multilineInputShell,
                          {
                            backgroundColor: roles.defaultCardBackground,
                            borderColor: roles.defaultCardBorder,
                          },
                        ]}
                        inputStyle={styles.multilineInput}
                      />
                    )}
                  />
                </View>

                <View style={styles.singleActionRow}>
                  <AppButton
                    title="Submit Custom Request"
                    loading={isSavingRequest}
                    onPress={onSubmitRequest}
                    fullWidth={true}
                    leading={<AppIcon name="requests" state="inverse" />}
                  />
                </View>
              </View>
            ) : null}

            {step === "summary" ? (
              <View style={styles.matcherFlow}>
                <LinearGradient
                  colors={[
                    theme.colors.palette.wine900,
                    theme.colors.palette.wine700,
                    theme.colors.palette.wine600,
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.matcherHeroHeader}
                >
                  <View pointerEvents="none" style={styles.matcherHeroGlow} />
                  <View style={styles.matcherHeroTopRow}>
                    <View style={styles.matcherHeroIcon}>
                      <MaterialCommunityIcons name="creation-outline" size={23} color="#FFFFFF" />
                    </View>
                    <View style={styles.matcherCountPill}>
                      <Text style={styles.matcherCountText}>3 PERSONALIZED LOOKS</Text>
                    </View>
                  </View>
                  <Text style={styles.matcherHeroTitle}>Choose your favorite look</Text>
                  <Text style={styles.matcherHeroBody}>
                    Compare all three previews in one gallery.
                  </Text>
                </LinearGradient>

                {hasGeneratedPreview ? (
                  <View style={styles.aiResultGrid}>
                    <Animated.ScrollView
                      ref={previewCarouselRef}
                      horizontal
                      nestedScrollEnabled
                      removeClippedSubviews={false}
                      showsHorizontalScrollIndicator={false}
                      style={styles.summaryPreviewFanViewport}
                      contentContainerStyle={styles.summaryPreviewGallery}
                      snapToInterval={previewCarouselSnapInterval}
                      snapToAlignment="start"
                      decelerationRate="fast"
                      disableIntervalMomentum
                      scrollEventThrottle={16}
                      onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: previewCarouselScrollX } } }],
                        { useNativeDriver: true },
                      )}
                      onMomentumScrollEnd={(event) => {
                        const nextIndex = Math.max(
                          0,
                          Math.min(
                            recommendationOptions.length - 1,
                            Math.round(event.nativeEvent.contentOffset.x / previewCarouselSnapInterval),
                          ),
                        );
                        selectRecommendationAtIndex(nextIndex);
                      }}
                    >
                      {recommendationOptions.map((option, index) => {
                        const isSelected = Boolean(selectedOptionId) && option.id === selectedOptionId;
                        const imageUri = option.generatedImageUri || option.previewUrl;
                        const wigSpec = option?.selectedWig?.physical_specification || {};
                        const colorAndLength = [
                          wigSpec?.color || "",
                          wigSpec?.length != null ? `${wigSpec.length} in` : "",
                        ].filter(Boolean).join(" • ");
                        const styleAndTexture = [wigSpec?.style || option?.family, wigSpec?.hair_texture]
                          .filter(Boolean)
                          .join(" • ");
                        const carouselInputRange = [
                          (index - 1) * previewCarouselSnapInterval,
                          index * previewCarouselSnapInterval,
                          (index + 1) * previewCarouselSnapInterval,
                        ];
                        const animatedScale = previewCarouselScrollX.interpolate({
                          inputRange: carouselInputRange,
                          outputRange: [0.92, 1, 0.92],
                          extrapolate: "clamp",
                        });
                        const animatedOpacity = previewCarouselScrollX.interpolate({
                          inputRange: carouselInputRange,
                          outputRange: [0.68, 1, 0.68],
                          extrapolate: "clamp",
                        });
                        const animatedLift = previewCarouselScrollX.interpolate({
                          inputRange: carouselInputRange,
                          outputRange: [12, 0, 12],
                          extrapolate: "clamp",
                        });
                        return (
                          <Animated.View
                            key={option.id}
                            style={[
                              styles.summaryPreviewFanSlot,
                              {
                                width: previewCarouselCardWidth,
                                marginRight: index < recommendationOptions.length - 1
                                  ? previewCarouselGap
                                  : 0,
                                opacity: animatedOpacity,
                                transform: [
                                  { translateY: animatedLift },
                                  { scale: animatedScale },
                                ],
                              },
                            ]}
                          >
                            <Pressable
                              accessibilityRole="radio"
                              accessibilityLabel={`Wig preview ${index + 1}: ${option.name}`}
                              accessibilityState={{ selected: isSelected }}
                              onPress={() => {
                                selectRecommendationAtIndex(index);
                                previewCarouselRef.current?.scrollTo({
                                  x: index * previewCarouselSnapInterval,
                                  animated: true,
                                });
                              }}
                              style={({ pressed }) => [
                                styles.summaryPreviewTile,
                                {
                                  backgroundColor: roles.defaultCardBackground,
                                  borderColor: isSelected
                                    ? roles.primaryActionBackground
                                    : roles.defaultCardBorder,
                                },
                                isSelected ? styles.summaryPreviewTileSelected : null,
                                pressed ? styles.summaryPreviewTilePressed : null,
                              ]}
                            >
                              {imageUri ? (
                                <Image source={{ uri: imageUri }} resizeMode="cover" style={styles.summaryPreviewImage} />
                              ) : (
                                <View style={[styles.summaryPreviewPlaceholder, { backgroundColor: roles.supportCardBackground }]}>
                                  <AppIcon name="image" size="lg" color={roles.iconPrimaryColor} />
                                </View>
                              )}
                              <LinearGradient
                                pointerEvents="none"
                                colors={["transparent", "rgba(54,4,16,0.26)", "rgba(54,4,16,0.94)"]}
                                locations={[0.12, 0.42, 1]}
                                style={styles.summaryPreviewInfoOverlay}
                              >
                                <View style={styles.summaryPreviewDetails}>
                                  <Text style={styles.summaryPreviewTitle}>{option.name}</Text>
                                  <Text style={styles.summaryPreviewMatch}>{option.matchLabel || "Personalized look"}</Text>
                                  {colorAndLength ? (
                                    <View style={styles.wigGalleryMetaRow}>
                                      <MaterialCommunityIcons name="palette-outline" size={13} color="#FFFFFF" />
                                      <Text style={styles.wigGalleryOverlayMeta}>{colorAndLength}</Text>
                                    </View>
                                  ) : null}
                                  {styleAndTexture ? (
                                    <Text style={styles.wigGalleryOverlayDescription}>{styleAndTexture}</Text>
                                  ) : null}
                                  {option.suitabilityReason ? (
                                    <View style={styles.summaryPreviewReasonRow}>
                                      <MaterialCommunityIcons name="creation-outline" size={13} color="#F7DDE4" />
                                      <Text style={styles.summaryPreviewReasonText}>{option.suitabilityReason}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              </LinearGradient>
                              <View style={styles.summaryPreviewRankBadge}>
                                <MaterialCommunityIcons name="creation" size={12} color={theme.colors.palette.wine800} />
                                <Text style={styles.summaryPreviewRankText}>LOOK {index + 1}</Text>
                              </View>
                              <View style={[
                                styles.summaryPreviewSelectedBadge,
                                !isSelected ? styles.summaryPreviewChooseBadge : null,
                              ]}>
                                <MaterialCommunityIcons
                                  name={isSelected ? "check-circle" : "plus-circle-outline"}
                                  size={15}
                                  color={isSelected ? "#FFFFFF" : theme.colors.palette.wine800}
                                />
                                <Text style={[
                                  styles.summaryPreviewSelectedText,
                                  !isSelected ? styles.summaryPreviewChooseText : null,
                                ]}>
                                  {isSelected ? "Selected" : "Choose"}
                                </Text>
                              </View>
                            </Pressable>
                          </Animated.View>
                        );
                      })}
                    </Animated.ScrollView>

                    <LinearGradient
                      colors={["rgba(255,255,255,0.92)", "rgba(247,221,228,0.74)"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.summaryGalleryHint, { borderColor: roles.defaultCardBorder }]}
                    >
                      <View style={[styles.summaryGalleryHintIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                        <MaterialCommunityIcons name="gesture-swipe-horizontal" size={17} color={roles.iconPrimaryColor} />
                      </View>
                      <Text style={[styles.summaryGalleryHintText, { color: roles.bodyText }]}>Swipe to compare · Tap to choose your final wig</Text>
                    </LinearGradient>

                    {preview?.render_mode === "wig_overlay" ? (
                      <View style={[
                        styles.aiResultPanel,
                        styles.aiPreviewCard,
                        {
                          backgroundColor: roles.pageBackground,
                          borderColor: roles.defaultCardBorder,
                        },
                      ]}>
                        <View style={styles.aiPreviewCardHeader}>
                          <View>
                            <Text style={[styles.aiResultLabel, { color: roles.headingText }]}>Adjust preview</Text>
                            <Text style={[styles.aiPreviewHint, { color: roles.bodyText }]}>Fine-tune this older overlay before saving.</Text>
                          </View>
                        </View>
                        <AiWigCompositePreview
                          baseImageUri={referenceImage?.uri || generatedImageUri}
                          selectedWig={preview?.selected_wig || activeSelectedWig}
                          placement={preview?.placement || referenceImage?.placement}
                          previewCaptureRef={previewCaptureRef}
                          roles={roles}
                          compact={true}
                        />
                      </View>
                    ) : null}

                    <LinearGradient
                      colors={[theme.colors.palette.white, theme.colors.palette.warm50]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                      styles.previewReferenceCard,
                      { borderColor: roles.defaultCardBorder },
                    ]}
                    >
                      <Image
                        source={{ uri: referenceImage?.uri }}
                        resizeMode="cover"
                        style={styles.previewReferenceImage}
                      />
                      <View style={styles.previewReferenceCopy}>
                        <Text style={[styles.aiResultLabel, { color: roles.iconPrimaryColor }]}>Photo reference</Text>
                        <Text style={[styles.previewReferenceText, { color: roles.bodyText }]}>
                          Used only to create these previews.
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="shield-check-outline" size={21} color={roles.iconPrimaryColor} />
                    </LinearGradient>

                    {selectedOptionId && activeSelectedWig ? (
                      <LinearGradient
                        colors={[theme.colors.palette.blush100, theme.colors.palette.warm50]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                        styles.summaryNoteCard,
                        { borderColor: roles.defaultCardBorder },
                      ]}
                      >
                        <View style={styles.summarySelectedWigHeader}>
                          <View style={[styles.summarySelectedWigIcon, { backgroundColor: roles.primaryActionBackground }]}>
                            <MaterialCommunityIcons name="check" size={18} color={roles.primaryActionText} />
                          </View>
                          <View style={styles.summarySelectedWigCopy}>
                            <Text style={[styles.summarySelectedWigEyebrow, { color: roles.iconPrimaryColor }]}>YOUR SELECTION</Text>
                            <Text style={[styles.summaryNoteTitle, { color: roles.headingText }]} numberOfLines={2}>
                              {activeSelectedWig.wig_name}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.wigSpecificationGrid}>
                          {[
                            ["Color", activeSelectedWig?.physical_specification?.color],
                            ["Length", activeSelectedWig?.physical_specification?.length],
                            ["Style", activeSelectedWig?.physical_specification?.style],
                            ["Texture", activeSelectedWig?.physical_specification?.hair_texture],
                          ].filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => (
                            <View key={label} style={[styles.wigSpecificationItem, { borderColor: roles.defaultCardBorder }]}>
                              <Text style={[styles.wigSpecificationLabel, { color: roles.headingText }]}>{label}</Text>
                              <Text style={[styles.wigSpecificationValue, { color: roles.headingText }]}>{String(value)}</Text>
                            </View>
                          ))}
                        </View>
                      </LinearGradient>
                    ) : null}
                  </View>
                ) : (
                  <AppCard
                    variant="soft"
                    radius="sm"
                    padding="md"
                    style={styles.summaryNoteCard}
                  >
                    <Text
                      style={[
                        styles.summaryNoteTitle,
                        { color: roles.headingText },
                      ]}
                    >
                      Preview unavailable
                    </Text>
                    <Text style={[styles.flowBody, { color: roles.bodyText }]}>
                      We could not prepare your wig preview. Please try again or choose another photo.
                    </Text>
                  </AppCard>
                )}

                <LinearGradient
                  colors={[theme.colors.palette.blush100, theme.colors.palette.warm50]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.previewActionSection, { borderColor: roles.defaultCardBorder }]}
                >
                  <View style={styles.previewActionHeader}>
                    <View style={[styles.previewActionIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                      <MaterialCommunityIcons name="check-decagram-outline" size={20} color={roles.iconPrimaryColor} />
                    </View>
                    <View style={styles.previewActionCopy}>
                      <Text style={[styles.previewActionTitle, { color: roles.headingText }]}>Ready to submit?</Text>
                      <Text style={[styles.previewActionBody, { color: roles.bodyText }]}>Save this preview or make a change first.</Text>
                    </View>
                  </View>
                  <AppButton
                    title="Save preview"
                    variant="outline"
                    disabled={!generatedImageUri && preview?.render_mode !== "wig_overlay"}
                    onPress={onDownloadImage}
                    leading={<AppIcon name="image" state="active" />}
                  />
                  <View style={styles.previewAlternativeActions}>
                    <View style={styles.previewAlternativeAction}>
                      <AppButton
                        title="Choose again"
                        variant="outline"
                        size="sm"
                        onPress={onTryAnotherWig}
                        leading={<AppIcon name="sparkle" state="active" size="sm" />}
                      />
                    </View>
                    <View style={styles.previewAlternativeAction}>
                      <AppButton
                        title="Retake photo"
                        variant="outline"
                        size="sm"
                        onPress={onUploadAnotherPhoto}
                        leading={<AppIcon name="image" state="active" size="sm" />}
                      />
                    </View>
                  </View>
                </LinearGradient>
              </View>
            ) : null}

            {step === "confirmChoices" ? (
              <View style={styles.flowSection}>
                <LinearGradient
                  colors={[theme.colors.palette.wine900, theme.colors.palette.wine700, theme.colors.palette.wine600]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.photoGuideCard}
                >
                  <View pointerEvents="none" style={styles.photoGuideGlow} />
                  <View style={styles.photoGuideIcon}>
                    <MaterialCommunityIcons name="check-decagram-outline" size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.photoGuideCopy}>
                    <Text style={styles.photoGuideEyebrow}>CONFIRM YOUR SELECTION</Text>
                    <Text style={styles.photoGuideTitle}>Review your three looks</Text>
                    <Text style={styles.photoGuideBody}>Check each style before we create your previews.</Text>
                  </View>
                </LinearGradient>

                <View style={styles.confirmWigGrid}>
                  {(selectedWigs || []).map((wig, index) => {
                    const aiRecommendation = catalogRecommendationByWigId.get(String(wig?.wig_id || wig?.id || ""));
                    const wigSpec = wig?.physical_specification || {};
                    const colorAndLength = [
                      wigSpec?.color || "",
                      wigSpec?.length != null ? `${wigSpec.length} in` : "",
                    ].filter(Boolean).join(" • ");
                    const styleAndTexture = [wigSpec?.style, wigSpec?.hair_texture]
                      .filter(Boolean)
                      .join(" • ");
                    const previewUrl = getWigPreviewImageUrl(wig);

                    return (
                      <View key={wig.id || wig.wig_id} style={styles.wigGalleryCell}>
                        <View
                          style={[
                            styles.wigGalleryCard,
                            {
                              backgroundColor: roles.supportCardBackground,
                              borderColor: roles.primaryActionBackground,
                            },
                            styles.wigGalleryCardSelected,
                          ]}
                        >
                          <View style={styles.wigGalleryImageWrap}>
                            {previewUrl ? (
                              <Image
                                source={{ uri: previewUrl }}
                                resizeMode="contain"
                                style={styles.wigGalleryImage}
                              />
                            ) : (
                              <View
                                style={[
                                  styles.wigGalleryImage,
                                  styles.wigStyleThumbPlaceholder,
                                  { backgroundColor: roles.supportCardBackground },
                                ]}
                              >
                                <AppIcon name="image" size="md" color={roles.primaryActionBackground} />
                              </View>
                            )}
                            <LinearGradient
                              pointerEvents="none"
                              colors={["transparent", "rgba(54,4,16,0.60)", "rgba(54,4,16,0.94)"]}
                              locations={[0, 0.32, 1]}
                              style={styles.wigGalleryInfoOverlay}
                            >
                              <View style={styles.wigGalleryInfoCopy}>
                                <Text style={styles.wigGalleryOverlayTitle}>{wig.wig_name}</Text>
                                {colorAndLength ? (
                                  <View style={styles.wigGalleryMetaRow}>
                                    <MaterialCommunityIcons name="palette-outline" size={13} color="#FFFFFF" />
                                    <Text style={styles.wigGalleryOverlayMeta}>{colorAndLength}</Text>
                                  </View>
                                ) : null}
                                {styleAndTexture ? (
                                  <Text style={styles.wigGalleryOverlayDescription}>{styleAndTexture}</Text>
                                ) : null}
                                <View style={styles.wigGalleryOverlayAvailability}>
                                  <View style={[styles.wigGalleryAvailabilityDot, {
                                    backgroundColor: wig.is_available ? "#8EE6B7" : theme.colors.palette.blush100,
                                  }]} />
                                  <Text style={styles.wigGalleryOverlayAvailabilityText}>
                                    {wig.is_available ? "Available" : "Wish option"}
                                  </Text>
                                </View>
                              </View>
                            </LinearGradient>

                            <View style={[styles.wigGalleryChoiceBadge, styles.wigGalleryChoiceBadgeSelected]}>
                              <MaterialCommunityIcons name="check-circle" size={15} color="#FFFFFF" />
                              <Text style={[styles.wigGalleryChoiceBadgeText, styles.wigGalleryChoiceBadgeTextSelected]}>
                                Choice {index + 1}
                              </Text>
                            </View>

                            {aiRecommendation ? (
                              <View style={styles.wigGalleryAiBadge}>
                                <MaterialCommunityIcons name="creation" size={13} color={theme.colors.palette.wine800} />
                                <Text style={styles.wigGalleryAiBadgeText}>AI PICK #{aiRecommendation.rank}</Text>
                              </View>
                            ) : null}
                          </View>

                          {aiRecommendation?.suitabilityReason ? (
                            <View style={[styles.wigGalleryReason, { backgroundColor: roles.iconPrimarySurface }]}>
                              <MaterialCommunityIcons name="creation-outline" size={14} color={roles.iconPrimaryColor} />
                              <Text style={[styles.wigGalleryReasonText, { color: roles.bodyText }]}>
                                {aiRecommendation.suitabilityReason}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>

              </View>
            ) : null}

            {step === "safety" ? (
              <View style={styles.flowSection}>
                <View style={styles.requestFlowSectionHeader}>
                  <Text style={[styles.flowTitle, { color: roles.headingText }]}>Safety Assessment</Text>
                  <Text style={[styles.flowBody, { color: roles.headingText }]}>
                    Tell us about scalp sensitivities or restrictions before your wig request is reviewed.
                  </Text>
                </View>

                <View style={[styles.safetyAssessmentCard, {
                  backgroundColor: roles.pageBackground,
                  borderColor: roles.defaultCardBorder,
                }]}>
                  <SafetyChoiceRow
                    label="Known allergies"
                    value={safetyAssessment.hasKnownAllergies}
                    onChange={(value) => onChangeSafety("hasKnownAllergies", value)}
                    roles={roles}
                  />
                  {safetyAssessment.hasKnownAllergies ? (
                    <AppInput
                      label="Allergy details"
                      value={safetyAssessment.allergyDetails}
                      onChangeText={(value) => onChangeSafety("allergyDetails", value)}
                      placeholder="List known allergies"
                      multiline
                      shellStyle={[
                        styles.safetyDetailInput,
                        {
                          backgroundColor: roles.pageBackground,
                          borderColor: roles.defaultCardBorder,
                        },
                      ]}
                    />
                  ) : null}
                  <SafetyChoiceRow
                    label="Sensitive scalp"
                    value={safetyAssessment.hasSensitiveScalp}
                    onChange={(value) => onChangeSafety("hasSensitiveScalp", value)}
                    roles={roles}
                  />
                  <SafetyChoiceRow
                    label="Scalp irritation"
                    value={safetyAssessment.hasScalpIrritation}
                    onChange={(value) => onChangeSafety("hasScalpIrritation", value)}
                    roles={roles}
                  />
                  <SafetyChoiceRow
                    label="Open scalp wounds"
                    value={safetyAssessment.hasOpenScalpWounds}
                    onChange={(value) => onChangeSafety("hasOpenScalpWounds", value)}
                    roles={roles}
                  />
                  <SafetyChoiceRow
                    label="Medical restriction"
                    value={safetyAssessment.hasMedicalRestriction}
                    onChange={(value) => onChangeSafety("hasMedicalRestriction", value)}
                    roles={roles}
                  />
                  {safetyAssessment.hasMedicalRestriction ? (
                    <AppInput
                      label="Medical restriction details"
                      value={safetyAssessment.medicalRestrictionDetails}
                      onChangeText={(value) => onChangeSafety("medicalRestrictionDetails", value)}
                      placeholder="Describe the restriction"
                      multiline
                      shellStyle={[
                        styles.safetyDetailInput,
                        {
                          backgroundColor: roles.pageBackground,
                          borderColor: roles.defaultCardBorder,
                        },
                      ]}
                    />
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: safetyAssessment.informationConfirmed }}
                  onPress={() => onChangeSafety("informationConfirmed", !safetyAssessment.informationConfirmed)}
                  style={styles.agreementRowCompact}
                >
                  <View style={[
                    styles.checkBox,
                    safetyAssessment.informationConfirmed ? styles.checkBoxActive : null,
                  ]}>
                    {safetyAssessment.informationConfirmed ? (
                      <AppIcon name="success" state="inverse" size="sm" />
                    ) : null}
                  </View>
                  <Text style={[styles.agreementText, { color: roles.headingText }]}>
                    I confirm that this safety information is complete and accurate.
                  </Text>
                </Pressable>

                <AppButton
                  title="Submit Safety Assessment"
                  onPress={onSubmitSafety}
                  loading={isSavingSafety}
                  disabled={isSavingSafety}
                  leading={<AppIcon name="success" state="inverse" />}
                />
              </View>
            ) : null}
          </Animated.ScrollView>

          {step === "patient" && isPatientApproveDocked ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.patientApproveFooter,
                { paddingBottom: Math.max(insets.bottom, theme.spacing.md) },
              ]}
            >
              <AppButton
                title="Approve Details"
                onPress={onContinueToDetails}
                fullWidth={true}
                leading={<AppIcon name="success" state="inverse" />}
              />
            </View>
          ) : null}

          {step === "styles" ? (
            <View
              style={[
                styles.stylesActionFooter,
                {
                  paddingBottom: Math.max(insets.bottom, theme.spacing.md),
                  backgroundColor: roles.pageBackground,
                  borderTopColor: roles.defaultCardBorder,
                },
              ]}
            >
              <AppButton
                title={selectedWigIds?.length === 3 ? "Review 3 Choices" : `Selected ${selectedWigIds?.length || 0} of 3`}
                disabled={selectedWigIds?.length !== 3}
                onPress={onReviewChoices}
                fullWidth={true}
                leading={<AppIcon name="sparkle" state="inverse" />}
              />
            </View>
          ) : null}

          {step === "confirmChoices" ? (
            <LinearGradient
              pointerEvents="box-none"
              colors={["rgba(247,249,252,0)", roles.pageBackground, roles.pageBackground]}
              locations={[0, 0.32, 1]}
              style={[
                styles.confirmChoicesFooter,
                { paddingBottom: Math.max(insets.bottom, theme.spacing.md) },
              ]}
            >
              <View style={styles.confirmChoicesFooterRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit wig choices"
                  onPress={onBackToStyles}
                  style={({ pressed }) => [
                    styles.confirmChoicesAction,
                    pressed ? styles.confirmChoicesActionPressed : null,
                  ]}
                >
                  <LinearGradient
                    colors={[theme.colors.palette.white, theme.colors.palette.blush100]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.confirmChoicesActionGradient, { borderColor: roles.defaultCardBorder }]}
                  >
                    <View style={styles.confirmChoicesButtonLabel}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={roles.iconPrimaryColor} />
                      <Text numberOfLines={1} style={[styles.confirmChoicesEditText, { color: roles.iconPrimaryColor }]}>Edit choices</Text>
                    </View>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Confirm selected looks"
                  disabled={isGeneratingPreview}
                  onPress={onStartGeneration}
                  style={({ pressed }) => [
                    styles.confirmChoicesAction,
                    styles.confirmChoicesPrimaryAction,
                    pressed && !isGeneratingPreview ? styles.confirmChoicesActionPressed : null,
                  ]}
                >
                  <LinearGradient
                    colors={[theme.colors.palette.wine600, theme.colors.palette.wine900]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.confirmChoicesActionGradient}
                  >
                    {isGeneratingPreview ? (
                      <View style={styles.confirmChoicesButtonLabel}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text numberOfLines={1} style={styles.confirmChoicesConfirmText}>Creating...</Text>
                      </View>
                    ) : (
                      <View style={styles.confirmChoicesButtonLabel}>
                        <MaterialCommunityIcons name="check-decagram-outline" size={19} color="#FFFFFF" />
                        <Text numberOfLines={1} style={styles.confirmChoicesConfirmText}>Confirm looks</Text>
                      </View>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </LinearGradient>
          ) : null}

          {step === "summary" ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.summarySubmitFooter,
                { paddingBottom: Math.max(insets.bottom, theme.spacing.md) },
              ]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={selectedOptionId ? "Submit final wig" : "Choose your final wig"}
                accessibilityState={{ disabled: !selectedOptionId || isSavingRequest, busy: isSavingRequest }}
                disabled={!selectedOptionId || isSavingRequest}
                onPress={onSubmitRequest}
                style={({ pressed }) => [
                  styles.summarySubmitButton,
                  pressed && selectedOptionId && !isSavingRequest ? styles.summarySubmitButtonPressed : null,
                ]}
              >
                <LinearGradient
                  colors={selectedOptionId
                    ? [theme.colors.palette.wine600, theme.colors.palette.wine900]
                    : ["rgba(255,255,255,0.52)", "rgba(247,221,228,0.22)"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[
                    styles.summarySubmitButtonGradient,
                    {
                      borderColor: selectedOptionId
                        ? theme.colors.palette.wine700
                        : roles.defaultCardBorder,
                    },
                  ]}
                >
                  {isSavingRequest ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <MaterialCommunityIcons
                      name="clipboard-check-outline"
                      size={20}
                      color={selectedOptionId ? "#FFFFFF" : roles.metaText}
                    />
                  )}
                  <Text style={[
                    styles.summarySubmitButtonText,
                    { color: selectedOptionId ? "#FFFFFF" : roles.metaText },
                  ]}>
                    {isSavingRequest
                      ? "Submitting..."
                      : selectedOptionId
                        ? "Submit Final Wig"
                        : "Choose Your Final Wig"}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          ) : null}
        </View>
        <Modal
          transparent
          visible={Boolean(documentPreviewUri)}
          animationType="fade"
          onRequestClose={() => setDocumentPreviewUri("")}
        >
          <View style={styles.documentFullPreviewRoot}>
            <Pressable
              style={styles.documentFullPreviewBackdrop}
              onPress={() => setDocumentPreviewUri("")}
            />
            <View style={styles.documentFullPreviewHeader}>
              <Text style={styles.documentFullPreviewTitle}>
                Medical Certificate
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close medical certificate preview"
                onPress={() => setDocumentPreviewUri("")}
                style={styles.documentFullPreviewClose}
              >
                <MaterialCommunityIcons name="close" size={22} color="#ffffff" />
              </Pressable>
            </View>
            {isPdfDocumentUrl(documentPreviewUri) && Pdf ? (
              <Pdf
                source={{ uri: documentPreviewUri, cache: true }}
                style={styles.documentFullPreviewPdf}
                trustAllCerts={false}
              />
            ) : (
              <Image
                source={{ uri: documentPreviewUri }}
                style={styles.documentFullPreviewImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function PatientWigRequestScreen({ showFlowOnly = false } = {}) {
  const router = useRouter();
  const cameraRef = useRef(null);
  const wigPreviewCaptureRef = useRef(null);
  const hasFocusedRequestTabRef = useRef(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const [selectedWigFilterIds, setSelectedWigFilterIds] = useState([]);
  const [isCancelRequestModalOpen, setIsCancelRequestModalOpen] = useState(false);
  const [isReleaseReceiptModalOpen, setIsReleaseReceiptModalOpen] = useState(false);
  const [receiptConfirmationTarget, setReceiptConfirmationTarget] = useState(null);
  const [isReleaseAppealModalOpen, setIsReleaseAppealModalOpen] = useState(false);
  const [isSavingReleaseAction, setIsSavingReleaseAction] = useState(false);
  const [selectedHistoryRequest, setSelectedHistoryRequest] = useState(null);
  const [historyRequestDetails, setHistoryRequestDetails] = useState(null);
  const [isLoadingHistoryDetails, setIsLoadingHistoryDetails] = useState(false);
  const [historyAppealTarget, setHistoryAppealTarget] = useState(null);
  const [flowStep, setFlowStep] = useState("patient");
  const [photoValidation, setPhotoValidation] = useState(null);
  const [certificateVerification, setCertificateVerification] = useState(null);
  const [isVerifyingCertificate, setIsVerifyingCertificate] = useState(false);
  const [safetyAssessment, setSafetyAssessment] = useState(SAFETY_ASSESSMENT_DEFAULTS);
  const [safetyAssessmentRequestId, setSafetyAssessmentRequestId] = useState(null);
  const [completedSafetyRequestId, setCompletedSafetyRequestId] = useState(null);
  const [isSavingSafety, setIsSavingSafety] = useState(false);
  const [isLeavingRequest, setIsLeavingRequest] = useState(false);
  const [isSafetyAnswersOpen, setIsSafetyAnswersOpen] = useState(false);
  const [termsDocument, setTermsDocument] = useState(null);
  const [isLoadingTermsDocument, setIsLoadingTermsDocument] = useState(false);
  const [termsDocumentError, setTermsDocumentError] = useState("");
  const { user, profile, patientProfile, resolvedTheme } = useAuth();
  const roles = resolvePatientThemeRoles(resolvedTheme);
  const requestFlowPrimaryTextColor = roles.headingText;
  const requestFlowRoles = {
    ...roles,
    headingText: requestFlowPrimaryTextColor,
    bodyText: requestFlowPrimaryTextColor,
    metaText: requestFlowPrimaryTextColor,
  };
  const dashboardNavItems = showFlowOnly ? [] : patientDashboardNavItems;
  const firstName = String(profile?.first_name || "").trim();
  const lastName = String(profile?.last_name || "").trim();
  const avatarInitials = [firstName?.[0], lastName?.[0]]
    .filter(Boolean)
    .join("")
    .toUpperCase();
  const greeting = useMemo(getPatientGreeting, []);

  const loadTermsDocument = React.useCallback(async () => {
    setIsLoadingTermsDocument(true);
    setTermsDocumentError("");
    const result = await fetchActiveLegalDocuments();
    setIsLoadingTermsDocument(false);
    const activeDocuments = (result.data || []).filter((document) => document?.legal_document_id);
    const preferredDocumentTypes = new Set([
      "patient_wig_request_terms",
      "wig_request_terms",
      "patient_terms_and_agreement",
      "terms_and_agreement",
      "terms_and_conditions",
      "terms_of_service",
      "terms of service",
      "terms and conditions",
    ]);
    const selectedDocument = activeDocuments.find((document) => (
      preferredDocumentTypes.has(String(document?.document_type || "").trim().toLowerCase())
    )) || activeDocuments[0] || null;

    if (result.error || !selectedDocument) {
      setTermsDocument(null);
      setTermsDocumentError(
        result.error?.message || "No active legal document is available right now.",
      );
      return;
    }
    setTermsDocument(selectedDocument);
  }, []);

  useEffect(() => {
    if (!showFlowOnly || termsDocument || isLoadingTermsDocument || termsDocumentError) return;
    void loadTermsDocument();
  }, [isLoadingTermsDocument, loadTermsDocument, showFlowOnly, termsDocument, termsDocumentError]);
  const { unreadCount } = useNotifications({
    role: "patient",
    userId: user?.id,
    databaseUserId: profile?.user_id,
  });
  const {
    tracker,
    refreshTracking,
  } = useProcessTracking({
    role: "patient",
    userId: user?.id,
    databaseUserId: profile?.user_id,
    enabled: !showFlowOnly,
  });
  const {
    patientDetails,
    latestAllocation,
    latestWigRequest,
    latestWigSpecification,
    requestWig,
    safetyAssessment: savedSafetyAssessment,
    tryOnSelections,
    releaseReceipt,
    releaseAppeal,
    activeRequestMode,
    previousRequests,
    hasDraftRequest,
    hasSubmittedRequest,
    referenceImage,
    preview,
    wigRankings,
    error,
    successMessage,
    isLoadingContext,
    hasLoadedContext,
    isGeneratingPreview,
    isRankingWigs,
    isSavingRequest,
    isCancellingRequest,
    availableWigs,
    isLoadingAvailableWigs,
    wigPreferenceOptions,
    isLoadingWigPreferenceOptions,
    saveCapturedReferenceImage,
    clearReferenceImage,
    clearPreview,
    rankAvailableWigs,
    beginRequest,
    discardDraftRequest,
    saveCapSize,
    confirmTryOnCandidates,
    generatePreview,
    saveRequest,
    cancelRequest,
    acceptReleaseReceipt,
    downloadReleaseReceipt,
    loadPreviousRequestDetails,
    submitReleaseAppeal,
    refreshContext,
  } = usePatientWigRequest({ userId: user?.id });

  const promptedReceiptIdRef = useRef(null);
  useEffect(() => {
    const isReleased = String(latestWigRequest?.status || "").trim().toLowerCase() === "released";
    const receiptId = releaseReceipt?.receipt_id || null;
    if (!showFlowOnly && isReleased && receiptId && !releaseReceipt?.received_confirmed_at && promptedReceiptIdRef.current !== receiptId) {
      promptedReceiptIdRef.current = receiptId;
      setReceiptConfirmationTarget(null);
      setIsReleaseReceiptModalOpen(true);
    }
  }, [latestWigRequest?.status, releaseReceipt?.receipt_id, releaseReceipt?.received_confirmed_at, showFlowOnly]);

  useFocusEffect(
    React.useCallback(() => {
      if (showFlowOnly || !user?.id) return undefined;

      if (!hasFocusedRequestTabRef.current) {
        hasFocusedRequestTabRef.current = true;
        return undefined;
      }

      void refreshContext();
      void refreshTracking();
      return undefined;
    }, [refreshContext, refreshTracking, showFlowOnly, user?.id]),
  );

  const {
    control,
    handleSubmit,
    setValue,
    setError: setFormError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(wigRequestSchema),
    mode: "onBlur",
    defaultValues: wigRequestDefaultValues,
  });

  const draftValues = useWatch({ control });
  const patientFullName = [
    profile?.first_name,
    profile?.middle_name,
    profile?.last_name,
    profile?.suffix,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const requestPatientDetails = patientDetails || patientProfile || {};
  const requestStatus = formatRequestStatus(
    latestWigRequest?.status || "Pending",
  );
  const requestedWig = latestAllocation?.wigs || requestWig || null;
  const requestedWigSpec = requestedWig?.physical_specification || null;
  const requestedWigCode =
    requestedWig?.wig_code || latestWigRequest?.request_code || "Pending";
  const requestedWigStatus = requestedWig?.wig_status || requestStatus;
  const requestedWigSummary = [
    requestedWigSpec?.style,
    requestedWigSpec?.color ? `${requestedWigSpec.color}` : "",
    requestedWigSpec?.length != null ? `${requestedWigSpec.length} in` : "",
  ]
    .filter(Boolean)
    .join(" • ");
  const medicalCondition = requestPatientDetails?.medical_condition || "";
  const requestCode = latestWigRequest?.request_code || "";
  const cancellationEligibility = getWigRequestCancellationEligibility(latestWigRequest);
  const canCancelLatestRequest = cancellationEligibility.canCancel;
  const hasCameraPermission = Boolean(cameraPermission?.granted);
  const requestedWigCodeValue =
    requestedWig?.wig_code || requestCode || "Pending";
  const requestedWigColorValue = formatPatientFieldValue(
    requestedWigSpec?.color || latestWigSpecification?.preferred_color,
  );
  const requestedWigLengthValue = formatPatientFieldValue(
    requestedWigSpec?.length ?? latestWigSpecification?.preferred_length,
  );
  const requestedWigTextureValue = formatPatientFieldValue(
    requestedWigSpec?.hair_texture || latestWigSpecification?.hair_texture,
  );
  const requestedWigDensityValue = formatPatientFieldValue(
    requestedWigSpec?.hair_density || latestWigSpecification?.hair_density,
  );
  const requestedWigCapSizeValue = formatPatientFieldValue(
    requestedWigSpec?.cap_size || latestWigSpecification?.cap_size,
  );
  const requestedWigStyleValue = formatPatientFieldValue(
    requestedWigSpec?.style || latestWigSpecification?.style_preference,
  );
  const requestedWigId =
    requestedWig?.wig_id
    || latestWigRequest?.requested_wig_id
    || latestAllocation?.wig_id
    || null;
  const requestedCatalogWig = requestedWigId
    ? availableWigs.find((wig) => String(wig?.wig_id || wig?.id || "") === String(requestedWigId)) || null
    : null;
  const requestedWigImageUrl =
    getWigPreviewImageUrl(requestedCatalogWig)
    || getPrimaryTryOnImageUrl(requestedCatalogWig)
    || "";
  const requestedWigDisplayName =
    requestedCatalogWig?.wig_name
    || requestedWig?.wig_name
    || (requestedWigStyleValue !== "Not provided" ? requestedWigStyleValue : "");
  const requestedWigRows = [
    { label: "Style", value: requestedWigStyleValue },
    { label: "Color", value: requestedWigColorValue },
    { label: "Length", value: requestedWigLengthValue },
    { label: "Texture", value: requestedWigTextureValue },
    { label: "Density", value: requestedWigDensityValue },
    { label: "Cap size", value: requestedWigCapSizeValue },
  ];
  const requestStatusKey = String(latestWigRequest?.status || "").trim().toLowerCase();
  const expectedRelease = formatExpectedRelease(latestWigRequest?.expected_release_at);
  const expectedReleaseTime = latestWigRequest?.expected_release_at
    ? new Date(latestWigRequest.expected_release_at).getTime()
    : Number.NaN;
  const latestActualReleaseTime = releaseReceipt?.released_at
    ? new Date(releaseReceipt.released_at).getTime()
    : Number.NaN;
  const expectedReleaseUpdatedTime = latestWigRequest?.expected_release_updated_at
    ? new Date(latestWigRequest.expected_release_updated_at).getTime()
    : Number.NaN;
  const requestIsTerminal = ["cancelled", "canceled", "rejected", "closed"].includes(requestStatusKey);
  const expectedWasUpdatedAfterActualRelease = Number.isFinite(latestActualReleaseTime)
    && Number.isFinite(expectedReleaseUpdatedTime)
    && expectedReleaseUpdatedTime > latestActualReleaseTime;
  const expectedReleaseIsActive = Boolean(
    expectedRelease
    && !requestIsTerminal
    && (!Number.isFinite(latestActualReleaseTime) || expectedWasUpdatedAfterActualRelease)
    && requestStatusKey !== "released"
  );
  const canHaveExpectedRelease = [
    "accepted - wig allocated",
    "accepted - in production",
    "ready for pick-up",
    "to be release",
    "releasing",
  ].includes(requestStatusKey);
  const showExpectedReleaseCard = expectedReleaseIsActive
    || (!expectedRelease && !requestIsTerminal && canHaveExpectedRelease);
  const expectedReleaseHasPassed = expectedReleaseIsActive
    && Number.isFinite(expectedReleaseTime)
    && expectedReleaseTime < Date.now();
  void requestedWigCode;
  void requestedWigStatus;
  void requestedWigSummary;
  const availablePreviewWigs = useMemo(
    () =>
      availableWigs.filter((wig) =>
        wig?.is_active !== false &&
        Boolean(getPrimaryTryOnImageUrl(wig) || getWigPreviewImageUrl(wig)),
      ),
    [availableWigs],
  );
  const matchingPreviewWigs = useMemo(() => {
    const selectedCapSize = normalizeCapSizeValue(
      draftValues?.capSize || latestWigRequest?.requested_cap_size,
    );
    if (!selectedCapSize) return availablePreviewWigs;
    return availablePreviewWigs.filter((wig) => (
      normalizeCapSizeValue(getWigPreferenceValue(wig, "capSize")) === selectedCapSize
    ));
  }, [availablePreviewWigs, draftValues?.capSize, latestWigRequest?.requested_cap_size]);
  const recommendationOptions = useMemo(
    () =>
      buildRecommendationOptions({
        preview,
        specification: latestWigSpecification,
        draftValues,
      }),
    [draftValues, latestWigSpecification, preview],
  );
  const selectedOption = useMemo(
    () =>
      recommendationOptions.find((option) => option.id === selectedOptionId) ||
      recommendationOptions[0] ||
      null,
    [recommendationOptions, selectedOptionId],
  );
  const generatedImageUri =
    selectedOption?.generatedImageUri ||
    preview?.generated_image_data_url ||
    latestWigSpecification?.ai_wig_preview_url ||
    "";
  const hasGeneratedPreview = Boolean(preview);
  const aiRecommendedWig = useMemo(() => {
    if (!availablePreviewWigs.length) return null;

    return (
      availablePreviewWigs.reduce((best, wig) => {
        const score = scoreWigRecommendation(wig, draftValues);
        if (!best) return { wig, score };
        if (score > best.score) return { wig, score };

        const bestStock = Number(best.wig?.stock_count || 0);
        const wigStock = Number(wig?.stock_count || 0);
        if (score === best.score && wigStock > bestStock) return { wig, score };

        return best;
      }, null)?.wig ||
      availablePreviewWigs[0] ||
      null
    );
  }, [availablePreviewWigs, draftValues]);
  const recommendedPreferenceOptions = useMemo(
    () => ({
      preferredLength: [
        getWigPreferenceValue(aiRecommendedWig, "preferredLength"),
      ].filter(Boolean),
      preferredColor: [
        getWigPreferenceValue(aiRecommendedWig, "preferredColor"),
      ].filter(Boolean),
      hairTexture: [
        getWigPreferenceValue(aiRecommendedWig, "hairTexture"),
      ].filter(Boolean),
      hairDensity: [
        getWigPreferenceValue(aiRecommendedWig, "hairDensity"),
      ].filter(Boolean),
      capSize: [getWigPreferenceValue(aiRecommendedWig, "capSize")].filter(
        Boolean,
      ),
      stylePreference: [
        getWigPreferenceValue(aiRecommendedWig, "stylePreference"),
      ].filter(Boolean),
    }),
    [aiRecommendedWig],
  );
  const selectedWigs = useMemo(
    () => selectedWigFilterIds
      .map((filterId) => matchingPreviewWigs.find((wig) => wig.id === filterId))
      .filter(Boolean),
    [matchingPreviewWigs, selectedWigFilterIds],
  );
  const catalogRecommendationOptions = useMemo(
    () => buildRecommendationOptions({
      preview: wigRankings,
      specification: latestWigSpecification,
      draftValues,
    }),
    [draftValues, latestWigSpecification, wigRankings],
  );
  const selectedWig = selectedWigs[0] || null;
  const selectedRecommendationWig = selectedOption?.selectedWig || null;
  const effectiveSelectedWig = selectedRecommendationWig || selectedWig;
  useEffect(() => {
    setSelectedOptionId("");
  }, [preview?.generated_image_data_url]);

  useEffect(() => {
    if (!availablePreviewWigs.length) {
      setSelectedWigFilterIds([]);
      return;
    }

    setSelectedWigFilterIds((current) => current.filter((filterId) => (
      matchingPreviewWigs.some((wig) => wig.id === filterId)
    )).slice(0, 3));
  }, [availablePreviewWigs.length, matchingPreviewWigs]);

  useEffect(() => {
    if (!showFlowOnly || !hasLoadedContext || !hasDraftRequest) return;
    if (latestWigRequest?.requested_cap_size) {
      setValue("capSize", latestWigRequest.requested_cap_size);
    }
    setSafetyAssessmentRequestId(latestWigRequest?.req_id || null);
    const savedSelections = Array.isArray(tryOnSelections) ? tryOnSelections : [];
    if (savedSelections.length === 3) {
      setSelectedWigFilterIds(savedSelections.map((selection) => selection.filter_id).filter(Boolean));
    }
    const hasThreeGeneratedResults = savedSelections.filter((selection) => selection.generated_image_url).length === 3;
    const hasCompletedSafety = Boolean(
      savedSafetyAssessment?.information_confirmed
      || completedSafetyRequestId === latestWigRequest?.req_id,
    );
    setFlowStep((currentStep) => {
      if (!["patient", "safety"].includes(currentStep)) return currentStep;
      if (!hasCompletedSafety) return "safety";
      return hasThreeGeneratedResults ? "summary" : "photo";
    });
  }, [completedSafetyRequestId, hasDraftRequest, hasLoadedContext, latestWigRequest?.req_id, latestWigRequest?.requested_cap_size, savedSafetyAssessment?.information_confirmed, setValue, showFlowOnly, tryOnSelections]);

  useEffect(() => {
    if (!hasDraftRequest || !matchingPreviewWigs.length || tryOnSelections?.length !== 3) return;
    const savedFilterIds = tryOnSelections
      .map((selection) => selection.filter_id)
      .filter((filterId) => matchingPreviewWigs.some((wig) => wig.id === filterId));
    if (savedFilterIds.length === 3) setSelectedWigFilterIds(savedFilterIds);
  }, [hasDraftRequest, matchingPreviewWigs, tryOnSelections]);

  const handleNavPress = (item) => {
    if (!item.route || item.route === "/patient/requests") return;
    router.navigate(item.route);
  };

  const handleVerifyCertificateAsset = async (asset) => {
    if (!asset?.uri || isVerifyingCertificate) return { success: false };

    setIsVerifyingCertificate(true);
    const result = await verifyMedicalCertificateAsset({
      authUserId: user?.id,
      patientId: requestPatientDetails?.patient_id || null,
      asset,
    });
    setIsVerifyingCertificate(false);

    if (result?.verification) {
      setCertificateVerification(result.verification);
    }

    if (!result?.success) {
      Alert.alert(
        "Certificate needs review",
        result?.error || "Upload a clear medical certificate that shows the doctor's name and PRC/license number.",
      );
      return result;
    }

    await refreshContext();
    Alert.alert(
      "Certificate checked",
      "OCR detected the doctor license details. Staff will still verify the license against PRC records.",
    );
    return result;
  };

  const handleUploadCertificate = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return { success: false, canceled: true };
    const asset = result.assets?.[0] || null;
    return await handleVerifyCertificateAsset({
      uri: asset?.uri,
      mimeType: asset?.mimeType || "application/pdf",
      fileName: asset?.name || asset?.fileName || "medical-certificate",
    });
  };

  const handleScanCertificate = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera needed", "Allow camera access to scan the medical certificate.");
      return { success: false };
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.86,
      base64: true,
    });

    if (result.canceled) return { success: false, canceled: true };
    const asset = result.assets?.[0] || null;
    return await handleVerifyCertificateAsset({
      uri: asset?.uri,
      mimeType: asset?.mimeType || "image/jpeg",
      fileName: asset?.fileName || "medical-certificate-scan.jpg",
      base64: asset?.base64 || "",
    });
  };

  const generateConfirmedWigPreviews = async (image) => {
    const validation = validateAiTryOnPhoto(image);
    setPhotoValidation(validation);
    if (!validation.valid) return { success: false, error: validation.message };
    if (selectedWigs.length !== 3) {
      Alert.alert(
        "Choose three wigs",
        "Confirm exactly three wig styles before taking your photo.",
        [{ text: "Got it" }],
      );
      return {
        success: false,
        title: "Choose Three Wigs",
        error: "Confirm exactly three wig styles before taking your photo.",
      };
    }

    setFlowStep("generating");
    const generationResult = await generatePreview(draftValues, selectedWigs, image);
    if (generationResult?.success) {
      setSelectedOptionId("");
      setFlowStep("summary");
      return generationResult;
    }

    setFlowStep("confirmChoices");
    Alert.alert(
      generationResult?.title || "Preview Could Not Be Created",
      generationResult?.error || "Something interrupted the preview. Your photo is still saved—please try again.",
      [{ text: "Back to choices" }],
    );
    return generationResult;
  };

  const handleCapturePhoto = async () => {
    if (!cameraPermission?.granted) {
      await requestCameraPermission();
      return;
    }

    if (!cameraRef.current || isCapturingPhoto) return;

    setIsCapturingPhoto(true);

    try {
      const photo =
        typeof cameraRef.current.takePictureAsync === "function"
          ? await cameraRef.current.takePictureAsync({
              quality: 0.86,
              base64: true,
              skipProcessing: false,
            })
          : null;

      const result = await saveCapturedReferenceImage(photo);
      if (result?.image) {
        const validation = validateAiTryOnPhoto(result.image);
        setPhotoValidation(validation);
        return result;
      }
    } catch {
      await saveCapturedReferenceImage(null);
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const handleContinueToWigs = async () => {
    const validation = validateAiTryOnPhoto(referenceImage);
    setPhotoValidation(validation);
    if (!validation.valid) {
      Alert.alert("Photo needs review", validation.message);
      return { success: false, error: validation.message };
    }
    setFlowStep("cap");
    return { success: true };
  };

  const handleStartGeneration = handleSubmit(async (values) => {
    if (selectedWigs.length !== 3) {
      Alert.alert("Choose three wigs", "Select exactly three unique styles for your try-on.");
      return { success: false, error: "Select exactly three unique styles." };
    }
    if (Array.isArray(preview?.options) && preview.options.length === 3) {
      setFlowStep("summary");
      return { success: true, reusedPreview: true };
    }
    const result = await confirmTryOnCandidates(selectedWigs);
    if (!result?.success) {
      Alert.alert("Selections not saved", result?.error || "Please try again.");
      return result;
    }
    clearPreview();
    return await generateConfirmedWigPreviews(referenceImage, values);
  });

  const handleTryAnotherWig = () => {
    clearPreview();
    setSelectedOptionId("");
    setFlowStep("styles");
  };

  const handleUploadAnotherPhoto = async () => {
    clearPreview();
    clearReferenceImage();
    setSelectedOptionId("");
    setPhotoValidation(null);
    setFlowStep("photo");
  };

  const captureAdjustedWigPreview = async () => {
    if (preview?.render_mode !== "wig_overlay") {
      return generatedImageUri
        ? {
            uri: generatedImageUri,
            mimeType: generatedImageUri.startsWith("data:image/webp")
              ? "image/webp"
              : generatedImageUri.startsWith("data:image/png")
                ? "image/png"
                : "image/jpeg",
          }
        : null;
    }

    if (!wigPreviewCaptureRef.current) {
      throw new Error("The wig preview is not ready to save yet.");
    }

    const captureRef = getViewShotCaptureRef();
    if (typeof captureRef !== "function") {
      throw new Error(
        "Preview capture is not available in this app build. Rebuild the app to enable saving wig previews.",
      );
    }

    const uri = await captureRef(wigPreviewCaptureRef.current, {
      format: "jpg",
      quality: 0.95,
      result: "tmpfile",
    });

    return uri ? { uri, mimeType: "image/jpeg" } : null;
  };

  const handleDownloadImage = async () => {
    if (!generatedImageUri && preview?.render_mode !== "wig_overlay") return;

    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Photo access needed",
          "Allow photo library access to download the wig preview.",
        );
        return;
      }

      const capturedPreview = await captureAdjustedWigPreview();
      const imageToSave = capturedPreview?.uri || generatedImageUri;

      await MediaLibrary.saveToLibraryAsync(imageToSave);
      Alert.alert("Downloaded", "The wig preview was saved.");
    } catch {
      Alert.alert(
        "Download unavailable",
        "The wig preview is visible here, but it could not be saved on this device yet.",
      );
    }
  };

  const handleSaveRequest = handleSubmit(async (values) => {
    const finalOption = recommendationOptions.find((option) => option.id === selectedOptionId) || null;
    const requestedWigId = finalOption?.selectedWig?.wig_id || finalOption?.id || null;
    if (!requestedWigId || !selectedOptionId) {
      Alert.alert("Choose your final wig", "Tap one of the three previews before submitting.");
      return { success: false, error: "Choose one final wig." };
    }

    const result = await saveRequest(
      values,
      selectedOptionId,
      requestedWigId,
      null,
    );

    if (result?.success) {
      void refreshTracking().catch(() => {});
      router.replace("/patient/requests");
    }

    return result;
  });

  const handleChangeSafety = (field, value) => {
    setSafetyAssessment((current) => ({ ...current, [field]: value }));
  };

  const handleSubmitSafety = async () => {
    const requiredChoices = [
      safetyAssessment.hasKnownAllergies,
      safetyAssessment.hasSensitiveScalp,
      safetyAssessment.hasScalpIrritation,
      safetyAssessment.hasOpenScalpWounds,
      safetyAssessment.hasMedicalRestriction,
    ];
    if (requiredChoices.some((value) => typeof value !== "boolean")) {
      Alert.alert("Complete the assessment", "Please answer every Yes or No safety question.");
      return;
    }
    if (safetyAssessment.hasKnownAllergies && !safetyAssessment.allergyDetails.trim()) {
      Alert.alert("Allergy details required", "Please describe the known allergies.");
      return;
    }
    if (safetyAssessment.hasMedicalRestriction && !safetyAssessment.medicalRestrictionDetails.trim()) {
      Alert.alert("Restriction details required", "Please describe the medical restriction.");
      return;
    }
    if (!safetyAssessment.informationConfirmed) {
      Alert.alert("Confirmation required", "Confirm that the safety information is complete and accurate.");
      return;
    }
    if (!safetyAssessmentRequestId) {
      Alert.alert("Request unavailable", "The submitted wig request could not be linked to this assessment.");
      return;
    }

    setIsSavingSafety(true);
    const result = await upsertPatientWigSafetyAssessment({
      reqId: safetyAssessmentRequestId,
      ...safetyAssessment,
    });
    setIsSavingSafety(false);

    if (result.error) {
      Alert.alert("Unable to save assessment", result.error.message || "Please try again.");
      return;
    }

    setCompletedSafetyRequestId(safetyAssessmentRequestId);
    await Promise.all([
      refreshTracking(),
      refreshContext({ silent: true, force: true }),
    ]);
    setFlowStep("photo");
  };

  const handleCancelLatestRequest = () => {
    const latestEligibility = getWigRequestCancellationEligibility(latestWigRequest);
    if (!latestEligibility.canCancel) {
      Alert.alert(
        "Cancellation unavailable",
        latestEligibility.reason || "This request can no longer be cancelled.",
      );
      return;
    }
    setIsCancelRequestModalOpen(true);
  };

  const handleAcceptReleaseReceipt = async ({ confirmationPhoto }) => {
    setIsSavingReleaseAction(true);
    const result = await acceptReleaseReceipt({
      confirmationPhoto,
      request: receiptConfirmationTarget?.request || null,
      receipt: receiptConfirmationTarget?.receipt || null,
      wig: receiptConfirmationTarget?.wig || null,
    });
    setIsSavingReleaseAction(false);
    if (!result?.success) {
      Alert.alert("Receipt not confirmed", result?.error || "Please try again.");
      return;
    }
    setIsReleaseReceiptModalOpen(false);
    setReceiptConfirmationTarget(null);
    await Promise.all([
      refreshContext({ silent: true, force: true }),
      refreshTracking(),
    ]);
    Alert.alert(
      "Wig Receipt Confirmed",
      result?.pdfWarning || "Thank you for confirming that you received your wig.",
      [
        ...(result?.receipt?.pdf_path ? [{ text: "Download Receipt PDF", onPress: () => void handleDownloadReleaseReceipt(result.receipt) }] : []),
        { text: "Done" },
      ],
    );
  };

  const handleDownloadReleaseReceipt = async (receipt = null) => {
    const result = await downloadReleaseReceipt(receipt);
    if (!result?.success) Alert.alert("Download unavailable", result?.error || "Please try again.");
  };

  const handleSubmitReleaseAppeal = async ({ reason, description, requestedResolution, photos }) => {
    setIsSavingReleaseAction(true);
    const result = await submitReleaseAppeal({
      reason,
      description,
      requestedResolution,
      photos,
      request: historyAppealTarget?.request || null,
      receipt: historyAppealTarget?.receipt || null,
    });
    setIsSavingReleaseAction(false);
    if (!result?.success) {
      Alert.alert("Appeal not submitted", result?.error || "Please try again.");
      return;
    }
    setIsReleaseAppealModalOpen(false);
    setHistoryAppealTarget(null);
    await refreshContext({ silent: true, force: true });
    Alert.alert("Appeal submitted", "Staff will review your report.");
  };

  const handleViewHistoryRequest = async (request) => {
    setSelectedHistoryRequest(request);
    setHistoryRequestDetails(null);
    setIsLoadingHistoryDetails(true);
    const result = await loadPreviousRequestDetails(request);
    setIsLoadingHistoryDetails(false);
    if (result?.error) {
      Alert.alert("Request details unavailable", result.error);
      return;
    }
    setHistoryRequestDetails(result.details);
  };

  const handleCloseHistoryDetails = () => {
    setSelectedHistoryRequest(null);
    setHistoryRequestDetails(null);
    setIsLoadingHistoryDetails(false);
  };

  const handleReportHistoryProblem = ({ request, receipt }) => {
    setHistoryAppealTarget({ request, receipt });
    handleCloseHistoryDetails();
    setIsReleaseAppealModalOpen(true);
  };

  const handleConfirmCancelLatestRequest = async () => {
    const latestEligibility = getWigRequestCancellationEligibility(latestWigRequest);
    if (!latestEligibility.canCancel) {
      setIsCancelRequestModalOpen(false);
      Alert.alert(
        "Cancellation unavailable",
        latestEligibility.reason || "This request can no longer be cancelled.",
      );
      return;
    }

    const result = await cancelRequest();
    if (!result?.success) {
      Alert.alert(
        "Request not cancelled",
        result?.error || "We could not cancel the request right now. Please try again.",
      );
      return;
    }

    setIsCancelRequestModalOpen(false);
    await refreshTracking();
  };

  const cancelUnfinishedRequestAndLeave = async () => {
    if (isLeavingRequest) return;
    setIsLeavingRequest(true);

    try {
      if (hasDraftRequest) {
        const result = await discardDraftRequest();
        if (!result?.success) {
          Alert.alert(
            "Unable to cancel request",
            result?.error || "We could not cancel your unfinished request. Your progress is still safe—please try again.",
          );
          return;
        }
      } else {
        clearReferenceImage();
        clearPreview();
      }

      router.back();
    } catch {
      Alert.alert(
        "Unable to cancel request",
        "Something interrupted the cancellation. Your progress is still safe—please try again.",
      );
    } finally {
      setIsLeavingRequest(false);
    }
  };

  const confirmUnfinishedRequestExit = () => {
    Alert.alert(
      "Cancel unfinished request?",
      "Your wig request is not finished. If you leave now, it will be canceled and your current progress will be removed.",
      [
        { text: "Continue request", style: "cancel" },
        {
          text: "Cancel request and leave",
          style: "destructive",
          onPress: () => {
            void cancelUnfinishedRequestAndLeave();
          },
        },
      ],
    );
  };

  const handleRequestFlowBack = () => {
    if (isSavingRequest || isSavingSafety || isGeneratingPreview || isRankingWigs || isLeavingRequest) {
      Alert.alert(
        "Please wait",
        isGeneratingPreview
          ? "Your wig previews are still being created. Keep this screen open until they finish."
          : isRankingWigs
            ? "AI is finding your best wig matches. Keep this screen open until it finishes."
          : isLeavingRequest
            ? "Your unfinished request is being canceled safely."
            : "This step is still being saved. You can go back when it finishes.",
      );
      return;
    }

    if (flowStep === "patient") {
      confirmUnfinishedRequestExit();
      return;
    }

    const previousStepByStep = {
      safety: "patient",
      photo: "safety",
      cap: "photo",
      styles: "cap",
      confirmChoices: "styles",
      summary: "confirmChoices",
      customSpec: "cap",
    };
    const previousStep = previousStepByStep[flowStep];

    if (!previousStep) {
      confirmUnfinishedRequestExit();
      return;
    }

    setFlowStep(previousStep);
  };

  const openRequestFlow = () => {
    router.navigate("/patient/request-wig");
  };

  const handleContinueToDetails = handleSubmit(async (values) => {
    if (!values.acceptedTerms) {
      setFormError("acceptedTerms", {
        type: "manual",
        message: "Please accept the patient record consent first.",
      });
      return {
        success: false,
        error: "Please accept the patient record consent first.",
      };
    }

    const verificationStatus = String(
      certificateVerification?.status
      || requestPatientDetails?.medical_document_verification_status
      || "",
    ).toLowerCase();
    const certificateReady = ["ocr_passed_prc_pending", "verified", "prc_verified"].includes(verificationStatus);
    if (!certificateReady) {
      Alert.alert(
        "Certificate validation required",
        "Upload or scan the doctor's medical certificate first. OCR must detect the doctor name, PRC/license number, and diagnosis details before you can request a wig.",
      );
      return {
        success: false,
        error: "Certificate validation is required.",
      };
    }

    const result = await beginRequest();
    if (!result?.success) {
      Alert.alert("Request not started", result?.error || "Please try again.");
      return result;
    }
    if (
      result.wigRequest?.requested_wig_id
      || String(result.wigRequest?.status || "").trim().toLowerCase() !== "pending"
    ) {
      Alert.alert("Request already active", "Track your current wig request before starting another.");
      router.replace("/patient/requests");
      return { success: false, alreadySubmitted: true };
    }
    setSafetyAssessmentRequestId(result.wigRequest?.req_id || null);
    setCompletedSafetyRequestId(null);
    setSafetyAssessment(SAFETY_ASSESSMENT_DEFAULTS);
    setFlowStep("safety");
    return result;
  });

  const handleSubmitCapSize = handleSubmit(async (values) => {
    if (!values.capSize) {
      Alert.alert("Choose a cap size", "Select the cap size that feels most comfortable.");
      return { success: false };
    }
    const result = await saveCapSize(values.capSize);
    if (!result?.success) {
      Alert.alert("Cap size not saved", result?.error || "Please try again.");
      return result;
    }
    if (matchingPreviewWigs.length < 3) {
      Alert.alert(
        "Not enough matching wigs",
        "At least three catalog wigs in this cap size are needed for the virtual try-on.",
      );
      return { success: false };
    }
    const rankingResult = await rankAvailableWigs(values, matchingPreviewWigs, referenceImage);
    if (!rankingResult?.success) {
      Alert.alert(
        rankingResult?.title || "Recommendations unavailable",
        rankingResult?.error || "We could not rank the wigs right now. Please try again.",
      );
      return rankingResult;
    }
    const recommendedIds = (rankingResult.recommendations || [])
      .map((recommendation) => (
        recommendation?.selectedWig?.id
        || recommendation?.selectedWig?.wig_id
        || recommendation?.selected_wig?.id
        || recommendation?.selected_wig?.wig_id
        || recommendation?.id
      ))
      .map((id) => matchingPreviewWigs.find((wig) => String(wig.wig_id || wig.id) === String(id))?.id)
      .filter(Boolean)
      .slice(0, 3);
    setSelectedWigFilterIds(recommendedIds);
    setFlowStep("styles");
    return result;
  });

  const handleReviewChoices = () => {
    if (selectedWigs.length !== 3) {
      Alert.alert("Choose three wigs", "Select exactly three looks before continuing.");
      return;
    }
    Alert.alert(
      "Review these three wigs?",
      "You can check each selection on the next screen before AI creates your try-on previews.",
      [
        { text: "Keep choosing", style: "cancel" },
        { text: "Review my choices", onPress: () => setFlowStep("confirmChoices") },
      ],
    );
  };

  const handleToggleWig = (filterId) => {
    setSelectedWigFilterIds((current) => {
      if (current.includes(filterId)) return current.filter((id) => id !== filterId);
      if (current.length >= 3) {
        Alert.alert("Three wigs selected", "Remove one choice before adding another.");
        return current;
      }
      return [...current, filterId];
    });
  };

  return (
    <DashboardLayout
      navItems={dashboardNavItems}
      activeNavKey="requests"
      navVariant="patient"
      onNavPress={handleNavPress}
      floatingOverlay={!showFlowOnly && canCancelLatestRequest ? (
        <View pointerEvents="box-none" style={styles.cancelRequestFloatingHost}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel wig request"
            disabled={isCancellingRequest}
            onPress={handleCancelLatestRequest}
            style={({ pressed }) => [
              styles.cancelRequestFloatingButton,
              pressed && !isCancellingRequest ? styles.cancelRequestFloatingButtonPressed : null,
            ]}
          >
            <LinearGradient
              colors={[theme.colors.actionDanger, theme.colors.actionDangerPressed]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cancelRequestFloatingContent}
            >
              <View style={styles.cancelRequestFloatingInner}>
                <View style={styles.cancelRequestFloatingIcon}>
                  {isCancellingRequest ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
                  )}
                </View>
                <View style={styles.cancelRequestFloatingCopy}>
                  <Text style={styles.cancelRequestFloatingTitle}>{isCancellingRequest ? "Cancelling..." : "Cancel request"}</Text>
                  <Text style={styles.cancelRequestFloatingHint}>Available for {cancellationEligibility.daysRemaining} {cancellationEligibility.daysRemaining === 1 ? "day" : "days"}</Text>
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}
      header={
        showFlowOnly ? null : (
          <DashboardHeaderSurface>
            <DonorTopBar
              title={greeting}
              subtitle={`${firstName || "Patient"} | Wig Recipient`}
              avatarInitials={avatarInitials}
              avatarUri={profile?.avatar_url || profile?.photo_path || ""}
              unreadCount={unreadCount}
              onNotificationsPress={() =>
                router.navigate("/patient/notifications")
              }
              onProfilePress={() => router.navigate("/profile")}
            />
          </DashboardHeaderSurface>
        )
      }
    >
      {!showFlowOnly ? (
        <>
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
        </>
      ) : null}

      {!showFlowOnly ? (
        <>
          <View style={[
            styles.simpleWigSection,
            canCancelLatestRequest ? styles.simpleWigSectionWithFloatingCancel : null,
            !hasSubmittedRequest && hasLoadedContext && !isLoadingContext ? styles.simpleWigSectionEmpty : null,
          ]}>
            <View style={[
              styles.requestedWigSummaryCard,
              hasSubmittedRequest ? styles.requestedWigSummaryActive : null,
              !hasSubmittedRequest && hasLoadedContext && !isLoadingContext ? styles.requestedWigSummaryPlain : null,
            ]}>
              {hasSubmittedRequest ? activeRequestMode === "receipt_confirmation" ? (
                <View style={[styles.receiptActionCard, {
                  backgroundColor: roles.defaultCardBackground,
                  borderColor: roles.defaultCardBorder,
                }]}
                >
                  <View
                    style={[styles.receiptActionIcon, { backgroundColor: roles.iconPrimarySurface }]}
                  >
                    <MaterialCommunityIcons name="package-check" size={30} color={roles.primaryActionBackground} />
                  </View>
                  <Text style={[styles.receiptActionEyebrow, { color: roles.metaText }]}>CURRENT ACTION</Text>
                  <Text style={[styles.receiptActionTitle, { color: roles.headingText }]}>Your wig has been released</Text>
                  <Text style={[styles.receiptActionDescription, { color: roles.bodyText }]}>Please confirm when you have physically received your wig.</Text>
                  <View style={[styles.receiptActionMeta, { backgroundColor: roles.iconPrimarySurface }]}>
                    <Text style={[styles.receiptActionMetaText, { color: roles.bodyText }]}>Request {latestWigRequest?.request_code || ""}</Text>
                    <Text style={[styles.receiptActionMetaText, { color: roles.bodyText }]}>Released {formatHistoryDateTime(releaseReceipt?.released_at)}</Text>
                  </View>
                  <AppButton title="Confirm Wig Receipt" onPress={() => {
                    setReceiptConfirmationTarget(null);
                    setIsReleaseReceiptModalOpen(true);
                  }} loading={isSavingReleaseAction} fullWidth={true} />
                </View>
              ) : (
                <>
                  <Text style={[styles.activeRequestHeading, { color: roles.headingText }]}>Current Wig Request</Text>
                  <WigJourneyTimeline tracker={tracker} roles={roles} />

                  <View style={styles.requestQuickActions}>
                    <InlineWigDetails
                      rows={requestedWigRows}
                      code={requestedWigCodeValue}
                      imageUrl={requestedWigImageUrl}
                      selectedStyle={requestedWigDisplayName}
                      roles={roles}
                    />

                    {showExpectedReleaseCard ? (
                      <View style={[styles.expectedReleaseCard, {
                        backgroundColor: roles.defaultCardBackground,
                        borderColor: roles.defaultCardBorder,
                      }]}
                      >
                        <View
                          style={[styles.expectedReleaseIcon, { backgroundColor: roles.iconPrimarySurface }]}
                        >
                          <MaterialCommunityIcons name="calendar-clock-outline" size={22} color={roles.primaryActionBackground} />
                        </View>
                        <View style={styles.expectedReleaseCopy}>
                          <Text style={[styles.expectedReleaseEyebrow, { color: roles.metaText }]}>EXPECTED WIG RELEASE</Text>
                          {expectedReleaseIsActive ? (
                            <>
                              <Text style={[styles.expectedReleaseDate, { color: roles.headingText }]}>{expectedRelease.date}</Text>
                              <Text style={[styles.expectedReleaseTime, { color: roles.primaryActionBackground }]}>Around {expectedRelease.time}</Text>
                              <Text style={[styles.expectedReleaseDescription, { color: expectedReleaseHasPassed ? theme.colors.textError : roles.bodyText }]}>
                                {expectedReleaseHasPassed
                                  ? "This estimated schedule has passed. Please wait for an updated schedule."
                                  : "This is the current estimate and may change while your wig is being prepared."}
                              </Text>
                              {latestWigRequest?.expected_release_note ? (
                                <Text style={[styles.expectedReleaseNote, { color: roles.bodyText }]}>{latestWigRequest.expected_release_note}</Text>
                              ) : null}
                            </>
                          ) : (
                            <Text style={[styles.expectedReleaseDescription, { color: roles.bodyText }]}>Release schedule will be provided once available.</Text>
                          )}
                        </View>
                      </View>
                    ) : null}

                    {savedSafetyAssessment ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="View safety information"
                        onPress={() => setIsSafetyAnswersOpen(true)}
                        style={({ pressed }) => [
                          styles.requestQuickAction,
                          {
                            backgroundColor: roles.defaultCardBackground,
                            borderColor: roles.defaultCardBorder,
                          },
                          pressed ? styles.preferencePressed : null,
                        ]}
                      >
                        <LinearGradient
                          colors={[roles.defaultCardBackground, roles.supportCardBackground]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.requestQuickActionRow}
                        >
                          <LinearGradient
                            colors={[theme.colors.palette.wine600, theme.colors.palette.wine900]}
                            style={styles.requestQuickActionIcon}
                          >
                            <MaterialCommunityIcons name="shield-check-outline" size={21} color="#FFFFFF" />
                          </LinearGradient>
                          <View style={styles.requestQuickActionCopy}>
                            <Text style={[styles.requestQuickActionTitle, { color: roles.headingText }]}>Safety information</Text>
                            <Text numberOfLines={1} style={[styles.requestQuickActionHint, { color: roles.metaText }]}>Health and comfort answers</Text>
                          </View>
                          <View style={[styles.requestQuickActionArrow, { backgroundColor: roles.iconPrimarySurface }]}>
                            <MaterialCommunityIcons name="chevron-right" size={20} color={roles.iconPrimaryColor} />
                          </View>
                        </LinearGradient>
                      </Pressable>
                    ) : null}

                    {releaseReceipt && ["released", "appealed"].includes(requestStatusKey) ? (
                      <LinearGradient
                        colors={[roles.defaultCardBackground, roles.supportCardBackground]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.requestQuickAction, { borderColor: roles.defaultCardBorder, padding: theme.spacing.md, gap: theme.spacing.sm }]}
                      >
                        <View style={styles.requestQuickActionRow}>
                          <LinearGradient colors={[theme.colors.palette.wine600, theme.colors.palette.wine900]} style={styles.requestQuickActionIcon}>
                            <MaterialCommunityIcons name="hand-heart-outline" size={21} color="#FFFFFF" />
                          </LinearGradient>
                          <View style={styles.requestQuickActionCopy}>
                            <Text style={[styles.requestQuickActionTitle, { color: roles.headingText }]}>Wig release receipt</Text>
                            <Text style={[styles.requestQuickActionHint, { color: roles.metaText }]}>
                              {releaseReceipt.received_confirmed_at ? "Receipt confirmed" : "Please confirm after receiving your wig"}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={3} style={[styles.flowBody, { color: roles.bodyText }]}>{releaseReceipt.terms_snapshot}</Text>
                        {releaseReceipt.received_confirmed_at && releaseReceipt.pdf_path ? (
                          <AppButton title="Download Receipt PDF" onPress={() => void handleDownloadReleaseReceipt()} fullWidth={true} />
                        ) : null}
                        {!releaseReceipt.received_confirmed_at ? (
                          <AppButton title="Confirm Wig Receipt" onPress={() => {
                            setReceiptConfirmationTarget(null);
                            setIsReleaseReceiptModalOpen(true);
                          }} loading={isSavingReleaseAction} fullWidth={true} />
                        ) : releaseAppeal ? (
                          <View style={[styles.documentStatusPill, { backgroundColor: roles.iconPrimarySurface, alignSelf: "flex-start" }]}>
                            <Text style={[styles.documentRowStatus, { color: roles.primaryActionBackground }]}>{getPatientAppealStatusLabel(releaseAppeal.status)}</Text>
                          </View>
                        ) : new Date(releaseReceipt.appeal_deadline).getTime() >= Date.now() ? (
                          <AppButton title="Report a Wig Problem" variant="outline" onPress={() => {
                            setHistoryAppealTarget(null);
                            setIsReleaseAppealModalOpen(true);
                          }} fullWidth={true} />
                        ) : (
                          <Text style={[styles.requestQuickActionHint, { color: roles.metaText }]}>The appeal period has ended.</Text>
                        )}
                      </LinearGradient>
                    ) : null}
                  </View>
                </>
              ) : isLoadingContext || !hasLoadedContext ? (
                <View
                  style={[
                    styles.wigRequestCheckingCard,
                    {
                      backgroundColor: roles.defaultCardBackground,
                      borderColor: roles.defaultCardBorder,
                    },
                  ]}
                >
                  <View style={[styles.wigRequestCheckingIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                    <ActivityIndicator color={roles.primaryActionBackground} />
                  </View>
                  <View style={styles.wigRequestCheckingCopy}>
                    <Text style={[styles.wigRequestCheckingTitle, { color: requestFlowPrimaryTextColor }]}>Checking your wig request</Text>
                    <Text style={[styles.wigRequestCheckingText, { color: roles.bodyText }]}>Loading your latest request and progress.</Text>
                  </View>
                </View>
              ) : (
                <LinearGradient
                  colors={[
                    roles.defaultCardBackground,
                    roles.supportCardBackground,
                  ]}
                  start={{ x: 0.05, y: 0 }}
                  end={{ x: 0.95, y: 1 }}
                  style={[
                    styles.wigRequestEmptyCard,
                    { borderColor: roles.defaultCardBorder },
                  ]}
                >
                  <View style={styles.wigRequestArtwork}>
                    <View
                      style={[
                        styles.wigRequestArtworkRing,
                        { borderColor: roles.defaultCardBorder },
                      ]}
                    />
                    <View
                      style={[
                        styles.wigRequestArtworkIcon,
                        { backgroundColor: roles.iconPrimarySurface },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="account-heart-outline"
                        size={38}
                        color={roles.primaryActionBackground}
                      />
                    </View>
                    <View
                      style={[
                        styles.wigRequestArtworkAccent,
                        { backgroundColor: roles.primaryActionBackground },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="creation"
                        size={13}
                        color={roles.primaryActionText}
                      />
                    </View>
                  </View>

                  <View style={styles.wigRequestEmptyCopy}>
                    <Text
                      style={[
                        styles.wigRequestEyebrow,
                        { color: roles.primaryActionBackground },
                      ]}
                    >
                      YOUR WIG REQUEST
                    </Text>
                    <Text
                      style={[
                        styles.wigRequestEmptyTitle,
                        { color: requestFlowPrimaryTextColor },
                      ]}
                    >
                      {hasDraftRequest ? "Continue your wig request" : "Ready to request a wig?"}
                    </Text>
                    <Text
                      style={[
                        styles.wigRequestEmptyMessage,
                        { color: roles.bodyText },
                      ]}
                    >
                      {hasDraftRequest
                        ? "Your progress is saved. Continue with your safety, fit, or wig choices."
                        : "Choose your fit, compare three wigs, and submit your favorite."}
                    </Text>
                  </View>

                  <View style={styles.wigRequestGuideRow}>
                    {wigRequestGuideSteps.map((step, index) => (
                      <React.Fragment key={step.key}>
                        <View style={styles.wigRequestGuideStep}>
                          <View
                            style={[
                              styles.wigRequestGuideIcon,
                              { backgroundColor: roles.iconPrimarySurface },
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={step.icon}
                              size={18}
                              color={roles.primaryActionBackground}
                            />
                          </View>
                          <Text
                            numberOfLines={2}
                            style={[
                              styles.wigRequestGuideLabel,
                              { color: roles.bodyText },
                            ]}
                          >
                            {step.label}
                          </Text>
                        </View>
                        {index < wigRequestGuideSteps.length - 1 ? (
                          <MaterialCommunityIcons
                            name="chevron-right"
                            size={16}
                            color={roles.metaText}
                          />
                        ) : null}
                      </React.Fragment>
                    ))}
                  </View>

                  <AppButton
                    title={hasDraftRequest ? "Resume wig request" : "Request a Wig"}
                    onPress={openRequestFlow}
                    leading={<AppIcon name="requests" state="inverse" />}
                    trailing={
                      <MaterialCommunityIcons
                        name="arrow-right"
                        size={20}
                        color={roles.primaryActionText}
                      />
                    }
                    style={styles.wigRequestPrimaryAction}
                  />

                  <View style={styles.wigRequestPrivacyNote}>
                    <MaterialCommunityIcons
                      name="shield-check-outline"
                      size={17}
                      color={roles.primaryActionBackground}
                    />
                    <Text
                      style={[
                        styles.wigRequestPrivacyText,
                        { color: roles.metaText },
                      ]}
                    >
                      Your medical information is handled securely.
                    </Text>
                  </View>
                </LinearGradient>
              )}
            </View>

            {previousRequests?.length ? (
              <View style={styles.previousRequestsSection}>
                <View style={[
                  styles.previousRequestsHeader,
                  Platform.OS === "web" ? { backgroundColor: roles.pageBackground } : null,
                ]}>
                  <Text style={[styles.previousRequestsTitle, { color: roles.headingText }]}>Previous Requests</Text>
                  <Text style={[styles.previousRequestsCount, { color: roles.metaText }]}>{previousRequests.length}</Text>
                </View>
                {previousRequests.map((request) => {
                  const historyStatus = getHistoryRequestStatus(request);
                  const needsConfirmation = historyStatus === "Released - Confirmation Required";
                  const historyDateLabel = request.latest_release_receipt?.received_confirmed_at ? "Received" : "Requested";
                  const historyDateValue = request.latest_release_receipt?.received_confirmed_at || request.request_date;
                  return (
                    <View key={request.req_id} style={[styles.previousRequestCard, {
                      backgroundColor: roles.defaultCardBackground,
                      borderColor: roles.defaultCardBorder,
                    }]}
                    >
                      <View style={styles.previousRequestTopRow}>
                        <View style={styles.previousRequestCopy}>
                          <Text style={[styles.previousRequestCode, { color: roles.headingText }]}>{request.request_code || "Wig request"}</Text>
                          {request.wig?.wig_name ? <Text numberOfLines={1} style={[styles.previousRequestWigName, { color: roles.bodyText }]}>{request.wig.wig_name}</Text> : null}
                          <Text style={[styles.previousRequestStatus, { color: needsConfirmation ? theme.colors.textError : roles.primaryActionBackground }]}>{historyStatus}</Text>
                        </View>
                        <MaterialCommunityIcons name="history" size={22} color={roles.metaText} />
                      </View>
                      {request.requested_cap_size ? <Text style={[styles.previousRequestMeta, { color: roles.bodyText }]}>{request.requested_cap_size} cap</Text> : null}
                      <Text style={[styles.previousRequestMeta, { color: roles.metaText }]}>{historyDateLabel} {formatHistoryDateTime(historyDateValue)}</Text>
                      {needsConfirmation ? (
                        <AppButton title="Confirm Receipt" onPress={() => {
                          setReceiptConfirmationTarget({
                            request,
                            receipt: request.latest_release_receipt,
                            wig: null,
                          });
                          setIsReleaseReceiptModalOpen(true);
                        }} fullWidth={true} />
                      ) : null}
                      <AppButton title="View Details" variant="outline" onPress={() => handleViewHistoryRequest(request)} fullWidth={true} />
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>

        </>
      ) : null}

      <RequestFlowModal
        visible={showFlowOnly}
        step={flowStep}
        control={control}
        errors={errors}
        patientName={patientFullName}
        patientDetails={requestPatientDetails}
        medicalCondition={medicalCondition}
        availableWigs={matchingPreviewWigs}
        referenceImage={referenceImage}
        selectedWig={effectiveSelectedWig}
        selectedWigs={selectedWigs}
        selectedWigIds={selectedWigFilterIds}
        recommendedPreferenceOptions={recommendedPreferenceOptions}
        recommendationOptions={recommendationOptions}
        catalogRecommendations={catalogRecommendationOptions}
        selectedOptionId={selectedOptionId}
        onSelectOption={setSelectedOptionId}
        wigPreferenceOptions={wigPreferenceOptions}
        isLoadingAvailableWigs={isLoadingAvailableWigs}
        isLoadingWigPreferenceOptions={isLoadingWigPreferenceOptions}
        generatedImageUri={generatedImageUri}
        preview={preview}
        hasGeneratedPreview={hasGeneratedPreview}
        isGeneratingPreview={isGeneratingPreview}
        isRankingWigs={isRankingWigs}
        isSavingRequest={isSavingRequest}
        isCapturingPhoto={isCapturingPhoto}
        certificateVerification={certificateVerification}
        isVerifyingCertificate={isVerifyingCertificate}
        termsDocument={termsDocument}
        isLoadingTermsDocument={isLoadingTermsDocument}
        termsDocumentError={termsDocumentError}
        onRetryTermsDocument={loadTermsDocument}
        photoValidation={photoValidation}
        hasCameraPermission={hasCameraPermission}
        cameraRef={cameraRef}
        onBack={handleRequestFlowBack}
        onContinueToDetails={handleContinueToDetails}
        onCapturePhoto={handleCapturePhoto}
        onUploadCertificate={handleUploadCertificate}
        onScanCertificate={handleScanCertificate}
        onRequestCameraPermission={requestCameraPermission}
        onContinueToWigs={handleContinueToWigs}
        onSubmitCapSize={handleSubmitCapSize}
        onChangeCapSize={() => setFlowStep("cap")}
        onReviewChoices={handleReviewChoices}
        onBackToStyles={() => setFlowStep("styles")}
        onStartGeneration={handleStartGeneration}
        onTryAnotherWig={handleTryAnotherWig}
        onUploadAnotherPhoto={handleUploadAnotherPhoto}
        onDownloadImage={handleDownloadImage}
        previewCaptureRef={wigPreviewCaptureRef}
        onSubmitRequest={handleSaveRequest}
        onSelectWig={handleToggleWig}
        safetyAssessment={safetyAssessment}
        isSavingSafety={isSavingSafety}
        onChangeSafety={handleChangeSafety}
        onSubmitSafety={handleSubmitSafety}
        roles={requestFlowRoles}
      />
      <SafetyAssessmentAnswersModal
        visible={isSafetyAnswersOpen}
        assessment={savedSafetyAssessment}
        onClose={() => setIsSafetyAnswersOpen(false)}
        roles={roles}
        resolvedTheme={resolvedTheme}
      />
      <CancelWigRequestModal
        visible={isCancelRequestModalOpen}
        requestCode={requestedWigCodeValue}
        daysRemaining={cancellationEligibility.daysRemaining}
        isCancelling={isCancellingRequest}
        onClose={() => setIsCancelRequestModalOpen(false)}
        onConfirm={handleConfirmCancelLatestRequest}
        roles={roles}
      />
      <WigReleaseAppealModal
        visible={isReleaseAppealModalOpen}
        isSaving={isSavingReleaseAction}
        onClose={() => {
          setIsReleaseAppealModalOpen(false);
          setHistoryAppealTarget(null);
        }}
        onSubmit={handleSubmitReleaseAppeal}
        roles={roles}
      />
      <WigReceiptConfirmationModal
        visible={isReleaseReceiptModalOpen}
        request={receiptConfirmationTarget?.request || latestWigRequest}
        receipt={receiptConfirmationTarget?.receipt || releaseReceipt}
        wig={receiptConfirmationTarget?.wig || requestWig}
        isSaving={isSavingReleaseAction}
        onClose={() => {
          setIsReleaseReceiptModalOpen(false);
          setReceiptConfirmationTarget(null);
        }}
        onConfirm={handleAcceptReleaseReceipt}
        roles={roles}
      />
      <FinishedWigRequestDetailsModal
        visible={Boolean(selectedHistoryRequest)}
        details={historyRequestDetails}
        isLoading={isLoadingHistoryDetails}
        onClose={handleCloseHistoryDetails}
        onDownload={handleDownloadReleaseReceipt}
        onReportProblem={handleReportHistoryProblem}
        roles={roles}
      />
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  historyDetailsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  historyDetailsHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historyRequestCode: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  historyCloseButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  historyDetailsLoading: {
    marginVertical: theme.spacing.xl,
  },
  historyStatusPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  historyStatusTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  historyWigHero: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 20,
    padding: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  historyWigImageFrame: {
    width: 112,
    height: 112,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  historyWigImage: {
    width: "100%",
    height: "100%",
  },
  historyWigHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  historyWigEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.5,
  },
  historyWigName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  historyWigCode: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  historyWigSummary: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  historyReleaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  historyCycleCounter: {
    minWidth: 46,
    height: 30,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  historyCycleCounterText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  historyReleaseCarousel: {
    gap: HISTORY_RELEASE_CYCLE_GAP,
    paddingRight: theme.spacing.lg,
  },
  historyReceiptCard: {
    width: HISTORY_RELEASE_CYCLE_CARD_WIDTH,
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  historyReceiptTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  historyReceiptIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  historyReceiptHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  historyCycleDots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  historyCycleDot: {
    height: 7,
    borderRadius: 4,
  },
  historyReceiptTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  historyAppealPanel: {
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  releaseModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  releaseModalCard: {
    maxHeight: "92%",
    borderWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  releaseModalContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  releaseModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    fontWeight: theme.typography.weights.bold,
  },
  releaseModalSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  releaseSummary: {
    borderWidth: 1,
    borderRadius: 16,
    padding: theme.spacing.md,
    gap: 5,
  },
  releaseSummaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  releaseSectionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.6,
  },
  receiptPhotoPreview: {
    width: "100%",
    height: 190,
    borderRadius: 16,
    resizeMode: "cover",
  },
  releasePhotoActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  releasePhotoActionCell: {
    flex: 1,
    minWidth: 0,
  },
  releaseTermsLoadingCard: {
    minHeight: 112,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  releaseTermsLoadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  releaseTermsErrorCard: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  releaseTermsErrorCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  releaseTermsErrorTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  releaseTermsErrorText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  releaseTermsRetry: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  releaseCheckboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  releaseCheckboxRowDisabled: {
    opacity: 0.48,
  },
  releaseCheckboxText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  appealResolution: {
    borderWidth: 1,
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: 4,
  },
  appealResolutionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  appealResolutionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  appealPhotoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  appealPhotoItem: {
    width: 76,
    height: 76,
    position: "relative",
  },
  appealPhotoImage: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  appealPhotoRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.palette.wine900,
  },
  releaseReceiptActions: {
    gap: theme.spacing.sm,
  },
  wigIntroSection: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  wigIntroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    lineHeight:
      theme.typography.semantic.titleMd * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  wigIntroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight:
      theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  simpleWigSection: {
    width: "100%",
    gap: theme.spacing.sm,
    paddingHorizontal: 0,
    paddingTop: theme.spacing.md,
    paddingBottom: 0,
  },
  simpleWigSectionEmpty: {
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  simpleWigSectionWithFloatingCancel: {
    paddingBottom: 78,
  },
  requestedWigSummaryCard: {
    width: "100%",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: 22,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  requestedWigSummaryPlain: {
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.xs,
    alignItems: "center",
  },
  wigRequestCheckingCard: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  requestedWigSummaryActive: {
    borderWidth: 0,
    borderRadius: 0,
    padding: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  wigJourneyAnimatedHost: {
    width: "100%",
    ...(Platform.OS === "web" ? {
      position: "sticky",
      top: 0,
      zIndex: 24,
      paddingBottom: theme.spacing.sm,
    } : null),
  },
  wigJourneyCard: {
    position: "relative",
    overflow: "hidden",
    minHeight: 236,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: 24,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  wigJourneyShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(23,17,20,0.08)",
  },
  wigJourneyGlow: {
    position: "absolute",
    width: 156,
    height: 156,
    top: -98,
    right: -44,
    borderRadius: 78,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  wigJourneyTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  wigJourneyHeaderIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  wigJourneyHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  wigJourneyHeaderEyebrow: {
    color: "rgba(255,255,255,0.76)",
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 1,
  },
  wigJourneyHeaderTitle: {
    color: "#FFFFFF",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    lineHeight: 21,
    fontWeight: theme.typography.weights.bold,
  },
  wigJourneyTopIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  wigJourneyHeadingCopy: {
    gap: 3,
  },
  wigJourneyEyebrow: {
    color: "rgba(255,255,255,0.74)",
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 1,
    opacity: 0.78,
  },
  wigJourneyTitle: {
    color: "#FFFFFF",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: 27,
    fontWeight: theme.typography.weights.bold,
  },
  wigJourneyReference: {
    color: "rgba(255,255,255,0.78)",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
    opacity: 0.76,
  },
  wigJourneyTimelineContent: {
    minWidth: "100%",
    paddingTop: theme.spacing.xs,
    paddingBottom: 2,
    paddingHorizontal: 2,
  },
  wigJourneyStage: {
    position: "relative",
    width: 84,
    alignItems: "center",
    gap: 7,
  },
  wigJourneyStageMarker: {
    zIndex: 2,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 17,
  },
  wigJourneyConnector: {
    position: "absolute",
    zIndex: 1,
    top: 16,
    left: -25,
    width: 50,
    height: 3,
    borderRadius: theme.radius.full,
  },
  wigJourneyStageLabel: {
    width: 78,
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: theme.typography.weights.semibold,
    textAlign: "center",
  },
  wigJourneyStageEstimate: {
    width: 88,
    color: "rgba(255,255,255,0.78)",
    fontFamily: theme.typography.fontFamily,
    fontSize: 8,
    lineHeight: 11,
    textAlign: "center",
  },
  inlineWigDetailsSection: {
    width: "100%",
    gap: theme.spacing.md,
    paddingHorizontal: 2,
    paddingVertical: theme.spacing.xs,
  },
  inlineWigDetailsHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  inlineWigDetailsIcon: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  inlineWigDetailsHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  inlineWigDetailsTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  inlineWigDetailsHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
  },
  inlineWigCodePill: {
    maxWidth: 104,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
  },
  inlineWigCodeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  inlineWigSelection: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  inlineWigSelectionImage: {
    width: 82,
    height: 82,
    flexShrink: 0,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundMuted,
  },
  inlineWigSelectionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  inlineWigSelectionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.8,
  },
  inlineWigSelectionName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    lineHeight: 20,
  },
  inlineWigSelectionHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
  },
  inlineWigDetailsDivider: {
    width: "100%",
    height: StyleSheet.hairlineWidth,
  },
  inlineWigDetailsList: {
    width: "100%",
  },
  inlineWigDetailRow: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  inlineWigDetailLabel: {
    width: "38%",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  inlineWigDetailValue: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: 18,
    fontWeight: theme.typography.weights.semibold,
  },
  inlineWigDetailDivider: {
    width: "100%",
    height: StyleSheet.hairlineWidth,
  },
  requestQuickActions: {
    width: "100%",
    gap: theme.spacing.sm,
  },
  receiptActionCard: {
    width: "100%",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 24,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  activeRequestHeading: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  receiptActionIcon: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  receiptActionEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 1,
  },
  receiptActionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  receiptActionDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: 19,
    textAlign: "center",
  },
  receiptActionMeta: {
    width: "100%",
    borderRadius: 14,
    padding: theme.spacing.md,
    gap: 3,
  },
  receiptActionMetaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textAlign: "center",
  },
  previousRequestsSection: {
    width: "100%",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  previousRequestsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    ...(Platform.OS === "web" ? {
      position: "sticky",
      top: 0,
      zIndex: 25,
    } : null),
  },
  previousRequestsTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  previousRequestsCount: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  previousRequestCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 20,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  previousRequestTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  previousRequestCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previousRequestCode: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  previousRequestStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  previousRequestWigName: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  previousRequestMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  expectedReleaseCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: 22,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  expectedReleaseIcon: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  expectedReleaseCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  expectedReleaseEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.8,
  },
  expectedReleaseDate: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  expectedReleaseTime: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  expectedReleaseDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  expectedReleaseNote: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
    fontStyle: "italic",
  },
  requestQuickAction: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 22,
    padding: 0,
    ...theme.shadows.soft,
  },
  requestQuickActionRow: {
    width: "100%",
    minHeight: 74,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderRadius: 21,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  requestQuickActionIcon: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  requestQuickActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  requestQuickActionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  requestQuickActionHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
  },
  requestQuickActionArrow: {
    width: 34,
    height: 34,
    flexShrink: 0,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  cancelRequestFloatingHost: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 112,
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    zIndex: 40,
  },
  cancelRequestFloatingButton: {
    width: "100%",
    maxWidth: 230,
    borderRadius: 31,
    overflow: "hidden",
    shadowColor: theme.colors.palette.wine900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 12,
  },
  cancelRequestFloatingContent: {
    width: "100%",
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    borderRadius: 31,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 9,
  },
  cancelRequestFloatingInner: {
    width: "100%",
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  cancelRequestFloatingButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.97 }],
  },
  cancelRequestFloatingIcon: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  cancelRequestFloatingCopy: {
    width: "100%",
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 38,
  },
  cancelRequestFloatingTitle: {
    color: "#FFFFFF",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  cancelRequestFloatingHint: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 13,
    textAlign: "center",
  },
  cancelRequestModalRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  cancelRequestModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  cancelRequestModalCard: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: 26,
    padding: theme.spacing.lg,
    ...theme.shadows.lg,
  },
  cancelRequestModalIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "rgba(186,31,51,0.1)",
  },
  cancelRequestModalCopy: {
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  cancelRequestModalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  cancelRequestModalText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: 19,
    textAlign: "center",
  },
  cancelRequestPolicyCard: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: 16,
    padding: theme.spacing.sm,
  },
  cancelRequestPolicyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cancelRequestPolicyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  cancelRequestPolicyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  cancelRequestCode: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textAlign: "center",
  },
  cancelRequestModalActions: {
    width: "100%",
    gap: theme.spacing.sm,
  },
  cancelRequestKeepButton: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    ...theme.shadows.sm,
  },
  cancelRequestKeepText: {
    color: "#FFFFFF",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  cancelRequestConfirmButton: {
    width: "100%",
    borderRadius: 18,
    overflow: "hidden",
    ...theme.shadows.sm,
  },
  cancelRequestActionGradient: {
    minHeight: 50,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 18,
    paddingHorizontal: theme.spacing.sm,
  },
  cancelRequestActionPressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  cancelRequestConfirmText: {
    color: "#FFFFFF",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  wigRequestCheckingIcon: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  wigRequestCheckingCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  wigRequestCheckingTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  wigRequestCheckingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  wigRequestEmptyCard: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 24,
    padding: theme.spacing.lg,
    alignItems: "center",
    gap: theme.spacing.md,
    overflow: "hidden",
    ...theme.shadows.soft,
  },
  wigRequestArtwork: {
    width: 92,
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  wigRequestArtworkRing: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    borderStyle: "dashed",
    opacity: 0.85,
  },
  wigRequestArtworkIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  wigRequestArtworkAccent: {
    position: "absolute",
    right: 1,
    top: 5,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  wigRequestEmptyCopy: {
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  wigRequestEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 1.1,
  },
  wigRequestEmptyTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight:
      theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  wigRequestEmptyMessage: {
    maxWidth: 300,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: 19,
    textAlign: "center",
  },
  wigRequestGuideRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  wigRequestGuideStep: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 6,
  },
  wigRequestGuideIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  wigRequestGuideLabel: {
    minHeight: 27,
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: theme.typography.weights.semibold,
    textAlign: "center",
  },
  wigRequestPrimaryAction: {
    borderRadius: 17,
  },
  wigRequestPrivacyNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  wigRequestPrivacyText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight:
      theme.typography.semantic.caption * theme.typography.lineHeights.normal,
    textAlign: "center",
  },
  simpleRecordHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  simpleRecordHeaderEmpty: {
    flexDirection: "column",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  aiTabIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  aiTabTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  aiTabBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight:
      theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  currentRequestCard: {
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: 20,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  currentRequestHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  currentRequestHeaderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  currentRequestBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  currentRequestIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  currentRequestCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timelineIconButton: {
    alignSelf: "flex-start",
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  currentRequestLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  currentRequestTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  currentRequestActions: {
    marginTop: theme.spacing.xs,
  },
  requestChoiceGrid: {
    gap: theme.spacing.lg,
  },
  referralCard: {
    overflow: "hidden",
  },
  referralCardHeader: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  requestedWigIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  referralIdentityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  referralIdentityCopyEmpty: {
    flex: 0,
    alignItems: "center",
  },
  referralHospitalName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyMd,
    fontWeight: theme.typography.weights.bold,
  },
  referralHospitalNameEmpty: {
    textAlign: "center",
  },
  recordDetailSection: {
    paddingTop: 0,
  },
  requestFlowCopy: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight:
      theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
  },
  requestFlowCopyEmpty: {
    maxWidth: 260,
    textAlign: "center",
  },
  requestedWigStatusRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
  },
  requestedWigStatusPill: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  requestedWigStatusLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.25,
  },
  requestedWigStatusValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    lineHeight: 18,
  },
  requestedWigSectionHeading: {
    gap: 2,
    paddingTop: theme.spacing.xs,
  },
  requestedWigSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  currentRequestHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  requestedWigSectionHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  viewSafetyAssessmentAction: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: 16,
    padding: theme.spacing.sm,
  },
  viewSafetyAssessmentIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  viewSafetyAssessmentCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  viewSafetyAssessmentText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  viewSafetyAssessmentHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
  },
  requestedWigPendingNote: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  requestedWigPendingText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight:
      theme.typography.compact.bodySm * theme.typography.lineHeights.normal,
  },
  requestedWigEmptyLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  requestedWigEmptyText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight:
      theme.typography.compact.bodySm * theme.typography.lineHeights.normal,
  },
  manualRequestCard: {
    gap: theme.spacing.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
  },
  manualRequestIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  manualRequestTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  manualRequestBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
    textTransform: "uppercase",
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  previewGrid: {
    gap: theme.spacing.xs,
  },
  previewRow: {
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderMuted,
  },
  previewLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  previewValue: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.normal,
    color: theme.colors.textPrimary,
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  singleActionRow: {
    width: "100%",
    marginTop: theme.spacing.xs,
  },
  actionButton: {
    flex: 1,
  },
  preferencesFlow: {
    gap: theme.spacing.xl,
  },
  preferencesHeaderBlock: {
    alignItems: "flex-start",
    gap: theme.spacing.xs,
  },
  preferencesTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight:
      theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  preferencesBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight:
      theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
  },
  fitPanel: {
    minHeight: 84,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderMuted,
  },
  fitNoticeIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    alignItems: "center",
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  preferenceLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  preferenceChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  preferenceChip: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  preferenceChipRecommended: {
    backgroundColor: "transparent",
  },
  aiChipBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
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
  capSizeOptionGrid: {
    width: "100%",
    justifyContent: "space-between",
  },
  capSizeOptionShell: {
    width: "31.5%",
    minHeight: 138,
    borderRadius: theme.radius.lg,
    ...theme.shadows.soft,
  },
  capSizeOption: {
    width: "100%",
    minHeight: 138,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    paddingHorizontal: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  capSizeOptionGradient: {
    position: "relative",
    width: "100%",
    minHeight: 135,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: theme.radius.lg - 1,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  capSizeOptionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  capSizeOptionText: {
    maxWidth: "100%",
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  capSizeOptionState: {
    maxWidth: "100%",
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  capSizeMeasurementPill: {
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
  },
  capSizeMeasurementText: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  capSizeRadio: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  capSizeSelectionConfirmation: {
    alignSelf: "flex-start",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
  },
  capSizeSelectionConfirmationText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  preferenceSelectedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  styleSelectionGrid: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  styleOption: {
    flex: 1,
    minHeight: 104,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.sm,
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
    gap: theme.spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    padding: theme.spacing.sm,
  },
  colorSwatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  colorSwatchButton: {
    position: "relative",
    width: 76,
    minHeight: 76,
    gap: theme.spacing.xs,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.xs,
  },
  colorAiBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSelectedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  colorSwatchLabel: {
    maxWidth: "100%",
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  preferenceHelperText: {
    marginTop: -theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontStyle: "italic",
  },
  preferenceChoiceGrid: {
    gap: theme.spacing.sm,
  },
  preferenceChoiceCard: {
    gap: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    borderWidth: 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  preferenceChoiceHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  matcherFlow: {
    gap: theme.spacing.lg,
  },
  matcherHeroHeader: {
    position: "relative",
    overflow: "hidden",
    gap: theme.spacing.xs,
    minHeight: 156,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  matcherHeroGlow: {
    position: "absolute",
    width: 150,
    height: 150,
    right: -42,
    top: -82,
    borderRadius: 75,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  matcherHeroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  matcherHeroIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  matcherCountPill: {
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  matcherCountText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.45,
    color: theme.colors.palette.wine800,
  },
  matcherHeroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight:
      theme.typography.semantic.titleSm * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
  },
  matcherHeroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textHeroSoft,
  },
  matcherSkeletonCard: {
    gap: theme.spacing.xl,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    padding: theme.spacing.lg,
  },
  matcherLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
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
    textTransform: "uppercase",
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
    borderRadius: theme.radius.md,
  },
  matcherSkeletonPills: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  matcherSkeletonPillWide: {
    width: "40%",
    height: 22,
    borderRadius: theme.radius.full,
  },
  matcherSkeletonPill: {
    width: "28%",
    height: 22,
    borderRadius: theme.radius.full,
  },
  matcherSkeletonLine: {
    height: 44,
    borderRadius: theme.radius.md,
  },
  matcherRecommendationsSection: {
    gap: theme.spacing.lg,
  },
  matcherSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    position: "relative",
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    borderWidth: 2,
    ...theme.shadows.card,
  },
  matcherBadge: {
    position: "absolute",
    top: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
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
    position: "relative",
    width: "100%",
    aspectRatio: 0.95,
  },
  matcherImage: {
    width: "100%",
    height: "100%",
  },
  matcherWigOverlay: {
    position: "absolute",
  },
  matcherImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  matcherImageShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "35%",
  },
  matcherRankBadge: {
    position: "absolute",
    top: theme.spacing.md,
    left: theme.spacing.md,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.94)",
    ...theme.shadows.soft,
  },
  matcherRankText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.55,
    color: theme.colors.palette.wine800,
  },
  matcherSelectedBadge: {
    position: "absolute",
    top: theme.spacing.md,
    right: theme.spacing.md,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(104,26,46,0.94)",
    ...theme.shadows.soft,
  },
  matcherSelectedBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  matcherCardPrice: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  matcherFavoriteButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  agreementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  checkBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.xs,
  },
  resultCard: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderColor: theme.colors.borderMuted,
  },
  resultHeader: {
    marginBottom: theme.spacing.md,
    alignItems: "center",
  },
  resultHeaderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  resultHero: {
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  resultBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
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
    backgroundColor: "#e4efff",
    borderWidth: 2,
    borderColor: "#87b7ff",
    ...theme.shadows.soft,
  },
  resultCircleInner: {
    width: "100%",
    height: "100%",
    borderRadius: 104,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceSoft,
  },
  resultHeroImage: {
    width: "100%",
    height: "100%",
  },
  resultHeroPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  resultStyleTitle: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  resultStyleFamily: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    marginBottom: theme.spacing.xs,
  },
  resultSummary: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  resultMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  metaPill: {
    minWidth: "30%",
    flexGrow: 1,
    gap: 4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
  },
  metaLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: "uppercase",
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
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  optionCard: {
    width: 136,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  optionCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  optionCardActive: {
    borderColor: "#87b7ff",
    backgroundColor: "#f4f8ff",
  },
  optionImageWrap: {
    height: 92,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceSoft,
    marginBottom: theme.spacing.sm,
  },
  optionImage: {
    width: "100%",
    height: "100%",
  },
  optionImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  optionName: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  optionMatch: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    marginBottom: 4,
  },
  optionNote: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  tryOnButton: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  tryOnButtonActive: {
    backgroundColor: "#4f8fe8",
    borderColor: "#4f8fe8",
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
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.overlay,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalCard: {
    width: "100%",
    alignSelf: "center",
    maxWidth: theme.layout.contentMaxWidth,
  },
  calibrationCard: {
    width: "100%",
    alignSelf: "center",
    maxWidth: 420,
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.backgroundPrimary,
    ...theme.shadows.lg,
  },
  calibrationHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    textAlign: "right",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  calibrationSliderTouchArea: {
    minHeight: 34,
    justifyContent: "center",
  },
  calibrationSliderTrack: {
    position: "relative",
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceDisabled,
  },
  calibrationSliderFill: {
    height: "100%",
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
  },
  calibrationSliderThumb: {
    position: "absolute",
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
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  captureFullScreen: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    maxWidth: theme.layout.contentMaxWidth,
    backgroundColor: theme.colors.backgroundCanvas,
  },
  captureHeaderBar: {
    width: "100%",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255, 255, 255, 0.14)",
  },
  captureHeaderRow: {
    position: "relative",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  captureHeaderButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  captureHeaderTitle: {
    position: "absolute",
    left: 84,
    right: 84,
    textAlign: "center",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight:
      theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  captureHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginLeft: "auto",
  },
  captureScroll: {
    flex: 1,
  },
  captureScrollContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  flowKeyboardWrap: {
    flex: 1,
  },
  flowFullScreen: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    maxWidth: theme.layout.contentMaxWidth,
  },
  flowTopBar: {
    position: "relative",
    overflow: "hidden",
    width: "100%",
    paddingHorizontal: theme.spacing.md,
    minHeight: 68,
    paddingVertical: 0,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  flowTopBarGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -38,
    top: -76,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  requestFlowHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  requestFlowBackButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  requestFlowHeaderTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    lineHeight:
      theme.typography.semantic.body * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  requestFlowHeaderSpacer: {
    width: 40,
    height: 40,
  },
  flowScroll: {
    flex: 1,
  },
  flowScrollContent: {
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.md,
  },
  flowSection: {
    gap: theme.spacing.md,
  },
  patientIdentityStickyHost: {
    zIndex: 12,
    width: "100%",
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  confirmDetailsHero: {
    position: "relative",
    overflow: "hidden",
    minHeight: 132,
    gap: theme.spacing.sm,
    borderRadius: 24,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  confirmDetailsGlow: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    right: -46,
    top: -70,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  patientRecordPill: {
    alignSelf: "flex-start",
    minHeight: 27,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.26)",
  },
  confirmDetailsEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.8,
    color: "#FFFFFF",
  },
  flowTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight:
      theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  requestFlowSectionHeader: {
    gap: theme.spacing.xs,
  },
  selectionSummaryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight:
      theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
    fontStyle: "italic",
    color: theme.colors.textSecondary,
  },
  wigPreviewPanel: {
    flexDirection: "row",
    gap: theme.spacing.md,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
  },
  wigPreviewImageFrame: {
    width: 108,
    height: 108,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    flexShrink: 0,
  },
  wigPreviewImage: {
    width: "100%",
    height: "100%",
  },
  wigPreviewPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  wigPreviewCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  wigPreviewTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight:
      theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.bold,
  },
  wigPreviewMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  wigPreviewBadgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  wigStockPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  wigStockLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  wigStockValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  wigSelectedPill: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
  },
  wigSelectedPillText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  patientHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingTop: 2,
  },
  patientAvatarCircle: {
    width: 74,
    height: 74,
    borderRadius: theme.radius.full,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    ...theme.shadows.card,
  },
  patientAvatarImage: {
    width: "100%",
    height: "100%",
  },
  patientHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  patientHeroName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
    flexShrink: 1,
  },
  patientHeroMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  patientIdentityVerifiedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.72)",
    ...theme.shadows.soft,
  },
  documentPreviewCard: {
    borderWidth: 1,
    borderRadius: 22,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    overflow: "hidden",
    ...theme.shadows.soft,
  },
  documentPreviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  documentModuleHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  documentFileRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: 14,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  documentFileName: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: 18,
    fontWeight: theme.typography.weights.semibold,
  },
  documentPreviewFrame: {
    height: 190,
    borderWidth: 1,
    borderRadius: 16,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  documentPreviewPressable: {
    width: "100%",
    height: 188,
    position: "relative",
  },
  documentPreviewImage: {
    width: "100%",
    height: "100%",
  },
  documentPreviewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    opacity: 0.96,
  },
  documentPreviewLoadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  documentPreviewZoomAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  documentPreviewZoomBadge: {
    minWidth: 86,
    minHeight: 32,
    borderRadius: theme.radius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.36)",
    ...theme.shadows.soft,
  },
  documentPreviewZoomText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  documentFullPreviewRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12, 5, 8, 0.94)",
  },
  documentFullPreviewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  documentFullPreviewHeader: {
    position: "absolute",
    top: theme.spacing.xl,
    left: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 2,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  documentFullPreviewTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: "#ffffff",
  },
  documentFullPreviewClose: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
  },
  documentFullPreviewImage: {
    width: "100%",
    height: "100%",
  },
  documentFullPreviewPdf: {
    position: "absolute",
    top: 72,
    right: 0,
    bottom: 0,
    left: 0,
  },
  documentPreviewPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  documentPreviewPlaceholderText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    textAlign: "center",
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  documentRowCard: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  documentRowIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceSoft,
  },
  documentRowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  documentRowLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  documentRowValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  documentRowStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  documentStatusPill: {
    minHeight: 28,
    maxWidth: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
  },
  certificateActionRow: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
  },
  certificateActionCell: {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  certificateActionButton: {
    width: "100%",
    minHeight: 50,
    borderRadius: 16,
    overflow: "hidden",
  },
  certificateActionGradient: {
    minHeight: 50,
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: theme.spacing.xs,
  },
  certificateActionText: {
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.bold,
    textAlign: "center",
  },
  safetyAssessmentCard: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  safetyChoiceRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: theme.spacing.sm,
  },
  safetyChoiceLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  safetyChoiceActions: {
    flexDirection: "row",
    gap: theme.spacing.xs,
  },
  safetyChoiceButton: {
    minWidth: 52,
    minHeight: 36,
    borderWidth: 1,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  safetyChoiceButtonText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  safetyDetailInput: {
    borderRadius: 6,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  safetyAnswersModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  safetyAnswersBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(20, 20, 24, 0.48)",
  },
  safetyAnswersSheet: {
    width: "100%",
    maxHeight: "84%",
    overflow: "hidden",
    borderWidth: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    ...theme.shadows.lg,
  },
  safetyAnswersHandle: {
    position: "absolute",
    zIndex: 3,
    top: 8,
    left: "44%",
    width: "12%",
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: "rgba(255,255,255,0.54)",
  },
  safetyAnswersHeader: {
    minHeight: 126,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  safetyAnswersHeaderIcon: {
    width: 44,
    height: 44,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  safetyAnswersHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  safetyAnswersTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    fontWeight: theme.typography.weights.bold,
  },
  safetyAnswersStatus: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    opacity: 0.78,
  },
  safetyAnswersClose: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  safetyAnswersList: {
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
  },
  safetyAnswerRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: 16,
    padding: theme.spacing.sm,
  },
  safetyAnswerIcon: {
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  safetyAnswerLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  safetyAnswerValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  safetyAnswerPill: {
    minWidth: 48,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
  },
  safetyAnswerDetails: {
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    padding: theme.spacing.md,
  },
  safetyAnswerDetailsText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  certificateIconButton: {
    width: 54,
    height: 54,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  certificateIconButtonPrimary: {
    backgroundColor: theme.colors.brandPrimary,
    borderColor: theme.colors.brandPrimary,
    ...theme.shadows.soft,
  },
  certificateIconButtonDisabled: {
    opacity: 0.45,
  },
  agreementRowCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  termsAgreementCheckRow: {
    width: "100%",
    alignSelf: "stretch",
    borderWidth: 1,
    borderRadius: 18,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  termsAgreementCheckRowDisabled: {
    opacity: 0.55,
  },
  termsAgreementContentRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: theme.spacing.sm,
  },
  termsAgreementLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: 18,
    fontWeight: theme.typography.weights.semibold,
  },
  termsRequiredPill: {
    minHeight: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    flexShrink: 0,
  },
  termsRequiredText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  termsAgreementCheckBox: {
    flexShrink: 0,
  },
  termsAgreementCard: {
    gap: theme.spacing.md,
  },
  termsAgreementHeader: {
    position: "relative",
    overflow: "hidden",
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: 22,
    padding: theme.spacing.md,
    ...theme.shadows.card,
  },
  termsAgreementHeaderGlow: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    right: -30,
    top: -60,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  termsAgreementIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  termsAgreementHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  termsAgreementTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
  },
  termsAgreementHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
    color: "#F7DDE4",
  },
  termsVersionPill: {
    minHeight: 28,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  termsVersionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.palette.wine800,
  },
  termsLoadingRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  termsLoadingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  termsErrorRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: 16,
    padding: theme.spacing.sm,
  },
  termsErrorText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 16,
  },
  termsRetryButton: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  termsRetryText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  stylesActionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    alignItems: "center",
  },
  stylesActionFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  patientApproveFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.sm,
    backgroundColor: "transparent",
  },
  summarySubmitFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 32,
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.sm,
    backgroundColor: "transparent",
  },
  summarySubmitButton: {
    width: "100%",
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    ...theme.shadows.hero,
  },
  summarySubmitButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  summarySubmitButtonGradient: {
    width: "100%",
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.lg,
  },
  summarySubmitButtonText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.2,
  },
  patientInlineApproveSlot: {
    width: "100%",
    minHeight: 64,
    justifyContent: "flex-start",
  },
  stylesActionButton: {
    flex: 1,
    minWidth: 0,
  },
  capSizeSelectionCard: {
    position: "relative",
    gap: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    padding: theme.spacing.lg,
    overflow: "hidden",
    ...theme.shadows.card,
  },
  capSizeCardGlow: {
    position: "absolute",
    width: 140,
    height: 140,
    top: -82,
    right: -46,
    borderRadius: 70,
    backgroundColor: "rgba(143,34,67,0.08)",
  },
  capSizeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  capSizeSelectionIcon: {
    width: 46,
    height: 46,
    flexShrink: 0,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  capSizeSectionHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  capSizeEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.7,
  },
  wigFlowPrimaryButton: {
    borderRadius: theme.radius.xl,
    ...theme.shadows.hero,
  },
  wigGalleryIntroCard: {
    position: "relative",
    minHeight: 128,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    overflow: "hidden",
    ...theme.shadows.hero,
  },
  wigGalleryIntroIcon: {
    width: 50,
    height: 50,
    borderRadius: theme.radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  wigGalleryIntroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  wigGallerySelectionCount: {
    minWidth: 46,
    height: 34,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  wigGallerySelectionCountText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.palette.wine800,
  },
  wigGalleryGrid: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: theme.spacing.md,
  },
  wigGalleryCell: {
    width: "48%",
    maxWidth: "48%",
    flexBasis: "48%",
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: theme.radius.xl,
  },
  wigGalleryStatusCard: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.soft,
  },
  wigGalleryStatusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  wigGalleryEmptyCard: {
    minHeight: 214,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  wigGalleryEmptyIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  wigGalleryEmptyCopy: {
    alignItems: "center",
    gap: 4,
  },
  wigGalleryCard: {
    width: "100%",
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    overflow: "hidden",
    ...theme.shadows.card,
  },
  wigGalleryCardSelected: {
    borderWidth: 2,
    ...theme.shadows.hero,
  },
  wigGalleryCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.975 }],
  },
  wigGalleryImageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: 0.88,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceSoft,
  },
  wigGalleryImage: {
    width: "100%",
    height: "100%",
  },
  wigGalleryImageShade: {
    ...StyleSheet.absoluteFillObject,
  },
  wigGalleryInfoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: "68%",
    justifyContent: "flex-end",
    padding: theme.spacing.sm,
    paddingTop: theme.spacing.xl,
  },
  wigGalleryInfoCopy: {
    minWidth: 0,
    gap: 5,
  },
  wigGalleryOverlayTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
  },
  wigGalleryOverlayMeta: {
    flex: 1,
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
    fontWeight: theme.typography.weights.semibold,
    color: "rgba(255,255,255,0.94)",
  },
  wigGalleryOverlayDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
    color: "rgba(255,255,255,0.82)",
  },
  wigGalleryOverlayAvailability: {
    alignSelf: "flex-start",
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  wigGalleryOverlayAvailabilityText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: "#FFFFFF",
  },
  wigGalleryChoiceBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  wigGalleryChoiceBadgeSelected: {
    backgroundColor: theme.colors.palette.wine700,
  },
  wigGalleryAiBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(255,255,255,0.94)",
    ...theme.shadows.soft,
  },
  wigGalleryAiBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.45,
    color: theme.colors.palette.wine800,
  },
  wigGalleryReason: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: theme.spacing.sm,
  },
  wigGalleryReasonText: {
    flex: 1,
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
  },
  wigGalleryChoiceBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.palette.wine800,
  },
  wigGalleryChoiceBadgeTextSelected: {
    color: "#FFFFFF",
  },
  wigGalleryCopy: {
    flex: 1,
    gap: 6,
    padding: theme.spacing.md,
  },
  wigGalleryTitle: {
    minHeight: 38,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
  },
  wigGalleryMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  wigGalleryMeta: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  wigGalleryDescription: {
    minHeight: 30,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  wigGalleryAvailabilityPill: {
    alignSelf: "flex-start",
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
  },
  wigGalleryAvailabilityDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
  },
  wigGalleryAvailabilityText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  confirmWigGrid: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: theme.spacing.sm,
    rowGap: theme.spacing.md,
  },
  confirmChoicesFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 34,
    width: "100%",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl,
  },
  confirmChoicesFooterRow: {
    width: "100%",
    maxWidth: theme.layout.contentMaxWidth,
    alignSelf: "center",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "center",
    gap: theme.spacing.sm,
  },
  confirmChoicesAction: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
  },
  confirmChoicesPrimaryAction: {
    flex: 1,
    ...theme.shadows.hero,
  },
  confirmChoicesActionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  confirmChoicesActionGradient: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.sm,
  },
  confirmChoicesButtonLabel: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  confirmChoicesEditText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  confirmChoicesConfirmText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
  },
  wigStyleList: {
    gap: theme.spacing.sm,
  },
  wigStyleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    padding: theme.spacing.md,
    minHeight: 92,
  },
  wigStyleCardSelected: {
    borderWidth: 2,
    padding: theme.spacing.md - 1,
  },
  wigStyleCardPressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
  wigStyleThumbWrap: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: "hidden",
    flexShrink: 0,
  },
  wigStyleThumb: {
    width: "100%",
    height: "100%",
  },
  wigStyleThumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  wigStyleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  wigStyleTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.bold,
  },
  wigStyleSpec: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight:
      theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  patientReviewHeader: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  patientEditButton: {
    minWidth: 76,
  },
  patientMediaGrid: {
    gap: theme.spacing.sm,
  },
  patientMediaCard: {
    gap: theme.spacing.xs,
  },
  patientMediaHeader: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  patientMediaTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  patientPhotoPreview: {
    width: "100%",
    height: 160,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceSoft,
  },
  patientMediaEmpty: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  patientMediaEmptyText: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  patientDocumentName: {
    minHeight: 28,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.normal,
  },
  requestFlowCompactAction: {
    width: "100%",
    minHeight: 38,
    alignSelf: "stretch",
    marginTop: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  requestFlowCompactActionText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  flowBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  photoPreviewBox: {
    minHeight: 180,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
  },
  photoPreviewImage: {
    width: "100%",
    height: 210,
  },
  photoFlowSection: {
    paddingBottom: theme.spacing.sm,
  },
  photoGuideCard: {
    position: "relative",
    overflow: "hidden",
    minHeight: 118,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.card,
  },
  photoGuideGlow: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    right: -34,
    top: -72,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  photoGuideIcon: {
    width: 52,
    height: 52,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  photoGuideCopy: {
    flex: 1,
    gap: 3,
  },
  photoGuideEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.75,
    color: theme.colors.textHeroMuted,
  },
  photoGuideTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight:
      theme.typography.semantic.bodyLg * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
  },
  photoGuideBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight:
      theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textHeroSoft,
  },
  aiPhotoStage: {
    position: "relative",
    minHeight: 300,
    overflow: "hidden",
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    ...theme.shadows.soft,
  },
  aiPhotoPreview: {
    width: "100%",
    height: 300,
  },
  aiPhotoPlaceholder: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  aiPhotoPlaceholderIcon: {
    width: 68,
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  aiPhotoPlaceholderCopy: {
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  aiPhotoPlaceholderTitle: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  aiPhotoPlaceholderText: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  photoTipsRow: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
  },
  photoTipPill: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  photoTipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.medium,
  },
  photoCameraGuideOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  photoFaceGuide: {
    width: 174,
    height: 222,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    borderRadius: 88,
  },
  photoCameraGuidePill: {
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.md,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: "rgba(75,16,32,0.86)",
  },
  photoCameraGuideText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  photoReadyPill: {
    position: "absolute",
    top: theme.spacing.md,
    right: theme.spacing.md,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(25,122,77,0.92)",
    ...theme.shadows.soft,
  },
  photoReadyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
  },
  photoCameraAction: {
    borderRadius: theme.radius.md,
  },
  photoReviewActions: {
    width: 232,
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "stretch",
    gap: theme.spacing.sm,
  },
  photoReviewActionCell: {
    width: 112,
    maxWidth: 112,
    flexBasis: 112,
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    minHeight: 52,
    overflow: "hidden",
    borderRadius: theme.radius.xl,
    ...theme.shadows.card,
  },
  photoReviewActionGradient: {
    width: "100%",
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.sm,
  },
  photoReviewActionPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  photoReviewActionDisabled: {
    opacity: 0.5,
  },
  photoReviewSecondaryText: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  photoReviewPrimaryText: {
    flexShrink: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
  },
  aiGeneratingState: {
    minHeight: 420,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.xl,
  },
  aiResultGrid: {
    gap: theme.spacing.md,
  },
  summaryPreviewFanViewport: {
    width: "100%",
    height: 354,
    flexGrow: 0,
    flexShrink: 0,
  },
  summaryPreviewGallery: {
    minHeight: 354,
    alignItems: "flex-start",
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  summaryPreviewFanSlot: {
    height: 334,
    minHeight: 334,
    maxHeight: 334,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
  },
  summaryPreviewTile: {
    position: "relative",
    width: "100%",
    height: 320,
    minHeight: 320,
    maxHeight: 320,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    ...theme.shadows.card,
  },
  summaryPreviewTileSelected: {
    borderWidth: 2,
    ...theme.shadows.hero,
  },
  summaryPreviewTilePressed: {
    opacity: 0.86,
  },
  summaryPreviewImage: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: 320,
    borderRadius: theme.radius.xl,
  },
  summaryPreviewPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.xl,
  },
  summaryPreviewInfoOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    width: "100%",
    height: 320,
    justifyContent: "flex-end",
    borderRadius: theme.radius.xl,
    padding: theme.spacing.md,
    paddingTop: 88,
  },
  summaryPreviewDetails: {
    minWidth: 0,
    gap: 5,
  },
  summaryPreviewTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.snug,
    fontWeight: theme.typography.weights.bold,
    color: "#FFFFFF",
  },
  summaryPreviewMatch: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: "#F7DDE4",
  },
  summaryPreviewReasonRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    marginTop: 3,
    paddingTop: theme.spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.28)",
  },
  summaryPreviewReasonText: {
    flex: 1,
    flexShrink: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: 15,
    color: "rgba(255,255,255,0.92)",
  },
  summaryPreviewRankBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    left: theme.spacing.sm,
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: theme.radius.full,
    paddingHorizontal: 7,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  summaryPreviewRankText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.5,
    color: theme.colors.palette.wine800,
  },
  summaryPreviewSelectedBadge: {
    position: "absolute",
    top: theme.spacing.sm,
    right: theme.spacing.sm,
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: "rgba(104,26,46,0.94)",
  },
  summaryPreviewChooseBadge: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(104,26,46,0.18)",
  },
  summaryPreviewSelectedText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textInverse,
  },
  summaryPreviewChooseText: {
    color: theme.colors.palette.wine800,
  },
  summaryGalleryHint: {
    width: "100%",
    maxWidth: 330,
    alignSelf: "center",
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    overflow: "hidden",
    ...theme.shadows.soft,
  },
  summaryGalleryHintIcon: {
    width: 30,
    height: 30,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
  },
  summaryGalleryHintText: {
    flex: 1,
    flexShrink: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  matcherCarouselViewport: {
    width: "100%",
    overflow: "hidden",
    borderRadius: theme.radius.lg,
  },
  aiRecommendationRow: {
    gap: theme.spacing.md,
    paddingRight: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  aiRecommendationCard: {
    flexShrink: 0,
  },
  matcherCarouselNavigation: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  matcherPagination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  matcherPaginationDot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
  },
  matcherPaginationDotActive: {
    width: 24,
  },
  matcherSwipeHint: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
  },
  matcherSwipeHintText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  aiRecommendationReason: {
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.soft,
  },
  aiRecommendationReasonHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  aiRecommendationReasonIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  aiRecommendationReasonHeading: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  aiRecommendationReasonTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
  aiRecommendationReasonMatch: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  aiResultPanel: {
    gap: theme.spacing.xs,
  },
  aiPreviewCard: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  aiPreviewCardHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  aiPreviewHint: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
  },
  aiPreviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  aiPreviewBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.bold,
  },
  aiResultLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  aiResultImage: {
    width: "100%",
    height: 340,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSoft,
  },
  aiCompositeShell: {
    gap: theme.spacing.sm,
  },
  aiCompositeFrame: {
    overflow: "hidden",
    position: "relative",
  },
  aiCompositeFrameCompact: {
    height: 220,
  },
  aiCompositeBaseImage: {
    width: "100%",
    height: "100%",
  },
  wigFitControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.xs,
  },
  wigFitSectionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  wigFitButton: {
    flex: 1,
    minHeight: 38,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.xs,
  },
  photoPlaceholder: {
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  summaryNoteCard: {
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  summarySelectedWigHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  summarySelectedWigIcon: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  summarySelectedWigCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summarySelectedWigEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
    letterSpacing: 0.55,
  },
  summaryNoteTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  previewReferenceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.sm,
  },
  previewReferenceImage: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
  },
  previewReferenceCopy: {
    flex: 1,
    gap: 3,
  },
  previewReferenceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  wigSpecificationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  wigSpecificationItem: {
    width: "48%",
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: theme.spacing.xs,
  },
  wigSpecificationLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  wigSpecificationValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  previewActionSection: {
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  previewActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  previewActionIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  previewActionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  previewActionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  previewActionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  previewAlternativeActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  previewAlternativeAction: {
    flex: 1,
  },
  generationModalCard: {
    width: "100%",
    alignSelf: "center",
    maxWidth: theme.layout.contentMaxWidth,
  },
  sheetKeyboardWrap: {
    flex: 1,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: theme.colors.overlay,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    width: "100%",
    alignSelf: "center",
    maxWidth: theme.layout.contentMaxWidth,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: "74%",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderStrong,
    alignSelf: "center",
    marginBottom: theme.spacing.md,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  modalHeaderActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: "center",
    justifyContent: "center",
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  generationStage: {
    minHeight: 320,
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceSoft,
    marginBottom: theme.spacing.md,
  },
  generationStageImage: {
    width: "100%",
    height: 320,
  },
  generationStagePlaceholder: {
    minHeight: 320,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  generationStagePlaceholderText: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textSecondary,
  },
  generationResultTitle: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  generationResultFamily: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
    marginBottom: theme.spacing.xs,
  },
  generationResultSummary: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  detailsPanel: {
    gap: theme.spacing.sm,
  },
  captureStage: {
    position: "relative",
    minHeight: 320,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    backgroundColor: "#090909",
    marginBottom: theme.spacing.sm,
  },
  captureStageImage: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    height: 320,
  },
  captureStagePhotoPreview: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    height: 320,
    backgroundColor: "#090909",
  },
  tryOnLayerWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 6,
    elevation: 6,
  },
  tryOnLayerHidden: {
    position: "absolute",
    width: 0,
    height: 0,
    opacity: 0,
  },
  tryOnLayerMissingBanner: {
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
    bottom: theme.spacing.md,
    zIndex: 12,
    elevation: 12,
    alignItems: "center",
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: "rgba(17, 14, 17, 0.72)",
  },
  tryOnLayerMissingText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  availableWigsSection: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  availableWigsHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    borderRadius: theme.radius.sm,
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
    position: "relative",
    height: 86,
    overflow: "hidden",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceSoft,
  },
  tryOnWigAiBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
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
    width: "100%",
    height: "100%",
  },
  tryOnWigImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tryOnWigName: {
    minHeight: 18,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  availableWigsEmpty: {
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
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
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.surfaceSoft,
  },
  captureStagePlaceholderTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  captureStagePlaceholderBody: {
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  captureFrame: {
    position: "absolute",
    top: CAPTURE_FRAME_INSET,
    right: CAPTURE_FRAME_INSET,
    bottom: CAPTURE_FRAME_INSET,
    left: CAPTURE_FRAME_INSET,
    borderRadius: theme.radius.md,
    zIndex: 10,
    elevation: 10,
  },
  captureCorner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderColor: "#ffffff",
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
    position: "absolute",
    top: CAPTURE_FACE_GUIDE_TOP,
    alignSelf: "center",
    width: CAPTURE_FACE_GUIDE_WIDTH,
    height: CAPTURE_FACE_GUIDE_HEIGHT,
    borderRadius: CAPTURE_FACE_GUIDE_RADIUS,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.68)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  captureHintPill: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: "rgba(17, 14, 17, 0.7)",
  },
  captureHintText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
  },
  faceScanPanel: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
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
    lineHeight:
      theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  captureControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.sm,
  },
  captureControlsSpacer: {
    width: 64,
  },
  iconCircleButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000000",
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
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  multilineInput: {
    minHeight: 92,
    textAlignVertical: "top",
  },
  multilineInputShell: {
    borderRadius: 12,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
});
