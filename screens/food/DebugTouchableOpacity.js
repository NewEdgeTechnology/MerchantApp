// screens/food/DebugTouchableOpacity.js
import React from 'react';
import { TouchableOpacity as RNTouchableOpacity } from 'react-native';

export default function DebugTouchableOpacity({ children, ...props }) {
  const kids = React.Children.toArray(children);
  kids.forEach((c) => {
    if (typeof c === 'string' || typeof c === 'number') {
      console.warn(
        `⛔ RAW TEXT inside <TouchableOpacity> (accessibilityLabel="${props.accessibilityLabel || ''}")`,
        `value="${String(c).trim()}"`
      );
    }
  });
  return <RNTouchableOpacity {...props}>{children}</RNTouchableOpacity>;
}
