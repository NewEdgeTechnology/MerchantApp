// ─────────────────────────────────────────────────────────────
//  tabdey_brand.js  –  Single source of truth for all TabDey styles
//  Import this in any screen/component and never hardcode brand values again.
//
//  Usage:
//    import { BRAND, FONT, TEXT, RADIUS, SHADOW, BUTTON } from '../styles/tabdey_brand';
// ─────────────────────────────────────────────────────────────

import { StyleSheet } from 'react-native';

// ── 1. COLOURS ────────────────────────────────────────────────
export const BRAND = {
  // Primary
  purple      : '#9D00FF',
  purpleLight : '#F7AEF8',

  // Accents
  red         : '#DD223D',
  magenta     : '#D8238B',
  amber       : '#FFA400',

  // Neutrals
  white       : '#FFFFFF',
  black       : '#000000',
  grey        : '#888888',
  greyLight   : '#E8E8E8',
  greyBorder  : '#D0D0D0',
};

// ── 2. TYPOGRAPHY ─────────────────────────────────────────────
//  Per brand guide:
//    Header  → Google Sans Flex Bold
//    Body    → Plus Jakarta Sans Regular
//    Accent  → Cormorant Garamond Regular / Italic
export const FONT = {
  header : 'GoogleSansFlex-Bold',
  body   : 'PlusJakartaSans',
  accent : 'CormorantGaramond',
};

// ── 3. READY-MADE TEXT STYLES ─────────────────────────────────
//  Use these directly: style={[TEXT.h1, { color: BRAND.purple }]}
export const TEXT = StyleSheet.create({
  h1: {
    fontFamily   : FONT.header,
    fontSize     : 28,
    fontWeight   : '700',
    color        : BRAND.black,
    letterSpacing: 0.2,
  },
  h2: {
    fontFamily   : FONT.header,
    fontSize     : 22,
    fontWeight   : '700',
    color        : BRAND.black,
    letterSpacing: 0.1,
  },
  h3: {
    fontFamily   : FONT.header,
    fontSize     : 18,
    fontWeight   : '700',
    color        : BRAND.black,
  },
  body: {
    fontFamily : FONT.body,
    fontSize   : 14,
    fontWeight : '400',
    color      : BRAND.black,
    lineHeight : 21,
  },
  bodySmall: {
    fontFamily : FONT.body,
    fontSize   : 12,
    fontWeight : '400',
    color      : BRAND.grey,
    lineHeight : 18,
  },
  label: {
    fontFamily : FONT.body,
    fontSize   : 16,
    fontWeight : '600',
    color      : BRAND.black,
  },
  accent: {
    fontFamily : FONT.accent,
    fontSize   : 16,
    fontStyle  : 'italic',
    color      : BRAND.black,
  },
  link: {
    fontFamily : FONT.body,
    fontSize   : 14,
    fontWeight : '600',
    color      : BRAND.magenta,       // magenta for links, purple for CTAs
  },
});

// ── 4. BORDER RADIUS ──────────────────────────────────────────
export const RADIUS = {
  sm  : 8,
  md  : 12,
  lg  : 20,
  pill: 30,   // for buttons
  full: 999,  // for avatars / chips
};

// ── 5. SHADOWS ────────────────────────────────────────────────
export const SHADOW = {
  sm: {
    shadowColor  : BRAND.purple,
    shadowOffset : { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius : 4,
    elevation    : 2,
  },
  md: {
    shadowColor  : BRAND.purple,
    shadowOffset : { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius : 8,
    elevation    : 5,
  },
};

// ── 6. BUTTON PRESETS ─────────────────────────────────────────
export const BUTTON = StyleSheet.create({
  // Filled purple – primary CTA (e.g. Log In, Confirm)
  primary: {
    backgroundColor  : BRAND.purple,
    paddingVertical  : 15,
    paddingHorizontal: 44,
    borderRadius     : RADIUS.pill,
    alignItems       : 'center',
  },
  primaryText: {
    fontFamily: FONT.body,
    fontWeight: '600',
    fontSize  : 16,
    color     : BRAND.white,
  },

  // Ghost – secondary CTA (e.g. Sign Up, Cancel)
  secondary: {
    backgroundColor  : BRAND.white,
    borderWidth      : 1.5,
    borderColor      : BRAND.purple,
    paddingVertical  : 15,
    paddingHorizontal: 44,
    borderRadius     : RADIUS.pill,
    alignItems       : 'center',
  },
  secondaryText: {
    fontFamily: FONT.body,
    fontWeight: '600',
    fontSize  : 16,
    color     : BRAND.purple,
  },

  // Danger – destructive actions
  danger: {
    backgroundColor  : BRAND.red,
    paddingVertical  : 15,
    paddingHorizontal: 44,
    borderRadius     : RADIUS.pill,
    alignItems       : 'center',
  },
  dangerText: {
    fontFamily: FONT.body,
    fontWeight: '600',
    fontSize  : 16,
    color     : BRAND.white,
  },
});

// ── 7. INPUT PRESETS ──────────────────────────────────────────
export const INPUT = StyleSheet.create({
  base: {
    fontFamily      : FONT.body,
    fontSize        : 14,
    color           : BRAND.black,
    borderWidth     : 1,
    borderColor     : BRAND.greyBorder,
    borderRadius    : RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical : 12,
    backgroundColor : BRAND.white,
  },
  focused: {
    borderColor: BRAND.purple,
  },
  error: {
    borderColor: BRAND.red,
  },
  label: {
    fontFamily   : FONT.body,
    fontSize     : 13,
    fontWeight   : '600',
    color        : BRAND.black,
    marginBottom : 6,
  },
  errorText: {
    fontFamily: FONT.body,
    fontSize  : 12,
    color     : BRAND.red,
    marginTop : 4,
  },
});
