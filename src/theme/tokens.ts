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
  display: { fontFamily: 'Outfit_800ExtraBold', fontSize: 32, lineHeight: 40, fontWeight: '800' as const },
  heading1: { fontFamily: 'Outfit_800ExtraBold', fontSize: 28, lineHeight: 36, fontWeight: '800' as const },
  heading2: { fontFamily: 'Outfit_700Bold', fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
  heading3: { fontFamily: 'Outfit_700Bold', fontSize: 18, lineHeight: 24, fontWeight: '700' as const },
  heading4: { fontFamily: 'Outfit_600SemiBold', fontSize: 15, lineHeight: 20, fontWeight: '600' as const },
  body: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, fontWeight: '400' as const },
  bodySmall: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  label: { fontFamily: 'Geist_600SemiBold', fontSize: 11, lineHeight: 16, fontWeight: '600' as const },
  caption: { fontFamily: 'Geist_500Medium', fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
} as const;

// Android uses elevation; Web uses the matching boxShadow declaration.
export const shadows = {
  subtle: {
    elevation: 1,
    shadowColor: '#17251C', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3,
    boxShadow: '0px 1px 3px rgba(17, 24, 39, 0.05)',
  },
  card: {
    elevation: 2,
    shadowColor: '#17251C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 7,
    boxShadow: '0px 2px 7px rgba(17, 24, 39, 0.07)',
  },
  floating: {
    elevation: 5,
    shadowColor: '#17251C', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 12,
    boxShadow: '0px 5px 12px rgba(17, 24, 39, 0.12)',
  },
} as const;

export const layout = {
  contentMaxWidth: 1120,
  mobileHorizontalPadding: 20,
  desktopHorizontalPadding: 32,
  breakpoints: { mobile: 0, tablet: 768, desktop: 1024 },
} as const;
