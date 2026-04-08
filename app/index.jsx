import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ScreenContainer } from '../src/components/ui/ScreenContainer';
import { AppButton } from '../src/components/ui/AppButton';
import { AppIcon } from '../src/components/ui/AppIcon';
import { AppInput } from '../src/components/ui/AppInput';
import { AppCard } from '../src/components/ui/AppCard';
import { AppTextLink } from '../src/components/ui/AppTextLink';
import { OtpInput } from '../src/components/ui/OtpInput';
import { DatePickerField } from '../src/components/ui/DatePickerField';
import { AddressOptionSheet, AddressSelectField, SignupAddressSection } from '../src/components/auth/SignupAddressSection';
import { useAuth } from '../src/providers/AuthProvider';
import {
  completePostLoginOnboarding,
  getPatientLinkPreview,
} from '../src/features/profile/services/profile.service';
import { patientOnboardingSchema } from '../src/features/profile/profile.schema';
import { profileGenderOptions } from '../src/constants/profile';
import { theme } from '../src/design-system/theme';
import donivraLogoNoText from '../src/assets/images/donivra_logo_no_text.png';

const normalizePatientCode = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const IMAGE_MEDIA_TYPES = ['images'];
const PROFILE_MINIMUM_AGE = 18;
const MINIMUM_BIRTHDATE = new Date(1900, 0, 1);

const getMaximumBirthdate = () => {
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() - PROFILE_MINIMUM_AGE);
  return maxDate;
};

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

function LoadingState() {
  return (
    <ScreenContainer
      scrollable={false}
      safeArea
      variant="auth"
      contentStyle={styles.screenContent}
    >
      <View style={styles.centeredContainer}>
        <View style={styles.logoWrap}>
          <Image source={donivraLogoNoText} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.brandName}>Donivra</Text>
      </View>
    </ScreenContainer>
  );
}

