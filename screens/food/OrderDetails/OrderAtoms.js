// screens/food/OrderDetails/OrderAtoms.js
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './orderDetailsStyles';
import { toText } from './orderDetailsUtils';

export const Chip = ({ label, color, bg, border, icon }) => (
  <View style={[styles.pill, { backgroundColor: bg, borderColor: border }]}>
    <Ionicons name={icon} size={14} color={color} />
    <Text style={[styles.pillText, { color }]} numberOfLines={1}>{label}</Text>
  </View>
);

export const Step = ({ label, ringColor, fill, icon, time, onPress, disabled, dimmed }) => {
  const border = ringColor || '#cbd5e1';
  const bg = fill ? border : '#fff';
  const iconColor = fill ? '#fff' : border;
  return (
    <View style={styles.stepWrap}>
      <View style={[styles.stepDot, { borderColor: border, backgroundColor: bg }]}>
        <Ionicons name={icon} size={14} color={iconColor} />
      </View>
      <Text style={[styles.stepLabel, { color: dimmed ? '#94a3b8' : '#334155' }]} numberOfLines={1}>
        {label}
      </Text>
      {time ? <Text style={styles.stepTime}>{time}</Text> : null}
    </View>
  );
};

export const Row = ({ icon, text }) => (
  <View style={styles.row}>
    <Ionicons name={icon} size={16} color="#64748b" />
    <Text style={styles.rowText} numberOfLines={4}>{toText(text)}</Text>
  </View>
);

export const RowTitle = ({ title }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
    <Text style={styles.blockTitle}>{title}</Text>
  </View>
);
