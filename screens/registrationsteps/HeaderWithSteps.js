import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

const HeaderWithSteps = ({ step = 'Step 1 of 7' }) => {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <Text style={styles.icon}>←</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{step}</Text>

        <TouchableOpacity onPress={() => navigation.navigate('HelpScreen')} style={styles.iconButton}>
          <Icon name="help-circle-outline" size={24} color="#1A1D1F" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default HeaderWithSteps;

const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.OS === 'android' ? 40 : 0,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    padding: 8,
  },
  icon: {
    fontSize: 24,
    color: '#1A1D1F',
    fontFamily: 'Inter-Regular',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#1A1D1F',
    opacity: 0.7,
    paddingRight:180,
  },
});
