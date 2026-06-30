import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DonorTopBar } from "../../src/components/donor/DonorTopBar";
import { AppCard } from "../../src/components/ui/AppCard";
import { DashboardLayout } from "../../src/components/layout/DashboardLayout";
import { AppButton } from "../../src/components/ui/AppButton";
import { AppIcon } from "../../src/components/ui/AppIcon";
import { StatusBanner } from "../../src/components/ui/StatusBanner";
import { patientDashboardNavItems } from "../../src/constants/dashboard";
import { resolveThemeRoles, theme } from "../../src/design-system/theme";
import { useNotifications } from "../../src/hooks/useNotifications";
import { usePatientWigRequest } from "../../src/hooks/usePatientWigRequest";
import { useProcessTracking } from "../../src/hooks/useProcessTracking";
import { useAuth } from "../../src/providers/AuthProvider";

const createCalendarDate = (year, monthIndex, day) =>
  new Date(year, monthIndex, day, 12, 0, 0, 0);

const parseCalendarDate = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [datePart] = text.split("T");
    const [year, month, day] = datePart.split("-").map((part) => Number(part));
    if (!year || !month || !day) return null;
    return createCalendarDate(year, month - 1, day);
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return createCalendarDate(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
  );
};

const toLocalDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatCalendarMonthLabel = (date) =>
  new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    date,
  );

const buildCalendarCells = (monthDate, selectedDateKey) => {
  if (!(monthDate instanceof Date) || Number.isNaN(monthDate.getTime()))
    return [];

  const startOfMonth = createCalendarDate(
    monthDate.getFullYear(),
    monthDate.getMonth(),
    1,
  );
  const leadingOffset = startOfMonth.getDay();
  const firstCell = createCalendarDate(
    startOfMonth.getFullYear(),
    startOfMonth.getMonth(),
    startOfMonth.getDate() - leadingOffset,
  );
  const todayKey = toLocalDateKey(
    createCalendarDate(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate(),
    ),
  );

  return Array.from({ length: 42 }, (_cell, index) => {
    const cellDate = createCalendarDate(
      firstCell.getFullYear(),
      firstCell.getMonth(),
      firstCell.getDate() + index,
    );
    const key = toLocalDateKey(cellDate);
    return {
      date: cellDate,
      key,
      day: cellDate.getDate(),
      isCurrentMonth:
        cellDate.getMonth() === monthDate.getMonth() &&
        cellDate.getFullYear() === monthDate.getFullYear(),
      isSelected: Boolean(selectedDateKey && key === selectedDateKey),
      isToday: key === todayKey,
    };
  });
};

