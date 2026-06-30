import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { AppIcon } from '../ui/AppIcon';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

/**
 * HairTrendLineChart - Line graph visualization of hair condition trend over time
 * Shows hair analysis scores with visual trend indicator, powered by real hair log data
 */
export const HairTrendLineChart = ({ chartData = [] }) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = Math.min(screenWidth - 40, 320);
  const chartHeight = 100;

  if (!chartData || chartData.length === 0) {
    return null;
  }

  // For single data point, show a simple dot without trend line
  if (chartData.length === 1) {
    const point = chartData[0];
    return (
      <View style={styles.container}>
        <View style={[styles.singlePointContainer, { height: chartHeight }]}>
          <View style={styles.singlePointChart}>
            <View style={styles.singleDot} />
            <Text style={[styles.singlePointDate, { color: roles.metaText }]}>
              {point.displayDate}
            </Text>
          </View>
        </View>
        <Text style={[styles.singlePointSubtitle, { color: roles.bodyText }]}>
          {point.condition || 'Analyzed'} on {point.displayDate}
        </Text>
      </View>
    );
  }

  // Get visible data points (limit to last 7 for clarity)
  const visibleData = chartData.slice(Math.max(0, chartData.length - 7));

  // Calculate min/max for scaling
  const values = visibleData.map((d) => d.value);
  const minValue = Math.min(...values, 1);
  const maxValue = Math.max(...values, 5);
  const range = Math.max(maxValue - minValue, 1);

  // Scale value to chart y-position (top is high, bottom is low)
  const scaleY = (value) => {
    const normalized = (value - minValue) / range;
    return chartHeight - 10 - normalized * (chartHeight - 20);
  };

  // Scale x position across chart width
  const getXPos = (index) => (index / Math.max(1, visibleData.length - 1)) * (chartWidth - 40) + 20;

  // Get trend info
  const firstValue = visibleData[0]?.value || 2.5;
  const lastValue = visibleData[visibleData.length - 1]?.value || 2.5;
  const isImproving = lastValue > firstValue + 0.3;
  const isWorsening = lastValue < firstValue - 0.3;
  const trendColor = isImproving ? '#54b86f' : isWorsening ? '#e74c3c' : theme.colors.brandPrimary;

  return (
    <View style={styles.container}>
      {/* Chart container */}
      <View style={[styles.chartContainer, { width: chartWidth, height: chartHeight }]}>
        {/* Visual line graph using Views and connecting lines */}
        {visibleData.length > 1 && (
          <View style={styles.linesOverlay}>
            {visibleData.map((point, idx) => {
              if (idx === visibleData.length - 1) return null; // No line after last point

              const x1 = getXPos(idx);
              const y1 = scaleY(point.value);
              const x2 = getXPos(idx + 1);
              const y2 = scaleY(visibleData[idx + 1].value);

              // Calculate line angle and length for rotation
              const dx = x2 - x1;
              const dy = y2 - y1;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);

              return (
                <View
                  key={`line-${idx}`}
                  style={[
                    styles.linePath,
                    {
                      left: x1,
                      top: y1,
                      width: length,
                      borderBottomColor: trendColor,
                      transform: [{ rotate: `${angle}deg` }],
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        {/* Data point dots */}
        {visibleData.map((point, idx) => (
          <View
            key={`dot-${idx}`}
            style={[
              styles.dataDot,
              {
                left: getXPos(idx) - 4,
                top: scaleY(point.value) - 4,
                backgroundColor: trendColor,
              },
            ]}
          />
        ))}
      </View>

      {/* X-axis labels (dates) */}
      <View style={styles.xAxisLabels}>
        {visibleData.map((point, idx) => {
          const shouldShow = visibleData.length <= 5 || idx === 0 || idx === visibleData.length - 1 || idx % 2 === 0;
          return shouldShow ? (
            <View key={`label-${idx}`} style={styles.xLabel}>
              <Text style={[styles.xLabelText, { color: roles.metaText }]}>{point.displayDate}</Text>
            </View>
          ) : null;
        })}
      </View>

      {/* Trend summary */}
      <View style={styles.trendSummary}>
        <View style={styles.trendRow}>
          <View style={[styles.trendIcon, { backgroundColor: trendColor + '20' }]}>
            <AppIcon
              name={isImproving ? 'arrowUpRight' : isWorsening ? 'arrowDownLeft' : 'check'}
              size="sm"
              state="default"
              color={trendColor}
            />
          </View>
          <Text style={[styles.trendText, { color: roles.bodyText }]}>
            {isImproving ? 'Improving trend' : isWorsening ? 'Needs attention' : 'Stable trend'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  chartContainer: {
    position: 'relative',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.stroke,
  },
  linesOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  linePath: {
    position: 'absolute',
    height: 2,
    borderBottomWidth: 2,
    opacity: 0.7,
  },
  dataDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 10,
  },
  singlePointContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  singlePointChart: {
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  singleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.brandPrimary,
  },
  singlePointDate: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
  singlePointSubtitle: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
  },
  xAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  xLabel: {
    alignItems: 'center',
    flex: 1,
  },
  xLabelText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
  },
  trendSummary: {
    gap: theme.spacing.xs,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  trendIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    fontWeight: theme.typography.weights.semibold,
  },
});
