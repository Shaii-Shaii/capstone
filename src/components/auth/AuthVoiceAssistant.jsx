import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { resolveThemeRoles, theme } from '../../design-system/theme';

const AI_VOICE_ASSISTANT_STORAGE_KEY = 'donivra.auth.aiVoiceAssistant.enabled';
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

const wantsAssistantToType = (normalized = '') => (
  normalized.includes('type')
  || normalized.includes('itype')
  || normalized.includes('input')
  || normalized.includes('enter')
  || normalized.includes('fill')
  || normalized.includes('lagay')
  || normalized.includes('ilagay')
  || normalized.includes('isulat')
);

const resolveVoiceCommand = (spokenText = '') => {
  const raw = String(spokenText || '').trim();
  const normalized = raw.toLowerCase();
  const email = raw.match(EMAIL_PATTERN)?.[0] || '';
  const mentionsPassword = normalized.includes('password') || normalized.includes('pass word') || normalized.includes('passcode');

  if (mentionsPassword && wantsAssistantToType(normalized)) {
    return {
      handled: true,
      action: {
        type: 'blocked_sensitive_field',
        field: 'password',
      },
      reply: 'I cannot type or fill passwords for you. Please enter your password yourself for account security.',
    };
  }

  if (email && wantsAssistantToType(normalized)) {
    return {
      handled: true,
      action: {
        type: 'fill_field',
        field: 'email',
        value: email.trim(),
      },
      reply: `I filled in ${email.trim()} as your email address.`,
    };
  }

  return {
    handled: false,
    action: null,
    reply: '',
  };
};

const resolveAssistantReply = (spokenText, screen, brandName) => {
  const normalized = String(spokenText || '').toLowerCase();
  const alreadyHasAccount = (
    normalized.includes('already have an account')
    || normalized.includes('i have an account')
    || normalized.includes('have account')
    || normalized.includes('existing account')
    || normalized.includes('old account')
  );
  const doesNotHaveAccount = (
    normalized.includes("don't have an account")
    || normalized.includes('do not have an account')
    || normalized.includes('no account')
    || normalized.includes('new account')
    || normalized.includes('first time')
  );
  const wantsSignup = normalized.includes('sign up') || normalized.includes('signup') || normalized.includes('register') || normalized.includes('create account');
  const wantsLogin = normalized.includes('log in') || normalized.includes('login') || normalized.includes('sign in');
  const wantsOtp = normalized.includes('otp') || normalized.includes('code') || normalized.includes('verify');
  const wantsPassword = normalized.includes('password');
  const wantsPatient = normalized.includes('patient') || normalized.includes('hospital');
  const wantsDonor = normalized.includes('donor') || normalized.includes('donate') || normalized.includes('donation');
  const wantsHair = normalized.includes('hair') || normalized.includes('analysis') || normalized.includes('checkhair') || normalized.includes('check hair');

  if (alreadyHasAccount || wantsLogin) {
    return screen === 'login'
      ? 'You are on the login screen. Enter your email first, then your password, then tap Log in.'
      : 'Since you already have an account, use the Log in option instead of signup.';
  }

  if (doesNotHaveAccount || wantsSignup) {
    return screen === 'signup'
      ? 'You are on the signup screen. Start with your email, then create and confirm your password.'
      : 'Since this is a new account, use the Register option to start signup.';
  }

  if (screen === 'signup') {
    if (wantsOtp) return 'OTP comes after signup. First fill in your email, password, and confirm password, then tap Sign up.';
    if (wantsPassword) return 'Use a strong password with uppercase, lowercase, a number, and a special character. Make sure Confirm Password matches.';
    return 'For signup, start by entering your email address. After that, enter and confirm your password, then tap Sign up.';
  }

  if (screen === 'login') {
    if (wantsPassword) return 'Enter the password for your account. If you forgot it, tap Forgot password before logging in.';
    if (wantsPatient) return 'After login, choose Patient only if you need the patient startup flow. You can enter your patient code if you have one.';
    if (wantsDonor) return 'After login, choose No when asked if you are a patient. The app will assign your donor role before the donor dashboard opens.';
    return 'For login, enter your email first, then your password, then tap Log in.';
  }

  if (wantsOtp) return 'OTP happens after signup. Register first, then enter the six digit code sent to your email.';
  if (wantsPatient) return 'For patient setup, log in first. The app will ask if you are a patient, then request your patient code only if you have one.';
  if (wantsDonor) return 'For donor setup, log in first and choose the donor path when asked if you are a patient.';
  if (wantsHair) return 'For hair analysis, log in and open CheckHair. Capture front view, side profile, and hair ends with no face or hair accessories.';

  return `I can help with login, signup, OTP, donor setup, patient setup, or hair analysis. What would you like to do in ${brandName}?`;
};

