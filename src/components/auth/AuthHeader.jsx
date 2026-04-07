import React from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../design-system/theme';
import { AppTextLink } from '../ui/AppTextLink';
import donivraLogoNoText from '../../assets/images/donivra_logo_no_text.png';

const HEADER_VARIANTS = {
  donor: {
    colors: [theme.colors.dashboardDonorFrom, theme.colors.dashboardDonorTo],
  },
  patient: {
    colors: [theme.colors.dashboardPatientFrom, theme.colors.dashboardPatientTo],
  },
  access: {
    colors: [theme.colors.heroFrom, theme.colors.heroTo],
  },
  default: {
    colors: [theme.colors.heroFrom, theme.colors.heroTo],
  },
};

export const AuthHeader = ({
  title,
  subtitle,
  eyebrow,
  style,
  backLabel,
  onBackPress,
  role = 'default',
  minimal = false,
}) => {
  const config = HEADER_VARIANTS[role] || HEADER_VARIANTS.default;

  return (
    <View style={[styles.container, style]}>
      {backLabel && onBackPress ? (
        <AppTextLink title={backLabel} variant="muted" onPress={onBackPress} style={styles.backLink} />
      ) : null}

      {minimal ? (
        <View style={styles.minimalLogoWrap}>
          <View style={styles.minimalLogoFrame}>
            <Image source={donivraLogoNoText} style={styles.logoImage} resizeMode="contain" />
          </View>
        </View>
      ) : (
        <LinearGradient
          colors={config.colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.visualCard}
        >
          <View style={styles.visualTopRow}>
            <View style={styles.logoGroup}>
              <View style={styles.logoFrame}>
                <Image source={donivraLogoNoText} style={styles.logoImage} resizeMode="contain" />
              </View>
              <View style={styles.visualCopy}>
                <Text style={styles.brandName}>Donivra</Text>
              </View>
            </View>

            {eyebrow ? (
              <View style={styles.eyebrowPill}>
                <Text style={styles.eyebrowText}>{eyebrow}</Text>
              </View>
            ) : null}
          </View>
        </LinearGradient>
      )}

      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: theme.spacing.xs,
  },
  backLink: {
    alignSelf: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  visualCard: {
    borderRadius: 28,
    padding: theme.spacing.md,
    ...theme.shadows.soft,
  },
  minimalLogoWrap: {
    alignItems: 'center',
  },
  minimalLogoFrame: {
    width: 72,
    height: 72,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  visualTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  logoFrame: {
    width: 48,
    height: 48,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  visualCopy: {
    flex: 1,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textInverse,
  },
  eyebrowPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.whiteOverlay,
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  eyebrowText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  copyBlock: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleLg,
    lineHeight: theme.typography.compact.titleLg * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
