import React from 'react';
import {
  Image,
  ImageBackground,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ScreenContainer } from '../src/components/ui/ScreenContainer';
import { AppButton } from '../src/components/ui/AppButton';
import { AppCard } from '../src/components/ui/AppCard';
import { AppIcon } from '../src/components/ui/AppIcon';
import { AppTextLink } from '../src/components/ui/AppTextLink';
import { theme } from '../src/design-system/theme';
import donivraLogoNoText from '../src/assets/images/donivra_logo_no_text.png';
import heroDonorDash from '../src/assets/images/hero_donor_dash.png';
import heroLanding from '../src/assets/images/hero_landing.png';
import heroPatientDash from '../src/assets/images/hero_patient_dash.png';

const journeyHighlights = [
  {
    key: 'donor',
    icon: 'heart',
    title: 'For donors',
    description: 'Create a donor account, review preparation steps, and stay ready for your next donation visit.',
  },
  {
    key: 'patient',
    icon: 'support',
    title: 'For patients',
    description: 'Create a patient account, request support, and follow updates with a calmer guided flow.',
  },
];

const donationDriveEvents = [
  {
    key: 'quezon-city',
    title: 'Hope in Every Strand Drive',
    date: 'April 20',
    venue: 'Quezon City Community Hall',
    description: 'A weekend donation drive focused on first-time donors who want guided preparation and a welcoming start.',
    image: heroLanding,
    badge: 'Featured drive',
  },
  {
    key: 'pasig',
    title: 'Salon Partner Donation Day',
    date: 'May 4',
    venue: 'Pasig Partner Salon Network',
    description: 'Meet salon partners, review donation guidelines, and prepare your hair donation with on-site support.',
    image: heroDonorDash,
    badge: 'Donor-ready',
  },
  {
    key: 'manila',
    title: 'Community Care Hair Donation Fair',
    date: 'May 18',
    venue: 'Manila Wellness Center',
    description: 'An open community event connecting donation drives, patient support, and volunteer-led care information.',
    image: heroPatientDash,
    badge: 'Community event',
  },
];

const impactWidgets = [
  { key: 'events', icon: 'appointment', label: 'Upcoming drives', value: '3' },
  { key: 'support', icon: 'support', label: 'Guided pathways', value: 'Donor + Patient' },
  { key: 'access', icon: 'profile', label: 'Easy account return', value: 'Role-based login' },
];

