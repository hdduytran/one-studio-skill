import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { Environment, Float, Lightformer, RoundedBox } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ease, useTheme } from "../theme";

/**
 * EffectComposer builds its passes in an effect, so the very first frame after
 * mount is drawn before it is ready (blank frame → flicker at the start of every
 * render chunk). Hold the frame, then advance once more after the composer is up.
 * Render <PostFxWarmUp /> inside the canvas whenever an <EffectComposer> is present.
 */
const PostFxWarmUp = () => {
  const { advance } = useThree();
  const [handle] = useState(() => delayRender("Warm up postprocessing"));
  useEffect(() => {
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        advance(performance.now());
        continueRender(handle);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [advance, handle]);
  return null;
};

/**
 * 3D hero scene (Three.js + R3F + Drei + Postprocessing via @remotion/three).
 * Rules: every motion comes from useCurrentFrame() — never useFrame() — and
 * Drei helpers that animate on their own clock (Float, OrbitControls autoRotate…)
 * must be given frame-driven values or left static.
 */
export const Scene3D: React.FC<{ count?: number; bloom?: boolean }> = ({ count = 5, bloom = true }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const theme = useTheme();
  const t = frame / fps;
  const camZ = interpolate(frame, [0, fps * 2], [14, 9], { extrapolateRight: "clamp", easing: ease.out });

  return (
    <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, camZ], fov: 40 }}>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 6, 5]} intensity={1.4} />
      {/* Studio lighting built from Lightformers: no HDR download at render time.
          (Environment preset="city" etc. fetch HDR files from a CDN — avoid, or pass files={staticFile("hdri/x.hdr")}.) */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={4} position={[0, 5, -5]} scale={[10, 5, 1]} />
        <Lightformer form="rect" intensity={2} position={[-5, 1, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} />
        <Lightformer form="ring" intensity={2} color={theme.colors.primary} position={[5, 2, 3]} scale={3} />
      </Environment>
      {Array.from({ length: count }).map((_, i) => {
        const appear = interpolate(frame, [i * 5, i * 5 + 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease.overshoot });
        const x = (i - (count - 1) / 2) * 2.2;
        return (
          // Float with speed=0 keeps Drei from animating on its own; we move it ourselves.
          <Float key={i} speed={0} floatIntensity={0}>
            <RoundedBox
              args={[1.4, 1.4, 1.4]}
              radius={0.18}
              position={[x, Math.sin(t * 2 + i) * 0.25, 0]}
              rotation={[t * 0.6 + i, t * 0.8 + i * 0.5, 0]}
              scale={appear}
            >
              <meshStandardMaterial color={i % 2 ? theme.colors.primary : theme.colors.accent} metalness={0.3} roughness={0.25} />
            </RoundedBox>
          </Float>
        );
      })}
      {bloom ? <PostFxWarmUp /> : null}
      {bloom ? (
        <EffectComposer>
          <Bloom intensity={0.6} luminanceThreshold={0.6} mipmapBlur />
          <Vignette darkness={0.5} />
        </EffectComposer>
      ) : (
        <></>
      )}
    </ThreeCanvas>
  );
};
