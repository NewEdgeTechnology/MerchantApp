/**
 * TàbDey — Theme entry point
 *
 * Import colors:  import { C } from "../../theme";
 * Import fonts:   import { F } from "../../theme";
 * Import loader:  import { FONT_MAP } from "../../theme";
 *
 * FONT_MAP is passed directly to useFonts() in App.js so all font
 * loading is defined in one place.
 */

export { C } from "./colors";
export { F } from "./fonts";

/**
 * All brand font files in one map.
 * App.js: const [fontsLoaded] = useFonts(FONT_MAP);
 */
export const FONT_MAP = {
  "LeagueSpartan-Bold":     require("../assets/fonts/LeagueSpartan/LeagueSpartan-Bold.ttf"),
  "LeagueSpartan-SemiBold": require("../assets/fonts/LeagueSpartan/LeagueSpartan-SemiBold.ttf"),
  "LeagueSpartan-Medium":   require("../assets/fonts/LeagueSpartan/LeagueSpartan-Medium.ttf"),
  "Poppins-Regular":        require("../assets/fonts/Poppins/Poppins-Regular.ttf"),
  "Poppins-Medium":         require("../assets/fonts/Poppins/Poppins-Medium.ttf"),
  "Poppins-SemiBold":       require("../assets/fonts/Poppins/Poppins-SemiBold.ttf"),
  "Poppins-Bold":           require("../assets/fonts/Poppins/Poppins-Bold.ttf"),
  "Poppins-Italic":         require("../assets/fonts/Poppins/Poppins-Italic.ttf"),
};
