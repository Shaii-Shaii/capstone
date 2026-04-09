import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Controller, useWatch } from 'react-hook-form';
import phil from 'phil-reg-prov-mun-brgy';
import { AppInput } from '../ui/AppInput';
import { AppIcon } from '../ui/AppIcon';
import { theme } from '../../design-system/theme';

const sortByName = (items = []) => phil.sort(items, 'A');
const normalizeValue = (value = '') => value.trim().toLowerCase();

const REGION_OPTIONS = sortByName(phil.regions || []);

const fieldConfig = {
  street: {
    label: 'Street / Building / Landmark',
    placeholder: 'House number, street, subdivision, or landmark',
    helperText: 'Add the most specific street or landmark detail for pickup and verification.',
  },
  region: {
    label: 'Region',
    placeholder: 'Select region',
    helperText: 'Choose the main Philippine region first.',
  },
  province: {
    label: 'Province',
    placeholder: 'Select province',
    helperText: 'This list updates after you choose a region.',
  },
  city: {
    label: 'City / Municipality',
    placeholder: 'Select city or municipality',
    helperText: 'Choose the city or municipality for your address.',
  },
  barangay: {
    label: 'Barangay',
    placeholder: 'Select barangay',
    helperText: 'Choose the barangay that matches your city or municipality.',
  },
  country: {
    label: 'Country',
    placeholder: 'Philippines',
  },
};

const toSelectOptions = (items = [], codeKey) => (
  items.map((item) => ({
    label: item.name,
    value: item.name,
    code: item[codeKey],
  }))
);

