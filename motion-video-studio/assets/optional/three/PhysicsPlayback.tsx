import { ThreeCanvas } from "@remotion/three";
import { Environment, Lightformer, RoundedBox } from "@react-three/drei";
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { resolveSrc } from "../lib/assets";
import { useTheme } from "../theme";

type Baked = {
  fps: number;
  frames: number;
  bodies: { id: string; shape: "box" | "ball"; size?: [number, number, number]; radius?: number }[];
  track: number[][][]; // [frame][body] = [px,py,pz,qx,qy,qz,qw]
};

/**
 * Plays back a Rapier simulation baked by scripts/bake_physics.mjs.
 * Live physics (React Three Rapier <Physics>) steps on real time and can't be
 * seeked, so bake first, then every frame just reads its row — deterministic.
 */
export const PhysicsPlayback: React.FC<{ src: string; cameraY?: number; cameraZ?: number }> = ({ src, cameraY = 3, cameraZ = 11 }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const theme = useTheme();
  const [data, setData] = useState<Baked | null>(null);
  const [handle] = useState(() => delayRender(`Loading physics ${src}`));

  useEffect(() => {
    fetch(resolveSrc(src))
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        continueRender(handle);
      })
      .catch(cancelRender);
  }, [src, handle]);

  if (!data) return null;
  // Map video time to baked time (they may use different fps); hold the last frame.
  const f = Math.min(data.frames - 1, Math.round((frame / fps) * data.fps));
  const row = data.track[f];

  return (
    <ThreeCanvas width={width} height={height} camera={{ position: [0, cameraY, cameraZ], fov: 40 }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 8, 6]} intensity={1.3} />
      <Environment resolution={128}>
        <Lightformer form="rect" intensity={3} position={[0, 6, -4]} scale={[10, 4, 1]} />
      </Environment>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={theme.colors.surface} />
      </mesh>
      {data.bodies.map((b, i) => {
        const [px, py, pz, qx, qy, qz, qw] = row[i];
        const color = i % 3 === 0 ? theme.colors.accent : theme.colors.primary;
        return b.shape === "ball" ? (
          <mesh key={b.id} position={[px, py, pz]} quaternion={[qx, qy, qz, qw]}>
            <sphereGeometry args={[b.radius ?? 0.5, 32, 32]} />
            <meshStandardMaterial color={color} roughness={0.3} />
          </mesh>
        ) : (
          <RoundedBox key={b.id} args={b.size ?? [1, 1, 1]} radius={0.06} position={[px, py, pz]} quaternion={[qx, qy, qz, qw]}>
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
          </RoundedBox>
        );
      })}
    </ThreeCanvas>
  );
};
