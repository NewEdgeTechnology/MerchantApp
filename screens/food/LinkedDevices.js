import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, Button } from 'react-native';

const LinkedDevices = () => {
  const [deviceConnected, setDeviceConnected] = useState(true);

  const handleDeviceConnection = () => {
    // Device connection logic
    console.log(deviceConnected ? 'Device Connected' : 'Device Disconnected');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Linked Devices</Text>
      <View style={styles.settingRow}>
        <Text style={styles.text}>Apple Watch Series 9</Text>
        <Switch
          value={deviceConnected}
          onValueChange={setDeviceConnected}
        />
      </View>
      <Button title="Manage Device" onPress={handleDeviceConnection} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  text: {
    fontSize: 18,
  },
});

export default LinkedDevices;
