import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AppInput } from '../ui/AppInput';
import { PasswordInput } from '../ui/PasswordInput';
import { AppButton } from '../ui/AppButton';
import { AppIcon } from '../ui/AppIcon';
import { AppTextLink } from '../ui/AppTextLink';
import { OtpInput } from '../ui/OtpInput';
import { FormProgressStepper } from '../ui/FormProgressStepper';
import { theme } from '../../design-system/theme';
import { SignupAddressSection } from './SignupAddressSection';
import { signupDefaultValues } from '../../features/auth/validators/auth.schema';
import { getPasswordStrengthMessage } from '../../utils/passwordRules';
import { getPatientLinkPreview } from '../../features/profile/services/profile.service';

const IMAGE_MEDIA_TYPES = ['images'];

const buildPatientFullName = (patient) => [patient?.first_name, patient?.middle_name, patient?.last_name, patient?.suffix]
  .filter(Boolean)
  .join(' ')
  .trim();

const normalizeCodeValue = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const SIGNUP_STEPS = [
  { key: 'personal', label: 'Personal Details', shortLabel: 'Personal', fields: ['firstName', 'lastName', 'email', 'phone'] },
  { key: 'address', label: 'Address', shortLabel: 'Address', fields: ['street', 'barangay', 'city', 'province', 'region', 'country'] },
  { key: 'patientQuestion', label: 'Patient', shortLabel: 'Patient', fields: ['isPatient'] },
  { key: 'photo', label: 'Profile Picture', shortLabel: 'Photo', fields: [] },
  { key: 'confirm', label: 'Confirm', shortLabel: 'Confirm', fields: ['password', 'confirmPassword'] },
  { key: 'verify', label: 'OTP Verification', shortLabel: 'Verify', fields: [] },
];

const getStepCopy = (key) => {
  if (key === 'personal') return { title: 'Personal details', body: 'Start with the main account details needed for your Donivra profile.' };
  if (key === 'address') return { title: 'Address', body: 'Use the existing address lookup flow, then adjust the returned fields only if needed.' };
  if (key === 'patientQuestion') return { title: 'Are you a patient?', body: 'If yes, we will open a popup so you can verify and link your hospital patient record.' };
  if (key === 'photo') return { title: 'Optional profile picture', body: 'Add a profile picture now if you want. You can also skip this step.' };
  if (key === 'confirm') return { title: 'Confirm details', body: 'Review everything before account creation and OTP verification.' };
  return { title: 'OTP verification', body: 'The verification step comes after account submission.' };
};

const ChoiceCard = ({ title, description, selected, onPress }) => (
  <Pressable onPress={onPress} style={[styles.choiceCard, selected ? styles.choiceCardActive : null]}>
    <View style={styles.choiceCopy}>
      <Text style={styles.choiceTitle}>{title}</Text>
      <Text style={styles.choiceBody}>{description}</Text>
    </View>
    {selected ? <AppIcon name="success" state="success" size="sm" /> : null}
  </Pressable>
);

const PreviewCard = ({ patient }) => (
  <View style={styles.panel}>
    <Text style={styles.panelTitle}>Patient preview</Text>
    <Text style={styles.previewRow}>Code: {patient?.patient_code || 'Not available'}</Text>
    <Text style={styles.previewRow}>Name: {buildPatientFullName(patient) || 'Not available'}</Text>
    <Text style={styles.previewRow}>Age: {patient?.age || 'Not available'}</Text>
    <Text style={styles.previewRow}>Gender: {patient?.gender || 'Not available'}</Text>
    <Text style={styles.previewRow}>Condition: {patient?.medical_condition || 'Not available'}</Text>
    <Text style={styles.previewRow}>Hospital ID: {patient?.hospital_id || 'Not assigned'}</Text>
  </View>
);

const SummarySection = ({ title, rows }) => (
  <View style={styles.panel}>
    <Text style={styles.panelTitle}>{title}</Text>
    {rows.map((row) => (
      <View key={row.label} style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>{row.label}</Text>
        <Text style={styles.summaryValue}>{row.value || 'Not provided'}</Text>
      </View>
    ))}
  </View>
);

