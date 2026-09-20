import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  Video
} from "remotion";
import type { AssetType, RenderPayload } from "@fullpos-ad-studio/shared";
import { defaultRenderPayload } from "../payload.js";

const ink = "#0b1728";
const blue = "#1457d9";
const cyan = "#14a9d6";

type MotionIntensity = "elegant" | "cinematic" | "dynamic";

type DeviceTuning = {
  scale?: number;
  x?: number;
  y?: number;
  fit?: "cover" | "contain";
};

export type HybridSceneMode = "standard" | "hybrid" | "full-ai-experimental";

export const aiBackgroundLibrary = [
  {
    id: "phase5g-wan-mobile-atmosphere",
    projectId: "cmua1uv470000twq0zvlropgk",
    filename: "cmua1uvta0004twq06sj5dthj.mp4",
    model: "WAN 2.2 I2V 720p",
    prompt: "Existing funded WAN clip reused only as atmospheric background.",
    duration: 5,
    resolution: "672x1344",
    cost: 0.3,
    createdAt: "2026-09-20",
    type: "AI_BACKGROUND" as const
  }
];

export const aiBackgroundPromptTemplate = {
  prompt:
    "Premium SaaS technology commercial background, elegant futuristic studio environment, clean blue and white lighting, soft volumetric glow, subtle glass surfaces, realistic reflections, smooth cinematic camera push-in, professional product advertising stage, clean central composition area for a smartphone product, sophisticated corporate aesthetic, subtle depth and parallax, no text, no logos, no devices, no people, no interface.",
  negative:
    "text, letters, numbers, logo, smartphone, computer, UI, interface, people, faces, distorted geometry, flicker, sudden motion, clutter"
};

function clamp(frame: number, input: [number, number], output: [number, number]) {
  return interpolate(frame, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic)
  });
}

function intensityConfig(value?: string) {
  const mode = (value ?? "cinematic") as MotionIntensity;
  if (mode === "elegant") {
    return { camera: 0.028, parallax: 9, blur: 11, bgScale: 1.22, playbackRate: 0.88, light: 0.16 };
  }
  if (mode === "dynamic") {
    return { camera: 0.074, parallax: 24, blur: 7, bgScale: 1.32, playbackRate: 1.08, light: 0.28 };
  }
  return { camera: 0.05, parallax: 16, blur: 9, bgScale: 1.27, playbackRate: 1, light: 0.22 };
}

function tuning(payload: RenderPayload, key: "billing" | "products" | "reports" | "mobile" | "devices"): DeviceTuning {
  return payload.scenes?.[key] ?? {};
}

function realUiStyle(settings?: DeviceTuning): React.CSSProperties {
  return {
    width: "100%",
    height: "100%",
    objectFit: settings?.fit ?? "cover",
    objectPosition: "center top",
    transform: `translate(${settings?.x ?? 0}px, ${settings?.y ?? 0}px) scale(${settings?.scale ?? 1})`,
    transformOrigin: "center top",
    background: "#ffffff"
  };
}

function PlaceholderUi({ label }: { label: string }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#f8fbff", color: ink, fontFamily: "Inter, Segoe UI, Arial" }}>
      <div style={{ height: 72, background: "#0b1728", color: "white", display: "flex", alignItems: "center", padding: "0 28px", fontWeight: 800 }}>{label}</div>
      <div style={{ padding: 26, display: "grid", gap: 16 }}>
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} style={{ height: index % 3 === 0 ? 72 : 42, borderRadius: 12, background: index % 2 ? "#eef6ff" : "#e8f3ff", border: "1px solid #dceafe" }} />
        ))}
      </div>
    </div>
  );
}

