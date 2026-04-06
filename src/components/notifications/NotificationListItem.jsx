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
  wig_request_updated: 'clipboard-text-outline',
  wig_allocation_updated: 'content-cut',
  certificate_available: 'certificate-outline',
};

export function NotificationListItem({ notification, onPress }) {
  return (
    <Pressable
      onPress={() => onPress?.(notification)}
      style={({ pressed }) => [
        styles.card,
        !notification.isRead ? styles.cardUnread : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.iconWrap}>
        <AppIcon
          name={TYPE_ICON_MAP[notification.type] || 'bell-outline'}
          state={!notification.isRead ? 'active' : 'muted'}
        />
      </View>

      <View style={styles.copyWrap}>
        <View style={styles.topRow}>
          <Text style={styles.title}>{notification.title}</Text>
          {!notification.isRead ? <View style={styles.unreadDot} /> : null}
        </View>
        <Text style={styles.message}>{notification.message}</Text>
        <Text style={styles.timestamp}>{getNotificationTimestampLabel(notification.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.backgroundPrimary,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  cardUnread: {
    borderColor: theme.colors.brandPrimaryMuted,
    backgroundColor: theme.colors.surfaceSoft,
  },
  cardPressed: {
    opacity: 0.92,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.backgroundPrimary,
  },
  copyWrap: {
    flex: 1,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
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
  },
  message: {
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
