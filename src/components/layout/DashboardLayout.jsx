import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  ScrollView,
  Modal,
  Pressable,
  Text,
  KeyboardAvoidingView,
  Platform,
  Image,
  Animated as RNAnimated,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenContainer } from '../ui/ScreenContainer';
import { DashboardTabBar } from '../ui/DashboardTabBar';
import { AppCard } from '../ui/AppCard';
import { AppIcon } from '../ui/AppIcon';
import { ChatbotSupportPanel } from '../chatbot/ChatbotSupportPanel';
import { useAuth } from '../../providers/AuthProvider';
import { theme } from '../../design-system/theme';
import chatbotIcon from '../../assets/images/chatbot_icon.png';

export const DashboardLayout = ({
  children,
  header,
  footer,
  navItems = [],
  activeNavKey,
  onNavPress,
  navVariant = 'donor',
  showSupportChat = true,
  screenVariant = 'dashboard',
  chatModalPresentation = 'sheet',
  draggableChat = false,
}) => {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { user, resolvedTheme } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const hasNav = navItems.length > 0;
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const chatRole = navVariant === 'donor' || navVariant === 'patient' ? navVariant : null;
  const isSupportChatAvailable = Boolean(showSupportChat && chatRole && user?.id);
  const availableChatModalHeight = height - Math.max(insets.top, theme.spacing.md) - theme.spacing.sm;
  const minimumChatModalHeight = Math.max(availableChatModalHeight * (isShortScreen ? 0.58 : 0.52), 420);
  const desiredChatModalHeight = availableChatModalHeight * (isShortScreen ? 0.76 : 0.68);
  const chatModalHeight = Math.min(
    Math.max(desiredChatModalHeight, minimumChatModalHeight),
    availableChatModalHeight
  );
  const navVisualOffset = (
    isCompactScreen
      ? theme.layout.dashboardFloatingNavOffsetCompact
      : theme.layout.dashboardFloatingNavOffset
  ) + theme.layout.dashboardFloatingNavLift;
  const navBottomPadding = hasNav
    ? Math.max(
      insets.bottom + navVisualOffset + (isCompactScreen ? 12 : 16),
      isShortScreen ? 44 : 52
    )
    : (isShortScreen ? theme.spacing.sectionCompact : theme.spacing.sectionLg);
  const chatLauncherBottom = hasNav
    ? insets.bottom + navVisualOffset + (isCompactScreen ? 52 : 60)
    : insets.bottom + (isCompactScreen ? theme.spacing.lg : theme.spacing.xl);
  const chatLauncherRight = theme.spacing.md;
  const isCenteredChatModal = chatModalPresentation === 'centered';
  const resolvedScreenVariant = navVariant === 'patient' ? 'default' : screenVariant;
  const chatBubblePosition = React.useRef(new RNAnimated.ValueXY({ x: 0, y: 0 })).current;
  const chatBubbleResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gestureState) => (
        draggableChat && (Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4)
      ),
      onPanResponderGrant: () => {
        chatBubblePosition.extractOffset();
      },
      onPanResponderMove: RNAnimated.event(
        [null, { dx: chatBubblePosition.x, dy: chatBubblePosition.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        chatBubblePosition.flattenOffset();
      },
      onPanResponderTerminate: () => {
        chatBubblePosition.flattenOffset();
      },
    })
  ).current;

  return (
    <ScreenContainer
      variant={resolvedScreenVariant}
      scrollable={false}
      safeArea
      contentStyle={[
        styles.content,
        isShortScreen ? styles.contentCompact : null,
      ]}
    >
      <View style={[styles.shell, isShortScreen ? styles.shellCompact : null]}>
        <View style={[styles.headerContainer, isShortScreen ? styles.headerContainerCompact : null]}>
          {header}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: navBottomPadding }]}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.contentStage,
              isShortScreen ? styles.contentStageCompact : null,
            ]}
          >
            <View style={[styles.body, isShortScreen ? styles.bodyCompact : null]}>
              {children}
            </View>
            {footer ? (
              <View style={[styles.footerContainer, isShortScreen ? styles.footerContainerCompact : null]}>
                {footer}
              </View>
            ) : null}
          </View>
        </ScrollView>
      </View>

      {hasNav ? (
        <DashboardTabBar
          items={navItems}
          activeKey={activeNavKey}
          onPress={onNavPress}
          variant={navVariant}
        />
      ) : null}

      {isSupportChatAvailable ? (
        <>
          {!isChatOpen ? (
            <RNAnimated.View
              style={[
                styles.chatLauncherWrap,
                {
                  bottom: chatLauncherBottom,
                  right: chatLauncherRight,
                  maxWidth: width - theme.spacing.xl * 2,
                },
                { transform: chatBubblePosition.getTranslateTransform() },
              ]}
              {...(draggableChat ? chatBubbleResponder.panHandlers : {})}
            >
              <Pressable
                accessibilityLabel="Open quick inquiry chat"
                onPress={() => setIsChatOpen(true)}
                style={({ pressed }) => [
                  styles.chatLauncher,
                  resolvedTheme?.primaryColor ? { backgroundColor: resolvedTheme.primaryColor } : null,
                  pressed ? styles.chatLauncherPressed : null,
                ]}
              >
                <Image source={chatbotIcon} style={styles.chatLauncherImage} resizeMode="contain" />
              </Pressable>
            </RNAnimated.View>
          ) : null}

          <Modal
            transparent
            visible={isChatOpen}
            animationType="fade"
            onRequestClose={() => setIsChatOpen(false)}
            statusBarTranslucent
          >
            <KeyboardAvoidingView
              style={styles.chatModalKeyboardWrap}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={insets.bottom}
            >
              <View
                style={[
                  styles.chatModalOverlay,
                  isCenteredChatModal ? styles.chatModalOverlayCentered : null,
                  { paddingBottom: isCenteredChatModal ? theme.spacing.lg : 0 },
                ]}
              >
                <Pressable style={styles.chatModalBackdrop} onPress={() => setIsChatOpen(false)} />

                <AppCard
                  variant="elevated"
                  radius="xl"
                  padding="sm"
                  contentStyle={styles.chatModalCardContent}
                  style={[
                    styles.chatModalCard,
                    isCenteredChatModal
                      ? [styles.chatModalCardCentered, { height: Math.min(chatModalHeight, 620) }]
                      : { height: chatModalHeight },
                    isCompactScreen ? styles.chatModalCardCompact : null,
                    isShortScreen ? styles.chatModalCardShort : null,
                  ]}
                >
                  {!isCenteredChatModal ? <View style={styles.chatModalHandle} /> : null}

                  <View style={styles.chatModalHeader}>
                    <View style={styles.chatModalBotRow}>
                      <View style={styles.chatModalBotAvatarWrap}>
                        <Image source={chatbotIcon} style={styles.chatModalBotAvatar} resizeMode="contain" />
                      </View>
                      <View style={styles.chatModalBotCopy}>
                        <Text style={styles.chatModalBotName}>
                          {resolvedTheme?.brandName ? `${resolvedTheme.brandName} AI` : 'Donivra AI'}
                        </Text>
                        <View style={styles.chatModalStatusRow}>
                          <View style={styles.chatModalStatusDot} />
                          <Text style={styles.chatModalStatusText}>Online</Text>
                        </View>
                      </View>
                    </View>

                    <Pressable onPress={() => setIsChatOpen(false)} style={styles.chatCloseButton}>
                      <AppIcon name="close" state="muted" />
                    </Pressable>
                  </View>

                  <ChatbotSupportPanel role={chatRole} userId={user?.id} variant="modal" />
                </AppCard>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </>
      ) : null}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.xs,
  },
  contentCompact: {
    paddingTop: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  shell: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  shellCompact: {
    gap: theme.spacing.xs,
  },
  headerContainer: {
    marginBottom: 0,
  },
  headerContainerCompact: {
    marginBottom: 0,
  },
  contentStage: {
    position: 'relative',
    gap: theme.spacing.xs,
  },
  contentStageCompact: {
    gap: theme.spacing.xs,
  },
  body: {
    gap: theme.spacing.md,
    minHeight: 0,
    paddingTop: theme.spacing.xs,
  },
  bodyCompact: {
    gap: theme.spacing.sm,
    paddingTop: 0,
  },
  footerContainer: {
    marginTop: theme.spacing.md,
    paddingBottom: theme.layout.dashboardShellBottomGap,
  },
  footerContainerCompact: {
    marginTop: theme.spacing.sm,
    paddingBottom: theme.layout.dashboardShellBottomGapCompact,
  },
  chatLauncherWrap: {
    position: 'absolute',
    zIndex: 24,
  },
  chatLauncher: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
    ...theme.shadows.lg,
  },
  chatLauncherImage: {
    width: 26,
    height: 26,
  },
  chatLauncherPressed: {
    transform: [{ scale: 0.97 }],
  },
  chatModalKeyboardWrap: {
    flex: 1,
  },
  chatModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.overlay,
  },
  chatModalOverlayCentered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  chatModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  chatModalCard: {
    minHeight: 0,
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.contentMaxWidth,
    overflow: 'hidden',
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
  },
  chatModalCardCentered: {
    width: '100%',
    maxWidth: 420,
    minHeight: 420,
    maxHeight: 620,
    borderRadius: theme.radius.xxl,
  },
  chatModalCardContent: {
    flex: 1,
    minHeight: 0,
  },
  chatModalCardCompact: {
    paddingBottom: theme.spacing.xs,
  },
  chatModalCardShort: {
    paddingBottom: theme.spacing.xs,
  },
  chatModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  chatModalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderStrong,
    opacity: 0.35,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  chatModalBotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  chatModalBotAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
  chatModalBotAvatar: {
    width: 26,
    height: 26,
  },
  chatModalBotCopy: {
    gap: 2,
  },
  chatModalBotName: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.bodyLg,
    color: theme.colors.textPrimary,
  },
  chatModalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chatModalStatusDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: '#56c271',
  },
  chatModalStatusText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  chatCloseButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceSoft,
  },
});