export function AddressSelectField({
  label,
  required = false,
  value,
  placeholder,
  helperText,
  error,
  disabled = false,
  onPress,
}) {
  return (
    <View style={styles.selectFieldWrap}>
      <Text style={styles.selectFieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.selectField,
          disabled ? styles.selectFieldDisabled : null,
          error ? styles.selectFieldError : null,
          pressed && !disabled ? styles.selectFieldPressed : null,
        ]}
      >
        <Text
          style={[
            styles.selectFieldValue,
            !value ? styles.selectFieldPlaceholder : null,
            disabled ? styles.selectFieldValueDisabled : null,
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <AppIcon name="chevronRight" state={disabled ? 'disabled' : 'muted'} />
      </Pressable>
      {error ? (
        <Text style={styles.selectFieldErrorText}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.selectFieldHelper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

export function AddressOptionSheet({
  visible,
  title,
  placeholder,
  options,
  selectedValue,
  onClose,
  onSelect,
}) {
  const [searchValue, setSearchValue] = useState('');

  useEffect(() => {
    if (visible) {
      setSearchValue('');
    }
  }, [visible, title]);

  const filteredOptions = useMemo(() => {
    const normalizedSearch = normalizeValue(searchValue);
    if (!normalizedSearch) return options;

    return options.filter((option) => (
      normalizeValue(option.label).includes(normalizedSearch)
    ));
  }, [options, searchValue]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.sheetCard}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>{title}</Text>
              <Text style={styles.sheetSubtitle}>Choose one option to continue.</Text>
            </View>
            <Pressable onPress={onClose} style={styles.sheetCloseButton}>
              <AppIcon name="close" state="muted" />
            </Pressable>
          </View>

          <AppInput
            label="Search"
            placeholder={placeholder}
            variant="filled"
            value={searchValue}
            onChangeText={setSearchValue}
            autoCorrect={false}
            autoCapitalize="words"
          />

          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const isSelected = normalizeValue(option.value) === normalizeValue(selectedValue);

                return (
                  <Pressable
                    key={`${title}-${option.code || option.value}`}
                    onPress={() => {
                      onSelect(option);
                      onClose();
                    }}
                    style={({ pressed }) => [
                      styles.sheetOption,
                      isSelected ? styles.sheetOptionSelected : null,
                      pressed ? styles.sheetOptionPressed : null,
                    ]}
                  >
                    <Text style={[styles.sheetOptionText, isSelected ? styles.sheetOptionTextSelected : null]}>
                      {option.label}
                    </Text>
                    {isSelected ? <AppIcon name="success" state="active" /> : null}
                  </Pressable>
                );
              })
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No results found</Text>
                <Text style={styles.emptyStateBody}>Try a different search term.</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function SignupAddressSection({
  control,
  errors,
  setValue,
  showHeader = true,
  showHelperText = true,
  showTopBorder = true,
}) {
  const { width } = useWindowDimensions();
  const isWide = width >= 390;
  const [activePicker, setActivePicker] = useState('');
  const [region, province, city, barangay, country] = useWatch({
    control,
    name: ['region', 'province', 'city', 'barangay', 'country'],
  });

  const selectedRegion = useMemo(
    () => REGION_OPTIONS.find((item) => normalizeValue(item.name) === normalizeValue(region)),
    [region]
  );

  const provinceOptions = useMemo(() => {
    if (!selectedRegion?.reg_code) return [];
    return sortByName(phil.getProvincesByRegion(selectedRegion.reg_code));
  }, [selectedRegion?.reg_code]);

  const selectedProvince = useMemo(
    () => provinceOptions.find((item) => normalizeValue(item.name) === normalizeValue(province)),
    [province, provinceOptions]
  );

  const cityOptions = useMemo(() => {
    if (!selectedProvince?.prov_code) return [];
    return sortByName(phil.getCityMunByProvince(selectedProvince.prov_code));
  }, [selectedProvince?.prov_code]);

  const selectedCity = useMemo(
    () => cityOptions.find((item) => normalizeValue(item.name) === normalizeValue(city)),
    [city, cityOptions]
  );

  const barangayOptions = useMemo(() => {
    if (!selectedCity?.mun_code) return [];
    return sortByName(phil.getBarangayByMun(selectedCity.mun_code));
  }, [selectedCity?.mun_code]);

  useEffect(() => {
    if (normalizeValue(country) === normalizeValue('Philippines')) {
      return;
    }

    setValue('country', 'Philippines', {
      shouldDirty: false,
      shouldTouch: false,
      shouldValidate: true,
    });
  }, [country, setValue]);

  const helperText = 'Choose your address step by step. Street or landmark stays manual, while the rest uses free Philippine location data.';

  const pickerOptions = {
    region: toSelectOptions(REGION_OPTIONS, 'reg_code'),
    province: toSelectOptions(provinceOptions, 'prov_code'),
    city: toSelectOptions(cityOptions, 'mun_code'),
    barangay: toSelectOptions(barangayOptions, 'name'),
  };

  const handlePick = (fieldName, option) => {
    if (!option?.value) return;

    if (fieldName === 'region') {
      setValue('region', option.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setValue('province', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setValue('city', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setValue('barangay', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      return;
    }

    if (fieldName === 'province') {
      setValue('province', option.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setValue('city', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setValue('barangay', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      return;
    }

    if (fieldName === 'city') {
      setValue('city', option.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setValue('barangay', '', { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      return;
    }

    setValue(fieldName, option.value, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
  };

  return (
    <View style={[styles.container, !showTopBorder ? styles.containerEmbedded : null]}>
      {showHeader ? (
        <>
          <Text style={styles.sectionTitle}>Address Details</Text>
          {showHelperText ? <Text style={styles.sectionBody}>{helperText}</Text> : null}
        </>
      ) : showHelperText ? (
        <Text style={styles.compactHelper}>{helperText}</Text>
      ) : null}

      <Controller
        control={control}
        name="street"
        render={({ field }) => (
          <AppInput
            label={fieldConfig.street.label}
            placeholder={fieldConfig.street.placeholder}
            variant="filled"
            helperText={fieldConfig.street.helperText}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.street?.message}
          />
        )}
      />

      <View style={styles.fieldRow}>
        <AddressSelectField
          label={fieldConfig.region.label}
          value={region}
          placeholder={fieldConfig.region.placeholder}
          helperText={fieldConfig.region.helperText}
          error={errors.region?.message}
          onPress={() => setActivePicker('region')}
        />
      </View>

      <View style={[styles.fieldRow, isWide ? styles.fieldRowWide : null]}>
        <AddressSelectField
          label={fieldConfig.province.label}
          value={province}
          placeholder={fieldConfig.province.placeholder}
          helperText={fieldConfig.province.helperText}
          error={errors.province?.message}
          disabled={!region}
          onPress={() => setActivePicker('province')}
        />
        <AddressSelectField
          label={fieldConfig.city.label}
          value={city}
          placeholder={fieldConfig.city.placeholder}
          helperText={fieldConfig.city.helperText}
          error={errors.city?.message}
          disabled={!province}
          onPress={() => setActivePicker('city')}
        />
      </View>

      <View style={[styles.fieldRow, isWide ? styles.fieldRowWide : null]}>
        <AddressSelectField
          label={fieldConfig.barangay.label}
          value={barangay}
          placeholder={fieldConfig.barangay.placeholder}
          helperText={fieldConfig.barangay.helperText}
          error={errors.barangay?.message}
          disabled={!city}
          onPress={() => setActivePicker('barangay')}
        />

        <AppInput
          label={fieldConfig.country.label}
          placeholder={fieldConfig.country.placeholder}
          variant="filled"
          value={country || 'Philippines'}
          editable={false}
          helperText="Country is fixed for this signup flow."
          style={isWide ? styles.rowField : null}
        />
      </View>

      <AddressOptionSheet
        visible={activePicker === 'region'}
        title="Select Region"
        placeholder="Search region"
        options={pickerOptions.region}
        selectedValue={region}
        onClose={() => setActivePicker('')}
        onSelect={(option) => handlePick('region', option)}
      />

      <AddressOptionSheet
        visible={activePicker === 'province'}
        title="Select Province"
        placeholder="Search province"
        options={pickerOptions.province}
        selectedValue={province}
        onClose={() => setActivePicker('')}
        onSelect={(option) => handlePick('province', option)}
      />

      <AddressOptionSheet
        visible={activePicker === 'city'}
        title="Select City / Municipality"
        placeholder="Search city or municipality"
        options={pickerOptions.city}
        selectedValue={city}
        onClose={() => setActivePicker('')}
        onSelect={(option) => handlePick('city', option)}
      />

      <AddressOptionSheet
        visible={activePicker === 'barangay'}
        title="Select Barangay"
        placeholder="Search barangay"
        options={pickerOptions.barangay}
        selectedValue={barangay}
        onClose={() => setActivePicker('')}
        onSelect={(option) => handlePick('barangay', option)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
  },
  containerEmbedded: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  sectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  sectionBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  compactHelper: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  fieldRow: {
    gap: theme.spacing.xs,
  },
  fieldRowWide: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  rowField: {
    flex: 1,
  },
  selectFieldWrap: {
    flex: 1,
    marginBottom: theme.spacing.sm,
    minHeight: 82,
  },
  selectFieldLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.label,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  requiredMark: {
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.bold,
  },
  selectField: {
    minHeight: theme.inputs.minHeightCompact,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.transparent,
    backgroundColor: theme.colors.surfaceSoft,
    paddingHorizontal: theme.spacing.inputPaddingXCompact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectFieldPressed: {
    borderColor: theme.colors.borderFocus,
    ...theme.shadows.soft,
  },
  selectFieldDisabled: {
    opacity: 0.55,
  },
  selectFieldError: {
    borderColor: theme.colors.borderError,
  },
  selectFieldValue: {
    flex: 1,
    marginRight: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    color: theme.colors.textPrimary,
  },
  selectFieldPlaceholder: {
    color: theme.colors.textMuted,
  },
  selectFieldValueDisabled: {
    color: theme.colors.textDisabled,
  },
  selectFieldHelper: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  selectFieldErrorText: {
    marginTop: 3,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textError,
    fontWeight: theme.typography.weights.medium,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: theme.colors.overlay,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    maxHeight: '78%',
    backgroundColor: theme.colors.backgroundPrimary,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  sheetTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  sheetSubtitle: {
    marginTop: 2,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
  },
  sheetCloseButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  sheetScroll: {
    marginTop: theme.spacing.xs,
  },
  sheetScrollContent: {
    paddingBottom: theme.spacing.md,
  },
  sheetOption: {
    minHeight: 54,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.transparent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  sheetOptionSelected: {
    borderColor: theme.colors.brandPrimaryMuted,
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  sheetOptionPressed: {
    opacity: 0.9,
  },
  sheetOptionText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.body,
    color: theme.colors.textPrimary,
  },
  sheetOptionTextSelected: {
    fontWeight: theme.typography.weights.semibold,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  emptyStateTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  emptyStateBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
  },
});
