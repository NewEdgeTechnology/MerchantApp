import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  SafeAreaView,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import HeaderWithSteps from "./HeaderWithSteps";

const CATEGORIES = [
  "Fast Food",
  "Casual Dining",
  "Fine Dining",
  "Cafe",
  "Bakery",
  "Buffet",
  "Food Truck",
  "BBQ / Grill",
  "Seafood",
  "Vegan / Vegetarian",
  "Asian Cuisine",
  "Italian Cuisine",
  "Indian Cuisine",
  "Mexican Cuisine",
  "Middle Eastern Cuisine",
  "Desserts & Ice Cream",
];

export default function MerchantRegistrationScreen() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [regNo, setRegNo] = useState("");
  const [address, setAddress] = useState("");
  const [licenseFile, setLicenseFile] = useState(null);

  // Track focus for input highlight
  const [focusedField, setFocusedField] = useState(null);

  const validate = () => {
    const emailOk = /^\S+@\S+\.\S+$/.test(email);
    const phoneOk = phone.trim().length >= 6;
    if (!fullName.trim()) return false;
    if (!emailOk) return false;
    if (!phoneOk) return false;
    if (!businessName.trim()) return false;
    if (!address.trim()) return false;
    if (!licenseFile) return false;
    return true;
  };

  const onPickLicense = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: ["application/pdf", "image/*"],
      });

      if (res.type === "success") {
        setLicenseFile({
          name: res.name,
          uri: res.uri,
          mimeType: res.mimeType ?? "application/octet-stream",
          size: res.size ?? 0,
        });
        return;
      }

      if (res.type === "cancel") {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") return;

        const img = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.9,
        });
        if (!img.canceled) {
          const asset = img.assets[0];
          setLicenseFile({
            name: asset.fileName ?? "license.jpg",
            uri: asset.uri,
            mimeType: asset.mimeType ?? "image/jpeg",
            size: asset.fileSize ?? 0,
          });
        }
      }
    } catch (e) {
      Alert.alert("Upload failed", e?.message || "Try again.");
    }
  };

  const onSubmit = () => {
    Alert.alert("Submitted", "Your registration has been submitted.");
  };

  const isFormValid = validate();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <HeaderWithSteps step="Step 3 of 7" />

      <View style={styles.fixedTitle}>
        <Text style={styles.h1}>Business Details</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.section}>Food Merchant</Text>

          <Field
            label="Full name"
            placeholder="e.g., Sonam Dorji"
            value={fullName}
            onChangeText={setFullName}
            onFocus={() => setFocusedField("fullName")}
            onBlur={() => setFocusedField(null)}
            isFocused={focusedField === "fullName"}
          />
          <Field
            label="Email"
            placeholder="e.g., sonam@business.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            onFocus={() => setFocusedField("email")}
            onBlur={() => setFocusedField(null)}
            isFocused={focusedField === "email"}
          />
          <Field
            label="Phone number"
            placeholder="e.g., +975 17xxxxxx"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            onFocus={() => setFocusedField("phone")}
            onBlur={() => setFocusedField(null)}
            isFocused={focusedField === "phone"}
          />

          <Field
            label="Business name"
            placeholder="e.g., Zombala Restaurant"
            value={businessName}
            onChangeText={setBusinessName}
            onFocus={() => setFocusedField("businessName")}
            onBlur={() => setFocusedField(null)}
            isFocused={focusedField === "businessName"}
          />

          <Text style={styles.label}>Restaurant type</Text>
          <View style={styles.chipsRow}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, category === c && styles.chipActive]}
                onPress={() => setCategory(c)}
              >
                <Text
                  style={[styles.chipText, category === c && styles.chipTextActive]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field
            label="Business registration number (optional)"
            placeholder="e.g., BRN-12345"
            value={regNo}
            onChangeText={setRegNo}
            onFocus={() => setFocusedField("regNo")}
            onBlur={() => setFocusedField(null)}
            isFocused={focusedField === "regNo"}
          />
          <Field
            label="Business address"
            placeholder="Street, city, region"
            value={address}
            onChangeText={setAddress}
            onFocus={() => setFocusedField("address")}
            onBlur={() => setFocusedField(null)}
            isFocused={focusedField === "address"}
          />

          <Text style={styles.label}>Business license / registration document</Text>
          <View style={styles.row}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onPickLicense}>
              <Text style={styles.btnSecondaryText}>Upload</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.fileName}>
                {licenseFile ? licenseFile.name : "No file selected"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={isFormValid ? styles.btnPrimary : styles.btnPrimaryDisabled}
            onPress={onSubmit}
            disabled={!isFormValid}
          >
            <Text style={isFormValid ? styles.btnPrimaryText : styles.btnPrimaryTextDisabled}>
              Submit
            </Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  onFocus,
  onBlur,
  isFocused,
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          { borderColor: isFocused ? "#00b14f" : "#ccc" },
        ]}
      >
        <TextInput
          style={styles.inputField}
          placeholder={placeholder}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          placeholderTextColor="#9aa0a6"
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fixedTitle: {
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#fff",
  },
  h1: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1A1D1F",
  },
  container: {
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: "700",
  },
  label: {
    fontSize: 14,
    marginBottom: 6,
    color: "#333",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    height: 50,
    borderWidth: 1.5,
    borderRadius: 15,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
  },
  inputField: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#fff",
  },
  chipActive: {
    backgroundColor: "#12b76a22",
    borderColor: "#12b76a",
  },
  chipText: {
    fontSize: 13,
    color: "#1f2937",
  },
  chipTextActive: {
    fontSize: 13,
    fontWeight: "700",
    color: "#067647",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  btnSecondary: {
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  btnSecondaryText: {
    fontWeight: "700",
  },
  fileName: {
    fontSize: 13,
    color: "#374151",
  },
  btnPrimary: {
    backgroundColor: "#00b14f",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    marginTop: 6,
    elevation: 5,
  },
  btnPrimaryDisabled: {
    backgroundColor: "#eee",
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: "center",
    marginTop: 6,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  btnPrimaryTextDisabled: {
    fontSize: 16,
    fontWeight: "700",
    color: "#aaa",
  },
});
