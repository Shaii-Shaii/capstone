import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppInput } from './AppInput';
import { AppIcon } from './AppIcon';
import { AppTextLink } from './AppTextLink';
import { theme } from '../../design-system/theme';

const readableDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const formatDateValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateValue = (value) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return null;
  return parsedDate;
};

const formatReadableDate = (value) => {
  const parsedDate = value instanceof Date ? value : parseDateValue(value);
  if (!parsedDate) return '';
  return readableDateFormatter.format(parsedDate);
};

export function DatePickerField({
  label,
  value,
  placeholder,
  helperText,
  error,
  onChange,
  onBlur,
  minimumDate,
  maximumDate,
  onPress,
}) {
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const parsedDateValue = useMemo(() => parseDateValue(value), [value]);
  const maximumDateValue = useMemo(
    () => (maximumDate instanceof Date ? maximumDate : null),
    [maximumDate]
  );
  const minimumDateValue = useMemo(
    () => (minimumDate instanceof Date ? minimumDate : null),
    [minimumDate]
  );
  const maximumDateString = useMemo(
    () => (maximumDateValue ? formatDateValue(maximumDateValue) : undefined),
    [maximumDateValue]
  );
  const minimumDateString = useMemo(
    () => (minimumDateValue ? formatDateValue(minimumDateValue) : undefined),
    [minimumDateValue]
  );
  const readableValue = useMemo(
    () => formatReadableDate(parsedDateValue),
    [parsedDateValue]
  );

  if (Platform.OS === 'web') {
    return (
      <AppInput
        label={label}
        placeholder={placeholder}
        variant="filled"
        helperText={helperText}
        value={value}
        onChange={(event) => {
          const nextValue = String(event?.target?.value || event?.nativeEvent?.text || '').trim();
          const normalizedValue = parseDateValue(nextValue);
          onChange(normalizedValue ? formatDateValue(normalizedValue) : nextValue);
        }}
        onBlur={onBlur}
        error={error}
        min={minimumDateString}
        max={maximumDateString}
        type="date"
        autoComplete="bday"
      />
    );
  }

  const fallbackDate = parsedDateValue || maximumDateValue || new Date();

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, error ? styles.labelError : null]}>
        {label}
      </Text>
      <Pressable
        onPress={async () => {
          await onPress?.();
          setIsPickerVisible(true);
        }}
        style={[
          styles.fieldShell,
          error ? styles.fieldShellError : null,
        ]}
      >
        <Text style={[
          styles.fieldValue,
          !value ? styles.fieldPlaceholder : null,
        ]}>
          {readableValue || placeholder}
        </Text>
        <AppIcon name="appointment" state={error ? 'danger' : 'muted'} />
      </Pressable>

      {isPickerVisible ? (
        <View style={styles.pickerCard}>
          <DateTimePicker
            value={fallbackDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={minimumDateValue || undefined}
            maximumDate={maximumDateValue || undefined}
            onChange={(event, selectedDate) => {
              if (Platform.OS === 'android') {
                setIsPickerVisible(false);
              }

              if (event.type === 'dismissed' || !selectedDate) {
                return;
              }

              onChange(formatDateValue(selectedDate));
            }}
          />

          {Platform.OS === 'ios' ? (
            <View style={styles.pickerActions}>
              <AppTextLink
                title="Cancel"
                variant="muted"
                onPress={() => setIsPickerVisible(false)}
              />
              <AppTextLink
                title="Done"
                onPress={() => setIsPickerVisible(false)}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.fieldHelper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    width: '100%',
    marginBottom: theme.spacing.sm,
    minHeight: 82,
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  labelError: {
    color: theme.colors.textError,
  },
  fieldShell: {
    minHeight: theme.inputs.minHeightCompact,
    borderWidth: 1,
    borderRadius: theme.radius.xl,
    borderColor: theme.colors.transparent,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.inputPaddingXCompact,
    paddingVertical: theme.spacing.inputPaddingYCompact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  fieldShellError: {
    borderColor: theme.colors.borderError,
  },
  fieldValue: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    color: theme.colors.textPrimary,
  },
  fieldPlaceholder: {
    color: theme.colors.textMuted,
  },
  pickerCard: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    overflow: 'hidden',
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  fieldHelper: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  fieldError: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },
});
