/*theme/colors.js*
 * TàbDey — Global Color Palette
 * Brand Guide: purple #9D00FF as primary, #F7AEF8 light, #D8238B magenta, #DD223D red, #FFA400 amber
 *
 * Import: import { C } from "../../theme";
 *
 * All service themes (transport, events, foods, marts, wallet, etc.) pull
 * from this single file. Change a value here and it cascades everywhere.
 */

export const C = {
  // ── Brand ─────────────────────────────────────────────────────────────────
  brand:       "#9D00FF",               // primary vivid purple
  brandDark:   "#7B00CC",               // pressed states / gradient ends
  brandDeep:   "#5C0099",               // deep header gradients
  brandBg:     "#F5E6FF",               // light purple chip / badge bg
  brandBg2:    "rgba(157,0,255,0.08)",  // ultra-light purple overlay
  brandBorder: "#D4A0FF",               // light purple border

  // ── Brand accent palette (from brand guide) ───────────────────────────────
  brandPink:    "#F7AEF8",              // soft pink accent
  brandMagenta: "#D8238B",             // magenta / hot pink
  brandAmber:   "#FFA400",             // amber / orange highlight

  // ── Backgrounds ───────────────────────────────────────────────────────────
  bg:    "#ffffff",
  card:  "#FFFFFF",
  card2: "#F3F4F6",
  soft:  "rgba(51,51,51,0.04)",

  // ── Promobox ───────────────────────────────────────────────────────────
  nearme: "#FFD6D2",
  location: "rgba(255, 80, 80, 0.8)",
  ultimatesaving: "#C8EAE7",
  tag: "rgba(255, 146, 0, 0.85)",
  fivestar: "#FFEB9C",
  star: "rgba(255, 176, 0, 0.9)",

  // ── Text ──────────────────────────────────────────────────────────────────
  text:  "#333333",
  sub:   "#666666",
  muted: "#9CA3AF",
  text2: "#ffffff",

  // ── Borders & dividers ────────────────────────────────────────────────────
  border: "rgba(51,51,51,0.12)",
  line:   "#E5E7EB",

  // ── Semantic ──────────────────────────────────────────────────────────────
  success:      "#22C55E",              // green kept for success states
  warn:         "#FFA400",             // amber — from brand guide
  danger:       "#DD223D",             // red   — from brand guide
  dangerBg:     "#FFF5F5",
  dangerBorder: "#FEE2E2",
  info:         "#3B82F6",

  // ── Tints & accents ───────────────────────────────────────────────────────
  chipBg:   "#F1F5F9",
  blueTint: "#EAF3FF",

  // ── Gradients ─────────────────────────────────────────────────────────────
  gradHeader: ["#5C0099", "#7B00CC", "#9D00FF"],
  gradBrand:  ["#9D00FF", "#7B00CC"],
  gradDeep:   ["#5C0099", "#7B00CC"],
  gradMid:    ["#912ad6", "#c46cfb"],
  gradBlue:   ["#1D4ED8", "#2563EB"],
  gradCard:   ["#FFFFFF", "#F5E6FF"],
  gradScreen: ["#ffffff", "#ffffff", "#ffffff"],

  // ── Safety / Emergency ────────────────────────────────────────────────────
  sosRed:     "#E02424",
  sosRedDark: "#C81E1E",

  // ── Shadows ───────────────────────────────────────────────────────────────
  shadow:     "#000000",
  shadowSm:   "rgba(0,0,0,0.08)",
  shadowMd:   "rgba(0,0,0,0.10)",
  shadowDark: "rgba(0,0,0,0.35)",
  overlay:    "rgba(0,0,0,0.55)",

  // ── Misc ──────────────────────────────────────────────────────────────────
  white:   "#FFFFFF",
  black:   "#000000",
  star:    "#FFB800",
  shimmer: "#D4A0FF",

  // ── Legacy aliases — keeps all existing service imports working ────────────

  brandLight:     "#D4A0FF",              // was brandBorder (green)
  brandLightMint: "#F5E6FF",             // was brandBg (green)
  brandMid:       "#B040FF",             // mid purple
  secondary:      "#C060FF",
  bgGreen:        "#ffffff",             // → bg (kept name for compat)
  textDeep:       "#333333",             // → text
  subGreen:       "#666666",             // → sub
  borderGreen:    "#B040FF",
  borderLight:    "#D4A0FF",
  greenTint:      "rgba(157,0,255,0.08)", // → brandBg2
  blueTintSolid:  "#EAF3FF",
  dangerAlt:      "#EF4444",
  shadowIOS:      "rgba(0,0,0,0.10)",
};
