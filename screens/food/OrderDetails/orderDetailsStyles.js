// screens/food/OrderDetails/orderDetailsStyles.js
import { StyleSheet } from "react-native";
import { BRAND, FONT, RADIUS, SHADOW } from "../../styles/tabdey_brand";

export const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#FBF7FF",
  },

  topGlow: {
    position: "absolute",
    top: -120,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: BRAND.purpleLight,
    opacity: 0.38,
  },

  headerBar: {
    minHeight: 54,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    backgroundColor: BRAND.white,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.sm,
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT.header,
    fontSize: 20,
    fontWeight: "900",
    color: BRAND.black,
  },

  card: {
    backgroundColor: BRAND.white,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    // ...SHADOW.sm,
  },

  block: {
    backgroundColor: BRAND.white,
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    marginTop: 12,
    // ...SHADOW.sm,
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND.purple,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: RADIUS.pill,
    alignSelf: "flex-start",
    ...SHADOW.sm,
  },

  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND.white,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: "#FFD4DD",
  },

  progressFill: {
    height: 4,
    backgroundColor: BRAND.purple,
  },

  segmentBtnActive: {
    backgroundColor: BRAND.purple,
    borderColor: BRAND.purple,
  },

  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: BRAND.black,
    backgroundColor: BRAND.white,
  },

  modalCard: {
    backgroundColor: BRAND.white,
    padding: 18,
    borderRadius: RADIUS.lg,
    width: "100%",
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    ...SHADOW.md,
  },
  idRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderId: {
    fontFamily: FONT.header,
    fontSize: 16,
    color: BRAND.black,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: "60%",
  },
  pillText: { fontWeight: "800" },

  progressTrack: {
    height: 4,
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10,
  },

  stepsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingHorizontal: 2,
  },
  stepWrap: { width: 52, alignItems: "center" },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.white,
  },
  stepLabel: {
    marginTop: 4,
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
    color: "#334155",
  },
  stepTime: { marginTop: 1, fontSize: 10, color: BRAND.grey },

  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#F3E4FF",
    borderColor: BRAND.greyBorder,
    borderWidth: 1,
  },
  noteText: {
    fontFamily: FONT.body,
    color: BRAND.black,
  },

  sectionTitle: {
    marginTop: 14,
    marginBottom: 8,
    fontWeight: "700",
    color: BRAND.black,
  },
  terminalNote: { color: BRAND.grey, marginBottom: 10 },

  segmentWrap: { flexDirection: "row", gap: 10, marginTop: 10 },
  segmentBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderColor: BRAND.greyBorder,
    backgroundColor: BRAND.white,
    borderWidth: 1,
  },
  // Add to orderDetailsStyles.js

  itemPressable: {
    cursor: "pointer",
    activeOpacity: 0.7,
  },

  itemReplacedRow: {
    backgroundColor: "#fffbeb",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
  },

  itemRemovedRow: {
    backgroundColor: "#fef2f2",
    borderLeftWidth: 3,
    borderLeftColor: "#ef4444",
    opacity: 0.8,
  },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: BRAND.white,
  },

  replacedBadge: {
    backgroundColor: "#f59e0b",
  },

  unavailableBadge: {
    backgroundColor: "#ef4444",
  },

  removedBadge: {
    backgroundColor: "#10b981",
  },

  chatButton: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 6,
    alignSelf: "flex-start",
  },

  chatButtonText: {
    fontSize: 12,
    color: "#3b82f6",
    fontWeight: "500",
  },

  itemReplacement: {
    fontSize: 13,
    color: "#f59e0b",
    marginTop: 4,
    fontStyle: "italic",
  },

  segmentText: {
    fontFamily: FONT.body,
  },
  segmentHint: {
    marginTop: 8,
    fontFamily: FONT.body,
    color: BRAND.grey,
  },

  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  primaryBtnText: { color: BRAND.white, fontWeight: "800" },

  secondaryBtnText: { fontWeight: "800" },
  acceptButton: {
    backgroundColor: BRAND.purple,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  acceptButtonText: {
    color: BRAND.white,
    fontFamily: FONT.header,
    fontSize: 16,
  },
  // Add these styles to your orderDetailsStyles.js file

  itemImageContainer: {
    width: 60,
    height: 60,
    marginRight: 12,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
  },
  itemImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  itemImagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
  },
  declineButton: {
    backgroundColor: BRAND.white,
    borderColor: BRAND.red,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  declineButtonText: {
    color: BRAND.red,
    fontFamily: FONT.header,
    fontSize: 16,
  },
  blockTitle: {
    fontFamily: FONT.header,
    color: BRAND.black,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowText: { color: "#475569", fontWeight: "600", flex: 1 },

  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  itemName: {
    color: BRAND.black,
    fontWeight: "600",
    flexShrink: 1,
    paddingRight: 8,
  },
  itemQty: { color: BRAND.grey, fontWeight: "700" },
  totRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  totLabel: { color: BRAND.grey, fontWeight: "700" },
  totValue: { color: BRAND.black, fontWeight: "700" },
  totLabelStrong: { color: BRAND.black, fontWeight: "800" },
  totValueStrong: { color: BRAND.black, fontWeight: "900" },

  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },

  timeBlock: {
    marginTop: 4,
  },
  timeHint: {
    marginTop: 4,
    color: BRAND.black,
    fontWeight: "700",
    fontSize: 12,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalTitle: { fontSize: 16, fontWeight: "800", color: BRAND.black },
  modalSub: { fontSize: 12, color: BRAND.grey, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: BRAND.greyBorder,
    borderRadius: RADIUS.md,
    color: BRAND.black,
    fontFamily: FONT.body,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    marginTop: 10,
  },
  dialogBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  dialogBtnText: { fontWeight: "800" },
  pickedUpContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: BRAND.purpleLight,
    borderColor: BRAND.greyBorder,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickedUpText: {
    fontFamily: FONT.body,
    color: BRAND.black,
    fontSize: 13,
  },
});