export function AiBackgroundLayer({
  src,
  imageSrc,
  intensity = "cinematic",
  opacity = 1,
  startOffset = 0
}: {
  src?: string;
  imageSrc?: string;
  intensity?: MotionIntensity | string;
  opacity?: number;
  startOffset?: number;
}) {
  const frame = useCurrentFrame();
  const config = intensityConfig(intensity);
  const drift = Math.sin((frame + startOffset) / 95) * config.parallax;
  const scale = config.bgScale + clamp(frame, [0, 150], [0, config.camera]);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "linear-gradient(160deg, #edf6ff, #ffffff 54%, #e9f2ff)", opacity }}>
      {src ? (
        <Video
          src={src}
          muted
          loop
          playbackRate={config.playbackRate}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `translate(${drift}px, ${-drift * 0.45}px) scale(${scale})`,
            filter: `blur(${config.blur}px) saturate(1.08) brightness(.9)`,
            opacity: 0.88
          }}
        />
      ) : imageSrc ? (
        <Img src={imageSrc} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})`, filter: `blur(${config.blur}px) saturate(1.08)` }} />
      ) : (
        <BackgroundSourcePlate />
      )}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(255,255,255,.40), rgba(255,255,255,.18) 38%, rgba(7,17,31,.18))" }} />
      <AbsoluteFill style={{ background: "radial-gradient(circle at 50% 42%, rgba(255,255,255,.05), rgba(4,12,25,.26) 100%)" }} />
    </AbsoluteFill>
  );
}

export function AmbientEffectsLayer({ intensity = "cinematic" }: { intensity?: MotionIntensity | string }) {
  const frame = useCurrentFrame();
  const config = intensityConfig(intensity);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", width: 760, height: 760, left: 150 + Math.sin(frame / 130) * 18, top: 460, borderRadius: 100, background: "rgba(20,87,217,.10)", filter: "blur(22px)", transform: "rotate(-10deg)" }} />
      <div style={{ position: "absolute", width: 640, height: 250, left: 218, bottom: 260, borderRadius: "50%", background: "rgba(9,21,39,.18)", filter: "blur(35px)" }} />
      <div style={{ position: "absolute", top: -90, left: clamp(frame, [8, 88], [-160, 1120]), width: 96, height: 2200, transform: "rotate(18deg)", background: `linear-gradient(90deg, transparent, rgba(255,255,255,${config.light}), transparent)` }} />
    </AbsoluteFill>
  );
}

export function RealUiLayer({ src, type, tuning }: { src?: string; type: AssetType; tuning?: DeviceTuning }) {
  return src ? <Img src={src} style={realUiStyle(tuning)} /> : <PlaceholderUi label={`Video Studio ${type}`} />;
}

export function PhoneDevice({ src, tuning, children }: { src?: string; tuning?: DeviceTuning; children?: React.ReactNode }) {
  return (
    <div style={{ width: 520, height: 1040, borderRadius: 78, padding: 18, background: "linear-gradient(145deg, #101b2e, #030711)", position: "relative", boxShadow: "0 80px 180px rgba(5,14,29,.42), 0 18px 40px rgba(20,87,217,.20)", border: "1px solid rgba(255,255,255,.28)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: -1, borderRadius: 78, boxShadow: "inset 0 0 24px rgba(255,255,255,.16)", pointerEvents: "none" }} />
      <div style={{ width: "100%", height: "100%", borderRadius: 56, overflow: "hidden", background: "#fff", position: "relative" }}>
        {children ?? <RealUiLayer src={src} type="mobile" tuning={tuning} />}
      </div>
      <div style={{ position: "absolute", top: 30, left: "50%", width: 138, height: 31, borderRadius: 999, transform: "translateX(-50%)", background: "#050914", boxShadow: "0 3px 8px rgba(0,0,0,.25)" }} />
      <div style={{ position: "absolute", inset: 18, borderRadius: 56, background: "linear-gradient(112deg, rgba(255,255,255,.22), rgba(255,255,255,0) 34%, rgba(255,255,255,.10) 86%, rgba(255,255,255,0))", pointerEvents: "none" }} />
    </div>
  );
}

export function DesktopDevice({ src, type = "billing", tuning, children }: { src?: string; type?: AssetType; tuning?: DeviceTuning; children?: React.ReactNode }) {
  return (
    <div style={{ width: 1030, position: "relative" }}>
      <div style={{ height: 660, borderRadius: 34, background: "linear-gradient(145deg, #17263d, #06101f)", padding: 17, boxShadow: "0 70px 165px rgba(5,14,29,.36), 0 16px 36px rgba(20,87,217,.16)", border: "1px solid rgba(255,255,255,.24)", overflow: "hidden" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 22, overflow: "hidden", background: "#fff" }}>
          {children ?? <RealUiLayer src={src} type={type} tuning={tuning} />}
        </div>
        <div style={{ position: "absolute", inset: 17, borderRadius: 22, background: "linear-gradient(115deg, rgba(255,255,255,.22), rgba(255,255,255,0) 35%)", pointerEvents: "none" }} />
      </div>
      <div style={{ width: 230, height: 92, margin: "0 auto", background: "linear-gradient(180deg, #17263d, #07111f)", clipPath: "polygon(26% 0, 74% 0, 92% 100%, 8% 100%)", filter: "drop-shadow(0 28px 30px rgba(5,14,29,.22))" }} />
      <div style={{ width: 450, height: 24, margin: "-1px auto 0", borderRadius: 999, background: "linear-gradient(90deg, #07111f, #263a57, #07111f)" }} />
    </div>
  );
}

export function LaptopDevice({ src, type = "reports", tuning }: { src?: string; type?: AssetType; tuning?: DeviceTuning }) {
  return (
    <div style={{ width: 840, position: "relative" }}>
      <div style={{ height: 510, borderRadius: 28, padding: 14, background: "linear-gradient(145deg, #17263d, #060d18)", boxShadow: "0 50px 125px rgba(5,14,29,.30)" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 18, overflow: "hidden", background: "#fff" }}>
          <RealUiLayer src={src} type={type} tuning={tuning} />
        </div>
      </div>
      <div style={{ width: 930, height: 28, marginLeft: -45, borderRadius: "0 0 26px 26px", background: "linear-gradient(90deg, #dce7f5, #ffffff, #d4e0ef)", boxShadow: "0 28px 45px rgba(5,14,29,.22)" }} />
    </div>
  );
}

export function HighlightLayer() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: "10% 8%", border: "1px solid rgba(255,255,255,.34)", borderRadius: 64, opacity: clamp(frame, [20, 54], [0, 1]) }} />
      <div style={{ position: "absolute", inset: "16% 14%", borderRadius: 70, boxShadow: "0 0 95px rgba(20,87,217,.18)" }} />
    </AbsoluteFill>
  );
}

export function CopyLayer({ title, subtitle, start = 10 }: { title: string; subtitle?: string; start?: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 82, right: 82, top: 142, fontFamily: "Inter, Segoe UI, Arial", color: ink }}>
      <div style={{ opacity: clamp(frame, [start, start + 18], [0, 1]), transform: `translateY(${clamp(frame, [start, start + 20], [34, 0])}px)`, fontSize: 72, lineHeight: 1.02, fontWeight: 900, letterSpacing: 0 }}>
        {title}
      </div>
      {subtitle ? <div style={{ opacity: clamp(frame, [start + 10, start + 28], [0, 1]), marginTop: 18, color: "#50657d", fontSize: 30, lineHeight: 1.25, maxWidth: 760 }}>{subtitle}</div> : null}
    </div>
  );
}

export function BrandLayer({ payload }: { payload: RenderPayload }) {
  const primary = payload.brandProfile?.primaryColor ?? blue;
  const secondary = payload.brandProfile?.secondaryColor ?? cyan;
  return (
    <div style={{ position: "absolute", left: 76, bottom: 78, display: "flex", alignItems: "center", gap: 16, fontFamily: "Inter, Segoe UI, Arial" }}>
      <div style={{ width: 70, height: 70, borderRadius: 19, display: "grid", placeItems: "center", color: "#fff", fontWeight: 900, fontSize: 28, background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: "0 20px 55px rgba(20,87,217,.25)" }}>{initialsFor(payload.brand.name)}</div>
      <div>
        <div style={{ color: ink, fontWeight: 850, fontSize: 28 }}>{payload.brand.name}</div>
        <div style={{ color: "#60758d", fontSize: 18 }}>Video ads SaaS</div>
      </div>
    </div>
  );
}

function initialsFor(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VS";
}

export function ScreenPushIn({ children, amount = 0.05 }: { children: React.ReactNode; amount?: number }) {
  const frame = useCurrentFrame();
  return <div style={{ transform: `scale(${1 + clamp(frame, [0, 150], [0, amount])})`, transformOrigin: "center" }}>{children}</div>;
}

export function ScreenPan({ children, x = 0, y = -18 }: { children: React.ReactNode; x?: number; y?: number }) {
  const frame = useCurrentFrame();
  return <div style={{ transform: `translate(${clamp(frame, [36, 132], [0, x])}px, ${clamp(frame, [36, 132], [0, y])}px)` }}>{children}</div>;
}

export function ScreenFocus({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  return <div style={{ transform: `scale(${1 + clamp(frame, [34, 138], [0, 0.055])})`, transformOrigin: "center 36%" }}>{children}</div>;
}

export function ScreenParallax({ children, amount = 10 }: { children: React.ReactNode; amount?: number }) {
  const frame = useCurrentFrame();
  return <div style={{ transform: `translate(${Math.sin(frame / 70) * amount}px, ${Math.cos(frame / 82) * amount * 0.55}px)` }}>{children}</div>;
}

export function HybridAiScene({
  payload,
  children,
  intensity,
  backgroundOpacity = 1
}: {
  payload: RenderPayload;
  children: React.ReactNode;
  intensity?: MotionIntensity | string;
  backgroundOpacity?: number;
}) {
  const motion = intensity ?? payload.visual?.aiMotionIntensity ?? payload.visual?.motion ?? "cinematic";
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#f5f9ff" }}>
      <AiBackgroundLayer src={payload.visual?.aiBackgroundVideoPath} imageSrc={payload.visual?.aiBackgroundImagePath} intensity={motion} opacity={backgroundOpacity} />
      <AmbientEffectsLayer intensity={motion} />
      {children}
      <HighlightLayer />
      <BrandLayer payload={payload} />
    </AbsoluteFill>
  );
}

export function HybridMobileHero({ payload, title = "Tu negocio en tu móvil", preview = false }: { payload: RenderPayload; title?: string; preview?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const motion = intensityConfig(payload.visual?.aiMotionIntensity ?? payload.visual?.motion);
  const enter = spring({ frame: frame - 9, fps, config: { damping: 25, stiffness: 78, mass: 1.12 } });
  const y = interpolate(enter, [0, 1], [220, 0]);
  const rot = interpolate(enter, [0, 1], [8, -2.4]);
  return (
    <HybridAiScene payload={payload}>
      <CopyLayer title={title} subtitle={preview ? undefined : "Ventas, inventario y reportes siempre contigo."} start={10} />
      <div style={{ position: "absolute", left: 280, top: 430, transform: `translateY(${y + Math.sin(frame / 58) * motion.parallax * 0.35}px) rotate(${rot}deg) scale(${1 + clamp(frame, [38, 150], [0, motion.camera])})` }}>
        <ScreenParallax amount={motion.parallax * 0.4}>
          <PhoneDevice tuning={tuning(payload, "mobile")}>
            <ScreenPan y={-10}>
              <RealUiLayer src={payload.assets.mobile} type="mobile" tuning={tuning(payload, "mobile")} />
            </ScreenPan>
          </PhoneDevice>
        </ScreenParallax>
      </div>
    </HybridAiScene>
  );
}

export function HybridDesktopHero({ payload, type = "billing", title = "Factura rápido" }: { payload: RenderPayload; type?: AssetType; title?: string }) {
  const frame = useCurrentFrame();
  const motion = intensityConfig(payload.visual?.aiMotionIntensity ?? payload.visual?.motion);
  return (
    <HybridAiScene payload={payload}>
      <CopyLayer title={title} start={8} />
      <div style={{ position: "absolute", left: 24, top: 558, transform: `scale(${1 + clamp(frame, [20, 150], [0, motion.camera])}) perspective(1500px) rotateX(2deg) rotateY(-2.2deg)` }}>
        <DesktopDevice src={payload.assets[type]} type={type} tuning={tuning(payload, type === "reports" ? "reports" : "billing")} />
      </div>
    </HybridAiScene>
  );
}

export function HybridReportsHero({ payload }: { payload: RenderPayload }) {
  return (
    <HybridAiScene payload={payload}>
      <CopyLayer title="Decide con información" subtitle="Enfoca tus ventas, ganancias y reportes sin alterar datos." start={8} />
      <div style={{ position: "absolute", left: 24, top: 585, transform: "perspective(1500px) rotateX(2deg) rotateY(-2deg)" }}>
        <DesktopDevice type="reports" tuning={tuning(payload, "reports")}>
          <ScreenFocus>
            <ScreenPan x={-16} y={-26}>
              <RealUiLayer src={payload.assets.reports} type="reports" tuning={tuning(payload, "reports")} />
            </ScreenPan>
          </ScreenFocus>
        </DesktopDevice>
      </div>
    </HybridAiScene>
  );
}

export function HybridMultiDeviceHero({ payload }: { payload: RenderPayload }) {
  const frame = useCurrentFrame();
  return (
    <HybridAiScene payload={payload}>
      <CopyLayer title="PC · Android · iPhone" start={8} />
      <div style={{ position: "absolute", left: -110, top: 640, transform: `scale(.77) translateY(${clamp(frame, [8, 34], [80, 0])}px)` }}>
        <DesktopDevice src={payload.assets.billing} type="billing" tuning={tuning(payload, "devices")} />
      </div>
      <div style={{ position: "absolute", left: 96, top: 820, transform: `scale(.55) rotate(-7deg) translateY(${clamp(frame, [24, 56], [100, 0])}px)` }}>
        <PhoneDevice src={payload.assets.products} tuning={tuning(payload, "products")} />
      </div>
      <div style={{ position: "absolute", right: 72, top: 700, transform: `scale(.70) rotate(4deg) translateY(${clamp(frame, [38, 72], [110, 0])}px)` }}>
        <PhoneDevice src={payload.assets.mobile} tuning={tuning(payload, "mobile")} />
      </div>
    </HybridAiScene>
  );
}

export function BackgroundSourcePlate() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(150deg, #eef7ff 0%, #ffffff 44%, #dfeeff 100%)" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 38%, rgba(20,87,217,.22), transparent 34%), radial-gradient(circle at 68% 22%, rgba(20,169,214,.16), transparent 28%)" }} />
      <div style={{ position: "absolute", left: 120, right: 120, bottom: 315, height: 260, borderRadius: "50%", background: "linear-gradient(90deg, rgba(255,255,255,.58), rgba(20,87,217,.10), rgba(255,255,255,.42))", boxShadow: "0 45px 120px rgba(7,17,31,.16)", transform: `translateY(${Math.sin(frame / 90) * 4}px)` }} />
      <div style={{ position: "absolute", left: 190, top: 430, width: 700, height: 930, borderRadius: 88, border: "1px solid rgba(255,255,255,.72)", background: "linear-gradient(130deg, rgba(255,255,255,.32), rgba(255,255,255,.06))", boxShadow: "inset 0 0 70px rgba(255,255,255,.28)", transform: "rotate(-8deg)" }} />
      <div style={{ position: "absolute", inset: "8% 12%", borderRadius: 80, boxShadow: "inset 0 0 160px rgba(255,255,255,.50)" }} />
    </AbsoluteFill>
  );
}

export function HybridMobilePreview({ payload }: { payload?: RenderPayload }) {
  const safePayload = payload ?? defaultRenderPayload;
  return <HybridMobileHero payload={safePayload} title="Tu negocio en tu móvil" preview />;
}
