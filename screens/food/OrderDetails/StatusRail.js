// screens/food/OrderDetails/StatusRail.js
import React from 'react';
import { View } from 'react-native';
import { styles } from './orderDetailsStyles';
import { STATUS_META } from './orderDetailsUtils';
import { Step } from './OrderAtoms';

export default function StatusRail({
  status,
  statusSequence,
  isTerminalNegative,
  isTerminalSuccess,
  progressPct,
  progressIndex,
}) {
  const lastIndex = statusSequence.length - 1;

  return (
    <>
      {/* Progress */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
      </View>

      {/* Steps */}
      <View style={styles.stepsRow}>
        {statusSequence.map((k, i) => {
          const isActiveStep = k === status;
          const done = isTerminalSuccess ? true : !isTerminalNegative && i <= progressIndex;
          const fill = done;
          let ring = '#cbd5e1';
          if (isTerminalNegative) ring = isActiveStep ? STATUS_META.DECLINED.color : '#cbd5e1';
          else if (isTerminalSuccess) ring = '#16a34a';
          else ring = (done || isActiveStep) ? '#16a34a' : '#cbd5e1';
          const dimmed = !isActiveStep && !(done || isTerminalSuccess);
          const icon = STATUS_META[k]?.icon || 'ellipse-outline';
          return (
            <Step
              key={k}
              label={STATUS_META[k].label}
              icon={icon}
              ringColor={ring}
              fill={fill}
              dimmed={dimmed}
              onPress={() => {}}
              disabled
            />
          );
        })}
      </View>
    </>
  );
}
