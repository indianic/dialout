import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import Svg, { G, Polygon, Text as SvgText } from 'react-native-svg';

// 2:1 dimetric extruded blocks (skill: isometric-animation). Top lightest,
// left mid, right darkest — one fixed light. No perspective shrink.

type Variant = 'stack' | 'sessions' | 'terminal' | 'projects';

export function IsoScene({ variant, height = 220 }: { variant: Variant; height?: number }) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    let loop: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(drift, { toValue: 1, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(drift, { toValue: 0, duration: 7000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    sub = { remove: () => loop?.stop() };
    return () => sub?.remove();
  }, [drift]);

  const tx = drift.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });
  const ty = drift.interpolate({ inputRange: [0, 1], outputRange: [3, -3] });

  return (
    <Animated.View style={{ height, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: tx }, { translateY: ty }] }}>
      <Svg width={280} height={height} viewBox="0 0 280 220">
        {variant === 'stack' && <Stack />}
        {variant === 'sessions' && <Sessions />}
        {variant === 'terminal' && <Terminal />}
        {variant === 'projects' && <Projects />}
      </Svg>
    </Animated.View>
  );
}

function Block({ cx, cy, w, d, h, top, left, right, label }: {
  cx: number; cy: number; w: number; d: number; h: number;
  top: string; left: string; right: string; label?: string;
}) {
  // Diamond top + two parallelograms. cy is the top-center of the top face.
  const hx = w / 2, hy = d / 2;
  const t = [
    [cx, cy],
    [cx + hx, cy + hy],
    [cx, cy + d],
    [cx - hx, cy + hy],
  ];
  const l = [
    [cx - hx, cy + hy],
    [cx, cy + d],
    [cx, cy + d + h],
    [cx - hx, cy + hy + h],
  ];
  const r = [
    [cx + hx, cy + hy],
    [cx, cy + d],
    [cx, cy + d + h],
    [cx + hx, cy + hy + h],
  ];
  const pts = (p: number[][]) => p.map((xy) => xy.join(',')).join(' ');
  return (
    <G>
      <Polygon points={pts(l)} fill={left} />
      <Polygon points={pts(r)} fill={right} />
      <Polygon points={pts(t)} fill={top} />
      {label ? (
        <SvgText x={cx} y={cy + hy + 4} fill="#fff" fontSize="11" fontWeight="700" textAnchor="middle">{label}</SvgText>
      ) : null}
    </G>
  );
}

function Stack() {
  return (
    <>
      <Block cx={140} cy={118} w={120} d={60} h={28} top="#3a3f4a" left="#17191f" right="#0c0e13" label="agent" />
      <Block cx={140} cy={70} w={100} d={50} h={26} top="#5b9cf8" left="#1a56db" right="#123d9c" label="server" />
      <Block cx={140} cy={28} w={80} d={40} h={22} top="#d6dae3" left="#8b909a" right="#5c616a" label="phone" />
    </>
  );
}

function Sessions() {
  return (
    <>
      <Block cx={90} cy={90} w={88} d={44} h={36} top="#5b9cf8" left="#1a56db" right="#123d9c" label="grok" />
      <Block cx={170} cy={70} w={88} d={44} h={36} top="#3ddc84" left="#0f7a3d" right="#0a5a2c" label="claude" />
      <Block cx={140} cy={30} w={70} d={34} h={22} top="#eceef3" left="#9aa0aa" right="#6b717a" />
    </>
  );
}

function Terminal() {
  return (
    <>
      <Block cx={140} cy={50} w={140} d={70} h={50} top="#3a3f4a" left="#17191f" right="#0c0e13" />
      <Block cx={140} cy={38} w={110} d={50} h={10} top="#0c0e13" left="#17191f" right="#0c0e13" />
      <SvgText x={140} y={58} fill="#3ddc84" fontSize="12" fontFamily="Menlo" textAnchor="middle">$</SvgText>
    </>
  );
}

function Projects() {
  return (
    <>
      <Block cx={80} cy={80} w={70} d={36} h={40} top="#5b9cf8" left="#1a56db" right="#123d9c" />
      <Block cx={150} cy={60} w={70} d={36} h={48} top="#f0b429" left="#a55a00" right="#7a4200" />
      <Block cx={210} cy={90} w={60} d={30} h={28} top="#3ddc84" left="#0f7a3d" right="#0a5a2c" />
    </>
  );
}
