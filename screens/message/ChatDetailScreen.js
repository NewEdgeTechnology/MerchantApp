// screens/food/ChatDetailScreen.js
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ChatDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { type = 'customer', name = 'User', orderId = 'ORD-0000' } = route.params || {};

  const [input, setInput] = useState('');

  // Dummy messages based on type
  const initialMessages = useMemo(() => {
    if (type === 'driver') {
      return [
        { id: '1', from: 'driver', text: 'Hi, I am at your restaurant.' },
        { id: '2', from: 'merchant', text: 'Okay, order is almost ready.' },
        { id: '3', from: 'driver', text: 'Great, I will pick it up in 2 mins.' },
      ];
    }
    // customer
    return [
      { id: '1', from: 'customer', text: 'Hello, can you make it less spicy?' },
      { id: '2', from: 'merchant', text: 'Sure, we will make it mild.' },
      { id: '3', from: 'customer', text: 'Thank you!' },
    ];
  }, [type]);

  const [messages, setMessages] = useState(initialMessages);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const next = {
      id: String(Date.now()),
      from: 'merchant',
      text: trimmed,
    };
    setMessages((prev) => [...prev, next]);
    setInput('');
  };

  const renderItem = ({ item }) => {
    const isMerchant = item.from === 'merchant';
    return (
      <View
        style={[
          styles.bubbleRow,
          isMerchant ? styles.bubbleRowRight : styles.bubbleRowLeft,
        ]}
      >
        <View
          style={[
            styles.bubble,
            isMerchant ? styles.bubbleMerchant : styles.bubbleOther,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              isMerchant && styles.bubbleTextMerchant,
            ]}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <StatusBar translucent backgroundColor="transparent" barStyle="dark-content" />

      {/* Header (same style family as MenuScreen) */}
      <View style={[styles.header, { paddingTop: (insets.top || 0) + 6 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.iconBtn}
          android_ripple={{ color: 'rgba(0,0,0,0.08)', borderless: true }}
        >
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </Pressable>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {type === 'driver' ? 'Chat with driver' : 'Chat with customer'}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {name}
          </Text>
        </View>

        <View style={styles.orderPill}>
          <Ionicons name="receipt-outline" size={14} color="#065F46" />
          <Text style={styles.orderPillText} numberOfLines={1}>
            {orderId}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        // tweak this if header height changes
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
      >
        {/* Messages */}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 12,
          }}
        />

        {/* Input bar – slightly lifted + respects safe area */}
        <View
          style={[
            styles.inputBar,
            {
              paddingBottom: Math.max(insets.bottom, 8) + 2,
              marginBottom: 4, // small lift from very bottom
            },
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={input}
            onChangeText={setInput}
            multiline
            scrollEnabled
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },

  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'left',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  orderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#D1FAE5',
    maxWidth: 120,
  },
  orderPillText: {
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
  },

  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 3,
  },
  bubbleRowLeft: {
    justifyContent: 'flex-start',
  },
  bubbleRowRight: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleOther: {
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 4,
  },
  bubbleMerchant: {
    backgroundColor: '#00b14f',
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    color: '#111827',
  },
  bubbleTextMerchant: {
    color: '#ffffff',
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 18,
    paddingTop: 20,
    height: 80,
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    backgroundColor: '#F3F4F6',
    color: '#111827',
  },
  sendButton: {  
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00b14f',
  },
});