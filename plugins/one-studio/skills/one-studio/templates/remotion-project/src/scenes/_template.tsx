import { ThreeCanvas } from "@remotion/three";
import { interpolate, useCurrentFrame, useVideoConfig, AbsoluteFill } from "remotion";
import { BRAND } from "../brand.generated";

// Scene {{id}}: everything is a function of the frame. No clocks, no useFrame-driven state.
export const Scene: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const fadeIn = interpolate(frame, [0, 0.4 * fps], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [durationInFrames - 0.4 * fps, durationInFrames], [1, 0], { extrapolateLeft: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.colors.bg, opacity: Math.min(fadeIn, fadeOut) }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 1.2, 6], fov: 35 }}>
        <hemisphereLight args={["#ffffff", BRAND.colors.bg, 1.2]} />
        <directionalLight position={[3, 4, 5]} intensity={2.2} />
        <mesh rotation={[t * 0.4, t * 0.7, 0]}>
          <icosahedronGeometry args={[1.2, 1]} />
          <meshStandardMaterial color={BRAND.colors.primary} roughness={0.35} metalness={0.2} flatShading />
        </mesh>
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
