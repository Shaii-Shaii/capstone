import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
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
import { calculateAgeFromBirthdate, signupDefaultValues } from '../../features/auth/validators/auth.schema';
import { getPasswordStrengthMessage } from '../../utils/passwordRules';
import { getPatientLinkPreview } from '../../features/profile/services/profile.service';

const IMAGE_MEDIA_TYPES = ['images'];
const EARLIEST_BIRTH_YEAR = 1900;
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDateValue = (value) => {
  if (!value) return null;

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return parsedDate;
};

const getLatestEligibleBirthdate = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setFullYear(date.getFullYear() - 18);
  return date;
};

const getEarliestBirthdate = () => new Date(EARLIEST_BIRTH_YEAR, 0, 1);

const formatBirthdateLabel = (value) => {
  const parsedDate = parseDateValue(value);
  if (!parsedDate) return '';

  return parsedDate.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const startOfMonth = (value) => new Date(value.getFullYear(), value.getMonth(), 1);

const isSameDay = (firstDate, secondDate) => (
  Boolean(firstDate)
  && Boolean(secondDate)
  && firstDate.getFullYear() === secondDate.getFullYear()
  && firstDate.getMonth() === secondDate.getMonth()
  && firstDate.getDate() === secondDate.getDate()
);

const buildCalendarDays = (monthDate, minimumDate, maximumDate) => {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const leadingEmptySlots = monthStart.getDay();
  const totalSlots = Math.ceil((leadingEmptySlots + monthEnd.getDate()) / 7) * 7;

  return Array.from({ length: totalSlots }, (_, index) => {
    const dayOffset = index - leadingEmptySlots + 1;
    const cellDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayOffset);
    const inMonth = cellDate.getMonth() === monthDate.getMonth();
    const isDisabled = !inMonth || cellDate < minimumDate || cellDate > maximumDate;

    return {
      key: `${formatDateValue(cellDate)}-${index}`,
      label: String(cellDate.getDate()),
      value: cellDate,
      inMonth,
      isDisabled,
    };
  });
};

const getYearPageStart = (year) => {
  const pageSize = 12;
  return Math.max(EARLIEST_BIRTH_YEAR, year - ((year - EARLIEST_BIRTH_YEAR) % pageSize));
};

const buildYearOptions = (rangeStart, maximumYear) => Array.from({ length: 12 }, (_, index) => {
  const year = rangeStart + index;

  return {
    key: `year-${year}`,
    label: String(year),
    value: year,
    isDisabled: year > maximumYear,
  };
});

const isMonthSelectable = (year, monthIndex, minimumDate, maximumDate) => {
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0);

  return monthStart <= maximumDate && monthEnd >= minimumDate;
};

const buildPatientFullName = (patient) => [patient?.first_name, patient?.middle_name, patient?.last_name, patient?.suffix]
  .filter(Boolean)
  .join(' ')
  .trim();

const normalizeCodeValue = (value) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

const getSteps = (isPatient, patientFlowMode) => {
  const steps = [
    { key: 'personal', label: 'Personal Details', shortLabel: 'Personal', fields: ['firstName', 'lastName', 'email', 'phone', 'birthdate'] },
    { key: 'address', label: 'Address', shortLabel: 'Address', fields: ['street', 'barangay', 'city', 'province', 'region', 'country'] },
    { key: 'patientQuestion', label: 'Patient', shortLabel: 'Patient', fields: ['isPatient'] },
  ];

  if (isPatient === 'yes' && patientFlowMode === 'manual') {
    steps.push({
      key: 'patientManual',
      label: 'Patient Details',
      shortLabel: 'Details',
      fields: ['patientFirstName', 'patientLastName', 'patientGender', 'patientMedicalCondition'],
    });
  }

  steps.push(
    { key: 'photo', label: 'Profile Picture', shortLabel: 'Photo', fields: [] },
    { key: 'confirm', label: 'Confirm', shortLabel: 'Confirm', fields: ['password', 'confirmPassword'] },
    { key: 'verify', label: 'OTP Verification', shortLabel: 'Verify', fields: [] },
  );

  return steps;
};

