import { colors } from './colors';

export { colors };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
} as const;

export const typography = {
  display: { fontSize: 36, lineHeight: 44, fontWeight: '700' as const },
  heading1: { fontSize: 30, lineHeight: 38, fontWeight: '700' as const },
  heading2: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  heading3: { fontSize: 18, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
} as const;

// Android uses elevation; Web uses the matching boxShadow declaration.
export const shadows = {
  subtle: {
    elevation: 1,
    shadowColor: '#17251C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
    boxShadow: '0px 1px 3px rgba(23, 37, 28, 0.05)',
  },
  card: {
    elevation: 2,
    shadowColor: '#17251C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 7,
    boxShadow: '0px 2px 7px rgba(23, 37, 28, 0.07)',
  },
  floating: {
    elevation: 5,
    shadowColor: '#17251C', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 12,
    boxShadow: '0px 5px 12px rgba(23, 37, 28, 0.12)',
  },
} as const;

export const layout = {
  contentMaxWidth: 1120,
  mobileHorizontalPadding: 20,
  desktopHorizontalPadding: 32,
  breakpoints: { mobile: 0, tablet: 768, desktop: 1024 },
} as const;
