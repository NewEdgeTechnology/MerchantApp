import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, StatusBar } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { F } from "../theme";

const BRAND = ["T", "à", "b", "D", "e", "y"];

const LOGO_W = 120;
const LOGO_H = Math.round((LOGO_W * 122.48) / 142.4);

const LOGO_D =
  "M0,122.48c5.85-13.09,11.93-26.75,18-40.37,5.48-12.3,10.95-24.57,16.21-36.36," +
  "8.38-.02,15.95-.44,23.42-4.53,6.86-3.75,12.43-9.69,15.74-16.77,0,0,12.29,0," +
  "16.26,0l-9.52,21.3h15.35l-6.71,14.51h-15.12l-.88,1.98c-1.64,3.68-5.68,12.73," +
  "-6.06,13.56-.6,1.35-.48,2.89.32,4.12.8,1.23,2.16,1.97,3.63,1.97h18.18l-6.48," +
  "14.51h-15.43c-5.79,0-11.4-3.11-14.64-8.11-2.78-4.29-3.27-9.24-1.33-13.57l5.86," +
  "-13.11.6-1.35h-12.64l-4.28,9.65c-5.49,12.36-14.14,31.84-16.31,36.71l-.6,1.35h54.79" +
  "c17.81,0,34.2-10.25,41.95-26.16l.25-.46c10.72-21.88,2-49.23-19.43-60.97-6.93-3.9," +
  "-14.59-5.88-22.76-5.88h-30.2c1.13-2.54,6.47-14.51,6.47-14.51h23.73c10.19,0,19.9," +
  "2.18,28.85,6.49,25.67,12.27,39.9,40.53,33.84,67.19-4.38,19.81-19.17,36.78-38.6," +
  "44.27-7.68,3.01-15.79,4.53-24.09,4.53H0Z";

export default function SplashScreen({ loading, onHidden }) {
  const logoScale = useRef(new Animated.Value(0.78)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  const letterAnims = useRef(
    BRAND.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(24),
    })),
  ).current;

  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 7,
          tension: 55,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      Animated.stagger(
        70,
        letterAnims.map((a) =>
          Animated.parallel([
            Animated.timing(a.opacity, {
              toValue: 1,
              duration: 320,
              useNativeDriver: true,
            }),
            Animated.spring(a.translateY, {
              toValue: 0,
              friction: 7,
              tension: 85,
              useNativeDriver: true,
            }),
          ]),
        ),
      ).start(() => {
        Animated.timing(taglineOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start(() => startDots());
      });
    });
  }, []);

  const startDots = () => {
    const bounce = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, 900 - delay - 600)),
        ]),
      );
    Animated.parallel([
      bounce(dot1, 0),
      bounce(dot2, 200),
      bounce(dot3, 400),
    ]).start();
  };

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        onHidden?.();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [loading, onHidden]);

  const dotTranslate = (dot) =>
    dot.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const dotOpacityInterp = (dot) =>
    dot.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });

  return (
    <View pointerEvents="auto" style={styles.container}>
      <StatusBar
        translucent={false}
        backgroundColor="#0D0020"
        barStyle="light-content"
      />
      <LinearGradient
        colors={["#0D0020", "#2A0050", "#5C0099"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      {/* Center content */}
      <View style={styles.centerBlock}>
        <Animated.View
          style={[
            styles.logoWrap,
            { transform: [{ scale: logoScale }], opacity: logoOpacity },
          ]}
        >
          <Svg width={LOGO_W} height={LOGO_H} viewBox="0 0 142.4 122.48">
            <Path d={LOGO_D} fill="#ffffff" />
          </Svg>
        </Animated.View>

        <View style={styles.brandRow}>
          {BRAND.map((letter, i) => (
            <Animated.Text
              key={i}
              style={[
                styles.letter,
                {
                  opacity: letterAnims[i].opacity,
                  transform: [{ translateY: letterAnims[i].translateY }],
                },
              ]}
            >
              {letter}
            </Animated.Text>
          ))}
        </View>

        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          Your everyday super app
        </Animated.Text>
      </View>

      {/* Loading dots */}
      <View style={styles.dotsRow}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                transform: [{ translateY: dotTranslate(dot) }],
                opacity: dotOpacityInterp(dot),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0D0020",
    zIndex: 999999,
    elevation: 999999,
  },
  centerBlock: {
    alignItems: "center",
    marginBottom: 80,
  },
  logoWrap: {
    marginBottom: 28,
    shadowColor: "#5C0099",
    shadowOpacity: 0.9,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
  },
  brandRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  letter: {
    color: "#ffffff",
    fontFamily: F.family.heading,
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: 1.4,
    textShadowColor: "rgba(92, 0, 153, 0.8)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  tagline: {
    color: "rgba(255,255,255,0.55)",
    fontFamily: F.family.body,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  dotsRow: {
    position: "absolute",
    bottom: 56,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
});
