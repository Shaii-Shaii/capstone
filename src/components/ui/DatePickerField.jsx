import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AppIcon } from './AppIcon';
import { AppTextLink } from './AppTextLink';
import { theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const readableDateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const webNativeSelectStyle = {
  flex: 1,
  minHeight: 38,
  borderRadius: 14,
  border: `1px solid ${theme.colors.borderSubtle}`,
  backgroundColor: theme.colors.surfaceSoft,
  color: theme.colors.textPrimary,
  padding: '0 12px',
  fontFamily: theme.typography.fontFamily,
  fontSize: `${theme.typography.compact.body}px`,
  outline: 'none',
};

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

const toDateOnly = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const isSameDate = (left, right) => (
  left?.getFullYear() === right?.getFullYear()
  && left?.getMonth() === right?.getMonth()
  && left?.getDate() === right?.getDate()
);

const isDateWithinBounds = (date, minimumDate, maximumDate) => {
  const normalizedDate = toDateOnly(date).getTime();
  const minTime = minimumDate ? toDateOnly(minimumDate).getTime() : null;
  const maxTime = maximumDate ? toDateOnly(maximumDate).getTime() : null;

  if (minTime !== null && normalizedDate < minTime) return false;
  if (maxTime !== null && normalizedDate > maxTime) return false;
  return true;
};

const buildCalendarDays = (visibleMonth) => {
  const firstDayOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const firstWeekday = firstDayOfMonth.getDay();
  const firstCalendarDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1 - firstWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCalendarDay);
    date.setDate(firstCalendarDay.getDate() + index);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      isCurrentMonth: date.getMonth() === visibleMonth.getMonth(),
    };
  });
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
}) {
  const { resolvedTheme } = useAuth();
  const [isPickerVisible, setIsPickerVisible] = useState(false);
  const webFieldRef = useRef(null);
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
  const initialCalendarMonth = useMemo(() => {
    const baseDate = parsedDateValue || maximumDateValue || new Date();
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  }, [maximumDateValue, parsedDateValue]);
  const [visibleMonth, setVisibleMonth] = useState(initialCalendarMonth);

  useEffect(() => {
    if (!isPickerVisible) {
      setVisibleMonth(initialCalendarMonth);
    }
  }, [initialCalendarMonth, isPickerVisible]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !isPickerVisible) return undefined;

    const handlePointerDown = (event) => {
      if (!webFieldRef.current?.contains?.(event.target)) {
        setIsPickerVisible(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isPickerVisible]);

  const visibleMonthDays = useMemo(
    () => buildCalendarDays(visibleMonth),
    [visibleMonth]
  );
  const minimumYear = minimumDateValue?.getFullYear() || 1900;
  const maximumYear = maximumDateValue?.getFullYear() || new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: maximumYear - minimumYear + 1 }, (_, index) => minimumYear + index),
    [maximumYear, minimumYear]
  );
  const selectedDayBackgroundColor = resolvedTheme?.primaryColor || theme.colors.actionPrimary;
  const selectedDayTextColor = resolvedTheme?.backgroundColor || theme.colors.textOnBrand;

  const openWebPicker = async () => {
    await onPress?.();
    setIsPickerVisible((currentValue) => !currentValue);
  };

  if (Platform.OS === 'web') {
    return (
      <View ref={webFieldRef} style={styles.fieldWrap}>
        <Text style={[styles.label, error ? styles.labelError : null]}>
          {label}
          {required ? <Text style={styles.requiredMark}> *</Text> : null}
        </Text>

        <Pressable
          onPress={openWebPicker}
          style={[
          styles.fieldShell,
          styles.webFieldShell,
          error ? styles.fieldShellError : null,
        ]}
        >
          <View style={styles.webDisplayLayer}>
            <Text style={[
              styles.fieldValue,
              !value ? styles.fieldPlaceholder : null,
            ]}>
              {readableValue || placeholder}
            </Text>
            <AppIcon name="appointment" state={error ? 'danger' : 'muted'} />
          </View>
        </Pressable>

        {isPickerVisible ? (
          <View style={styles.webPickerCard}>
            <View style={styles.webPickerHeader}>
              <Text style={styles.webPickerTitle}>Select birthdate</Text>
              <AppTextLink
                title="Close"
                variant="muted"
                onPress={() => setIsPickerVisible(false)}
              />
            </View>

            <View style={styles.webPickerToolbar}>
              <Pressable
                onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}
                style={styles.webArrowButton}
              >
                <Text style={styles.webArrowText}>‹</Text>
              </Pressable>

              <View style={styles.webSelectRow}>
                {React.createElement(
                  'select',
                  {
                    value: String(visibleMonth.getMonth()),
                    onChange: (event) => {
                      const nextMonth = Number(event.target.value);
                      setVisibleMonth(new Date(visibleMonth.getFullYear(), nextMonth, 1));
                    },
                    style: webNativeSelectStyle,
                  },
                  MONTH_LABELS.map((monthLabel, monthIndex) => (
                    React.createElement('option', { key: monthLabel, value: String(monthIndex) }, monthLabel)
                  ))
                )}

                {React.createElement(
                  'select',
                  {
                    value: String(visibleMonth.getFullYear()),
                    onChange: (event) => {
                      const nextYear = Number(event.target.value);
                      setVisibleMonth(new Date(nextYear, visibleMonth.getMonth(), 1));
                    },
                    style: webNativeSelectStyle,
                  },
                  yearOptions.map((yearValue) => (
                    React.createElement('option', { key: yearValue, value: String(yearValue) }, String(yearValue))
                  ))
                )}
              </View>

              <Pressable
                onPress={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}
                style={styles.webArrowButton}
              >
                <Text style={styles.webArrowText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.webWeekdayRow}>
              {WEEKDAY_LABELS.map((weekdayLabel) => (
                <Text key={weekdayLabel} style={styles.webWeekdayCell}>
                  {weekdayLabel}
                </Text>
              ))}
            </View>

            <View style={styles.webCalendarGrid}>
              {visibleMonthDays.map((day) => {
                const isDisabled = !isDateWithinBounds(day.date, minimumDateValue, maximumDateValue);
                const isSelected = parsedDateValue ? isSameDate(day.date, parsedDateValue) : false;

                return (
                  <Pressable
                    key={day.key}
                    disabled={isDisabled}
                    onPress={() => {
                      onChange(formatDateValue(day.date));
                      onBlur?.();
                      setIsPickerVisible(false);
                    }}
                    style={[
                      styles.webDayCell,
                      !day.isCurrentMonth ? styles.webDayCellMuted : null,
                      isSelected ? [styles.webDayCellSelected, { backgroundColor: selectedDayBackgroundColor }] : null,
                      isDisabled ? styles.webDayCellDisabled : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.webDayText,
                        !day.isCurrentMonth ? styles.webDayTextMuted : null,
                        isSelected ? [styles.webDayTextSelected, { color: selectedDayTextColor }] : null,
                        isDisabled ? styles.webDayTextDisabled : null,
                      ]}
                    >
                      {day.date.getDate()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.webPickerFooter}>
              <AppTextLink
                title="Clear"
                variant="muted"
                onPress={() => {
                  onChange('');
                  onBlur?.();
                  setIsPickerVisible(false);
                }}
              />
            </View>
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

  const fallbackDate = parsedDateValue || maximumDateValue || new Date();

  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, error ? styles.labelError : null]}>
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
  requiredMark: {
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.bold,
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
  webFieldShell: {
    position: 'relative',
    cursor: 'pointer',
  },
  webDisplayLayer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    pointerEvents: 'none',
  },
  webPickerCard: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    ...theme.shadows.soft,
  },
  webPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  webPickerTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  webPickerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  webArrowButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  webArrowText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.weights.semibold,
  },
  webSelectRow: {
    flex: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  webWeekdayRow: {
    flexDirection: 'row',
  },
  webWeekdayCell: {
    flex: 1,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textSecondary,
  },
  webCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  webDayCell: {
    width: '13.2%',
    aspectRatio: 1,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  webDayCellMuted: {
    backgroundColor: theme.colors.surfaceSoft,
  },
  webDayCellSelected: {
    backgroundColor: theme.colors.actionPrimary,
  },
  webDayCellDisabled: {
    opacity: 0.35,
  },
  webDayText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textPrimary,
  },
  webDayTextMuted: {
    color: theme.colors.textSecondary,
  },
  webDayTextSelected: {
    color: theme.colors.textOnBrand,
    fontWeight: theme.typography.weights.semibold,
  },
  webDayTextDisabled: {
    color: theme.colors.textDisabled,
  },
  webPickerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
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
