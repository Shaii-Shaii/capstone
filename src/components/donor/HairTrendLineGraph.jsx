import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useAuth } from '../../providers/AuthProvider';
import { resolveThemeRoles } from '../../design-system/theme';

function HairTrendLineGraph({ analyticsData }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  if (!analyticsData?.hasHistory || !analyticsData?.chartData || analyticsData.chartData.length === 0) {
    return null;
  }

  const data = analyticsData.chartData;
  const maxValue = 5;
  const minValue = 1;
  const chartHeight = 140;
  const effectiveHeight = 100;
  const maxWidth = Dimensions.get('window').width - 32;
  const padding = 16;
  const usableWidth = maxWidth - padding * 2;

  // Calculate points for line graph
  const pointWidth = usableWidth / Math.max(data.length - 1, 1);
  const points = data.map((item, index) => ({
    x: padding + index * pointWidth,
    y: chartHeight - padding - ((item.value - minValue) / (maxValue - minValue)) * effectiveHeight,
    value: item.value,
    displayDate: item.displayDate,
    condition: item.condition,
  }));

  const getTrendLabel = () => {
    const direction = analyticsData.trendDirection || '→';
    const directionMap = {
      up: '↑ Improving',
      down: '↓ Worsening',
      stable: '→ Stable',
    };
    return directionMap[direction] || '→ Stable';
  };

  const getTrendColor = () => {
    const direction = analyticsData.trendDirection || 'stable';
    if (direction === 'up') return '#54b86f';
    if (direction === 'down') return '#e74c3c';
    return '#f0a856';
  };

  const dateRange = data.length > 1
    ? `${data[0].displayDate} - ${data[data.length - 1].displayDate}`
    : `${data[0].displayDate}`;

  return (
    <View style={[styles.container, { backgroundColor: roles.cardBackground, borderColor: roles.cardBorder }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: roles.headingText }]}>Hair Condition Trend</Text>
          <Text style={[styles.dateRange, { color: roles.metaText }]}>{dateRange}</Text>
        </View>
        <View style={[styles.trendBadge, { backgroundColor: getTrendColor() + '20' }]}>
          <Text style={[styles.trendLabel, { color: getTrendColor() }]}>
            {getTrendLabel()}
          </Text>
        </View>
      </View>

      <View style={styles.chartWrapper}>
        {/* Y-axis labels */}
        <View style={styles.yAxisLabels}>
          <Text style={[styles.yAxisLabel, { color: roles.bodyText }]}>5</Text>
          <Text style={[styles.yAxisLabel, { color: roles.bodyText }]}>3</Text>
          <Text style={[styles.yAxisLabel, { color: roles.bodyText }]}>1</Text>
        </View>

        {/* Chart area */}
        <View style={[styles.chart, { height: chartHeight, width: maxWidth }]}>
          {/* Grid lines */}
          <View
            style={[
              styles.gridLine,
              { top: padding, backgroundColor: roles.divider },
            ]}
          />
          <View
            style={[
              styles.gridLine,
              { top: padding + effectiveHeight / 2, backgroundColor: roles.divider },
            ]}
          />
          <View
            style={[
              styles.gridLine,
              { top: padding + effectiveHeight, backgroundColor: roles.divider },
            ]}
          />

          {/* Line and points */}
          <svg
            width={maxWidth}
            height={chartHeight}
            style={styles.svg}
            viewBox={`0 0 ${maxWidth} ${chartHeight}`}
          >
            {/* Line */}
            {points.length > 1 && (
              <polyline
                points={points.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={getTrendColor()}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Points */}
            {points.map((point, index) => (
              <circle
                key={`point-${index}`}
                cx={point.x}
                cy={point.y}
                r="4"
                fill={getTrendColor()}
                stroke={roles.cardBackground}
                strokeWidth="2"
              />
            ))}
          </svg>

          {/* Point labels (below chart) */}
          <View style={styles.xAxisLabels}>
            {points.map((point, index) => (
              <View
                key={`label-${index}`}
                style={[
                  styles.xAxisLabel,
                  { left: point.x - 16 },
                ]}
              >
                <Text
                  style={[styles.xAxisLabelText, { color: roles.metaText }]}
                  numberOfLines={1}
                >
                  {point.displayDate}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Latest status */}
      <View style={[styles.statusRow, { borderTopColor: roles.divider }]}>
        <Text style={[styles.statusLabel, { color: roles.metaText }]}>Current status:</Text>
        <Text style={[styles.statusValue, { color: roles.headingText }]}>
          {analyticsData.latestStatus || 'Checked'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  dateRange: {
    fontSize: 12,
    fontWeight: '400',
  },
  trendBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  trendLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  chartWrapper: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  yAxisLabels: {
    width: 24,
    height: 140,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  yAxisLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  chart: {
    flex: 1,
    position: 'relative',
  },
  svg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  xAxisLabels: {
    position: 'absolute',
    bottom: -20,
    left: 0,
    right: 0,
    height: 20,
  },
  xAxisLabel: {
    position: 'absolute',
    width: 32,
  },
  xAxisLabelText: {
    fontSize: 10,
    fontWeight: '400',
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    marginTop: 36,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '600',
  },
});

export default HairTrendLineGraph;
