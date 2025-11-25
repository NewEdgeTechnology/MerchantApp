// screens/food/OrderDetails/orderDetailsStyles.js
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  headerBar: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#e5e7eb',
    borderBottomWidth: 1,
    backgroundColor: '#fff',
  },
  backBtn: { height: 40, width: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: '#0f172a' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  idRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontWeight: '800', color: '#0f172a', fontSize: 16 },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
    maxWidth: '60%',
  },
  pillText: { fontWeight: '800' },

  progressTrack: {
    height: 4, backgroundColor: '#e2e8f0', borderRadius: 999,
    overflow: 'hidden', marginTop: 10,
  },
  progressFill: { height: 4, backgroundColor: '#16a34a' },

  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  stepWrap: { width: 52, alignItems: 'center' },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  stepLabel: { marginTop: 4, fontSize: 10.5, fontWeight: '700', textAlign: 'center', color: '#334155' },
  stepTime: { marginTop: 1, fontSize: 10, color: '#64748b' },

  noteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
    backgroundColor: '#ecfeff', borderWidth: 1, borderColor: '#99f6e4',
  },
  noteText: { flex: 1, color: '#115e59', fontWeight: '600' },

  sectionTitle: { marginTop: 14, marginBottom: 8, fontWeight: '700', color: '#0f172a' },
  terminalNote: { color: '#64748b', marginBottom: 10 },

  segmentWrap: { flexDirection: 'row', gap: 10, marginTop: 10 },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  segmentBtnActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },

  segmentText: { fontWeight: '800' },
  segmentHint: { marginTop: 8, color: '#64748b', fontWeight: '600' },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '800' },

  block: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 12,
  },
  blockTitle: { fontWeight: '800', color: '#0f172a' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowText: { color: '#475569', fontWeight: '600', flex: 1 },

  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  itemName: { color: '#0f172a', fontWeight: '600', flexShrink: 1, paddingRight: 8 },
  itemQty: { color: '#64748b', fontWeight: '700' },
  totRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  totLabel: { color: '#64748b', fontWeight: '700' },
  totValue: { color: '#0f172a', fontWeight: '700' },
  totLabelStrong: { color: '#0f172a', fontWeight: '800' },
  totValueStrong: { color: '#0f172a', fontWeight: '900' },

  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0f172a',
  },
  timeBlock: {
    marginTop: 4,
  },
  timeHint: {
    marginTop: 4,
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, minHeight: 44, marginTop: 10,
    color: '#0f172a',
  },
  dialogBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  dialogBtnText: { fontWeight: '800' },
});
