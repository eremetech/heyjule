import { useState, type PropsWithChildren } from "react";
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type SoftPressableProps = PropsWithChildren<
  PressableProps & {
    style?: StyleProp<ViewStyle>;
    pressedScale?: number;
  }
>;

export function SoftPressable({
  children,
  style,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  ...props
}: SoftPressableProps) {
  const [scale] = useState(() => new Animated.Value(1));

  return (
    <AnimatedPressable
      {...props}
      accessibilityRole={props.accessibilityRole ?? "button"}
      style={[style, { transform: [{ scale }] }]}
      onPressIn={(event) => {
        Animated.spring(scale, {
          toValue: pressedScale,
          damping: 22,
          stiffness: 320,
          mass: 0.7,
          useNativeDriver: true,
        }).start();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        Animated.spring(scale, {
          toValue: 1,
          damping: 19,
          stiffness: 250,
          mass: 0.65,
          useNativeDriver: true,
        }).start();
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
}
