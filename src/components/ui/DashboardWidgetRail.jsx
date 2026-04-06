import React from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { theme } from '../../design-system/theme';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

export const DashboardWidgetRail = ({
  items = [],
  renderItem,
  cardWidth,
  contentContainerStyle,
  showsHorizontalScrollIndicator = false,
  spacing = theme.spacing.md,
}) => {
  const { width } = useWindowDimensions();
  const isShortScreen = width < 390;
  const computedCardWidth = cardWidth || Math.min(
    width * (isShortScreen ? 0.8 : 0.82),
    isShortScreen ? theme.layout.dashboardRailCardWidthCompact : theme.layout.dashboardRailCardWidth
  );
  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  return (
    <AnimatedScrollView
      horizontal
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      bounces={false}
      decelerationRate="fast"
      disableIntervalMomentum
      snapToInterval={computedCardWidth + spacing}
      snapToAlignment="start"
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      contentContainerStyle={[
        styles.content,
        isShortScreen ? styles.contentCompact : null,
        { gap: spacing, paddingRight: Math.max(theme.spacing.xs, spacing - theme.spacing.xs) },
        contentContainerStyle,
      ]}
    >
      {items.map((item, index) => (
        <React.Fragment key={item?.key || `widget-${index}`}>
          {renderItem(item, index, computedCardWidth, scrollX)}
        </React.Fragment>
      ))}
    </AnimatedScrollView>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingLeft: 1,
  },
  contentCompact: {
    paddingRight: theme.spacing.xs,
  },
});
