import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

const QRCode = require('qrcode-terminal/vendor/QRCode');
const QRErrorCorrectLevel = require('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel');

const buildQrMatrix = (value = '') => {
  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(String(value || ''));
  qr.make();
  return {
    modules: qr.modules || [],
    count: qr.getModuleCount(),
  };
};

export function LocalQrCode({
  value,
  size = 220,
  quietZone = 4,
  color = '#111111',
  backgroundColor = '#ffffff',
}) {
  const { modules, count } = React.useMemo(() => buildQrMatrix(value), [value]);
  const viewBoxSize = count + quietZone * 2;
  const pathData = React.useMemo(() => {
    if (!count) return '';

    const commands = [];
    modules.forEach((row, rowIndex) => {
      row.forEach((isDark, colIndex) => {
        if (!isDark) return;
        const x = colIndex + quietZone;
        const y = rowIndex + quietZone;
        commands.push(`M${x} ${y}h1v1h-1z`);
      });
    });
    return commands.join('');
  }, [count, modules, quietZone]);

  if (!value || !count) return null;

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      shapeRendering="crispEdges"
    >
      <Rect width={viewBoxSize} height={viewBoxSize} fill={backgroundColor} />
      <Path d={pathData} fill={color} />
    </Svg>
  );
}