const getStepCopy = (key) => {
  if (key === 'personal') return { title: 'Personal details', body: 'Enter the basic account details.' };
  if (key === 'address') return { title: 'Address', body: 'Confirm your main address details.' };
  if (key === 'patientQuestion') return { title: 'Are you a patient?', body: 'Choose yes or no to continue.' };
  if (key === 'patientManual') return { title: 'Patient details', body: 'Enter the patient information for your account.' };
  if (key === 'photo') return { title: 'Profile picture', body: 'This step is optional.' };
  if (key === 'confirm') return { title: 'Confirm details', body: 'Review your information before verification.' };
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

const ReadOnlyValue = ({ label, value }) => (
  <View style={styles.readOnlyField}>
    <Text style={styles.readOnlyLabel}>{label}</Text>
    <View style={styles.readOnlyShell}>
      <Text style={styles.readOnlyValue}>{value || 'Not available'}</Text>
    </View>
  </View>
);

const DateField = ({ label, value, helperText, error, onPress }) => (
  <View style={styles.dateFieldWrap}>
    <Text style={styles.readOnlyLabel}>{label}</Text>
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dateFieldShell, pressed ? styles.dateFieldShellPressed : null]}>
      <Text style={[styles.dateFieldValue, !value ? styles.dateFieldPlaceholder : null]}>
        {value || 'Select birthdate'}
      </Text>
      <AppIcon name="calendar-month-outline" state="muted" />
    </Pressable>
    {error ? (
      <Text style={styles.errorText}>{error}</Text>
    ) : helperText ? (
      <Text style={styles.helperText}>{helperText}</Text>
    ) : null}
  </View>
);

