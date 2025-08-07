import React from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';

const OverlayDropdown = ({ visible, onClose, countries, selectedCountry, onSelect }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.dropdownMenu}>
            <View style={styles.headerContainer}>
              <Text style={styles.dropdownTitle}>My business is in</Text>
            </View>

            {countries.map((country) => (
              <TouchableOpacity
                key={country.code}
                style={[
                  styles.dropdownItem,
                  selectedCountry?.code === country.code && styles.selectedItem
                ]}
                onPress={() => {
                  onSelect(country);
                  onClose();
                }}
              >
                <View style={[
                  styles.flagContainer,
                  selectedCountry?.code === country.code && styles.selectedFlagContainer
                ]}>
                  <Image
                    source={{ uri: `https://flagcdn.com/w40/${country.code}.png` }}
                    style={styles.flag}
                  />
                </View>

                <Text style={[
                  styles.dropdownText,
                  selectedCountry?.code === country.code && styles.selectedCountryText
                ]}>
                  {country.name}
                </Text>

                {selectedCountry?.code === country.code && (
                  <Text style={styles.selectedMarker}>*</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  dropdownMenu: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 32,
    height: '70%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 20,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  dropdownTitle: {
    fontSize: 18,
    fontFamily: 'System',
    fontWeight: '600',
    color: '#1f2937',
  },
  versionText: {
    fontSize: 14,
    color: '#6b7280',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  selectedItem: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  flagContainer: {
    backgroundColor: 'white',
    borderRadius: 4,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedFlagContainer: {
    borderColor: '#ef4444',
    borderWidth: 1,
    shadowColor: '#ef4444',
    shadowOpacity: 0.2,
  },
  flag: {
    width: 32,
    height: 20,
    borderRadius: 3,
    resizeMode: 'cover',
  },
  dropdownText: {
    fontSize: 16,
    marginLeft: 14,
    color: '#1f2937',
    letterSpacing: -0.2,
  },
  selectedCountryText: {
    fontWeight: '500',
    color: '#ef4444',
  },
  selectedMarker: {
    marginLeft: 'auto',
    color: '#ef4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default OverlayDropdown;