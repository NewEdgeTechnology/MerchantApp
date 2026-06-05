/**
 * TàbDey — Global Typography Scale
 * Brand Guide fonts:
 *   Heading → Google Sans Flex Bold  (substituted: LeagueSpartan-Bold)
 *   Body    → Plus Jakarta Sans      (substituted: Poppins-Regular / Medium / SemiBold / Bold)
 *   Accent  → Cormorant Garamond     (substituted: Poppins-Italic)
 *
 * Import: import { F } from "../../theme";
 *
 * Usage:
 *   fontFamily: F.family.heading       ← section titles, screen headings
 *   fontFamily: F.family.body          ← body copy, list items
 *   fontFamily: F.family.bodyMedium    ← slightly emphasised body
 *   fontFamily: F.family.bodySemiBold  ← card labels, buttons
 *   fontFamily: F.family.bodyBold      ← prominent labels
 *   fontFamily: F.family.accent        ← decorative / italic copy
 */

export const F = {
  // ── Font Families ──────────────────────────────────────────────────────────
  // These map directly to the filenames loaded via expo-font in App.js.
  // To swap a font: change the value here and update the require() in App.js.
  family: {
    heading:      "LeagueSpartan-Bold",      // brand guide: Google Sans Flex Bold
    headingSemi:  "LeagueSpartan-SemiBold",
    headingMed:   "LeagueSpartan-Medium",
    body:         "Poppins-Regular",         // brand guide: Plus Jakarta Sans Regular
    bodyMedium:   "Poppins-Medium",
    bodySemiBold: "Poppins-SemiBold",
    bodyBold:     "Poppins-Bold",
    accent:       "Poppins-Italic",          // brand guide: Cormorant Garamond Italic
  },

  // ── Font Sizes ─────────────────────────────────────────────────────────────
  size: {
    xs:   10,   // sub-labels, badges, timestamps
    sm:   11,   // footer, fine print
    base: 12,   // secondary body, captions
    md:   13,   // primary body, list items
    lg:   14,   // section titles
    xl:   15,   // input text, prominent body
    x2l:  16,   // card titles (small)
    x3l:  18,   // card titles
    x4l:  20,   // screen sub-headings
    x5l:  22,   // screen headings
    x6l:  24,   // hero titles
    x7l:  26,   // large hero titles
    x8l:  32,   // display / splash
  },

  // ── Font Weights ───────────────────────────────────────────────────────────
  weight: {
    regular:   "400",
    medium:    "500",
    semibold:  "600",
    bold:      "700",
    extrabold: "800",
    black:     "900",
  },

  // ── Line Heights ───────────────────────────────────────────────────────────
  lineHeight: {
    tight:    16,
    snug:     18,
    normal:   20,
    relaxed:  21,
    loose:    24,
    spacious: 28,
  },

  // ── Letter Spacing ─────────────────────────────────────────────────────────
  tracking: {
    tight:  -0.5,
    normal:  0,
    wide:    0.5,
    wider:   1,
    widest:  2,
  },
};