export default function PatientHomeScreen() {
  const router = useRouter();
  const { user, profile, resolvedTheme } = useAuth();
  const { unreadCount } = useNotifications({
    role: "patient",
    userId: user?.id,
    databaseUserId: profile?.user_id,
  });
  const {
    latestWigRequest,
    latestReleaseSchedule,
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
  const completedStepCount = trackingSteps.filter(
    (step) => step.state === "completed",
  ).length;
  const currentStepCount = trackingSteps.some(
    (step) => step.state === "current",
  )
    ? 1
    : 0;
  const progressPercent = trackingSteps.length
    ? Math.min(
        100,
        Math.round(
          ((completedStepCount + currentStepCount) / trackingSteps.length) *
            100,
        ),
      )
    : latestWigRequest?.req_id
      ? 20
      : 0;
  const requestLabel =
    tracker?.summary?.label || latestWigRequest?.status || "No active request";
  const hasActiveRequest = Boolean(hasSubmittedRequest);
  const receiptDate = parseCalendarDate(
    latestReleaseSchedule?.proposed_release_date,
  );
  const initialCalendarMonth =
    receiptDate ||
    createCalendarDate(new Date().getFullYear(), new Date().getMonth(), 1);
  const [calendarMonth, setCalendarMonth] =
    React.useState(initialCalendarMonth);
  const selectedDateKey = receiptDate ? toLocalDateKey(receiptDate) : "";
  React.useEffect(() => {
    if (receiptDate) {
      setCalendarMonth(receiptDate);
    }
  }, [receiptDate]);
  const calendarCells = React.useMemo(
    () => buildCalendarCells(calendarMonth, selectedDateKey),
    [calendarMonth, selectedDateKey],
  );
  const calendarRows = React.useMemo(() => {
    const rows = [];
    for (let index = 0; index < calendarCells.length; index += 7) {
      rows.push(calendarCells.slice(index, index + 7));
    }
    return rows;
  }, [calendarCells]);

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
            onNotificationsPress={() =>
              router.navigate("/patient/notifications")
            }
            onProfilePress={() => router.navigate("/profile")}
          />
        </View>
      }
    >
      {isLoadingContext || isLoadingTracking ? (
        <StatusBanner
          title="Loading request status"
          message="Checking your latest wig request."
          variant="info"
          presentation="floating"
          visible={isLoadingContext || isLoadingTracking}
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
          visible={Boolean(error || trackingError)}
          autoDismissMs={3000}
        />
      ) : null}

      <View style={styles.stack}>
        <View style={styles.calendarSectionHeader}>
          <AppIcon
            name="calendar-month-outline"
            size="sm"
            color={roles.headingText}
          />
          <View
            style={[
              styles.calendarSectionDivider,
              { backgroundColor: roles.primaryActionBackground },
            ]}
          />
          <Text
            style={[styles.calendarSectionTitle, { color: roles.headingText }]}
          >
            Wig Release Calendar
          </Text>
        </View>

        {hasActiveRequest ? (
          <View style={styles.statusPanel}>
            <View style={styles.statusTopRow}>
              <View style={styles.statusBadge}>
                <AppIcon name="sparkle" size="sm" state="active" />
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: roles.tertiaryAccentText },
                  ]}
                >
                  Active request
                </Text>
              </View>
            </View>

            <View style={styles.statusContent}>
              <View style={styles.statusCopy}>
                <Text
                  style={[styles.statusTitle, { color: roles.headingText }]}
                >
                  Request status: {requestLabel}
                </Text>
                <Text style={[styles.statusBody, { color: roles.bodyText }]}>
                  {tracker?.summary?.helperText ||
                    "Track the latest progress for your wig request."}
                </Text>
              </View>

              <View style={styles.progressBlock}>
                <View style={styles.progressLabelRow}>
                  <Text
                    style={[styles.progressLabel, { color: roles.bodyText }]}
                  >
                    Progress
                  </Text>
                  <Text
                    style={[styles.progressValue, { color: roles.headingText }]}
                  >
                    {progressPercent}%
                  </Text>
                </View>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: roles.supportCardBackground },
                  ]}
                >
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${progressPercent}%`,
                        backgroundColor: roles.primaryActionBackground,
                      },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.updateRow}>
                <AppIcon name="appointment" size="sm" state="muted" />
                <Text
                  style={[styles.updateText, { color: roles.bodyText }]}
                  numberOfLines={1}
                >
                  {tracker?.summary?.helperText ||
                    "Updates appear after your first request."}
                </Text>
              </View>
            </View>

            <AppButton
              title="View Journey Details"
              onPress={() => router.navigate("/patient/requests")}
              trailing={<AppIcon name="chevronRight" state="inverse" />}
            />
          </View>
        ) : null}

        <AppCard
          variant="default"
          radius="xl"
          padding="md"
          contentStyle={styles.calendarPanel}
        >
          <View style={styles.calendarMonthRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              onPress={() =>
                setCalendarMonth((current) =>
                  createCalendarDate(
                    current.getFullYear(),
                    current.getMonth() - 1,
                    1,
                  ),
                )
              }
              hitSlop={8}
              style={({ pressed }) => [
                styles.calendarNavButton,
                {
                  backgroundColor: roles.pageBackground,
                  borderColor: roles.defaultCardBorder,
                },
                pressed ? styles.calendarNavButtonPressed : null,
              ]}
            >
              <AppIcon name="chevron-left" size="sm" color={roles.headingText} />
            </Pressable>

            <View style={styles.calendarHeaderCopy}>
              <Text
                style={[styles.calendarMonthLabel, { color: roles.headingText }]}
              >
                {formatCalendarMonthLabel(calendarMonth)}
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next month"
              onPress={() =>
                setCalendarMonth((current) =>
                  createCalendarDate(
                    current.getFullYear(),
                    current.getMonth() + 1,
                    1,
                  ),
                )
              }
              hitSlop={8}
              style={({ pressed }) => [
                styles.calendarNavButton,
                {
                  backgroundColor: roles.pageBackground,
                  borderColor: roles.defaultCardBorder,
                },
                pressed ? styles.calendarNavButtonPressed : null,
              ]}
            >
              <AppIcon name="chevron-right" size="sm" color={roles.headingText} />
            </Pressable>
          </View>

          <View style={styles.calendarWeekdayRow}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
              (weekday) => (
                <Text
                  key={`patient-calendar-weekday-${weekday}`}
                  style={[
                    styles.calendarWeekdayText,
                    { color: roles.metaText },
                  ]}
                >
                  {weekday}
                </Text>
              ),
            )}
          </View>

          <View style={styles.calendarGrid}>
            {calendarRows.map((row, rowIndex) => (
              <View
                key={`patient-calendar-row-${rowIndex}`}
                style={styles.calendarRow}
              >
                {row.map((cell) => (
                  <View
                    key={cell.key}
                    style={[
                      styles.calendarCell,
                      { backgroundColor: roles.pageBackground },
                      !cell.isCurrentMonth ? styles.calendarCellMuted : null,
                      cell.isSelected
                        ? [
                            styles.calendarCellSelected,
                            {
                              backgroundColor: theme.colors.backgroundSecondary,
                              borderColor: roles.primaryActionBackground,
                            },
                          ]
                        : null,
                      cell.isToday && !cell.isSelected
                        ? [
                            styles.calendarCellToday,
                            { borderColor: roles.primaryActionBackground },
                          ]
                        : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarCellText,
                        {
                          color: cell.isSelected
                            ? roles.primaryActionText
                            : cell.isCurrentMonth
                              ? roles.headingText
                              : roles.metaText,
                        },
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </AppCard>
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
    gap: theme.spacing.sm,
  },
  heroPanel: {
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  heroCopy: {
    gap: theme.spacing.xs,
  },
  heroEyebrow: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  heroTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight:
      theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.bold,
  },
  heroBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  heroMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  heroMetric: {
    minWidth: 96,
    flexGrow: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: 2,
  },
  heroMetricLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroMetricValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.tight,
    fontWeight: theme.typography.weights.bold,
  },
  calendarSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  calendarSectionDivider: {
    width: 4,
    height: 20,
    borderRadius: theme.radius.pill,
  },
  calendarSectionTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    lineHeight:
      theme.typography.semantic.bodyLg * theme.typography.lineHeights.tight,
  },
  statusPanel: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderMuted,
    borderBottomColor: theme.colors.borderMuted,
  },
  statusTopRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surfaceSoft,
  },
  statusBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  statusContent: {
    gap: theme.spacing.sm,
  },
  statusCopy: {
    gap: theme.spacing.xs,
  },
  statusTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight:
      theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
  },
  statusBody: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight:
      theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
  },
  progressBlock: {
    gap: theme.spacing.xs,
  },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.medium,
  },
  progressValue: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  progressTrack: {
    width: "100%",
    height: 10,
    borderRadius: theme.radius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: theme.radius.full,
  },
  updateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  updateText: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  calendarPanel: {
    gap: theme.spacing.xs,
  },
  calendarMonthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  calendarHeaderCopy: {
    flex: 1,
    alignItems: "center",
    minWidth: 0,
  },
  calendarMonthLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    fontWeight: theme.typography.weights.bold,
  },
  calendarNavButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.borderMuted,
    backgroundColor: theme.colors.backgroundPrimary,
  },
  calendarNavButtonPressed: {
    opacity: 0.72,
  },
  calendarWeekdayRow: {
    flexDirection: "row",
    gap: 3,
  },
  calendarWeekdayText: {
    flex: 1,
    textAlign: "center",
    fontFamily: theme.typography.fontFamily,
    fontSize: 8,
    fontWeight: theme.typography.weights.bold,
  },
  calendarGrid: {
    gap: 3,
  },
  calendarRow: {
    flexDirection: "row",
    gap: 3,
  },
  calendarCell: {
    flex: 1,
    minHeight: 32,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.backgroundPrimary,
  },
  calendarCellMuted: {
    opacity: 0.42,
  },
  calendarCellSelected: {
    ...theme.shadows.card,
  },
  calendarCellToday: {
    borderWidth: 1,
  },
  calendarCellText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: theme.typography.weights.semibold,
  },
  calendarFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  calendarFooterCopy: {
    flex: 1,
    gap: 4,
  },
  calendarFooterLabel: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    fontWeight: theme.typography.weights.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  calendarFooterValue: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.body,
    lineHeight:
      theme.typography.semantic.body * theme.typography.lineHeights.tight,
  },
});
