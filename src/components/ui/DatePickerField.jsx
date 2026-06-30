import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
  required = false,
  value,
  placeholder,
  helperText,
  error,
  onChange,
  onBlur,
  minimumDate,
  maximumDate,
  onPress,
  leftIcon,
  leftIconColor,
  rightIcon = 'appointment',
  rightIconColor,
  labelStyle,
  shellStyle,
  valueStyle,
  placeholderStyle,
  helperTextStyle,
  errorTextStyle,
  containerStyle,
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
  const readableValue = useMemo(
    () => formatReadableDate(parsedDateValue),
    [parsedDateValue]
  );
  const fallbackDate = parsedDateValue || maximumDateValue || new Date();

  return (
    <View style={[styles.fieldWrap, containerStyle]}>
      <Text style={[styles.label, error ? styles.labelError : null, labelStyle]}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>

      <Pressable
        onPress={async () => {
          await onPress?.();
          setIsPickerVisible(true);
        }}
        style={[
          styles.fieldShell,
          error ? styles.fieldShellError : null,
          shellStyle,
        ]}
      >
        {leftIcon ? (
          <AppIcon
            name={leftIcon}
            color={leftIconColor}
            size="md"
          />
        ) : null}
        <Text style={[
          styles.fieldValue,
          leftIcon ? styles.fieldValueWithIcon : null,
          !value ? styles.fieldPlaceholder : null,
          valueStyle,
          !value ? placeholderStyle : null,
        ]}>
          {readableValue || placeholder}
        </Text>
        <AppIcon
          name={rightIcon}
          color={rightIconColor}
          state={error ? 'danger' : 'muted'}
        />
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
              onBlur?.();
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
        <Text style={[styles.fieldError, errorTextStyle]}>{error}</Text>
      ) : helperText ? (
        <Text style={[styles.fieldHelper, helperTextStyle]}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: {
    gap: theme.spacing.xs,
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.label,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  labelError: {
    color: theme.colors.textError,
  },
  requiredMark: {
    color: theme.colors.textError,
  },
  fieldShell: {
    minHeight: theme.inputs.minHeightCompact,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceCard,
    paddingHorizontal: theme.spacing.inputPaddingXCompact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  fieldShellError: {
    borderColor: theme.colors.textError,
  },
  fieldValue: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    color: theme.colors.textPrimary,
  },
  fieldValueWithIcon: {
    marginLeft: theme.spacing.xs,
  },
  fieldPlaceholder: {
    color: theme.colors.textTertiary,
  },
  fieldError: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textError,
  },
  fieldHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textSecondary,
  },
  pickerCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.surfaceCard,
    overflow: 'hidden',
  },
  pickerActions: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
