const fallbackSpeechRecognitionModule = {
  isRecognitionAvailable: () => false,
  requestPermissionsAsync: async () => ({ granted: false }),
  start: () => {},
  stop: () => {},
  abort: () => {},
};

let nativeSpeechRecognition = null;

try {
  nativeSpeechRecognition = require('expo-speech-recognition');
} catch (_error) {
  nativeSpeechRecognition = null;
}

export const ExpoSpeechRecognitionModule = (
  nativeSpeechRecognition?.ExpoSpeechRecognitionModule || fallbackSpeechRecognitionModule
);

export const useSpeechRecognitionEvent = (
  nativeSpeechRecognition?.useSpeechRecognitionEvent || (() => {})
);
