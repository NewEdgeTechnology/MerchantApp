const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "..", "patches", "OSMMapView.swift");
const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo-osm-sdk",
  "ios",
  "OSMMapView.swift"
);

if (!fs.existsSync(source)) {
  console.error("[patch-expo-osm-sdk] Missing source file:", source);
  process.exit(1);
}

const targetDir = path.dirname(target);

if (!fs.existsSync(targetDir)) {
  console.error("[patch-expo-osm-sdk] expo-osm-sdk iOS folder not found:", targetDir);
  process.exit(1);
}

fs.copyFileSync(source, target);

console.log("[patch-expo-osm-sdk] Patched expo-osm-sdk/ios/OSMMapView.swift successfully.");