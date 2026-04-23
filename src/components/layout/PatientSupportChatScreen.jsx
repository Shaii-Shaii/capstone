import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DashboardLayout } from './DashboardLayout';
import { DashboardHeader } from '../ui/DashboardHeader';
import { AppCard } from '../ui/AppCard';
import { ChatbotSupportPanel } from '../chatbot/ChatbotSupportPanel';
import { useNotifications } from '../../hooks/useNotifications';
import { theme } from '../../design-system/theme';
import { patientDashboardNavItems } from '../../constants/dashboard';
import { useAuth } from '../../providers/AuthProvider';

export function PatientSupportChatScreen() {
  const router = useRouter();
  const { user, profile, patientProfile } = useAuth();
  const { unreadCount } = useNotifications({ role: 'patient', userId: user?.id, databaseUserId: profile?.user_id });

  const firstName = (profile?.first_name || '').trim();
  const lastName = (profile?.last_name || '').trim();
  const avatarUri = profile?.avatar_url || profile?.photo_path || patientProfile?.patient_picture || '';
  const avatarInitials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.trim();

  const handleNavPress = (item) => {
    if (!item.route || item.route === '/patient/support') return;
    router.navigate(item.route);
  };

  return (
    <DashboardLayout
      navItems={patientDashboardNavItems}
      activeNavKey="support"
      navVariant="patient"
      showSupportChat={false}
      onNavPress={handleNavPress}
      header={(
        <DashboardHeader
          title="Support"
          subtitle=""
          summary=""
          avatarInitials={avatarInitials}
          avatarUri={avatarUri}
          variant="patient"
          minimal={true}
          showAvatar={true}
          utilityActions={[
            {
              key: 'notifications',
              icon: 'notifications',
              badge: unreadCount ? String(Math.min(unreadCount, 99)) : undefined,
              onPress: () => router.navigate('/patient/notifications'),
            },
          ]}
        />
      )}
    >
      <AppCard variant="patientTint" radius="xl" padding="md" style={styles.chatCard}>
        <View style={styles.helpWrap}>
          <Text style={styles.helpTitle}>Patient adviser</Text>
          <Text style={styles.helpText}>Ask about wig requests, status updates, and account help.</Text>
        </View>
        <ChatbotSupportPanel role="patient" userId={user?.id} variant="screen" />
      </AppCard>
    </DashboardLayout>
  );
}

const styles = StyleSheet.create({
  chatCard: {
    gap: theme.spacing.md,
  },
  helpWrap: {
    gap: theme.spacing.xs,
  },
  helpTitle: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    color: theme.colors.textPrimary,
  },
  helpText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.bodySm,
    lineHeight: theme.typography.semantic.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textSecondary,
  },
});
