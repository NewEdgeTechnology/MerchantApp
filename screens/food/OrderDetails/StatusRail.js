// screens/food/OrderDetails/StatusRail.js
import React from 'react';
import { View } from 'react-native';
import { styles } from './orderDetailsStyles';
import { STATUS_META } from './orderDetailsUtils';
import { Step } from './OrderAtoms';
import { BRAND, FONT, RADIUS, SHADOW } from "../../styles/tabdey_brand";

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
          let ring = BRAND.greyBorder;

if (isTerminalNegative) {
  ring = isActiveStep ? BRAND.red : BRAND.greyBorder;
} else if (isTerminalSuccess) {
  ring = BRAND.purple;
} else {
  ring = done || isActiveStep ? BRAND.purple : BRAND.greyBorder;
}
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