export const AuthVoiceAssistant = ({
  screen = 'landing',
  resolvedTheme,
  prompt,
  stageMessage = '',
  compact = false,
  style,
  onAssistantAction,
}) => {
  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAssistantEnabled, setIsAssistantEnabled] = useState(true);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);
  const hasIntroducedRef = useRef(false);
  const isIntentionalStopRef = useRef(false);

  const speak = useCallback((message, options = {}) => {
    if (!isAssistantEnabled || !message) return;
    setIsVoiceActive(true);
    Speech.speak(message, {
      rate: 0.92,
      pitch: 1,
      ...options,
      onDone: () => {
        setIsVoiceActive(false);
        options.onDone?.();
      },
      onStopped: () => {
        setIsVoiceActive(false);
        options.onStopped?.();
      },
      onError: (error) => {
        setIsVoiceActive(false);
        options.onError?.(error);
      },
    });
  }, [isAssistantEnabled]);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(AI_VOICE_ASSISTANT_STORAGE_KEY)
      .then((storedValue) => {
        if (!isMounted) return;
        if (storedValue === 'false') {
          setIsAssistantEnabled(false);
        } else if (storedValue === 'true') {
          setIsAssistantEnabled(true);
        }
      })
      .finally(() => {
        if (isMounted) setHasLoadedPreference(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedPreference || !stageMessage || !isAssistantEnabled) return;
    Speech.stop();
    speak(stageMessage);
  }, [hasLoadedPreference, isAssistantEnabled, speak, stageMessage]);

  useEffect(() => () => {
    isIntentionalStopRef.current = true;
    Speech.stop();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Ignore cleanup failures when the native recognizer is already inactive.
    }
  }, []);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!isAssistantEnabled) return;
    const nextTranscript = event.results?.[0]?.transcript || '';
    if (!nextTranscript) return;

    if (event.isFinal !== false) {
      const command = resolveVoiceCommand(nextTranscript);
      if (command.handled) {
        onAssistantAction?.(command.action);
      }

      const reply = command.handled
        ? command.reply
        : resolveAssistantReply(nextTranscript, screen, brandName);
      speak(reply);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsListening(false);
    const normalizedError = `${event?.error || ''} ${event?.message || ''}`.toLowerCase();
    if (
      isIntentionalStopRef.current
      || normalizedError.includes('abort')
      || normalizedError.includes('aborted')
      || normalizedError.includes('cancel')
    ) {
      isIntentionalStopRef.current = false;
      return;
    }
    const message = event?.message || 'I could not hear that clearly. Tap the microphone and try again.';
    speak(message);
  });

  const startListening = async () => {
    if (!isAssistantEnabled) return;
    const isAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    if (!isAvailable) {
      const unavailableMessage = 'Speech recognition is not available on this device.';
      speak(unavailableMessage);
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      const permissionMessage = 'Please allow microphone and speech recognition access so I can listen to your question.';
      speak(permissionMessage);
      return;
    }

    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  };

  const handlePress = async () => {
    if (!isAssistantEnabled) return;
    await Haptics.selectionAsync();
    if (isListening) {
      isIntentionalStopRef.current = true;
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    const speaking = await Speech.isSpeakingAsync();
    if (speaking) {
      await Speech.stop();
      setIsVoiceActive(false);
    }

    if (hasIntroducedRef.current) {
      startListening();
      return;
    }

    hasIntroducedRef.current = true;
    const greeting = prompt || `Hello, welcome to ${brandName}. I am ${brandName} AI. How can I help you?`;
    speak(greeting, {
      onDone: () => {
        startListening();
      },
    });
  };

  const handleToggleAssistant = async (value) => {
    await Haptics.selectionAsync();
    setIsAssistantEnabled(value);
    await AsyncStorage.setItem(AI_VOICE_ASSISTANT_STORAGE_KEY, value ? 'true' : 'false');

    if (!value) {
      isIntentionalStopRef.current = true;
      setIsListening(false);
      setIsVoiceActive(false);
      await Speech.stop();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Ignore if recognizer is already inactive.
      }
      return;
    }
  };

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null, style]}>
      <Pressable
        onPress={handlePress}
        onLongPress={() => handleToggleAssistant(!isAssistantEnabled)}
        style={({ pressed }) => [
          styles.voiceGuide,
          compact ? styles.voiceGuideCompact : null,
          {
            backgroundColor: isAssistantEnabled ? roles.primaryActionBackground : roles.supportCardBackground,
            borderColor: isListening || isVoiceActive ? roles.primaryActionBackground : roles.defaultCardBorder,
            opacity: isAssistantEnabled ? 1 : 0.72,
          },
          pressed ? styles.pressed : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="AI voice assistant"
        accessibilityHint="Tap to speak. Long press to turn voice assistant off or on."
      >
        <MaterialCommunityIcons
          name={isListening ? 'microphone' : isVoiceActive ? 'volume-high' : 'microphone-outline'}
          size={compact ? 22 : 24}
          color={isAssistantEnabled ? roles.primaryActionText : roles.metaText}
        />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    width: 54,
    height: 54,
  },
  containerCompact: {
    marginBottom: theme.spacing.md,
  },
  voiceGuide: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  voiceGuideCompact: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  pressed: {
    opacity: 0.82,
  },
});
