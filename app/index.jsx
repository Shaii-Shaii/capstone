import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ScreenContainer } from '../src/components/ui/ScreenContainer';
import { AppButton } from '../src/components/ui/AppButton';
import { AppInput } from '../src/components/ui/AppInput';
import { AppCard } from '../src/components/ui/AppCard';
import { AppTextLink } from '../src/components/ui/AppTextLink';
import { OtpInput } from '../src/components/ui/OtpInput';
import { DatePickerField } from '../src/components/ui/DatePickerField';
import { AddressOptionSheet, AddressSelectField, SignupAddressSection } from '../src/components/auth/SignupAddressSection';
import { useAuth } from '../src/providers/AuthProvider';
import { useRoleAuthFlow } from '../src/hooks/useRoleAuthFlow';
import {
  completePostLoginOnboarding,
  getPatientLinkPreview,
} from '../src/features/profile/services/profile.service';
import { patientOnboardingSchema } from '../src/features/profile/profile.schema';
import { guardianRelationshipOptions, profileGenderOptions } from '../src/constants/profile';
import { resolveBrandLogoSource, resolveThemeRoles, theme } from '../src/design-system/theme';
import landingHeroImage from '../src/assets/images/hero_landing.png';

const normalizePatientCode = (value) => {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.startsWith('PT') && normalized.length > 6) {
    return normalized.slice(2, 8);
  }
  return normalized.slice(0, 6);
};
const IMAGE_MEDIA_TYPES = ['images'];
const PROFILE_MINIMUM_AGE = 18;
const MINIMUM_BIRTHDATE = new Date(1900, 0, 1);
const MINIMUM_DIAGNOSIS_DATE = new Date(1900, 0, 1);

const getMaximumBirthdate = () => {
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - PROFILE_MINIMUM_AGE);
  return maxDate;
};

const getMaximumDiagnosisDate = () => {
  const maxDate = new Date();
  maxDate.setHours(0, 0, 0, 0);
  return maxDate;
};

const manualPatientStepFieldGroups = [
  [
    'first_name',
    'middle_name',
    'last_name',
    'suffix',
    'birthdate',
    'gender',
    'contact_number',
    'street',
    'barangay',
    'region',
    'city',
    'province',
    'country',
    'latitude',
    'longitude',
  ],
  [
    'medical_condition',
    'date_of_diagnosis',
    'guardian',
    'guardian_relationship',
    'guardian_contact_number',
  ],
  [
    'patient_picture',
    'medical_document',
  ],
];

const getFileExtension = (mimeType = '', fileName = '') => {
  const normalizedMimeType = String(mimeType || '').toLowerCase();
  const normalizedFileName = String(fileName || '').toLowerCase();

  if (normalizedMimeType.includes('png') || normalizedFileName.endsWith('.png')) return 'png';
  if (normalizedMimeType.includes('webp') || normalizedFileName.endsWith('.webp')) return 'webp';
  if (normalizedMimeType.includes('gif') || normalizedFileName.endsWith('.gif')) return 'gif';
  return 'jpg';
};

const getPickedMediaPayload = async (asset, fallbackPrefix) => {
  if (!asset) {
    throw new Error('Unable to read the selected image.');
  }

  const contentType = asset.mimeType || asset.file?.type || 'image/jpeg';
  const fileName = asset.fileName || asset.file?.name || `${fallbackPrefix}.${getFileExtension(contentType)}`;
  const previewUri = asset.uri || '';

  if (asset.base64) {
    const fileResponse = await fetch(`data:${contentType};base64,${asset.base64}`);
    if (!fileResponse.ok) {
      throw new Error('Unable to read the selected image.');
    }

    return {
      fileBody: await fileResponse.arrayBuffer(),
      contentType,
      fileName,
      previewUri: previewUri || `data:${contentType};base64,${asset.base64}`,
    };
  }

  if (asset.file && typeof asset.file.arrayBuffer === 'function') {
    return {
      fileBody: await asset.file.arrayBuffer(),
      contentType,
      fileName,
      previewUri,
    };
  }

  if (asset.uri) {
    const fileResponse = await fetch(asset.uri);
    if (!fileResponse.ok) {
      throw new Error('Unable to read the selected image.');
    }

    return {
      fileBody: await fileResponse.arrayBuffer(),
      contentType,
      fileName,
      previewUri: asset.uri,
    };
  }

  throw new Error('Unable to read the selected image.');
};

function BrandLogo({ resolvedTheme, plain = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    plain ? (
      <Image source={logoSource} style={styles.logoPlain} resizeMode="contain" onError={() => setImageFailed(true)} />
    ) : (
      <View style={styles.logoWrap}>
        <Image source={logoSource} style={styles.logo} resizeMode="contain" onError={() => setImageFailed(true)} />
      </View>
    )
  );
}

