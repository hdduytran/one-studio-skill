import { AbsoluteFill, useVideoConfig } from "remotion";
import { safe } from "../theme";

/** Full-frame container that keeps content inside the title-safe area. */
export const Stage: React.FC<{ children: React.ReactNode; align?: "center" | "start"; style?: React.CSSProperties }> = ({
  children,
  align = "center",
  style,
}) => {
  const { width, height } = useVideoConfig();
  const m = safe(width, height);
  return (
    <AbsoluteFill
      style={{
        padding: `${m.y}px ${m.x}px`,
        justifyContent: "center",
        alignItems: align === "center" ? "center" : "flex-start",
        textAlign: align === "center" ? "center" : "left",
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
