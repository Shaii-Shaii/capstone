import React from 'react';
import { StyleSheet, useWindowDimensions, ScrollView } from 'react-native';
import { theme } from '../../design-system/theme';

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

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      bounces={false}
      contentContainerStyle={[
        styles.content,
        isShortScreen ? styles.contentCompact : null,
        { gap: spacing, paddingRight: Math.max(theme.spacing.xs, spacing - theme.spacing.xs) },
        contentContainerStyle,
      ]}
    >
      {items.map((item, index) => (
        <React.Fragment key={item?.key || `widget-${index}`}>
          {renderItem(item, index, computedCardWidth)}
        </React.Fragment>
      ))}
    </ScrollView>
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