export default function LandingScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const heroHeight = isCompactScreen ? 224 : isShortScreen ? 246 : 276;
  const [selectedEvent, setSelectedEvent] = React.useState(null);

  const navigateWithHaptic = async (path) => {
    await Haptics.selectionAsync();
    router.push(path);
  };

  const handleEventPress = async (eventItem) => {
    await Haptics.selectionAsync();
    setSelectedEvent(eventItem);
  };

  const closeEventModal = () => setSelectedEvent(null);

  return (
    <>
      <ScreenContainer
        scrollable={true}
        safeArea
        variant="auth"
        heroColors={[theme.colors.dashboardDonorFrom, theme.colors.heroTo]}
        contentStyle={[
          styles.screenContent,
          isCompactScreen ? styles.screenContentCompact : null,
        ]}
      >
        <View style={[styles.container, isShortScreen ? styles.containerCompact : null]}>
          <View style={styles.backgroundShapeOne} />
          <View style={styles.backgroundShapeTwo} />

          <Animated.View
            entering={FadeInUp.duration(520)}
            style={[styles.heroWrap, isCompactScreen ? styles.heroWrapCompact : null]}
          >
            <ImageBackground
              source={heroLanding}
              resizeMode="cover"
              style={[
                styles.heroCard,
                { height: heroHeight },
                isShortScreen ? styles.heroCardCompact : null,
              ]}
              imageStyle={styles.heroImage}
            >
              <LinearGradient
                colors={['rgba(100,100,100,0.10)', 'rgba(8,8,8,0.28)', 'rgba(8,8,8,0.88)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFillObject}
              />

              <View style={styles.heroGlow} />
              <View style={styles.heroGlowSecondary} />

              <View style={styles.heroTopRow}>
                <View style={styles.brandBadge}>
                  <View style={styles.logoFrame}>
                    <Image source={donivraLogoNoText} style={styles.logoImage} resizeMode="contain" />
                  </View>
                  <View style={styles.brandCopy}>
                    <Text style={styles.brandName}>Donivra</Text>
                    <Text style={styles.brandTag}>Hair donation and support</Text>
                  </View>
                </View>

                <View style={styles.heroIconButton}>
                  <AppIcon name="heart" state="inverse" />
                </View>
              </View>

              <View style={styles.heroContent}>
                <View style={styles.heroChipRow}>
                  <View style={styles.heroChip}>
                    <Text style={styles.heroChipText}>Support-first</Text>
                  </View>
                  <View style={styles.heroChip}>
                    <Text style={styles.heroChipText}>Donor and patient</Text>
                  </View>
                </View>

                <Text style={[styles.heroTitle, isCompactScreen ? styles.heroTitleCompact : null]}>
                  Connect hair donors and patients in need with one clear, caring start.
                </Text>
                <Text style={[styles.heroSubtitle, isCompactScreen ? styles.heroSubtitleCompact : null]}>
                  Donivra helps people donate hair, request support, and return to their role-based dashboard without a confusing entry flow.
                </Text>
              </View>
            </ImageBackground>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(70).duration(480)}
            style={[styles.eventWrap, isShortScreen ? styles.panelWrapCompact : null]}
          >
            <AppCard variant="elevated" radius="xl" padding={isCompactScreen ? 'sm' : 'lg'}>
              <View style={styles.eventHeader}>
                <View style={styles.eventHeaderCopy}>
                  <Text style={styles.panelEyebrow}>Hair donation drives</Text>
                  <Text style={styles.eventTitle}>Upcoming events and featured drives</Text>
                  <Text style={styles.panelSubtitle}>
                    Tap a drive to donate through that event. We will take you to donor signup or let you log in if you already have an account.
                  </Text>
                </View>

                <View style={styles.impactRow}>
                  {impactWidgets.map((item) => (
                    <View key={item.key} style={styles.impactWidget}>
                      <View style={styles.impactIconWrap}>
                        <AppIcon name={item.icon} size="sm" state="active" />
                      </View>
                      <Text style={styles.impactValue}>{item.value}</Text>
                      <Text style={styles.impactLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.eventRail}
              >
                {donationDriveEvents.map((item, index) => (
                  <Animated.View
                    key={item.key}
                    entering={FadeInDown.delay(120 + index * 70).duration(320)}
                    style={styles.eventCardWrap}
                  >
                    <Pressable
                      onPress={() => handleEventPress(item)}
                      style={({ pressed }) => [
                        styles.eventCardPressable,
                        pressed ? styles.eventCardPressed : null,
                      ]}
                    >
                      <ImageBackground source={item.image} style={styles.eventCard} imageStyle={styles.eventCardImage}>
                        <LinearGradient
                          colors={['rgba(18,18,18,0.04)', 'rgba(18,18,18,0.22)', 'rgba(18,18,18,0.84)']}
                          locations={[0, 0.45, 1]}
                          style={StyleSheet.absoluteFillObject}
                        />

                        <View style={styles.eventBadge}>
                          <Text style={styles.eventBadgeText}>{item.badge}</Text>
                        </View>

                        <View style={styles.eventCardFooter}>
                          <Text style={styles.eventCardDate}>{item.date}</Text>
                          <Text style={styles.eventCardTitle}>{item.title}</Text>
                          <Text style={styles.eventCardVenue}>{item.venue}</Text>
                          <Text numberOfLines={2} style={styles.eventCardDescription}>{item.description}</Text>
                        </View>
                      </ImageBackground>
                    </Pressable>
                  </Animated.View>
                ))}
              </ScrollView>
            </AppCard>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(100).duration(500)}
            style={[styles.panelWrap, isShortScreen ? styles.panelWrapCompact : null]}
          >
            <AppCard
              variant="elevated"
              radius="xl"
              padding={isCompactScreen ? 'sm' : 'lg'}
              contentStyle={styles.actionPanelContent}
              style={[styles.actionPanel, isCompactScreen ? styles.actionPanelCompact : null]}
            >
              <View style={styles.panelMainContent}>
                <View style={styles.panelHeader}>
                  <Text style={styles.panelEyebrow}>Start here</Text>
                  <Text style={[styles.panelTitle, isCompactScreen ? styles.panelTitleCompact : null]}>
                    Choose why you are here today.
                  </Text>
                  <Text style={styles.panelSubtitle}>
                    Our mission is to help connect generous hair donors with patients who need care, confidence, and practical support.
                  </Text>
                </View>

                <View style={styles.journeyGrid}>
                  {journeyHighlights.map((item) => (
                    <View key={item.key} style={styles.journeyCard}>
                      <View style={styles.journeyIconWrap}>
                        <AppIcon name={item.icon} size="sm" state="active" />
                      </View>
                      <Text style={styles.journeyTitle}>{item.title}</Text>
                      <Text style={styles.journeyDescription}>{item.description}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.actionStack}>
                  <Animated.View entering={FadeInDown.delay(180).duration(320)}>
                    <AppButton
                      title="I Want to Donate"
                      variant="primary"
                      size="lg"
                      leading={<AppIcon name="heart" state="inverse" />}
                      onPress={() => navigateWithHaptic('/donor/signup')}
                      enableHaptics={true}
                    />
                  </Animated.View>

                  <Animated.View entering={FadeInDown.delay(240).duration(320)}>
                    <AppButton
                      title="I Need a Donation"
                      variant="secondary"
                      size="lg"
                      leading={<AppIcon name="support" state="default" />}
                      onPress={() => navigateWithHaptic('/patient/signup')}
                      enableHaptics={true}
                    />
                  </Animated.View>
                </View>
              </View>

              <Animated.View entering={FadeInDown.delay(300).duration(320)} style={styles.accountActionWrap}>
                <Text style={styles.accountActionLabel}>Already have an account?</Text>
                <AppTextLink
                  title="Log in"
                  onPress={() => navigateWithHaptic('/auth/access')}
                  textStyle={styles.accountActionTitle}
                />
              </Animated.View>
            </AppCard>
          </Animated.View>
        </View>
      </ScreenContainer>

      <Modal
        visible={Boolean(selectedEvent)}
        animationType="fade"
        transparent
        onRequestClose={closeEventModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closeEventModal} />
          <View style={styles.modalSheetWrap}>
            <AppCard variant="elevated" radius="xl" padding="lg" style={styles.modalCard}>
              <View style={styles.modalTopRow}>
                <View style={styles.modalEventBadge}>
                  <AppIcon name="donations" size="sm" state="active" />
                </View>
                <AppTextLink title="Close" variant="muted" onPress={closeEventModal} />
              </View>

              <Text style={styles.modalTitle}>Do you want to donate?</Text>
              <Text style={styles.modalSubtitle}>
                {selectedEvent?.title ? `${selectedEvent.title} is open for donors. ` : ''}
                Sign up to start your donor account, or log in if you already have one.
              </Text>

              {selectedEvent ? (
                <View style={styles.modalEventDetails}>
                  <Text style={styles.modalEventMeta}>{selectedEvent.date} | {selectedEvent.venue}</Text>
                  <Text style={styles.modalEventCopy}>{selectedEvent.description}</Text>
                </View>
              ) : null}

              <View style={styles.modalActionStack}>
                <AppButton
                  title="Sign Up as Donor"
                  size="lg"
                  leading={<AppIcon name="heart" state="inverse" />}
                  onPress={async () => {
                    closeEventModal();
                    await navigateWithHaptic('/donor/signup');
                  }}
                  enableHaptics={true}
                />
                <AppButton
                  title="I Already Have an Account"
                  variant="secondary"
                  size="lg"
                  leading={<AppIcon name="profile" state="default" />}
                  onPress={async () => {
                    closeEventModal();
                    await navigateWithHaptic('/auth/access');
                  }}
                  enableHaptics={true}
                />
              </View>
            </AppCard>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: theme.spacing.sm,
    justifyContent: 'flex-start',
  },
  screenContentCompact: {
    paddingBottom: theme.spacing.xs,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  containerCompact: {
    paddingBottom: 0,
    gap: theme.spacing.xs,
  },
  heroWrap: {
    paddingHorizontal: theme.layout.screenPaddingX,
    zIndex: 1,
    marginBottom: theme.spacing.xs,
  },
  heroWrapCompact: {
    paddingHorizontal: theme.layout.screenPaddingXCompact,
    marginBottom: 0,
  },
  heroCard: {
    borderRadius: 34,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: theme.spacing.lg,
    ...theme.shadows.hero,
  },
  heroCardCompact: {
    padding: theme.spacing.md,
    borderRadius: 30,
  },
  heroImage: {
    borderRadius: 34,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    zIndex: 2,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  logoFrame: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    color: theme.colors.textInverse,
  },
  brandTag: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textHeroMuted,
  },
  heroIconButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.whiteOverlay,
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  heroContent: {
    zIndex: 2,
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  heroChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  heroChipText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textInverse,
    fontWeight: theme.typography.weights.medium,
  },
  heroTitle: {
    maxWidth: 280,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 30,
    lineHeight: 34,
    color: theme.colors.textInverse,
    marginBottom: theme.spacing.xs,
  },
  heroTitleCompact: {
    maxWidth: 236,
    fontSize: 26,
    lineHeight: 30,
  },
  heroSubtitle: {
    maxWidth: 292,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textHeroSoft,
  },
  heroSubtitleCompact: {
    maxWidth: 240,
  },
  panelWrap: {
    paddingHorizontal: theme.layout.screenPaddingX,
    zIndex: 3,
    marginTop: 0,
  },
  eventWrap: {
    paddingHorizontal: theme.layout.screenPaddingX,
    zIndex: 2,
    marginBottom: theme.spacing.xs,
  },
  panelWrapCompact: {
    paddingHorizontal: theme.layout.screenPaddingXCompact,
  },
  actionPanel: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.authCardMaxWidth,
    borderRadius: 32,
    paddingTop: theme.spacing.lg,
  },
  actionPanelCompact: {
    borderRadius: 28,
    paddingTop: theme.spacing.md,
  },
  actionPanelContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  panelMainContent: {
    gap: theme.spacing.md,
  },
  panelHeader: {
    marginBottom: 0,
  },
  panelEyebrow: {
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: theme.colors.brandPrimary,
  },
  panelTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 23,
    lineHeight: 28,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  panelTitleCompact: {
    fontSize: 21,
    lineHeight: 25,
  },
  panelSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  actionStack: {
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  eventHeader: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  eventHeaderCopy: {
    gap: theme.spacing.xs,
  },
  eventTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
    lineHeight: theme.typography.compact.titleSm * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
  },
  impactRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  impactWidget: {
    flex: 1,
    minHeight: 88,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  impactIconWrap: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  impactValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  impactLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    lineHeight: 15,
    color: theme.colors.textSecondary,
  },
  eventRail: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
  },
  eventCardWrap: {
    width: 238,
  },
  eventCardPressable: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  eventCardPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.99 }],
  },
  eventCard: {
    height: 262,
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    borderRadius: 28,
    overflow: 'hidden',
  },
  eventCardImage: {
    borderRadius: 28,
  },
  eventBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  eventBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textInverse,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventCardFooter: {
    gap: 2,
  },
  eventCardDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textHeroMuted,
    fontWeight: theme.typography.weights.medium,
  },
  eventCardTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textInverse,
  },
  eventCardVenue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    color: theme.colors.textInverse,
    fontWeight: theme.typography.weights.medium,
  },
  eventCardDescription: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 17,
    color: theme.colors.textHeroSoft,
  },
  journeyGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  journeyCard: {
    flex: 1,
    minHeight: 132,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: theme.spacing.xs,
  },
  journeyIconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  journeyTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  journeyDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.textSecondary,
  },
  accountActionWrap: {
    marginTop: 'auto',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  accountActionLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.medium,
  },
  accountActionTitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.actionTextLink,
  },
  backgroundShapeOne: {
    position: 'absolute',
    top: 36,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentSoft,
  },
  backgroundShapeTwo: {
    position: 'absolute',
    top: 186,
    left: -48,
    width: 112,
    height: 112,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: theme.colors.whiteOverlay,
  },
  heroGlow: {
    position: 'absolute',
    top: -28,
    right: -12,
    width: 132,
    height: 132,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(151,49,58,0.26)',
  },
  heroGlowSecondary: {
    position: 'absolute',
    bottom: 30,
    right: 18,
    width: 86,
    height: 86,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(201,200,200,0.18)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 8, 0.46)',
    justifyContent: 'flex-end',
  },
  modalSheetWrap: {
    paddingHorizontal: theme.layout.screenPaddingX,
    paddingBottom: theme.spacing.xl,
  },
  modalCard: {
    borderRadius: 30,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  modalEventBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  modalTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleLg,
    lineHeight: theme.typography.compact.titleLg * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  modalSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  modalEventDetails: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.sm,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: theme.spacing.xs,
  },
  modalEventMeta: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.brandPrimary,
  },
  modalEventCopy: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  modalActionStack: {
    marginTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
});
