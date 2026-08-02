import React from "react";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DonorTopBar } from "../../src/components/donor/DonorTopBar";
import { DashboardLayout } from "../../src/components/layout/DashboardLayout";
import { PatientTutorialModal } from "../../src/components/patient/PatientTutorialModal";
import { EmptyDataState } from "../../src/components/ui/EmptyDataState";
import { StatusBanner } from "../../src/components/ui/StatusBanner";
import { patientDashboardNavItems } from "../../src/constants/dashboard";
import { resolveThemeRoles, theme } from "../../src/design-system/theme";
import { useNotifications } from "../../src/hooks/useNotifications";
import { usePatientWigRequest } from "../../src/hooks/usePatientWigRequest";
import { useProcessTracking } from "../../src/hooks/useProcessTracking";
import { useAuth } from "../../src/providers/AuthProvider";

export default function PatientHomeScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const { unreadCount } = useNotifications({
    role: "patient",
    userId: user?.id,
    databaseUserId: profile?.user_id,
  });
  const {
    hasSubmittedRequest,
    isLoadingContext,
    error,
  } = usePatientWigRequest({ userId: user?.id });
  const { tracker, trackingError, isLoadingTracking } = useProcessTracking({
    role: "patient",
    userId: user?.id,
    databaseUserId: profile?.user_id,
  });

  const roles = resolveThemeRoles(resolvedTheme);
  const headerPrimaryColor =
    resolvedTheme?.primaryColor || roles.primaryActionBackground;
  const trackingSteps = tracker?.steps || [];
  const hasActiveRequest = Boolean(hasSubmittedRequest);
  const primaryTextColor = resolvedTheme?.primaryTextColor || roles.headingText;
  const [isTutorialOpen, setIsTutorialOpen] = React.useState(false);

  const handleNavPress = (item) => {
    if (!item.route || item.route === "/patient/home") return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="home"
      navVariant="patient"
      onNavPress={handleNavPress}
      header={
        <View
          style={[
            styles.dashboardHeaderSurface,
            { backgroundColor: headerPrimaryColor },
          ]}
        >
          <DonorTopBar
            unreadCount={unreadCount}
            showTutorialAction
            onTutorialPress={() => setIsTutorialOpen(true)}
            onNotificationsPress={() =>
              router.navigate("/patient/notifications")
            }
            onProfilePress={() => router.navigate("/profile")}
          />
        </View>
      }
    >
      <PatientTutorialModal
        visible={isTutorialOpen}
        tabKey="home"
        onClose={() => setIsTutorialOpen(false)}
      />
      {isLoadingContext || isLoadingTracking ? (
        <StatusBanner
          title="Loading request status"
          message="Checking your latest wig request."
          variant="info"
          presentation="floating"
          visible
          autoDismissMs={3000}
        />
      ) : null}

      {error || trackingError ? (
        <StatusBanner
          title="Status unavailable"
          message={
            error?.message ||
            trackingError ||
            "We could not load your request status right now."
          }
          variant="error"
          presentation="floating"
          visible
          autoDismissMs={3000}
        />
      ) : null}

      <View style={styles.stack}>
        <View style={styles.timelineSection}>
          <View style={styles.timelineHeadingRow}>
            <Text style={[styles.timelineHeading, { color: primaryTextColor }]}>
              Journey Timeline
            </Text>
            {hasActiveRequest ? (
              <Text style={[styles.timelineStatus, { color: primaryTextColor }]}>
                {tracker?.summary?.label || "Pending"}
              </Text>
            ) : null}
          </View>

          {hasActiveRequest && trackingSteps.length ? (
            <View style={styles.timelineList}>
              {trackingSteps.map((step, index) => {
                const isCompleted = step.state === "completed";
                const isCurrent = step.state === "current";
                const isAttention = step.state === "attention";
                return (
                  <View key={step.key || `${step.title}-${index}`} style={styles.timelineRow}>
                    <View style={styles.timelineMarkerColumn}>
                      <View style={[
                        styles.timelineMarker,
                        {
                          backgroundColor: isCompleted
                            ? roles.primaryActionBackground
                            : roles.pageBackground,
                          borderColor: isCompleted || isCurrent || isAttention
                            ? roles.primaryActionBackground
                            : roles.defaultCardBorder,
                        },
                      ]}>
                        {isCompleted ? (
                          <MaterialCommunityIcons name="check" size={14} color={roles.primaryActionText} />
                        ) : isCurrent ? (
                          <View style={[styles.timelineCurrentDot, { backgroundColor: roles.primaryActionBackground }]} />
                        ) : isAttention ? (
                          <MaterialCommunityIcons name="alert" size={13} color={roles.primaryActionBackground} />
                        ) : (
                          <MaterialCommunityIcons name="clock-outline" size={13} color={primaryTextColor} />
                        )}
                      </View>
                      {index < trackingSteps.length - 1 ? (
                        <View style={[
                          styles.timelineConnector,
                          {
                            backgroundColor: isCompleted
                              ? roles.primaryActionBackground
                              : roles.defaultCardBorder,
                          },
                        ]} />
                      ) : null}
                    </View>

                    <View style={[
                      styles.timelineCard,
                      {
                        backgroundColor: roles.pageBackground,
                        borderColor: roles.defaultCardBorder,
                      },
                    ]}>
                      <View style={styles.timelineCardHeader}>
                        <Text style={[styles.timelineTitle, { color: primaryTextColor }]}>{step.title}</Text>
                        <Text style={[styles.timelineLabel, { color: primaryTextColor }]}>{step.label}</Text>
                      </View>
                      {step.description ? (
                        <Text style={[styles.timelineDescription, { color: primaryTextColor }]}>
                          {step.description}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.navigate("/patient/requests")}
                style={styles.timelineDetailsLink}
              >
                <Text style={[styles.timelineDetailsText, { color: primaryTextColor }]}>View request details</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color={primaryTextColor} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyJourney}>
              <EmptyDataState
                variant="analysis"
                title="No wig request yet"
                message=""
                style={styles.emptyJourneyTemplate}
                titleStyle={[styles.emptyJourneyTitle, { color: primaryTextColor }]}
              />
            </View>
          )}
        </View>
      </View>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  dashboardHeaderSurface: {
    marginHorizontal: -theme.layout.screenPaddingX,
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.xs,
  },
  stack: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  timelineSection: {
    gap: theme.spacing.md,
  },
  timelineHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  timelineHeading: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    fontWeight: theme.typography.weights.bold,
  },
  timelineStatus: {
    maxWidth: 140,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  timelineList: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: theme.spacing.sm,
  },
  timelineMarkerColumn: {
    width: 30,
    alignItems: "center",
  },
  timelineMarker: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCurrentDot: {
    width: 9,
    height: 9,
    borderRadius: theme.radius.full,
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    minHeight: 28,
  },
  timelineCard: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  timelineCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  timelineTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  timelineLabel: {
    maxWidth: 104,
    textAlign: "right",
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.medium,
  },
  timelineDescription: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    lineHeight: theme.typography.semantic.caption * theme.typography.lineHeights.relaxed,
  },
  timelineDetailsLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.xs,
  },
  timelineDetailsText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  emptyJourney: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
  },
  emptyJourneyTemplate: {
    width: "100%",
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.sm,
  },
  emptyJourneyTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.bold,
  },
});
