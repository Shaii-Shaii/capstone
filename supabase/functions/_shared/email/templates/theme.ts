// Email-safe equivalents of src/design-system/colors.js. Email clients do not
// reliably support CSS variables, so templates use these matching hex values.
export const emailTheme = {
  canvas: '#f8f2ee',
  surface: '#ffffff',
  surfaceSoft: '#fbf0f2',
  surfaceMuted: '#faedf0',
  wine900: '#4b1020',
  wine800: '#681a2e',
  wine700: '#7f2039',
  wine600: '#92294a',
  blush200: '#f4d8de',
  textPrimary: '#171114',
  textSecondary: '#4f4148',
  textMuted: '#806771',
  textOnBrand: '#ffffff',
  borderSubtle: '#eadde1',
  success: '#197a4d',
  successSurface: '#edf8f2',
  error: '#ba1f33',
  errorSurface: '#fff0f2',
} as const;