const ImagePickerBlock = ({ value, onPress, loading, emptyTitle, emptyBody, buttonTitle }) => (
  <View style={styles.uploadWrap}>
    <View style={styles.uploadPreview}>
      {value ? (
        <Image source={{ uri: value }} style={styles.uploadImage} />
      ) : (
        <View style={styles.uploadPlaceholder}>
          <View style={styles.uploadIconWrap}>
            <AppIcon name="camera" state="active" />
          </View>
          <Text style={styles.uploadTitle}>{emptyTitle}</Text>
          <Text style={styles.uploadBody}>{emptyBody}</Text>
        </View>
      )}
    </View>
    <AppButton
      title={value ? 'Change Photo' : buttonTitle}
      variant="secondary"
      loading={loading}
      leading={<AppIcon name="image" state="muted" />}
      onPress={onPress}
    />
  </View>
);

const PatientCodeModal = ({
  visible,
  codeValue,
  onChangeCode,
  onClose,
  onValidate,
  onConfirm,
  preview,
  errorMessage,
  isValidating,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={styles.modalSheetWrap}>
        <View style={styles.modalCardWrap}>
          <View style={styles.modalTopRow}>
            <Text style={styles.modalTitle}>Hospital patient code</Text>
            <AppTextLink title="Close" variant="muted" onPress={onClose} />
          </View>
          <Text style={styles.modalSubtitle}>
            Enter your hospital patient code so we can validate it, preview the patient details, and link that record to your account.
          </Text>
          <OtpInput
            length={6}
            value={codeValue}
            onChange={onChangeCode}
            error={Boolean(errorMessage)}
            keyboardType="default"
            characterSet="alphanumeric"
            autoCapitalize="characters"
            style={styles.codeInput}
          />
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {!preview ? (
            <AppButton
              title="Validate Code"
              variant="secondary"
              loading={isValidating}
              leading={<AppIcon name="shield" state="muted" />}
              onPress={onValidate}
            />
          ) : null}
          {preview ? (
            <View style={styles.stack}>
              <PreviewCard patient={preview} />
              <AppButton
                title="Confirm Patient Details"
                leading={<AppIcon name="success" state="inverse" />}
                onPress={onConfirm}
              />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  </Modal>
);

export const SignupForm = ({ schema, onSubmit, isLoading, buttonText = 'Create Account' }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [patientCodeInput, setPatientCodeInput] = useState('');
  const [patientLookupPreview, setPatientLookupPreview] = useState(null);
  const [linkedPatientPreview, setLinkedPatientPreview] = useState(null);
  const [patientLookupError, setPatientLookupError] = useState('');
  const [isValidatingPatientCode, setIsValidatingPatientCode] = useState(false);

  const { control, handleSubmit, setValue, watch, trigger, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: signupDefaultValues,
  });

  const isPatient = watch('isPatient');
  const profilePhoto = watch('profilePhoto');
  const passwordValue = watch('password');
  const allValues = watch();
  const steps = useMemo(() => SIGNUP_STEPS, []);
  const activeStep = steps[currentStep];
  const stepCopy = getStepCopy(activeStep.key);
  const passwordStrengthMessage = getPasswordStrengthMessage(passwordValue);

  const clearLinkedPatient = () => {
    setPatientCodeInput('');
    setPatientLookupPreview(null);
    setLinkedPatientPreview(null);
    setPatientLookupError('');
    setValue('linkedPatientCode', '', { shouldDirty: true });
    setValue('linkedPatientId', '', { shouldDirty: true });
    setValue('linkedPatientHospitalId', '', { shouldDirty: true });
    setValue('linkedPatientName', '', { shouldDirty: true });
    setValue('linkedPatientCondition', '', { shouldDirty: true });
  };

  const nextStep = () => setCurrentStep((value) => Math.min(value + 1, steps.length - 2));
  const backStep = () => setCurrentStep((value) => Math.max(value - 1, 0));

  const pickImage = async (fieldName, setUploading) => {
    try {
      setUploading(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo Access Needed', 'Allow photo library access first so you can add an optional image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.base64) {
        Alert.alert('Photo Unavailable', 'The selected image could not be read. Please choose another photo.');
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      setValue(fieldName, `data:${mimeType};base64,${asset.base64}`, { shouldDirty: true });
    } finally {
      setUploading(false);
    }
  };

  const handlePatientAnswer = (answer) => {
    setValue('isPatient', answer, { shouldDirty: true, shouldValidate: true });
    if (answer === 'no') {
      setValue('patientFlowMode', '', { shouldDirty: true, shouldValidate: true });
      clearLinkedPatient();
      nextStep();
      return;
    }

    setValue('patientFlowMode', '', { shouldDirty: true, shouldValidate: true });
    clearLinkedPatient();
    setIsPatientModalOpen(true);
  };

  const handlePatientCodeChange = (value) => {
    setPatientCodeInput(normalizeCodeValue(value));
    setPatientLookupPreview(null);
    setPatientLookupError('');
    if (linkedPatientPreview) {
      setLinkedPatientPreview(null);
      setValue('patientFlowMode', '', { shouldDirty: true, shouldValidate: true });
      setValue('linkedPatientCode', '', { shouldDirty: true });
      setValue('linkedPatientId', '', { shouldDirty: true });
      setValue('linkedPatientHospitalId', '', { shouldDirty: true });
      setValue('linkedPatientName', '', { shouldDirty: true });
      setValue('linkedPatientCondition', '', { shouldDirty: true });
    }
  };

  const handleValidatePatientCode = async () => {
    const normalizedCode = normalizeCodeValue(patientCodeInput);
    if (normalizedCode.length !== 6) {
      setPatientLookupError('Enter the 6-character hospital code from your email.');
      return;
    }

    setIsValidatingPatientCode(true);
    setPatientLookupError('');
    setPatientLookupPreview(null);
    const result = await getPatientLinkPreview(normalizedCode);
    setIsValidatingPatientCode(false);

    if (result.error) {
      setPatientLookupError(result.error);
      return;
    }

    setPatientCodeInput(normalizedCode);
    setPatientLookupPreview(result.patient);
  };

  const handleConfirmLinkedPatient = () => {
    if (!patientLookupPreview?.patient_id) return;
    setLinkedPatientPreview(patientLookupPreview);
    setValue('patientFlowMode', 'linked', { shouldDirty: true, shouldValidate: true });
    setValue('linkedPatientCode', patientLookupPreview.patient_code || patientCodeInput, { shouldDirty: true, shouldValidate: true });
    setValue('linkedPatientId', String(patientLookupPreview.patient_id || ''), { shouldDirty: true });
    setValue('linkedPatientHospitalId', String(patientLookupPreview.hospital_id || ''), { shouldDirty: true });
    setValue('linkedPatientName', buildPatientFullName(patientLookupPreview), { shouldDirty: true });
    setValue('linkedPatientCondition', patientLookupPreview.medical_condition || '', { shouldDirty: true });
    setPatientLookupError('');
    setIsPatientModalOpen(false);
    nextStep();
  };

  const handleNext = async () => {
    if (activeStep.key === 'patientQuestion') {
      const isValid = await trigger(activeStep.fields);
      if (!isValid) return;

      if (isPatient === 'yes') {
        if (linkedPatientPreview?.patient_id) {
          nextStep();
          return;
        }
        setPatientLookupError('Confirm your patient code in the popup first.');
        setIsPatientModalOpen(true);
        return;
      }

      if (isPatient === 'no') {
        nextStep();
        return;
      }

      return;
    }

    if (!activeStep.fields.length) {
      nextStep();
      return;
    }

    const isValid = await trigger(activeStep.fields);
    if (isValid) {
      nextStep();
    }
  };

  const summary = {
    ...allValues,
    linkedPatientCode: allValues.linkedPatientCode || linkedPatientPreview?.patient_code || '',
    linkedPatientName: allValues.linkedPatientName || buildPatientFullName(linkedPatientPreview),
    linkedPatientCondition: allValues.linkedPatientCondition || linkedPatientPreview?.medical_condition || '',
  };

  return (
    <>
      <View style={styles.container}>
        <FormProgressStepper steps={steps} currentStep={currentStep} style={styles.stepper} />
        <View style={styles.stepCard}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>{stepCopy.title}</Text>
          <Text style={styles.stepBody}>{stepCopy.body}</Text>
        </View>

        {activeStep.key === 'personal' ? (
          <>
            <View style={styles.row}>
              <Controller control={control} name="firstName" render={({ field: { onChange, onBlur, value } }) => <AppInput label="First Name" placeholder="Juan" variant="filled" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.firstName?.message} style={styles.rowField} />} />
              <Controller control={control} name="lastName" render={({ field: { onChange, onBlur, value } }) => <AppInput label="Last Name" placeholder="Dela Cruz" variant="filled" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.lastName?.message} style={styles.rowField} />} />
            </View>
            <Controller control={control} name="email" render={({ field: { onChange, onBlur, value } }) => <AppInput label="Email Address" placeholder="juan@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} variant="filled" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.email?.message} />} />
            <Controller control={control} name="phone" render={({ field: { onChange, onBlur, value } }) => <AppInput label="Mobile Number" placeholder="09123456789" keyboardType="phone-pad" variant="filled" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.phone?.message} />} />
          </>
        ) : null}

        {activeStep.key === 'address' ? <SignupAddressSection control={control} errors={errors} setValue={setValue} showHeader={false} /> : null}

        {activeStep.key === 'patientQuestion' ? (
          <View style={styles.stack}>
            <ChoiceCard title="Yes" description="Open the popup to verify and link your patient details." selected={isPatient === 'yes'} onPress={() => handlePatientAnswer('yes')} />
            <ChoiceCard title="No" description="Continue to the next signup step without patient linking." selected={isPatient === 'no'} onPress={() => handlePatientAnswer('no')} />
            {errors.isPatient?.message ? <Text style={styles.errorText}>{errors.isPatient.message}</Text> : null}
            {patientLookupError ? <Text style={styles.errorText}>{patientLookupError}</Text> : null}
            {linkedPatientPreview ? (
              <View style={styles.stack}>
                <PreviewCard patient={linkedPatientPreview} />
                <View style={styles.linkedRow}>
                  <AppIcon name="success" state="success" />
                  <Text style={styles.linkedText}>This patient record will be linked to your account after signup.</Text>
                </View>
                <AppButton title="Open Patient Popup" variant="outline" leading={<AppIcon name="edit" state="muted" />} onPress={() => setIsPatientModalOpen(true)} />
              </View>
            ) : null}
          </View>
        ) : null}

        {activeStep.key === 'photo' ? <Controller control={control} name="profilePhoto" render={() => <ImagePickerBlock value={profilePhoto} onPress={() => pickImage('profilePhoto', setIsUploadingPhoto)} loading={isUploadingPhoto} emptyTitle="No photo selected" emptyBody="This step is optional. You can upload a profile photo now or skip it." buttonTitle="Upload Photo" />} /> : null}

        {activeStep.key === 'confirm' ? (
          <>
            <SummarySection title="Personal Details" rows={[{ label: 'First name', value: summary.firstName }, { label: 'Last name', value: summary.lastName }, { label: 'Email', value: summary.email }, { label: 'Mobile number', value: summary.phone }]} />
            <SummarySection title="Address" rows={[{ label: 'Street', value: summary.street }, { label: 'Barangay', value: summary.barangay }, { label: 'City', value: summary.city }, { label: 'Province', value: summary.province }, { label: 'Region', value: summary.region }, { label: 'Country', value: summary.country }]} />
            <SummarySection title="Patient Details" rows={[{ label: 'Are you a patient?', value: summary.isPatient === 'yes' ? 'Yes' : summary.isPatient === 'no' ? 'No' : '' }, ...(summary.isPatient === 'yes' ? [{ label: 'Hospital code', value: summary.linkedPatientCode }, { label: 'Linked patient', value: summary.linkedPatientName }, { label: 'Medical condition', value: summary.linkedPatientCondition }] : [])]} />
            <SummarySection title="Profile Picture" rows={[{ label: 'Photo', value: summary.profilePhoto ? 'Profile picture added' : 'Skipped' }]} />
            <Controller control={control} name="password" render={({ field: { onChange, onBlur, value } }) => <PasswordInput label="Password" placeholder="Create a strong password" variant="filled" helperText={passwordStrengthMessage || 'Use uppercase, lowercase, numbers, and a symbol.'} onBlur={onBlur} onChangeText={onChange} value={value} error={errors.password?.message} />} />
            <Controller control={control} name="confirmPassword" render={({ field: { onChange, onBlur, value } }) => <PasswordInput label="Confirm Password" placeholder="Retype password" variant="filled" onBlur={onBlur} onChangeText={onChange} value={value} error={errors.confirmPassword?.message} />} />
          </>
        ) : null}

          <View style={styles.footerRow}>
            <View style={styles.footerSecondary}>
              {currentStep > 0 ? <AppButton title="Back" variant="ghost" fullWidth={false} onPress={backStep} /> : null}
              {activeStep.key === 'photo' ? <AppButton title="Skip" variant="ghost" fullWidth={false} onPress={() => { setValue('profilePhoto', '', { shouldDirty: true }); nextStep(); }} /> : null}
            </View>
            {currentStep < steps.length - 2 ? <AppButton title="Next" fullWidth={false} trailing={<AppIcon name="chevronRight" state="inverse" />} onPress={handleNext} /> : <AppButton title={buttonText} onPress={handleSubmit(onSubmit)} loading={isLoading} size="lg" enableHaptics={true} />}
          </View>
        </View>
      </View>
      <PatientCodeModal
        visible={isPatientModalOpen}
        codeValue={patientCodeInput}
        onChangeCode={handlePatientCodeChange}
        onClose={() => setIsPatientModalOpen(false)}
        onValidate={handleValidatePatientCode}
        onConfirm={handleConfirmLinkedPatient}
        preview={patientLookupPreview}
        errorMessage={patientLookupError}
        isValidating={isValidatingPatientCode}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', gap: theme.spacing.md },
  stepper: { marginBottom: theme.spacing.xs },
  stepCard: { gap: theme.spacing.sm },
  stepHeader: { gap: theme.spacing.xs, marginBottom: theme.spacing.xs },
  stepTitle: { fontFamily: theme.typography.fontFamilyDisplay, fontSize: theme.typography.compact.bodyLg, color: theme.colors.textPrimary },
  stepBody: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.caption, lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed, color: theme.colors.textSecondary },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  rowField: { flex: 1 },
  stack: { gap: theme.spacing.sm },
  choiceCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.md, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceSoft },
  choiceCardActive: { borderColor: theme.colors.brandPrimary, backgroundColor: theme.colors.brandPrimaryMuted },
  choiceCopy: { flex: 1, gap: 2 },
  choiceTitle: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.semantic.body, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary },
  choiceBody: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.caption, lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed, color: theme.colors.textSecondary },
  errorText: { marginTop: 3, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.caption, color: theme.colors.textError, fontWeight: theme.typography.weights.medium },
  codeInput: { marginVertical: 0 },
  panel: { gap: theme.spacing.xs, padding: theme.spacing.md, borderRadius: theme.radius.xl, backgroundColor: theme.colors.surfaceSoft, borderWidth: 1, borderColor: theme.colors.borderSubtle },
  panelTitle: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.semantic.body, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary },
  previewRow: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.bodySm, color: theme.colors.textPrimary },
  linkedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.sm },
  linkedText: { flex: 1, fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.caption, color: theme.colors.textSecondary },
  uploadWrap: { gap: theme.spacing.md },
  uploadPreview: { minHeight: 220, borderRadius: theme.radius.xl, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceSoft, overflow: 'hidden' },
  uploadImage: { width: '100%', height: 220 },
  uploadPlaceholder: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm },
  uploadIconWrap: { width: 58, height: 58, borderRadius: theme.radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.backgroundPrimary },
  uploadTitle: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.body, fontWeight: theme.typography.weights.semibold, color: theme.colors.textPrimary },
  uploadBody: { textAlign: 'center', fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.caption, color: theme.colors.textSecondary, lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  summaryRow: { gap: 2 },
  summaryLabel: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.caption, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { fontFamily: theme.typography.fontFamily, fontSize: theme.typography.compact.bodySm, color: theme.colors.textPrimary },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm, marginTop: theme.spacing.sm },
  footerSecondary: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
});
