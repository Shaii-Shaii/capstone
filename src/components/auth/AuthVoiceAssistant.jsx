import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
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
    if (wantsPatient) return 'After login, choose Patient only if you need the patient startup flow. You can enter a hospital code if you have one.';
    if (wantsDonor) return 'After login, choose No when asked if you are a patient. The app will assign your donor role before the donor dashboard opens.';
    return 'For login, enter your email first, then your password, then tap Log in.';
  }

  if (wantsOtp) return 'OTP happens after signup. Register first, then enter the six digit code sent to your email.';
  if (wantsPatient) return 'For patient setup, log in first. The app will ask if you are a patient, then request a hospital code only if you have one.';
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
}) => {
  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [assistantReply, setAssistantReply] = useState(stageMessage || '');
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
          setAssistantReply('');
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
    setAssistantReply(stageMessage);
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
    setAssistantReply('Listening...');
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (!isAssistantEnabled) return;
    const nextTranscript = event.results?.[0]?.transcript || '';
    if (!nextTranscript) return;
    setTranscript(nextTranscript);

    if (event.isFinal !== false) {
      const reply = resolveAssistantReply(nextTranscript, screen, brandName);
      setAssistantReply(reply);
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
    setAssistantReply(message);
    speak(message);
  });

  const startListening = async () => {
    if (!isAssistantEnabled) return;
    const isAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    if (!isAvailable) {
      const unavailableMessage = 'Speech recognition is not available on this device.';
      setAssistantReply(unavailableMessage);
      speak(unavailableMessage);
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      const permissionMessage = 'Please allow microphone and speech recognition access so I can listen to your question.';
      setAssistantReply(permissionMessage);
      speak(permissionMessage);
      return;
    }

    setTranscript('');
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
      setAssistantReply('Listening...');
      startListening();
      return;
    }

    hasIntroducedRef.current = true;
    const greeting = prompt || `Hello, welcome to ${brandName}. I am ${brandName} AI. How can I help you?`;
    setAssistantReply(greeting);
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
      setTranscript('');
      setAssistantReply('');
      await Speech.stop();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Ignore if recognizer is already inactive.
      }
      return;
    }

    setAssistantReply('AI voice assistance is on. Tap the microphone when you need help.');
  };

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null, style]}>
      <View
        style={[
          styles.toggleRow,
          {
            backgroundColor: roles.supportCardBackground,
            borderColor: roles.supportCardBorder,
          },
        ]}
      >
        <Text
          style={[styles.toggleLabel, { color: roles.bodyText }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          AI voice assistance
        </Text>
        <Switch
          value={isAssistantEnabled}
          onValueChange={handleToggleAssistant}
          trackColor={{
            false: roles.defaultCardBorder,
            true: roles.primaryActionBackground,
          }}
          thumbColor={roles.defaultCardBackground}
        />
      </View>

      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.voiceGuide,
          compact ? styles.voiceGuideCompact : null,
          {
            backgroundColor: roles.defaultCardBackground,
            borderColor: isListening || isVoiceActive ? roles.primaryActionBackground : roles.defaultCardBorder,
            opacity: isAssistantEnabled ? 1 : 0.58,
          },
          pressed ? styles.pressed : null,
        ]}
        disabled={!isAssistantEnabled}
      >
        <View style={[styles.voiceIcon, { backgroundColor: roles.iconPrimarySurface }]}>
          <MaterialCommunityIcons
            name={isListening ? 'microphone' : isVoiceActive ? 'volume-high' : 'microphone-outline'}
            size={compact ? 18 : 20}
            color={roles.iconPrimaryColor}
          />
        </View>
        <View style={styles.voiceCopy}>
          <Text
            style={[styles.voiceTitle, { color: roles.headingText }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {isListening ? 'Listening...' : isVoiceActive ? `${brandName} AI is speaking` : `Talk to ${brandName} AI`}
          </Text>
          <Text
            style={[styles.voiceText, { color: roles.bodyText }]}
            numberOfLines={2}
          >
            {isAssistantEnabled ? transcript || 'Ask for the next step.' : 'Voice guidance is off.'}
          </Text>
        </View>
      </Pressable>

      {assistantReply && isAssistantEnabled ? (
        <View
          style={[
            styles.assistantReply,
            {
              backgroundColor: roles.supportCardBackground,
              borderColor: roles.supportCardBorder,
            },
          ]}
        >
          <Text style={[styles.assistantReplyText, { color: roles.bodyText }]}>
            {assistantReply}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  containerCompact: {
    marginBottom: theme.spacing.md,
  },
  toggleRow: {
    width: '100%',
    minHeight: 44,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    paddingRight: theme.spacing.sm,
  },
  toggleLabel: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  voiceGuide: {
    width: '100%',
    minHeight: 64,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  voiceGuideCompact: {
    minHeight: 56,
    borderRadius: 22,
  },
  pressed: {
    opacity: 0.82,
  },
  voiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  voiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  voiceTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  voiceText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
  },
  assistantReply: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  assistantReplyText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
});