function PublicLanding() {
  const router = useRouter();

  const navigateWithHaptic = async (path) => {
    await Haptics.selectionAsync();
    router.push(path);
  };

  return (
    <ScreenContainer
      scrollable={false}
      safeArea
      variant="auth"
      heroColors={[theme.colors.dashboardDonorFrom, theme.colors.heroTo]}
      contentStyle={styles.screenContent}
    >
      <View style={styles.centeredContainer}>
        <View style={styles.content}>
          <View style={styles.logoWrap}>
            <Image source={donivraLogoNoText} style={styles.logo} resizeMode="contain" />
          </View>

          <Text style={styles.brandName}>Donivra</Text>

          <View style={styles.copyBlock}>
            <Text style={styles.heroTitle}>Welcome</Text>
            <Text style={styles.heroSubtitle}>Sign up or log in to continue.</Text>
          </View>

          <View style={styles.actionStack}>
            <AppButton
              title="Sign Up"
              variant="primary"
              size="lg"
              leading={<AppIcon name="profile" state="inverse" />}
              onPress={() => navigateWithHaptic('/auth/signup')}
              enableHaptics={true}
            />
            <AppButton
              title="Log In"
              variant="secondary"
              size="lg"
              leading={<AppIcon name="profile" state="default" />}
              onPress={() => navigateWithHaptic('/auth/access')}
              enableHaptics={true}
            />
          </View>
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
      <Text style={styles.confirmTitle}>Are you:</Text>
      <Text style={styles.confirmValue}>
        {displayName} from the {displayHospital}
      </Text>
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
  const { user, profile, refreshProfile } = useAuth();
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
  const [isUploadingPatientPicture, setIsUploadingPatientPicture] = useState(false);
  const [isUploadingMedicalDocument, setIsUploadingMedicalDocument] = useState(false);
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const startOpacity = useRef(new Animated.Value(0)).current;

  const manualPatientForm = useForm({
    resolver: zodResolver(patientOnboardingSchema),
    mode: 'onBlur',
    defaultValues: {
      first_name: profile?.first_name || '',
      middle_name: profile?.middle_name || '',
      last_name: profile?.last_name || '',
      suffix: profile?.suffix || '',
      birthdate: profile?.birthdate || '',
      gender: profile?.gender || '',
      phone: profile?.contact_number || profile?.phone || '',
      street: profile?.street || '',
      barangay: profile?.barangay || '',
      region: profile?.region || '',
      city: profile?.city || '',
      province: profile?.province || '',
      country: profile?.country || 'Philippines',
      medical_condition: '',
      date_of_diagnosis: '',
      guardian: '',
      guardian_relationship: '',
      guardian_contact_number: '',
      patient_picture: '',
      medical_document: '',
    },
  });

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
      setPatientCodeError('Enter the 6-character hospital code.');
      setPatientPreview(null);
      return;
    }

    await Haptics.selectionAsync();
    setIsValidatingCode(true);
    setPatientCodeError('');
    setPatientPreview(null);

    const result = await getPatientLinkPreview(normalizedCode);
    setIsValidatingCode(false);

    if (result.error) {
      setPatientCodeError(result.error);
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

  const handleManualPatientNext = async () => {
    const isValid = await manualPatientForm.trigger(
      manualPatientStep === 0
        ? [
            'first_name',
            'middle_name',
            'last_name',
            'suffix',
            'birthdate',
            'gender',
            'phone',
            'street',
            'barangay',
            'region',
            'city',
            'province',
            'country',
          ]
        : [
            'medical_condition',
            'date_of_diagnosis',
            'guardian',
            'guardian_relationship',
            'guardian_contact_number',
          ]
    );

    if (!isValid) {
      return;
    }

    await Haptics.selectionAsync();
    setManualPatientStep((currentStep) => Math.min(currentStep + 1, 2));
  };

  const pickManualPatientAsset = async (fieldName, setUploading) => {
    try {
      setUploading(true);
      if (Platform.OS !== 'web') {
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
    } finally {
      setUploading(false);
    }
  };

  const renderOnboardingCard = () => {
    if (branchMode === 'donor-info') {
      return (
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.onboardingCard}>
          <View style={styles.onboardingSection}>
            <Text style={styles.onboardingQuestion}>Donivra helps support hair donation and patient care.</Text>
          </View>

          <View style={styles.actionStack}>
            <AppButton
              title="Go to Dashboard"
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
            <Text style={styles.onboardingQuestion}>please enter hospital code received on your email</Text>
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
                title="Confirm and Continue"
                size="lg"
                loading={isSubmitting}
                disabled={isSubmitting}
                onPress={handleConfirmPatientCode}
              />
            ) : (
              <AppButton
                title="Validate Code"
                size="lg"
                loading={isValidatingCode}
                disabled={isValidatingCode || isSubmitting}
                onPress={handleValidatePatientCode}
              />
            )}

            <AppTextLink
              title="I don't Have a Code"
              variant="muted"
              disabled={isSubmitting || isValidatingCode}
              onPress={() => {
                setBranchMode('patient-manual');
                setManualPatientStep(0);
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
      const patientPicturePreview = typeof patientPictureValue === 'string' ? patientPictureValue : patientPictureValue?.previewUri || '';
      const medicalDocumentPreview = typeof medicalDocumentValue === 'string' ? medicalDocumentValue : medicalDocumentValue?.previewUri || '';

      return (
        <AppCard variant="elevated" radius="xl" padding="lg" style={styles.onboardingCard}>
          <View style={styles.onboardingSection}>
            <Text style={styles.onboardingQuestion}>Manual patient details</Text>
          </View>

          <View style={styles.stepIndicatorRow}>
            <Text style={[styles.stepIndicator, manualPatientStep === 0 ? styles.stepIndicatorActive : null]}>Step 1</Text>
            <Text style={[styles.stepIndicator, manualPatientStep === 1 ? styles.stepIndicatorActive : null]}>Step 2</Text>
            <Text style={[styles.stepIndicator, manualPatientStep === 2 ? styles.stepIndicatorActive : null]}>Step 3</Text>
          </View>

          {manualPatientStep === 0 ? (
            <>
              <Controller
                control={manualPatientForm.control}
                name="first_name"
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="First Name"
                    value={value}
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
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Middle Name"
                    value={value}
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
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Last Name"
                    value={value}
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
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Suffix"
                    value={value}
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
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <DatePickerField
                    label="Birthdate"
                    value={value}
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
                render={({ fieldState }) => (
                  <>
                    <AddressSelectField
                      label="Gender"
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
                name="phone"
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Mobile Number"
                    value={value}
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
            </>
          ) : manualPatientStep === 1 ? (
            <>
              <Controller
                control={manualPatientForm.control}
                name="medical_condition"
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Medical Condition"
                    value={value}
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
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Date of Diagnosis"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="YYYY-MM-DD"
                    variant="filled"
                  />
                )}
              />

              <Controller
                control={manualPatientForm.control}
                name="guardian"
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Guardian"
                    value={value}
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
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Guardian Contact Number"
                    value={value}
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
                render={({ field: { onChange, onBlur, value }, fieldState }) => (
                  <AppInput
                    label="Guardian Relationship"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={fieldState.error?.message}
                    placeholder="Parent, sibling, guardian"
                    variant="filled"
                  />
                )}
              />
            </>
          ) : (
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
          )}

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
                title="Complete Patient Account"
                size="lg"
                loading={isSubmitting}
                disabled={isSubmitting || isUploadingPatientPicture || isUploadingMedicalDocument}
                onPress={manualPatientForm.handleSubmit(handleManualPatientSubmit)}
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
          <Text style={styles.onboardingQuestion}>Are you a Patient?</Text>
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
          <View style={styles.logoWrap}>
            <Image source={donivraLogoNoText} style={styles.logo} resizeMode="contain" />
          </View>

          <Animated.Text style={[styles.heroTitle, { opacity: welcomeOpacity }]}>
            Welcome to Donivra
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
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xl,
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
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleMd,
    lineHeight: theme.typography.semantic.titleMd * theme.typography.lineHeights.tight,
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
    gap: theme.spacing.sm,
  },
  choiceButton: {
    flex: 1,
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
