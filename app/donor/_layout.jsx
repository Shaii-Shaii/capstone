import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useGlobalSearchParams, usePathname, useRouter } from 'expo-router';
import { DashboardTabBar } from '../../src/components/ui/DashboardTabBar';
import { donorDashboardNavItems } from '../../src/constants/dashboard';

const DONOR_NAV_HIDDEN_PATHS = new Set([
  '/donor/login',
  '/donor/signup',
  '/donor/notifications',
  '/donor/donation-history',
  '/donor/achievements',
  '/donor/hair-check-details',
]);

const shouldHideDonorNav = (pathname = '') => (
  DONOR_NAV_HIDDEN_PATHS.has(pathname)
  || /^\/donor\/drives\/[^/]+/.test(pathname)
);

const getDonorActiveNavKey = (pathname = '') => {
  if (pathname.startsWith('/donor/donations')) return 'checkhair';
  if (
    pathname.startsWith('/donor/status')
    || pathname.startsWith('/donor/donation-history')
  ) {
    return 'donations';
  }
  if (
    pathname.startsWith('/donor/home')
    || pathname.startsWith('/donor/organizations')
    || pathname.startsWith('/donor/drives')
  ) {
    return 'home';
  }
  return '';
};

export default function DonorRoutesLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const navLockRef = React.useRef(false);
  const activeNavKey = getDonorActiveNavKey(pathname);
  const mode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const showNav = !shouldHideDonorNav(pathname) && !(pathname === '/donor/donations' && mode === 'scan');

  const handleNavPress = React.useCallback((item) => {
    if (!item?.route || item.key === activeNavKey || navLockRef.current) return;
    const targetPath = String(item.route).split('?')[0];
    if (targetPath === pathname) return;

    navLockRef.current = true;
    router.replace(item.route);
    setTimeout(() => {
      navLockRef.current = false;
    }, 450);
  }, [activeNavKey, pathname, router]);

  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }} />
      {showNav ? (
        <DashboardTabBar
          items={donorDashboardNavItems}
          activeKey={activeNavKey}
          onPress={handleNavPress}
          variant="donor"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