const PatientCodeModal = ({
  visible,
  codeValue,
  onChangeCode,
  onClose,
  onValidate,
  onConfirm,
  onNoCode,
  preview,
  errorMessage,
  isValidating,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalOverlay}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <View style={styles.modalCenterWrap}>
        <View style={styles.modalCardWrap}>
          <View style={styles.modalTopRow}>
            <Text style={styles.modalTitle}>Enter your hospital code</Text>
            <AppTextLink title="Close" variant="muted" onPress={onClose} />
          </View>

          <Text style={styles.modalBody}>Please enter hospital code received on your email</Text>

          <OtpInput
            length={6}
            value={codeValue}
            onChange={onChangeCode}
            error={Boolean(errorMessage)}
            keyboardType="default"
            characterSet="alphanumeric"
            autoCapitalize="characters"
            style={styles.modalCodeInput}
          />

          <AppTextLink title="I don't have a code" variant="muted" onPress={onNoCode} />

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
  const [isUploadingPatientPicture, setIsUploadingPatientPicture] = useState(false);
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [isWebBirthdatePickerOpen, setIsWebBirthdatePickerOpen] = useState(false);
  const [webCalendarView, setWebCalendarView] = useState('days');
  const [isIosBirthdatePickerOpen, setIsIosBirthdatePickerOpen] = useState(false);
  const [iosBirthdateDraft, setIosBirthdateDraft] = useState(getLatestEligibleBirthdate);
  const [webCalendarMonth, setWebCalendarMonth] = useState(getLatestEligibleBirthdate);
  const [webYearRangeStart, setWebYearRangeStart] = useState(getYearPageStart(getLatestEligibleBirthdate().getFullYear()));
  const [patientCodeInput, setPatientCodeInput] = useState('');
  const [patientLookupPreview, setPatientLookupPreview] = useState(null);
  const [linkedPatientPreview, setLinkedPatientPreview] = useState(null);
  const [patientLookupError, setPatientLookupError] = useState('');
  const [isValidatingPatientCode, setIsValidatingPatientCode] = useState(false);

  const { control, handleSubmit, setValue, watch, trigger, getValues, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: signupDefaultValues,
  });

  const isPatient = watch('isPatient');
  const patientFlowMode = watch('patientFlowMode');
  const profilePhoto = watch('profilePhoto');
  const patientPicture = watch('patientPicture');
  const birthdate = watch('birthdate');
  const passwordValue = watch('password');
  const allValues = watch();
  const steps = useMemo(() => getSteps(isPatient, patientFlowMode), [isPatient, patientFlowMode]);
  const activeStep = steps[currentStep];
  const stepCopy = getStepCopy(activeStep.key);
  const passwordStrengthMessage = getPasswordStrengthMessage(passwordValue);
  const derivedAge = useMemo(() => calculateAgeFromBirthdate(birthdate), [birthdate]);
  const latestEligibleBirthdate = useMemo(() => getLatestEligibleBirthdate(), []);
  const earliestBirthdate = useMemo(() => getEarliestBirthdate(), []);
  const selectedBirthdate = useMemo(() => parseDateValue(birthdate), [birthdate]);
  const webCalendarDays = useMemo(
    () => buildCalendarDays(webCalendarMonth, earliestBirthdate, latestEligibleBirthdate),
    [webCalendarMonth, earliestBirthdate, latestEligibleBirthdate]
  );
  const webYearOptions = useMemo(
    () => buildYearOptions(webYearRangeStart, latestEligibleBirthdate.getFullYear()),
    [webYearRangeStart, latestEligibleBirthdate]
  );

  useEffect(() => {
    if (currentStep > steps.length - 2) {
      setCurrentStep(Math.max(steps.length - 2, 0));
    }
  }, [currentStep, steps.length]);

  useEffect(() => {
    if (patientFlowMode !== 'manual') return;
    if (!getValues('patientFirstName') && getValues('firstName')) {
      setValue('patientFirstName', getValues('firstName'), { shouldDirty: true });
    }
    if (!getValues('patientLastName') && getValues('lastName')) {
      setValue('patientLastName', getValues('lastName'), { shouldDirty: true });
    }
  }, [getValues, patientFlowMode, setValue]);

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

  const clearManualPatient = () => {
    setValue('patientFirstName', '', { shouldDirty: true });
    setValue('patientMiddleName', '', { shouldDirty: true });
    setValue('patientLastName', '', { shouldDirty: true });
    setValue('patientSuffix', '', { shouldDirty: true });
    setValue('patientAge', '', { shouldDirty: true });
    setValue('patientGender', '', { shouldDirty: true });
    setValue('patientMedicalCondition', '', { shouldDirty: true });
    setValue('patientPicture', '', { shouldDirty: true });
    setValue('patientMedicalDocument', '', { shouldDirty: true });
  };

  const nextStep = () => setCurrentStep((value) => Math.min(value + 1, steps.length - 2));
  const backStep = () => setCurrentStep((value) => Math.max(value - 1, 0));

  const applyBirthdateValue = (selectedDate) => {
    setValue('birthdate', formatDateValue(selectedDate), {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
  };

  const openBirthdatePicker = () => {
    const initialDate = parseDateValue(getValues('birthdate')) || latestEligibleBirthdate;

    if (Platform.OS === 'web') {
      setWebCalendarMonth(initialDate);
      setWebYearRangeStart(getYearPageStart(initialDate.getFullYear()));
      setWebCalendarView('days');
      setIsWebBirthdatePickerOpen(true);
      return;
    }

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: 'date',
        display: 'calendar',
        maximumDate: latestEligibleBirthdate,
        minimumDate: earliestBirthdate,
        onChange: (event, selectedDate) => {
          if (event.type !== 'set' || !selectedDate) return;
          applyBirthdateValue(selectedDate);
        },
      });
      return;
    }

    if (Platform.OS === 'ios') {
      setIosBirthdateDraft(initialDate);
      setIsIosBirthdatePickerOpen(true);
    }
  };

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
      clearManualPatient();
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

  const handleNoCode = () => {
    clearLinkedPatient();
    setValue('patientFlowMode', 'manual', { shouldDirty: true, shouldValidate: true });
    setIsPatientModalOpen(false);
    nextStep();
  };

  const handleNext = async () => {
    if (activeStep.key === 'patientQuestion') {
      const isValid = await trigger(activeStep.fields);
      if (!isValid) return;

      if (isPatient === 'yes') {
        if (patientFlowMode === 'linked' && linkedPatientPreview?.patient_id) {
          nextStep();
          return;
        }

        if (patientFlowMode === 'manual') {
          nextStep();
          return;
        }

        setPatientLookupError("Complete the patient popup first, or tap I don't have a code.");
        setIsPatientModalOpen(true);
        return;
      }

      if (isPatient === 'no') {
        nextStep();
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
                <Controller
                  control={control}
                  name="firstName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <AppInput
                      label="First Name"
                      placeholder="Juan"
                      variant="filled"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.firstName?.message}
                      style={styles.rowField}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="lastName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <AppInput
                      label="Last Name"
                      placeholder="Dela Cruz"
                      variant="filled"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.lastName?.message}
                      style={styles.rowField}
                    />
                  )}
                />
              </View>

              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Email Address"
                    placeholder="juan@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    variant="filled"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.email?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="phone"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Mobile Number"
                    placeholder="09123456789"
                    keyboardType="phone-pad"
                    variant="filled"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.phone?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="birthdate"
                render={({ field: { value } }) => (
                  Platform.OS === 'web' ? (
                    <DateField
                      label="Birthdate"
                      value={formatBirthdateLabel(value)}
                      helperText="Select your birthdate. You must be at least 18 years old."
                      error={errors.birthdate?.message}
                      onPress={openBirthdatePicker}
                    />
                  ) : (
                    <DateField
                      label="Birthdate"
                      value={formatBirthdateLabel(value)}
                      helperText="You must be at least 18 years old."
                      error={errors.birthdate?.message}
                      onPress={openBirthdatePicker}
                    />
                  )
                )}
              />
            </>
          ) : null}

          {activeStep.key === 'address' ? (
            <SignupAddressSection
              control={control}
              errors={errors}
              setValue={setValue}
              showHeader={false}
            />
          ) : null}

          {activeStep.key === 'patientQuestion' ? (
            <View style={styles.stack}>
              <ChoiceCard
                title="Yes"
                description="Link an existing patient record."
                selected={isPatient === 'yes'}
                onPress={() => handlePatientAnswer('yes')}
              />
              <ChoiceCard
                title="No"
                description="Continue to the next step."
                selected={isPatient === 'no'}
                onPress={() => handlePatientAnswer('no')}
              />
              {errors.isPatient?.message ? <Text style={styles.errorText}>{errors.isPatient.message}</Text> : null}
              {patientLookupError && !isPatientModalOpen ? <Text style={styles.errorText}>{patientLookupError}</Text> : null}
              {linkedPatientPreview ? (
                <View style={styles.stack}>
                  <PreviewCard patient={linkedPatientPreview} />
                  <View style={styles.linkedRow}>
                    <AppIcon name="success" state="success" />
                    <Text style={styles.linkedText}>This patient record will be linked to your account after signup.</Text>
                  </View>
                  <AppButton
                    title="Open Patient Popup"
                    variant="outline"
                    leading={<AppIcon name="edit" state="muted" />}
                    onPress={() => setIsPatientModalOpen(true)}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          {activeStep.key === 'patientManual' ? (
            <View style={styles.stack}>
              <View style={styles.row}>
                <Controller
                  control={control}
                  name="patientFirstName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <AppInput
                      label="Patient First Name"
                      placeholder="Juan"
                      variant="filled"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.patientFirstName?.message}
                      style={styles.rowField}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="patientLastName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <AppInput
                      label="Patient Last Name"
                      placeholder="Dela Cruz"
                      variant="filled"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.patientLastName?.message}
                      style={styles.rowField}
                    />
                  )}
                />
              </View>

              <View style={styles.row}>
                <Controller
                  control={control}
                  name="patientMiddleName"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <AppInput
                      label="Middle Name"
                      placeholder="Santos"
                      variant="filled"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.patientMiddleName?.message}
                      style={styles.rowField}
                    />
                  )}
                />
                <Controller
                  control={control}
                  name="patientSuffix"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <AppInput
                      label="Suffix"
                      placeholder="Jr."
                      variant="filled"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.patientSuffix?.message}
                      style={styles.rowField}
                    />
                  )}
                />
              </View>

              <View style={styles.row}>
                <View style={styles.rowField}>
                  <ReadOnlyValue label="Age" value={derivedAge ? String(derivedAge) : ''} />
                </View>
                <Controller
                  control={control}
                  name="patientGender"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <AppInput
                      label="Gender"
                      placeholder="Female"
                      variant="filled"
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value}
                      error={errors.patientGender?.message}
                      style={styles.rowField}
                    />
                  )}
                />
              </View>

              <Controller
                control={control}
                name="patientMedicalCondition"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Medical Condition"
                    placeholder="Describe the main medical condition"
                    variant="filled"
                    multiline={true}
                    numberOfLines={4}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.patientMedicalCondition?.message}
                    inputStyle={styles.textArea}
                  />
                )}
              />

              <Controller
                control={control}
                name="patientPicture"
                render={() => (
                  <ImagePickerBlock
                    value={patientPicture}
                    onPress={() => pickImage('patientPicture', setIsUploadingPatientPicture)}
                    loading={isUploadingPatientPicture}
                    emptyTitle="No patient picture selected"
                    emptyBody="Add a patient picture if you want to include one with the patient record."
                    buttonTitle="Upload Patient Picture"
                  />
                )}
              />
            </View>
          ) : null}

          {activeStep.key === 'photo' ? (
            <Controller
              control={control}
              name="profilePhoto"
              render={() => (
                <ImagePickerBlock
                  value={profilePhoto}
                  onPress={() => pickImage('profilePhoto', setIsUploadingPhoto)}
                  loading={isUploadingPhoto}
                  emptyTitle="No photo selected"
                  emptyBody="This step is optional. You can upload a profile photo now or skip it."
                  buttonTitle="Upload Photo"
                />
              )}
            />
          ) : null}

          {activeStep.key === 'confirm' ? (
            <>
              <SummarySection
                title="Personal Details"
                rows={[
                  { label: 'First name', value: summary.firstName },
                  { label: 'Last name', value: summary.lastName },
                  { label: 'Email', value: summary.email },
                  { label: 'Mobile number', value: summary.phone },
                  { label: 'Birthdate', value: summary.birthdate },
                ]}
              />

              <SummarySection
                title="Address"
                rows={[
                  { label: 'Street', value: summary.street },
                  { label: 'Barangay', value: summary.barangay },
                  { label: 'City', value: summary.city },
                  { label: 'Province', value: summary.province },
                  { label: 'Region', value: summary.region },
                  { label: 'Country', value: summary.country },
                ]}
              />

              <SummarySection
                title="Patient Details"
                rows={[
                  { label: 'Are you a patient?', value: summary.isPatient === 'yes' ? 'Yes' : summary.isPatient === 'no' ? 'No' : '' },
                  ...(summary.isPatient === 'yes' && summary.patientFlowMode === 'linked'
                    ? [
                        { label: 'Hospital code', value: summary.linkedPatientCode },
                        { label: 'Linked patient', value: summary.linkedPatientName },
                        { label: 'Medical condition', value: summary.linkedPatientCondition },
                      ]
                    : []),
                  ...(summary.isPatient === 'yes' && summary.patientFlowMode === 'manual'
                    ? [
                        { label: 'Patient first name', value: summary.patientFirstName },
                        { label: 'Patient middle name', value: summary.patientMiddleName },
                        { label: 'Patient last name', value: summary.patientLastName },
                        { label: 'Suffix', value: summary.patientSuffix },
                        { label: 'Age', value: derivedAge ? String(derivedAge) : '' },
                        { label: 'Gender', value: summary.patientGender },
                        { label: 'Medical condition', value: summary.patientMedicalCondition },
                        { label: 'Patient picture', value: summary.patientPicture ? 'Added' : 'Skipped' },
                      ]
                    : []),
                ]}
              />

              <SummarySection
                title="Profile Picture"
                rows={[{ label: 'Photo', value: summary.profilePhoto ? 'Profile picture added' : 'Skipped' }]}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <PasswordInput
                    label="Password"
                    placeholder="Create a strong password"
                    variant="filled"
                    helperText={passwordStrengthMessage || 'Use uppercase, lowercase, numbers, and a symbol.'}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.password?.message}
                  />
                )}
              />

              <Controller
                control={control}
                name="confirmPassword"
                render={({ field: { onChange, onBlur, value } }) => (
                  <PasswordInput
                    label="Confirm Password"
                    placeholder="Retype password"
                    variant="filled"
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    error={errors.confirmPassword?.message}
                  />
                )}
              />
            </>
          ) : null}

          <View style={styles.footerRow}>
            <View style={styles.footerSecondary}>
              {currentStep > 0 ? (
                <AppButton title="Back" variant="ghost" fullWidth={false} onPress={backStep} />
              ) : null}
              {activeStep.key === 'photo' ? (
                <AppButton
                  title="Skip"
                  variant="ghost"
                  fullWidth={false}
                  onPress={() => {
                    setValue('profilePhoto', '', { shouldDirty: true });
                    nextStep();
                  }}
                />
              ) : null}
            </View>

            {currentStep < steps.length - 2 ? (
              <AppButton
                title="Next"
                fullWidth={false}
                trailing={<AppIcon name="chevronRight" state="inverse" />}
                onPress={handleNext}
              />
            ) : (
              <AppButton
                title={buttonText}
                onPress={handleSubmit(onSubmit)}
                loading={isLoading}
                size="lg"
                enableHaptics={true}
              />
            )}
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
        onNoCode={handleNoCode}
        preview={patientLookupPreview}
        errorMessage={patientLookupError}
        isValidating={isValidatingPatientCode}
      />

      <Modal
        visible={isWebBirthdatePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsWebBirthdatePickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIsWebBirthdatePickerOpen(false)} />
          <View style={styles.calendarModalWrap}>
            <View style={styles.modalCardWrap}>
              <View style={styles.modalTopRow}>
                <Text style={styles.modalTitle}>Select birthdate</Text>
                <AppTextLink title="Close" variant="muted" onPress={() => setIsWebBirthdatePickerOpen(false)} />
              </View>

              <View style={styles.calendarHeaderRow}>
                <Pressable
                  onPress={() => setWebCalendarMonth((currentValue) => new Date(currentValue.getFullYear(), currentValue.getMonth() - 1, 1))}
                  style={({ pressed }) => [styles.calendarNavButton, pressed ? styles.dateFieldShellPressed : null]}
                  hitSlop={6}
                  disabled={startOfMonth(webCalendarMonth) <= startOfMonth(earliestBirthdate)}
                >
                  <AppIcon name="chevron-left" state="muted" />
                </Pressable>

                <View style={styles.calendarTitleWrap}>
                  <Pressable
                    onPress={() => setWebCalendarView('months')}
                    style={({ pressed }) => [styles.calendarTitleButton, pressed ? styles.dateFieldShellPressed : null]}
                  >
                    <Text style={styles.calendarMonthLabel}>
                      {webCalendarMonth.toLocaleDateString('en-PH', { month: 'long' })}
                    </Text>
                    <AppIcon name="chevron-down" size="sm" state="muted" />
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setWebYearRangeStart(getYearPageStart(webCalendarMonth.getFullYear()));
                      setWebCalendarView('years');
                    }}
                    style={({ pressed }) => [styles.calendarTitleButton, pressed ? styles.dateFieldShellPressed : null]}
                  >
                    <Text style={styles.calendarMonthLabel}>{webCalendarMonth.getFullYear()}</Text>
                    <AppIcon name="chevron-down" size="sm" state="muted" />
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => setWebCalendarMonth((currentValue) => new Date(currentValue.getFullYear(), currentValue.getMonth() + 1, 1))}
                  style={({ pressed }) => [styles.calendarNavButton, pressed ? styles.dateFieldShellPressed : null]}
                  hitSlop={6}
                  disabled={startOfMonth(webCalendarMonth) >= startOfMonth(latestEligibleBirthdate)}
                >
                  <AppIcon name="chevron-right" state="muted" />
                </Pressable>
              </View>

              {webCalendarView === 'days' ? (
                <>
                  <View style={styles.calendarWeekRow}>
                    {WEEKDAY_LABELS.map((label) => (
                      <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
                    ))}
                  </View>

                  <View style={styles.calendarGrid}>
                    {webCalendarDays.map((day) => (
                      <Pressable
                        key={day.key}
                        disabled={day.isDisabled}
                        onPress={() => {
                          applyBirthdateValue(day.value);
                          setIsWebBirthdatePickerOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.calendarDayButton,
                          day.isDisabled ? styles.calendarDayButtonDisabled : null,
                          isSameDay(day.value, selectedBirthdate) ? styles.calendarDayButtonSelected : null,
                          pressed && !day.isDisabled ? styles.dateFieldShellPressed : null,
                        ]}
                      >
                        <Text style={[
                          styles.calendarDayLabel,
                          day.isDisabled ? styles.calendarDayLabelDisabled : null,
                          isSameDay(day.value, selectedBirthdate) ? styles.calendarDayLabelSelected : null,
                        ]}>
                          {day.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}

              {webCalendarView === 'months' ? (
                <View style={styles.calendarOptionGrid}>
                  {MONTH_LABELS.map((monthLabel, monthIndex) => {
                    const isDisabled = !isMonthSelectable(
                      webCalendarMonth.getFullYear(),
                      monthIndex,
                      earliestBirthdate,
                      latestEligibleBirthdate
                    );
                    const isSelected = selectedBirthdate
                      && selectedBirthdate.getFullYear() === webCalendarMonth.getFullYear()
                      && selectedBirthdate.getMonth() === monthIndex;

                    return (
                      <Pressable
                        key={monthLabel}
                        disabled={isDisabled}
                        onPress={() => {
                          setWebCalendarMonth(new Date(webCalendarMonth.getFullYear(), monthIndex, 1));
                          setWebCalendarView('days');
                        }}
                        style={({ pressed }) => [
                          styles.calendarOptionButton,
                          isDisabled ? styles.calendarDayButtonDisabled : null,
                          isSelected ? styles.calendarDayButtonSelected : null,
                          pressed && !isDisabled ? styles.dateFieldShellPressed : null,
                        ]}
                      >
                        <Text style={[
                          styles.calendarOptionLabel,
                          isDisabled ? styles.calendarDayLabelDisabled : null,
                          isSelected ? styles.calendarDayLabelSelected : null,
                        ]}>
                          {monthLabel}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {webCalendarView === 'years' ? (
                <View style={styles.stack}>
                  <View style={styles.calendarRangeRow}>
                    <Pressable
                      onPress={() => setWebYearRangeStart((currentValue) => Math.max(EARLIEST_BIRTH_YEAR, currentValue - 12))}
                      style={({ pressed }) => [styles.calendarNavButton, pressed ? styles.dateFieldShellPressed : null]}
                      disabled={webYearRangeStart <= EARLIEST_BIRTH_YEAR}
                    >
                      <AppIcon name="chevron-left" state="muted" />
                    </Pressable>

                    <Text style={styles.calendarRangeLabel}>
                      {webYearRangeStart} - {Math.min(webYearRangeStart + 11, latestEligibleBirthdate.getFullYear())}
                    </Text>

                    <Pressable
                      onPress={() => setWebYearRangeStart((currentValue) => Math.min(getYearPageStart(latestEligibleBirthdate.getFullYear()), currentValue + 12))}
                      style={({ pressed }) => [styles.calendarNavButton, pressed ? styles.dateFieldShellPressed : null]}
                      disabled={webYearRangeStart + 11 >= latestEligibleBirthdate.getFullYear()}
                    >
                      <AppIcon name="chevron-right" state="muted" />
                    </Pressable>
                  </View>

                  <View style={styles.calendarOptionGrid}>
                    {webYearOptions.map((yearOption) => {
                      const isSelected = selectedBirthdate?.getFullYear() === yearOption.value;

                      return (
                        <Pressable
                          key={yearOption.key}
                          disabled={yearOption.isDisabled}
                          onPress={() => {
                            setWebCalendarMonth(new Date(yearOption.value, webCalendarMonth.getMonth(), 1));
                            setWebCalendarView('months');
                          }}
                          style={({ pressed }) => [
                            styles.calendarOptionButton,
                            yearOption.isDisabled ? styles.calendarDayButtonDisabled : null,
                            isSelected ? styles.calendarDayButtonSelected : null,
                            pressed && !yearOption.isDisabled ? styles.dateFieldShellPressed : null,
                          ]}
                        >
                          <Text style={[
                            styles.calendarOptionLabel,
                            yearOption.isDisabled ? styles.calendarDayLabelDisabled : null,
                            isSelected ? styles.calendarDayLabelSelected : null,
                          ]}>
                            {yearOption.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <Text style={styles.calendarHint}>Only dates for users aged 18 and above are available.</Text>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isIosBirthdatePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsIosBirthdatePickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setIsIosBirthdatePickerOpen(false)} />
          <View style={styles.modalCenterWrap}>
            <View style={styles.modalCardWrap}>
              <View style={styles.modalTopRow}>
                <Text style={styles.modalTitle}>Select birthdate</Text>
                <AppTextLink title="Close" variant="muted" onPress={() => setIsIosBirthdatePickerOpen(false)} />
              </View>

              <DateTimePicker
                value={iosBirthdateDraft}
                mode="date"
                display="spinner"
                maximumDate={latestEligibleBirthdate}
                minimumDate={earliestBirthdate}
                onChange={(_, selectedDate) => {
                  if (selectedDate) {
                    setIosBirthdateDraft(selectedDate);
                  }
                }}
              />

              <AppButton
                title="Use This Birthdate"
                onPress={() => {
                  applyBirthdateValue(iosBirthdateDraft);
                  setIsIosBirthdatePickerOpen(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: theme.spacing.md,
  },
  stepper: {
    marginBottom: theme.spacing.xs,
  },
  stepCard: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceCard,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  stepHeader: {
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  stepTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
  },
  stepBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowField: {
    flex: 1,
  },
  stack: {
    gap: theme.spacing.sm,
  },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
  },
  choiceCardActive: {
    borderColor: theme.colors.brandPrimary,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  choiceCopy: {
    flex: 1,
    gap: 2,
  },
  choiceTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  choiceBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  panel: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  panelTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  previewRow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
  },
  summaryRow: {
    gap: 2,
  },
  summaryLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
  },
  uploadWrap: {
    gap: theme.spacing.md,
  },
  uploadPreview: {
    minHeight: 220,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    overflow: 'hidden',
  },
  uploadImage: {
    width: '100%',
    height: 220,
  },
  uploadPlaceholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  uploadIconWrap: {
    width: 58,
    height: 58,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  uploadTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  uploadBody: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  readOnlyField: {
    gap: theme.spacing.xs,
  },
  dateFieldWrap: {
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  readOnlyLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  dateFieldShell: {
    minHeight: theme.inputs.minHeightCompact,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.transparent,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.inputPaddingXCompact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  dateFieldShellPressed: {
    opacity: 0.92,
  },
  dateFieldValue: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    color: theme.colors.textPrimary,
  },
  dateFieldPlaceholder: {
    color: theme.colors.textMuted,
  },
  readOnlyShell: {
    minHeight: theme.inputs.minHeightCompact,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.inputPaddingXCompact,
  },
  readOnlyValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    color: theme.colors.textPrimary,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  linkedText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },
  helperText: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  calendarModalWrap: {
    width: '100%',
    maxWidth: 360,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  calendarTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  calendarTitleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  calendarNavButton: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  calendarMonthLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.xs,
  },
  calendarWeekLabel: {
    width: '14.2857%',
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  calendarOptionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: theme.spacing.sm,
    columnGap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  calendarDayButton: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
  },
  calendarDayButtonDisabled: {
    opacity: 0.28,
  },
  calendarDayButtonSelected: {
    backgroundColor: theme.colors.brandPrimary,
  },
  calendarDayLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textPrimary,
  },
  calendarDayLabelDisabled: {
    color: theme.colors.textMuted,
  },
  calendarDayLabelSelected: {
    color: theme.colors.textInverse,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarOptionButton: {
    width: '31%',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  calendarOptionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.medium,
  },
  calendarRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  calendarRangeLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  calendarHint: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  footerSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 8, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.screenPaddingX,
  },
  modalCenterWrap: {
    width: '100%',
    maxWidth: 420,
  },
  modalCardWrap: {
    borderRadius: 28,
    backgroundColor: theme.colors.surfaceCard,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  modalTitle: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
  },
  modalBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  modalCodeInput: {
    marginVertical: 0,
  },
});