function LoadingState() {
  const { resolvedTheme } = useAuth();
  return (
    <ScreenContainer
      scrollable={true}
      safeArea
      variant="auth"
      contentStyle={styles.screenContent}
    >
      <View style={styles.centeredContainer}>
        <BrandLogo resolvedTheme={resolvedTheme} />
        {resolvedTheme?.brandName ? (
          <Text
            style={[
              styles.brandName,
              resolvedTheme?.primaryTextColor ? { color: resolvedTheme.primaryTextColor } : null,
              resolvedTheme?.secondaryFontFamily ? { fontFamily: resolvedTheme.secondaryFontFamily } : null,
            ]}
          >
            {resolvedTheme.brandName}
          </Text>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function PublicLanding() {
  const router = useRouter();
  const { resolvedTheme } = useAuth();
  const { isLoading, clearGoogleError } = useRoleAuthFlow('access');
  const roles = resolveThemeRoles(resolvedTheme);
  const brandName = resolvedTheme?.brandName || 'Donivra';

  const navigateWithHaptic = async (path) => {
    await Haptics.selectionAsync();
    router.push(path);
  };

  return (
    <ScreenContainer
      scrollable={true}
      safeArea
      variant="auth"
      contentStyle={styles.screenContent}
    >
      <View style={[styles.landingPage, { backgroundColor: roles.pageBackground }]}>
        <View style={[styles.landingTopBar, { backgroundColor: roles.defaultCardBackground }]}>
          <View style={styles.landingBrandBar}>
            <MaterialCommunityIcons name="content-cut" size={26} color={roles.primaryActionBackground} />
            <Text
              style={[
                styles.landingBrandText,
                {
                  color: roles.primaryActionBackground,
                  fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
                },
              ]}
            >
              {brandName}
            </Text>
          </View>
          <AppButton
            title="Sign Up"
            size="sm"
            fullWidth={false}
            style={styles.landingNavButton}
            textStyle={styles.landingNavButtonText}
            disabled={isLoading}
            onPress={() => {
              clearGoogleError();
              return navigateWithHaptic('/auth/signup');
            }}
          />
        </View>

        <View style={styles.landingContent}>
          <View style={styles.landingHeroSection}>
            <View style={styles.landingCopyBlock}>
              <Text
                style={[
                  styles.landingTitle,
                  {
                    color: roles.headingText,
                    fontFamily: resolvedTheme?.secondaryFontFamily || theme.typography.fontFamilyDisplay,
                  },
                ]}
              >
                Give Your Hair a New Purpose
              </Text>
              <Text style={[styles.landingSubtitle, { color: roles.bodyText }]}>
                Join donors making a difference in the lives of people experiencing medical hair loss. Professional, secure, and deeply impactful.
              </Text>
              <View style={styles.landingActionStack}>
                <AppButton
                  title="Start Your Journey"
                  size="lg"
                  style={styles.landingButtonPrimary}
                  textStyle={styles.landingButtonText}
                  textColorOverride={roles.primaryActionText}
                  backgroundColorOverride={roles.primaryActionBackground}
                  borderColorOverride={roles.primaryActionBackground}
                  disabled={isLoading}
                  onPress={() => {
                    clearGoogleError();
                    return navigateWithHaptic('/auth/signup');
                  }}
                  enableHaptics={true}
                />
                <AppButton
                  title="Learn How It Works"
                  variant="outline"
                  size="lg"
                  style={styles.landingButtonSecondary}
                  textStyle={styles.landingButtonText}
                  textColorOverride={roles.secondaryActionText}
                  backgroundColorOverride={roles.defaultCardBackground}
                  borderColorOverride={roles.defaultCardBorder}
                  disabled={isLoading}
                  onPress={() => Haptics.selectionAsync()}
                  enableHaptics={true}
                />
              </View>
            </View>

            <View style={styles.landingArtWrap}>
              <Image
                source={landingHeroImage}
                style={styles.landingHeroImage}
                resizeMode="cover"
              />
            </View>
          </View>

          <View style={styles.landingSection}>
            <Text style={[styles.landingSectionTitle, { color: roles.headingText }]}>Why Donate?</Text>
            <View style={styles.landingCardGrid}>
              {[
                {
                  icon: 'heart-outline',
                  title: 'Emotional Impact',
                  body: 'Provide confidence and emotional support to individuals facing severe medical treatments.',
                },
                {
                  icon: 'check-decagram-outline',
                  title: 'Trusted Process',
                  body: 'Certified partners help ensure every strand is handled with professional care.',
                },
                {
                  icon: 'leaf',
                  title: 'Sustainable',
                  body: 'Donated hair is used with careful, low-waste practices that respect every contribution.',
                },
              ].map((item) => (
                <View key={item.title} style={[styles.landingInfoCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
                  <View style={[styles.landingInfoIcon, { backgroundColor: roles.iconPrimarySurface }]}>
                    <MaterialCommunityIcons name={item.icon} size={30} color={roles.primaryActionBackground} />
                  </View>
                  <Text style={[styles.landingInfoTitle, { color: roles.headingText }]}>{item.title}</Text>
                  <Text style={[styles.landingInfoBody, { color: roles.bodyText }]}>{item.body}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.landingProcessSection, { backgroundColor: roles.supportCardBackground }]}>
            <Text style={[styles.landingSectionTitle, { color: roles.headingText }]}>Simple 3-Step Process</Text>
            <Text style={[styles.landingProcessBody, { color: roles.bodyText }]}>
              Donating is easier than you think. We guide you through every step to keep the experience clear and secure.
            </Text>
            <View style={styles.landingProcessGrid}>
              {[
                {
                  step: '1',
                  icon: 'ruler',
                  title: 'Assess',
                  body: 'Measure your hair and review basic donation requirements before starting.',
                },
                {
                  step: '2',
                  icon: 'map-marker-outline',
                  title: 'Find',
                  body: 'Locate a partner drive or prepare an independent hair donation through the platform.',
                },
                {
                  step: '3',
                  icon: 'truck-outline',
                  title: 'Donate',
                  body: 'Securely package your hair, attach the generated QR, and track the donation journey.',
                },
              ].map((item) => (
                <View key={item.step} style={[styles.landingStepCard, { backgroundColor: roles.defaultCardBackground, borderColor: roles.defaultCardBorder }]}>
                  <Text style={[styles.landingStepNumber, { color: roles.defaultCardBorder }]}>{item.step}</Text>
                  <MaterialCommunityIcons name={item.icon} size={28} color={roles.primaryActionBackground} />
                  <Text style={[styles.landingStepTitle, { color: roles.headingText }]}>{item.title}</Text>
                  <Text style={[styles.landingStepBody, { color: roles.bodyText }]}>{item.body}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.landingFooter, { backgroundColor: roles.supportCardBackground }]}>
          <Text style={[styles.landingFooterBrand, { color: roles.primaryActionBackground }]}>{brandName}</Text>
          <Text style={[styles.landingFooterText, { color: roles.bodyText }]}>Every strand counts.</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

function PatientPreviewCard({ patient }) {
  const displayName = patient?.full_name || 'Patient record';
  const displayHospital = patient?.hospital_name || 'selected hospital';
  const rows = [
    { label: 'Patient Code', value: patient?.patient_code || 'Not available' },
    { label: 'Hospital', value: displayHospital },
  ];

  return (
    <AppCard variant="soft" radius="xl" padding="md" style={styles.previewCard}>
      <Text style={styles.confirmTitle}>Display Patient Details</Text>
      <Text style={styles.confirmValue}>
        {displayName} from the {displayHospital}
      </Text>
      <Text style={styles.onboardingBody}>An activation email will be sent to the hospital.</Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.previewRow}>
          <Text style={styles.previewLabel}>{row.label}</Text>
          <Text style={styles.previewValue}>{row.value}</Text>
        </View>
      ))}
    </AppCard>
  );
}

function FirstTimeOnboarding() {
  const router = useRouter();
  const { user, profile, refreshProfile, resolvedTheme } = useAuth();
  const [branchMode, setBranchMode] = useState('question');
  const [isIntroReady, setIsIntroReady] = useState(false);
  const [patientCode, setPatientCode] = useState('');
  const [patientPreview, setPatientPreview] = useState(null);
  const [patientCodeError, setPatientCodeError] = useState('');
  const [screenError, setScreenError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [manualPatientStep, setManualPatientStep] = useState(0);
  const [activeManualPicker, setActiveManualPicker] = useState('');
  const [manualGuardianRelationshipOption, setManualGuardianRelationshipOption] = useState('');
  const [isUploadingPatientPicture, setIsUploadingPatientPicture] = useState(false);
  const [isUploadingMedicalDocument, setIsUploadingMedicalDocument] = useState(false);
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const startOpacity = useRef(new Animated.Value(0)).current;

  const manualPatientForm = useForm({
    resolver: zodResolver(patientOnboardingSchema),
    mode: 'onBlur',
    shouldUnregister: false,
    defaultValues: {
      first_name: profile?.first_name || '',
      middle_name: profile?.middle_name || '',
      last_name: profile?.last_name || '',
      suffix: profile?.suffix || '',
      birthdate: profile?.birthdate || '',
      gender: profile?.gender || '',
      contact_number: profile?.contact_number || '',
      street: profile?.street || '',
      barangay: profile?.barangay || '',
      region: profile?.region || '',
      city: profile?.city || '',
      province: profile?.province || '',
      country: profile?.country || 'Philippines',
      latitude: profile?.latitude !== undefined && profile?.latitude !== null ? String(profile.latitude) : '',
      longitude: profile?.longitude !== undefined && profile?.longitude !== null ? String(profile.longitude) : '',
      medical_condition: '',
      date_of_diagnosis: '',
      guardian: '',
      guardian_relationship: '',
      guardian_contact_number: '',
      patient_picture: '',
      medical_document: '',
    },
  });

  const getManualPatientFieldValue = (fieldName) => manualPatientForm.getValues(fieldName) ?? '';

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(welcomeOpacity, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
      Animated.delay(480),
      Animated.timing(welcomeOpacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(startOpacity, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
      }),
    ]);

    animation.start(() => {
      setIsIntroReady(true);
    });

    return () => {
      animation.stop();
    };
  }, [startOpacity, welcomeOpacity]);

  useEffect(() => {
    const currentGuardianRelationship = String(manualPatientForm.getValues('guardian_relationship') || '').trim();
    if (!currentGuardianRelationship) {
      return;
    }

    const isPresetOption = guardianRelationshipOptions.some((option) => option.value === currentGuardianRelationship);
    setManualGuardianRelationshipOption(isPresetOption ? currentGuardianRelationship : 'Other');
  }, [manualPatientForm]);

  const continueToRoleHome = async (targetRole) => {
    await refreshProfile(user?.id);
    router.replace(targetRole === 'patient' ? '/patient/home' : '/donor/home');
  };

  const finalizeOnboarding = async (payload) => {
    setIsSubmitting(true);
    setScreenError('');

    const result = await completePostLoginOnboarding({
      userId: user?.id,
      email: user?.email || profile?.email || '',
      ...payload,
    });

    setIsSubmitting(false);

    if (!result.success) {
      setScreenError(result.error || 'Unable to complete onboarding.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await continueToRoleHome(result.role);
  };

  const handleContinueAsDonor = async () => {
    await Haptics.selectionAsync();
    await finalizeOnboarding({
      mode: 'donor',
    });
  };

  const handleValidatePatientCode = async () => {
    const normalizedCode = normalizePatientCode(patientCode);
    if (normalizedCode.length !== 6) {
      setPatientCodeError('Invalid Code');
      setPatientPreview(null);
      return;
    }

    await Haptics.selectionAsync();
    setIsValidatingCode(true);
    setPatientCodeError('');
    setPatientPreview(null);

    const result = await getPatientLinkPreview(normalizedCode, {
      currentAuthUserId: user?.id || '',
    });
    setIsValidatingCode(false);

    if (result.error) {
      setPatientCodeError(result.error || 'Patient code could not be validated.');
      return;
    }

    setPatientPreview(result.patient);
  };

  const handleConfirmPatientCode = async () => {
    await Haptics.selectionAsync();
    await finalizeOnboarding({
      mode: 'patient-linked',
      patientCode: normalizePatientCode(patientCode),
    });
  };

  const handleManualPatientSubmit = async (values) => {
    await Haptics.selectionAsync();
    await finalizeOnboarding({
      mode: 'patient-manual',
      manualPatientDetails: values,
    });
  };

  const handleManualPatientInvalid = async (errors) => {
    const invalidFieldNames = Object.keys(errors || {});
    const blockingStep = manualPatientStepFieldGroups.findIndex((fieldNames) => (
      fieldNames.some((fieldName) => invalidFieldNames.includes(fieldName))
    ));

    setScreenError('Please complete the required patient details before creating the account.');

    if (blockingStep >= 0) {
      setManualPatientStep(blockingStep);
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const handleManualPatientNext = async () => {
    const isValid = await manualPatientForm.trigger(manualPatientStepFieldGroups[manualPatientStep]);

    if (!isValid) {
      setScreenError('Please complete the required fields before continuing.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    await Haptics.selectionAsync();
    setScreenError('');
    setManualPatientStep((currentStep) => Math.min(currentStep + 1, 2));
  };

  const pickManualPatientAsset = async (fieldName, setUploading) => {
    try {
      setUploading(true);
      if (Platform.OS !== 'web' && Platform.OS !== 'android') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setScreenError('Please allow photo library access to continue.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];
      const mediaPayload = await getPickedMediaPayload(
        asset,
        fieldName === 'patient_picture' ? 'patient-picture' : 'patient-document'
      );
      manualPatientForm.setValue(fieldName, mediaPayload, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setScreenError('');
    } catch (error) {
      setScreenError(error?.message || 'Unable to use the selected file.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(false);
    }
  };

  const renderOnboardingCard = () => {
    if (branchMode === 'donor-info') {
      return (
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.onboardingCard}>
          <View style={styles.onboardingSection}>
            <Text style={styles.onboardingQuestion}>Assign User Role to Donor</Text>
            <Text style={styles.onboardingBody}>
              This account will be routed to the Donor Dashboard after the donor role is assigned.
            </Text>
          </View>

          <View style={styles.actionStack}>
            <AppButton
              title="Open Donor Dashboard"
              size="lg"
              loading={isSubmitting}
              disabled={isSubmitting}
              onPress={handleContinueAsDonor}
            />
            <AppTextLink
              title="Back"
              variant="muted"
              onPress={() => {
                setBranchMode('question');
                setScreenError('');
              }}
            />
          </View>
        </AppCard>
      );
    }

    if (branchMode === 'patient-code') {
      return (
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.onboardingCard}>
          <View style={styles.onboardingSection}>
            <Text style={styles.onboardingQuestion}>Input Patient Code</Text>
            <Text style={styles.onboardingBody}>
              Enter the numeric part of the patient code provided with the temporary credentials.
            </Text>
          </View>

          <OtpInput
            length={6}
            value={patientCode}
            onChange={(value) => {
              setPatientCode(normalizePatientCode(value));
              setPatientPreview(null);
              setPatientCodeError('');
              setScreenError('');
            }}
            keyboardType="default"
            characterSet="alphanumeric"
            autoCapitalize="characters"
            error={Boolean(patientCodeError)}
            style={styles.codeInput}
          />

          {patientCodeError ? <Text style={styles.errorText}>{patientCodeError}</Text> : null}
          {patientPreview ? <PatientPreviewCard patient={patientPreview} /> : null}

          <View style={styles.actionStack}>
            {patientPreview ? (
              <AppButton
                title="Assign Patient Role"
                size="lg"
                loading={isSubmitting}
                disabled={isSubmitting}
                onPress={handleConfirmPatientCode}
              />
            ) : (
              <AppButton
                title="Validate Patient Code"
                size="lg"
                loading={isValidatingCode}
                disabled={isValidatingCode || isSubmitting}
                onPress={handleValidatePatientCode}
              />
            )}

            <AppTextLink
              title="No patient code"
              variant="muted"
              disabled={isSubmitting || isValidatingCode}
              onPress={() => {
                setBranchMode('patient-manual');
                setManualPatientStep(0);
                setManualGuardianRelationshipOption('');
                setScreenError('');
              }}
            />

            <AppTextLink
              title="Back"
              variant="muted"
              onPress={() => {
                setBranchMode('question');
                setPatientPreview(null);
                setPatientCodeError('');
                setScreenError('');
              }}
            />
          </View>
        </AppCard>
      );
    }

    if (branchMode === 'patient-manual') {
      const patientPictureValue = manualPatientForm.watch('patient_picture');
      const medicalDocumentValue = manualPatientForm.watch('medical_document');
      const manualGenderValue = manualPatientForm.watch('gender');
      const manualGuardianRelationshipValue = manualPatientForm.watch('guardian_relationship');
      const isManualGuardianRelationshipOther = manualGuardianRelationshipOption === 'Other';
      const patientPicturePreview = typeof patientPictureValue === 'string' ? patientPictureValue : patientPictureValue?.previewUri || '';
      const medicalDocumentPreview = typeof medicalDocumentValue === 'string' ? medicalDocumentValue : medicalDocumentValue?.previewUri || '';

      return (
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.onboardingCard}>
          <View style={styles.onboardingSection}>
            <Text style={styles.onboardingQuestion}>Enter Patient Information</Text>
            <Text style={styles.onboardingBody}>
              The Patient Dashboard opens only after the patient role is assigned.
            </Text>
          </View>

          <View style={styles.stepIndicatorRow}>
            <Text style={[styles.stepIndicator, manualPatientStep === 0 ? styles.stepIndicatorActive : null]}>Step 1</Text>
            <Text style={[styles.stepIndicator, manualPatientStep === 1 ? styles.stepIndicatorActive : null]}>Step 2</Text>
            <Text style={[styles.stepIndicator, manualPatientStep === 2 ? styles.stepIndicatorActive : null]}>Step 3</Text>
          </View>

          <View style={manualPatientStep === 0 ? styles.manualStepPanel : styles.manualStepPanelHidden}>
              <Controller
                control={manualPatientForm.control}
                name="first_name"
                defaultValue={getManualPatientFieldValue('first_name')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="First Name"
                    required={true}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="Enter your first name"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="middle_name"
                defaultValue={getManualPatientFieldValue('middle_name')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Middle Name"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="Enter your middle name"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="last_name"
                defaultValue={getManualPatientFieldValue('last_name')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Last Name"
                    required={true}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="Enter your last name"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="suffix"
                defaultValue={getManualPatientFieldValue('suffix')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Suffix"
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="Suffix"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="birthdate"
                defaultValue={getManualPatientFieldValue('birthdate')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <DatePickerField
                    label="Birthdate"
                    required={true}
                    value={value ?? ''}
                    placeholder="Select your birthdate"
                    helperText=""
                    error={fieldState.error?.message}
                    onChange={onChange}
                    onBlur={onBlur}
                    minimumDate={MINIMUM_BIRTHDATE}
                    maximumDate={getMaximumBirthdate()}
                    onPress={() => Haptics.selectionAsync()}
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="gender"
                defaultValue={getManualPatientFieldValue('gender')}
                render={({ fieldState }) => (
                  <>
                    <AddressSelectField
                      label="Gender"
                      required={true}
                      value={manualGenderValue}
                      placeholder="Select gender"
                      helperText=""
                      error={fieldState.error?.message}
                      onPress={async () => {
                        await Haptics.selectionAsync();
                        setActiveManualPicker('gender');
                      }}
                    />

                    <AddressOptionSheet
                      visible={activeManualPicker === 'gender'}
                      title="Select Gender"
                      placeholder="Search gender"
                      options={profileGenderOptions}
                      selectedValue={manualGenderValue}
                      onClose={() => setActiveManualPicker('')}
                      onSelect={(option) => {
                        manualPatientForm.setValue('gender', option.value, {
                          shouldDirty: true,
                          shouldTouch: true,
                          shouldValidate: true,
                        });
                      }}
                    />
                  </>
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="contact_number"
                defaultValue={getManualPatientFieldValue('contact_number')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Contact Number"
                    required={true}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="09123456789"
                    keyboardType="phone-pad"
                    variant="filled"
                  />
                )}
              />

              <SignupAddressSection
                control={manualPatientForm.control}
                errors={manualPatientForm.formState.errors}
                setValue={manualPatientForm.setValue}
                showHeader={false}
                showHelperText={false}
                showTopBorder={false}
              />
          </View>

          <View style={manualPatientStep === 1 ? styles.manualStepPanel : styles.manualStepPanelHidden}>
              <Controller
                control={manualPatientForm.control}
                name="medical_condition"
                defaultValue={getManualPatientFieldValue('medical_condition')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Medical Condition"
                    required={true}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="Enter the medical condition"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="date_of_diagnosis"
                defaultValue={getManualPatientFieldValue('date_of_diagnosis')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <DatePickerField
                    label="Date of Diagnosis"
                    required={true}
                    value={value ?? ''}
                    placeholder="Select diagnosis date"
                    helperText=""
                    error={fieldState.error?.message}
                    onChange={onChange}
                    onBlur={onBlur}
                    minimumDate={MINIMUM_DIAGNOSIS_DATE}
                    maximumDate={getMaximumDiagnosisDate()}
                    onPress={() => Haptics.selectionAsync()}
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="guardian"
                defaultValue={getManualPatientFieldValue('guardian')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Guardian"
                    required={true}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="Enter guardian name"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="guardian_contact_number"
                defaultValue={getManualPatientFieldValue('guardian_contact_number')}
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Guardian Contact Number"
                    required={true}
                    value={value ?? ''}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="09123456789"
                    keyboardType="phone-pad"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="guardian_relationship"
                defaultValue={getManualPatientFieldValue('guardian_relationship')}
                render={({ fieldState }) => (
                  <>
                    <AddressSelectField
                      label="Guardian Relationship"
                      required={true}
                      value={manualGuardianRelationshipOption}
                      placeholder="Select relationship"
                      helperText=""
                      error={fieldState.error?.message}
                      onPress={async () => {
                        await Haptics.selectionAsync();
                        setActiveManualPicker('guardianRelationship');
                      }}
                    />

                    <AddressOptionSheet
                      visible={activeManualPicker === 'guardianRelationship'}
                      title="Select Relationship"
                      placeholder="Search relationship"
                      options={guardianRelationshipOptions}
                      selectedValue={manualGuardianRelationshipValue}
                      onClose={() => setActiveManualPicker('')}
                      onSelect={(option) => {
                        setManualGuardianRelationshipOption(option.value);

                        manualPatientForm.setValue(
                          'guardian_relationship',
                          option.value === 'Other' ? '' : option.value,
                          {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          }
                        );
                      }}
                    />
                  </>
                )}
              />

              {isManualGuardianRelationshipOther ? (
                <Controller
                  control={manualPatientForm.control}
                  name="guardian_relationship"
                  defaultValue={getManualPatientFieldValue('guardian_relationship')}
                  render={({ field: { onChange, onBlur, value }, fieldState }) => (
                    <AppInput
                      label="Other Relationship"
                      required={true}
                      value={value ?? ''}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      error={fieldState.error?.message}
                      placeholder="Enter relationship"
                      variant="filled"
                    />
                  )}
                />
              ) : null}
          </View>

          <View style={manualPatientStep === 2 ? styles.manualStepPanel : styles.manualStepPanelHidden}>
            <View style={styles.uploadSection}>
              <AppCard variant="soft" radius="xl" padding="md" style={styles.uploadCard}>
                <View style={styles.uploadCardCopy}>
                  <Text style={styles.uploadCardTitle}>Patient Picture</Text>
                </View>
                <AppButton
                  title={patientPictureValue ? 'Change Picture' : 'Add Picture'}
                  variant="secondary"
                  loading={isUploadingPatientPicture}
                  disabled={isUploadingPatientPicture || isSubmitting}
                  onPress={() => pickManualPatientAsset('patient_picture', setIsUploadingPatientPicture)}
                />
              </AppCard>

              {patientPictureValue ? (
                <Image source={{ uri: patientPicturePreview }} style={styles.uploadPreviewImage} />
              ) : null}

              <AppCard variant="soft" radius="xl" padding="md" style={styles.uploadCard}>
                <View style={styles.uploadCardCopy}>
                  <Text style={styles.uploadCardTitle}>Medical Document</Text>
                </View>
                <AppButton
                  title={medicalDocumentValue ? 'Change Document' : 'Add Document'}
                  variant="secondary"
                  loading={isUploadingMedicalDocument}
                  disabled={isUploadingMedicalDocument || isSubmitting}
                  onPress={() => pickManualPatientAsset('medical_document', setIsUploadingMedicalDocument)}
                />
              </AppCard>

              {medicalDocumentValue ? (
                <Image source={{ uri: medicalDocumentPreview }} style={styles.uploadPreviewImage} />
              ) : null}
            </View>
          </View>

          <View style={styles.actionStack}>
            {manualPatientStep < 2 ? (
              <AppButton
                title="Next"
                size="lg"
                disabled={isSubmitting}
                onPress={handleManualPatientNext}
              />
            ) : (
              <AppButton
                title="Assign Patient Role"
                size="lg"
                loading={isSubmitting}
                disabled={isSubmitting || isUploadingPatientPicture || isUploadingMedicalDocument}
                onPress={manualPatientForm.handleSubmit(handleManualPatientSubmit, handleManualPatientInvalid)}
              />
            )}

            {manualPatientStep > 0 ? (
              <AppTextLink
                title={manualPatientStep === 2 ? 'Back to Step 2' : 'Back to Step 1'}
                variant="muted"
                onPress={() => setManualPatientStep((currentStep) => Math.max(currentStep - 1, 0))}
              />
            ) : null}

            <AppTextLink
              title="Back"
              variant="muted"
              onPress={() => {
                setBranchMode('patient-code');
                setManualPatientStep(0);
                setManualGuardianRelationshipOption('');
                setScreenError('');
              }}
            />
          </View>
        </AppCard>
      );
    }

    return (
      <AppCard variant="elevated" radius="xl" padding="lg" style={styles.onboardingCard}>
        <View style={styles.onboardingSection}>
          <Text style={styles.onboardingQuestion}>Is the user a Patient?</Text>
          <Text style={styles.onboardingBody}>
            Choose Patient only if this account should complete the patient startup flow.
          </Text>
        </View>

        <View style={styles.choiceRow}>
          <AppButton
            title="Yes"
            size="lg"
            fullWidth={false}
            style={styles.choiceButton}
            disabled={!isIntroReady || isSubmitting}
            onPress={async () => {
              await Haptics.selectionAsync();
              setBranchMode('patient-code');
              setScreenError('');
            }}
          />
          <AppButton
            title="No"
            variant="secondary"
            size="lg"
            fullWidth={false}
            style={styles.choiceButton}
            disabled={!isIntroReady || isSubmitting}
            onPress={async () => {
              await Haptics.selectionAsync();
              setBranchMode('donor-info');
              setScreenError('');
            }}
          />
        </View>
      </AppCard>
    );
  };

  return (
    <ScreenContainer
      scrollable={branchMode === 'patient-manual'}
      safeArea
      variant="auth"
      contentStyle={styles.screenContent}
    >
      <View style={styles.centeredContainer}>
        <View style={styles.content}>
          <BrandLogo resolvedTheme={resolvedTheme} />

          <Animated.Text style={[styles.heroTitle, { opacity: welcomeOpacity }]}>
            {resolvedTheme?.brandName ? `Welcome to ${resolvedTheme.brandName}` : 'Welcome'}
          </Animated.Text>

          <Animated.Text style={[styles.heroTitle, { opacity: startOpacity }]}>
            Let&apos;s get you started
          </Animated.Text>

          {isIntroReady ? renderOnboardingCard() : <View style={styles.introSpacer} />}

          {screenError ? <Text style={styles.errorText}>{screenError}</Text> : null}
        </View>
      </View>
    </ScreenContainer>
  );
}

export default function LandingScreen() {
  const { user, needsOnboarding, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState />;
  }

  if (!user) {
    return <PublicLanding />;
  }

  if (needsOnboarding) {
    return <FirstTimeOnboarding />;
  }

  return <LoadingState />;
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xxl,
    paddingTop: theme.spacing.xxxxl,
    paddingBottom: theme.spacing.giant,
  },
  landingCard: {
    width: '100%',
    maxWidth: 356,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xxxl,
  },
  landingBrandCluster: {
    width: '100%',
    alignItems: 'center',
    gap: theme.spacing.xl,
  },
  landingGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
  },
  landingPage: {
    width: '100%',
    minHeight: '100%',
  },
  landingTopBar: {
    width: '100%',
    minHeight: 64,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  landingContent: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
    gap: theme.spacing.xxxl,
  },
  landingHeroSection: {
    width: '100%',
    gap: theme.spacing.xl,
  },
  landingDecorRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  landingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  landingBrandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  landingBrandText: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    fontWeight: theme.typography.weights.bold,
  },
  landingNavButton: {
    minHeight: 44,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
  },
  landingNavButtonText: {
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.bold,
  },
  landingArtWrap: {
    width: '100%',
    height: 270,
    borderRadius: theme.radius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    shadowColor: theme.colors.palette.black,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 5,
  },
  landingHeroImage: {
    width: '100%',
    height: '100%',
  },
  landingHeroImageInner: {
    borderRadius: 30,
  },
  landingHeroShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17,17,17,0.18)',
  },
  landingHeroBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  landingHeroBadge: {
    minHeight: 34,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  landingHeroBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.bold,
  },
  illustrationStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hairHalo: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    opacity: 0.72,
  },
  hairStrandLarge: {
    position: 'absolute',
    width: 132,
    height: 154,
    borderTopLeftRadius: 88,
    borderTopRightRadius: 34,
    borderBottomLeftRadius: 84,
    borderBottomRightRadius: 76,
    opacity: 0.9,
    transform: [{ rotate: '-16deg' }],
  },
  hairStrandSmall: {
    position: 'absolute',
    right: 46,
    top: 30,
    width: 42,
    height: 116,
    borderRadius: 24,
    opacity: 0.8,
    transform: [{ rotate: '18deg' }],
  },
  personHead: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  personHairLeft: {
    position: 'absolute',
    left: 92,
    top: 70,
    width: 42,
    height: 118,
    borderRadius: 24,
    opacity: 0.9,
    transform: [{ rotate: '8deg' }],
  },
  personHairRight: {
    position: 'absolute',
    right: 86,
    top: 68,
    width: 46,
    height: 126,
    borderRadius: 26,
    opacity: 0.9,
    transform: [{ rotate: '-8deg' }],
  },
  personBody: {
    width: 126,
    height: 74,
    marginTop: -8,
    borderTopLeftRadius: 42,
    borderTopRightRadius: 42,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  donationBadge: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    minWidth: 108,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  donationBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  landingCopyBlock: {
    width: '100%',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  landingTitle: {
    textAlign: 'left',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 32,
    lineHeight: 40,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.textPrimary,
  },
  landingSubtitle: {
    textAlign: 'left',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    maxWidth: 560,
  },
  landingAssistant: {
    marginBottom: theme.spacing.md,
  },
  landingActionStack: {
    width: '100%',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  landingButtonPrimary: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
  },
  landingButtonSecondary: {
    minHeight: 48,
    borderRadius: theme.radius.lg,
  },
  landingButtonText: {
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  landingSection: {
    width: '100%',
    gap: theme.spacing.lg,
  },
  landingSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.title,
    lineHeight: theme.typography.semantic.title * theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
  },
  landingCardGrid: {
    width: '100%',
    gap: theme.spacing.md,
  },
  landingInfoCard: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
    shadowColor: theme.colors.palette.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 3,
  },
  landingInfoIcon: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xs,
  },
  landingInfoTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    textAlign: 'center',
  },
  landingInfoBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    textAlign: 'center',
  },
  landingProcessSection: {
    borderRadius: 24,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  landingProcessBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    lineHeight: theme.typography.semantic.body * theme.typography.lineHeights.relaxed,
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 680,
  },
  landingProcessGrid: {
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  landingStepCard: {
    borderWidth: 1,
    borderRadius: theme.radius.xxl,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    overflow: 'hidden',
  },
  landingStepNumber: {
    position: 'absolute',
    top: theme.spacing.md,
    right: theme.spacing.md,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 42,
    fontWeight: theme.typography.weights.bold,
  },
  landingStepTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    marginTop: theme.spacing.xs,
  },
  landingStepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  landingFooter: {
    width: '100%',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  landingFooterBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
  },
  landingFooterText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
  },
  content: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: theme.spacing.lg,
  },
  logoWrap: {
    width: 112,
    height: 112,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  logo: {
    width: 68,
    height: 68,
  },
  logoPlain: {
    width: 42,
    height: 42,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
    lineHeight: theme.typography.compact.titleSm * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  copyBlock: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  heroTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
  },
  heroSubtitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    maxWidth: 300,
  },
  introSpacer: {
    minHeight: 220,
  },
  onboardingCard: {
    width: '100%',
    overflow: 'visible',
  },
  onboardingSection: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  onboardingQuestion: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  onboardingBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  stepIndicatorRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  stepIndicator: {
    minWidth: 72,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  stepIndicatorActive: {
    backgroundColor: theme.colors.brandPrimaryMuted,
    color: theme.colors.textPrimary,
  },
  actionStack: {
    width: '100%',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  choiceRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  choiceButton: {
    flex: 0,
    minWidth: 132,
    maxWidth: 150,
    alignSelf: 'center',
  },
  codeInput: {
    marginTop: 0,
    marginBottom: theme.spacing.sm,
  },
  previewCard: {
    width: '100%',
    marginTop: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  confirmTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  confirmValue: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textPrimary,
  },
  previewRow: {
    gap: 2,
  },
  previewLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  previewValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    color: theme.colors.textPrimary,
  },
  uploadSection: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  manualStepPanel: {
    width: '100%',
  },
  manualStepPanelHidden: {
    width: '100%',
    display: 'none',
  },
  uploadCard: {
    width: '100%',
    gap: theme.spacing.sm,
  },
  uploadCardCopy: {
    gap: 2,
  },
  uploadCardTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  uploadPreviewImage: {
    width: '100%',
    height: 180,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  errorText: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },
});
