import { invokeEdgeFunction } from '../api/supabase/client';
import { getErrorMessage, logAppError, logAppEvent } from '../utils/appErrors';

const HEAD_DETECTION_FUNCTION = 'detect-wig-head-frame';
const FACE_LANDMARKER_MODEL = 'face_landmarker.task';

let mediaPipeModule = null;
try {
  mediaPipeModule = require('react-native-mediapipe');
} catch {
  mediaPipeModule = null;
}

const averageLandmarks = (landmarks = [], indexes = []) => {
  const points = indexes.map((index) => landmarks[index]).filter(Boolean);
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + Number(point.x || 0), 0) / points.length,
    y: points.reduce((sum, point) => sum + Number(point.y || 0), 0) / points.length,
  };
};

const landmarkToPixel = (landmark, width, height) => (
  landmark
    ? {
        x: Number(landmark.x || 0) * width,
        y: Number(landmark.y || 0) * height,
      }
    : null
);

const buildMediaPipePlacement = (resultBundle = {}, photo = {}) => {
  const landmarks = resultBundle?.results?.[0]?.faceLandmarks?.[0] || [];
  const width = Number(resultBundle?.inputImageWidth || photo.width || 0);
  const height = Number(resultBundle?.inputImageHeight || photo.height || 0);
  if (!landmarks.length || !width || !height) return null;

  const leftTemple = averageLandmarks(landmarks, [127, 234, 93, 132]);
  const rightTemple = averageLandmarks(landmarks, [356, 454, 323, 361]);
  const leftEar = landmarks[234] || leftTemple;
  const rightEar = landmarks[454] || rightTemple;
  const forehead = landmarks[10];
  const chin = landmarks[152];
  const nose = landmarks[1];
  const leftEye = averageLandmarks(landmarks, [33, 133, 159, 145]);
  const rightEye = averageLandmarks(landmarks, [362, 263, 386, 374]);
  const xValues = [leftEar, rightEar, leftTemple, rightTemple, leftEye, rightEye, nose]
    .filter(Boolean)
    .map((point) => Number(point.x || 0) * width);
  const yValues = [forehead, chin, leftEye, rightEye, nose]
    .filter(Boolean)
    .map((point) => Number(point.y || 0) * height);
  if (!xValues.length || !yValues.length) return null;

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const faceWidth = Math.max(1, maxX - minX);
  const faceHeight = Math.max(1, maxY - minY);

  return {
    faceFrame: {
      source: 'mediapipe_static_image',
      mediapipe: true,
      frameWidth: width,
      frameHeight: height,
      rollAngle: 0,
      yawAngle: 0,
      bounds: {
        x: Math.max(0, minX - faceWidth * 0.04),
        y: Math.max(0, minY - faceHeight * 0.04),
        width: faceWidth * 1.08,
        height: faceHeight * 1.08,
      },
      landmarks: {
        FOREHEAD: landmarkToPixel(forehead, width, height),
        CHIN: landmarkToPixel(chin, width, height),
        NOSE: landmarkToPixel(nose, width, height),
        LEFT_EYE: landmarkToPixel(leftEye, width, height),
        RIGHT_EYE: landmarkToPixel(rightEye, width, height),
        LEFT_TEMPLE: landmarkToPixel(leftTemple, width, height),
        RIGHT_TEMPLE: landmarkToPixel(rightTemple, width, height),
        LEFT_EAR: landmarkToPixel(leftEar, width, height),
        RIGHT_EAR: landmarkToPixel(rightEar, width, height),
      },
    },
    stageLayout: {
      width,
      height,
    },
    wigCalibration: {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    },
  };
};

const detectWithMediaPipe = async (photo = {}) => {
  const detectOnImage = mediaPipeModule?.faceLandmarkDetectionOnImage;
  if (typeof detectOnImage !== 'function' || !photo?.uri) return null;

  const resultBundle = await detectOnImage(photo.uri, FACE_LANDMARKER_MODEL, {
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    delegate: mediaPipeModule?.Delegate?.GPU || mediaPipeModule?.Delegate?.CPU,
    mirrorMode: 'no-mirror',
  });

  return buildMediaPipePlacement(resultBundle, photo);
};

export const detectWigHeadFrame = async (photo = {}) => {
  try {
    if (!photo?.dataUrl || !photo?.width || !photo?.height) {
      return { placement: null, error: 'Photo is missing image data for head detection.' };
    }

    const mediaPipePlacement = await detectWithMediaPipe(photo);
    if (mediaPipePlacement?.faceFrame) {
      logAppEvent('wigHeadDetection.detect', 'Detected head frame using MediaPipe static image.', {
        provider: 'mediapipe',
      });
      return {
        placement: mediaPipePlacement,
        error: null,
      };
    }

    const { data, error } = await invokeEdgeFunction(HEAD_DETECTION_FUNCTION, {
      body: {
        image: {
          dataUrl: photo.dataUrl,
          width: photo.width,
          height: photo.height,
          mimeType: photo.mimeType || 'image/jpeg',
        },
      },
    });

    if (error) {
      throw error;
    }

    logAppEvent('wigHeadDetection.detect', 'Detected head frame for wig overlay.', {
      hasPlacement: Boolean(data?.placement?.faceFrame),
      provider: data?.diagnostics?.provider || null,
    });

    return {
      placement: data?.placement || null,
      error: null,
    };
  } catch (error) {
    logAppError('wigHeadDetection.detect', error);
    return {
      placement: null,
      error: getErrorMessage(error) || 'Head detection failed.',
    };
  }
};
