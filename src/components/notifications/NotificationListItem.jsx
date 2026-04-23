import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import { theme } from '../../design-system/theme';
import { getNotificationTimestampLabel } from '../../features/notification.service';

const TYPE_ICON_MAP = {
  submission_received: 'gift-outline',
  ai_screening_completed: 'star-four-points-outline',
  recommendation_available: 'lightbulb-on-outline',
  logistics_update: 'truck-delivery-outline',
  donation_tracking_updated: 'timeline-text-outline',
  hair_analysis_reminder: 'line-scan',
  donation_drive_update: 'calendar-clock-outline',
  donation_drive_rsvp_reminder: 'calendar-clock-outline',
  wig_request_updated: 'clipboard-text-outline',
  wig_allocation_updated: 'content-cut',
  certificate_available: 'certificate-outline',
};

export function NotificationListItem({ notification, onPress, compact = false }) {
  return (
    <Pressable
      onPress={() => onPress?.(notification)}
      style={({ pressed }) => [
        styles.row,
        compact ? styles.rowCompact : null,
        !notification.isRead ? styles.rowUnread : null,
        pressed ? styles.rowPressed : null,
      ]}
    >
      <View style={[styles.iconWrap, !notification.isRead ? styles.iconWrapUnread : null]}>
        <AppIcon
          name={TYPE_ICON_MAP[notification.type] || 'bell-outline'}
          state={!notification.isRead ? 'active' : 'muted'}
        />
      </View>

      <View style={styles.copyWrap}>
        <View style={styles.topRow}>
          <Text numberOfLines={1} style={styles.title}>{notification.title}</Text>
          <Text style={styles.timestamp}>{getNotificationTimestampLabel(notification.createdAt)}</Text>
        </View>
        <View style={styles.messageRow}>
          <Text numberOfLines={2} style={styles.message}>{notification.message}</Text>
          {!notification.isRead ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderSubtle,
  },
  rowCompact: {
    paddingVertical: theme.spacing.sm,
  },
  rowUnread: {
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.sm,
    marginHorizontal: -theme.spacing.xs,
  },
  rowPressed: {
    opacity: 0.84,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
    marginTop: 2,
  },
  iconWrapUnread: {
    backgroundColor: theme.colors.brandPrimaryMuted,
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.body,
    fontWeight: theme.typography.weights.semibold,
    color: theme.colors.textPrimary,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
    marginTop: 4,
    marginLeft: theme.spacing.sm,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
  timestamp: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    color: theme.colors.textMuted,
  },
});
