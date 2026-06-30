import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { resolveThemeRoles, theme } from '../../design-system/theme';

export const AuthTabBar = ({ activeTab, resolvedTheme }) => {
  const router = useRouter();
  const roles = resolveThemeRoles(resolvedTheme);

  const getTabStyle = (tab) => [
    styles.tab,
    activeTab === tab
      ? [styles.activeTab, { backgroundColor: roles.primaryActionBackground }]
      : null,
  ];

  const getTabTextStyle = (tab) => [
    styles.tabText,
    {
      color:
        activeTab === tab
          ? roles.primaryActionText
          : roles.bodyText,
    },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: roles.defaultCardBackground,
          borderColor: roles.defaultCardBorder,
        },
      ]}
    >
      <Pressable
        style={({ pressed }) => [...getTabStyle('login'), pressed ? styles.tabPressed : null]}
        onPress={() => activeTab !== 'login' && router.replace('/auth/access')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'login' }}
      >
        <Text style={getTabTextStyle('login')}>Login</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [...getTabStyle('signup'), pressed ? styles.tabPressed : null]}
        onPress={() => activeTab !== 'signup' && router.replace('/auth/signup')}
        accessibilityRole="tab"
        accessibilityState={{ selected: activeTab === 'signup' }}
      >
        <Text style={getTabTextStyle('signup')}>Register</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    padding: 3,
    marginBottom: theme.spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  activeTab: {},
  tabPressed: {
    opacity: 0.82,
  },
  tabText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.1,
  },
});
