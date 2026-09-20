import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import type { AssetType, RenderPayload } from "@fullpos-ad-studio/shared";
import { defaultRenderPayload } from "../payload.js";
import { HybridDesktopHero, HybridMobileHero, HybridMultiDeviceHero, HybridReportsHero } from "./HybridAiScene.js";

const theme = {
  ink: "#111d2f",
  muted: "#5d718a",
  blue: "#1457d9",
  cyan: "#11a8c9",
  navy: "#091527",
  panel: "#f8fbff"
};

const safe = { top: 170, side: 86, bottom: 230 };
type SceneKey = "billing" | "products" | "reports" | "mobile" | "devices";

interface TemplateProps {
  payload: RenderPayload;
}

interface RootTemplateProps {
  payload?: RenderPayload;
}

function clampEase(frame: number, input: [number, number], output: [number, number]) {
  return interpolate(frame, input, output, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic)
  });
}

function fadeScene(frame: number, start: number, end: number) {
  const inOpacity = clampEase(frame, [start, start + 18], [0, 1]);
  const outOpacity = interpolate(frame, [end - 16, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.cubic)
  });
  return Math.min(inOpacity, outOpacity);
}

function cameraPush(frame: number, start: number, end: number, amount = 0.055) {
  return interpolate(frame, [start, end], [1, 1 + amount], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic)
  });
}

function entrance(frame: number, start: number, fps: number) {
  return spring({
    frame: frame - start,
    fps,
    config: { damping: 26, stiffness: 78, mass: 1.15 }
  });
}

function float(frame: number, amplitude = 7, speed = 42) {
  return Math.sin(frame / speed) * amplitude;
}

function motionConfig(payload: RenderPayload) {
  const mode = payload.visual?.motion ?? "cinematic";
  if (mode === "elegant") return { push: 0.026, float: 3.5, depth: 0.72, transition: 18 };
  if (mode === "dynamic") return { push: 0.045, float: 6, depth: 0.9, transition: 14 };
  return { push: 0.062, float: 8, depth: 1.08, transition: 12 };
}

function visualTheme(payload: RenderPayload) {
  const style = payload.visual?.style ?? "saas-premium";
  if (style === "technology-cinematic") return { accent: theme.cyan, glow: "rgba(17,168,201,.25)", panel: "#f2fbff", text: theme.navy };
  if (style === "clean-corporate") return { accent: "#2d6cdf", glow: "rgba(45,108,223,.14)", panel: "#f8fafc", text: theme.ink };
  return { accent: theme.blue, glow: "rgba(20,87,217,.20)", panel: theme.panel, text: theme.ink };
}

function CameraPush({ children, start, end, amount }: { children: React.ReactNode; start: number; end: number; amount: number }) {
  const frame = useCurrentFrame();
  return <div style={{ transform: `scale(${cameraPush(frame, start, end, amount)})`, transformOrigin: "center" }}>{children}</div>;
}

function DepthLayer({ children, z = 0 }: { children: React.ReactNode; z?: number }) {
  return <div style={{ transform: `translateZ(${z}px)`, transformStyle: "preserve-3d" }}>{children}</div>;
}

function ParallaxGroup({ children, drift = 0 }: { children: React.ReactNode; drift?: number }) {
  const frame = useCurrentFrame();
  return <div style={{ transform: `translate3d(${Math.sin(frame / 90) * drift}px, ${Math.cos(frame / 110) * drift}px, 0)` }}>{children}</div>;
}

function LightSweep({ delay = 0, opacity = 0.18 }: { delay?: number; opacity?: number }) {
  const frame = useCurrentFrame();
  const x = interpolate(frame - delay, [0, 70], [-140, 1160], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return <div style={{ position: "absolute", top: -80, bottom: -80, left: x, width: 90, transform: "rotate(18deg)", background: `linear-gradient(90deg, transparent, rgba(255,255,255,${opacity}), transparent)`, pointerEvents: "none" }} />;
}

function SoftGlow({ color }: { color: string }) {
  return <div style={{ position: "absolute", inset: "12% 8%", borderRadius: 80, background: color, filter: "blur(70px)", opacity: 0.42, pointerEvents: "none" }} />;
}

function MaskReveal({ children, start }: { children: React.ReactNode; start: number }) {
  const frame = useCurrentFrame();
  const inset = interpolate(frame, [start, start + 24], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return <div style={{ clipPath: `inset(${inset}% ${inset}% ${inset}% ${inset}% round 30px)` }}>{children}</div>;
}

function BlurReveal({ children, start }: { children: React.ReactNode; start: number }) {
  const frame = useCurrentFrame();
  const blur = interpolate(frame, [start, start + 18], [18, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ filter: `blur(${blur}px)` }}>{children}</div>;
}

function SceneTransition({ start, direction = 1 }: { start: number; direction?: 1 | -1 }) {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [start, start + 18], [direction * -120, direction * 1280], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return <div style={{ position: "absolute", top: 0, bottom: 0, left: x, width: 160, background: "linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent)", transform: "skewX(-14deg)", pointerEvents: "none" }} />;
}

function sceneStyle(frame: number, start: number, end: number): React.CSSProperties {
  return {
    opacity: fadeScene(frame, start, end),
    padding: `${safe.top}px ${safe.side}px ${safe.bottom}px`,
    fontFamily: "Inter, Segoe UI, Arial, Helvetica, sans-serif"
  };
}

function PremiumBackground({ payload }: TemplateProps) {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 120) * 18;
  const vt = visualTheme(payload);
  return (
    <AbsoluteFill style={{ background: `linear-gradient(155deg, ${vt.panel} 0%, #edf5ff 45%, #ffffff 100%)` }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 22% 16%, ${vt.glow}, transparent 30%), radial-gradient(circle at 78% 18%, rgba(20,87,217,.17), transparent 34%), radial-gradient(circle at 52% 80%, rgba(8,21,39,.10), transparent 38%)`
        }}
      />
      <div style={{ position: "absolute", width: 920, height: 920, right: -420 + drift, top: 100, borderRadius: 86, border: "1px solid rgba(20,87,217,.14)", transform: "rotate(17deg)", boxShadow: "inset 0 0 80px rgba(255,255,255,.5)" }} />
      <div style={{ position: "absolute", width: 700, height: 700, left: -350 - drift, bottom: 180, borderRadius: 80, border: "1px solid rgba(17,168,201,.13)", transform: "rotate(-12deg)" }} />
      {Array.from({ length: 18 }).map((_, index) => (
        <span key={index} style={{ position: "absolute", width: 3, height: 3, borderRadius: 8, left: `${8 + ((index * 31) % 86)}%`, top: `${10 + ((index * 47) % 78)}%`, opacity: 0.08 + (index % 4) * 0.025, background: index % 2 ? theme.blue : theme.cyan }} />
      ))}
    </AbsoluteFill>
  );
}

function BrandMark({ payload, compact = false }: TemplateProps & { compact?: boolean }) {
  const logo = payload.assets.logo;
  const size = compact ? 92 : 132;
  const primary = payload.brandProfile?.primaryColor ?? theme.blue;
  const secondary = payload.brandProfile?.secondaryColor ?? theme.cyan;
  const initials = payload.brand.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VS";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 18 : 24 }}>
      <div style={{ width: size, height: size, borderRadius: compact ? 22 : 32, background: logo ? "#fff" : `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: "0 34px 90px rgba(20,87,217,.24)", display: "grid", placeItems: "center", overflow: "hidden", border: "1px solid rgba(255,255,255,.8)" }}>
        {logo ? <Img src={logo} style={{ width: "82%", height: "82%", objectFit: "contain" }} /> : <span style={{ color: "white", fontSize: compact ? 34 : 50, fontWeight: 900 }}>{initials}</span>}
      </div>
      <div>
        <div style={{ fontSize: compact ? 42 : 58, fontWeight: 880, color: theme.ink, letterSpacing: 0 }}>{payload.brand.name}</div>
        {!compact ? <div style={{ fontSize: 25, color: theme.muted, marginTop: 9 }}>Software para vender mejor</div> : null}
      </div>
    </div>
  );
}

function KineticText({ children, start, size = 70, maxWidth = 850 }: { children: React.ReactNode; start: number; size?: number; maxWidth?: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ opacity: clampEase(frame, [start, start + 16], [0, 1]), transform: `translateY(${clampEase(frame, [start, start + 24], [44, 0])}px)`, fontSize: size, lineHeight: 1.04, color: theme.ink, fontWeight: 880, letterSpacing: 0, maxWidth }}>
      {children}
    </div>
  );
}

function SupportText({ children, start }: { children: React.ReactNode; start: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ opacity: clampEase(frame, [start, start + 18], [0, 1]), transform: `translateY(${clampEase(frame, [start, start + 22], [24, 0])}px)`, color: theme.muted, fontSize: 31, lineHeight: 1.28, maxWidth: 780 }}>
      {children}
    </div>
  );
}

function PlaceholderScreen({ type }: { type: AssetType }) {
  const title: Record<string, string> = {
    billing: "Facturación",
    products: "Inventario",
    mobile: "Móvil",
    reports: "Reportes",
    additional: "Video Studio",
    logo: "Marca"
  };
  return (
    <div style={{ width: "100%", height: "100%", background: "#fbfdff", color: theme.ink }}>
      <div style={{ height: 76, background: theme.navy, color: "#fff", display: "flex", alignItems: "center", padding: "0 28px", gap: 14 }}>
        <strong style={{ fontSize: 23 }}>Video Studio</strong>
        <span style={{ opacity: 0.72, fontSize: 18 }}>{title[type]}</span>
      </div>
      <div style={{ padding: 28, display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 16 }}>
          <div style={{ height: 88, borderRadius: 14, background: "#e9f2ff" }} />
          <div style={{ height: 88, borderRadius: 14, background: "#e7fbff" }} />
        </div>
        {Array.from({ length: type === "mobile" ? 11 : 8 }).map((_, index) => (
          <div key={index} style={{ height: type === "mobile" ? 44 : 56, borderRadius: 12, background: index % 4 === 0 ? "#eaf4ff" : "#f3f7fc", border: "1px solid #dfe9f4" }} />
        ))}
      </div>
    </div>
  );
}

function sceneTuning(payload: RenderPayload, key: SceneKey) {
  return {
    scale: payload.scenes?.[key]?.scale ?? 1,
    x: payload.scenes?.[key]?.x ?? 0,
    y: payload.scenes?.[key]?.y ?? 0,
    fit: payload.scenes?.[key]?.fit ?? "cover"
  };
}

function Screenshot({ src, type, fit = "contain", scale = 1, x = 0, y = 0 }: { src?: string; type: AssetType; fit?: "contain" | "cover"; scale?: number; x?: number; y?: number }) {
  if (src) {
    return <Img src={src} style={{ width: "100%", height: "100%", objectFit: fit, objectPosition: "center top", background: "#f8fbff", transform: `translate(${x}px, ${y}px) scale(${scale})`, transformOrigin: "center top" }} />;
  }
  return <PlaceholderScreen type={type} />;
}

function DesktopMockup({ src, type, pan = 0, tuning }: { src?: string; type: AssetType; pan?: number; tuning?: ReturnType<typeof sceneTuning> }) {
  return (
    <div style={{ width: 1000, position: "relative", transformStyle: "preserve-3d" }}>
      <div style={{ height: 650, borderRadius: 34, background: "linear-gradient(145deg, #18263b, #07111f)", padding: 18, boxShadow: "0 60px 150px rgba(9,21,39,.30), 0 18px 35px rgba(20,87,217,.13)", border: "1px solid rgba(255,255,255,.20)", overflow: "hidden", position: "relative" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 22, overflow: "hidden", background: "#fff" }}>
          <div style={{ width: "100%", height: "100%", transform: `translateX(${pan}px) scale(1.01)` }}>
            <Screenshot src={src} type={type} fit={tuning?.fit ?? "cover"} scale={tuning?.scale ?? 1} x={tuning?.x ?? 0} y={tuning?.y ?? 0} />
          </div>
        </div>
        <div style={{ position: "absolute", inset: 18, borderRadius: 22, background: "linear-gradient(115deg, rgba(255,255,255,.26), rgba(255,255,255,0) 38%)", pointerEvents: "none" }} />
      </div>
      <div style={{ width: 210, height: 92, margin: "0 auto", background: "linear-gradient(180deg, #152236, #0a1424)", clipPath: "polygon(26% 0, 74% 0, 92% 100%, 8% 100%)", filter: "drop-shadow(0 28px 35px rgba(9,21,39,.22))" }} />
      <div style={{ width: 430, height: 22, margin: "-2px auto 0", borderRadius: 999, background: "linear-gradient(90deg, #07111f, #22314a, #07111f)", boxShadow: "0 25px 45px rgba(9,21,39,.20)" }} />
    </div>
  );
}

function PhoneMockup({ src, type = "mobile", tuning }: { src?: string; type?: AssetType; tuning?: ReturnType<typeof sceneTuning> }) {
  return (
    <div style={{ width: 475, height: 955, borderRadius: 72, background: "linear-gradient(145deg, #101c2f, #020812)", padding: 17, position: "relative", boxShadow: "0 70px 145px rgba(9,21,39,.34), 0 16px 34px rgba(20,87,217,.18)", border: "1px solid rgba(255,255,255,.24)", overflow: "hidden" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 50, overflow: "hidden", background: "#fff" }}>
        <Screenshot src={src} type={type} fit={tuning?.fit ?? "cover"} scale={tuning?.scale ?? 1} x={tuning?.x ?? 0} y={tuning?.y ?? 0} />
      </div>
      <div style={{ position: "absolute", top: 26, left: "50%", width: 128, height: 30, borderRadius: 999, transform: "translateX(-50%)", background: "#060b13" }} />
      <div style={{ position: "absolute", inset: 17, borderRadius: 50, background: "linear-gradient(110deg, rgba(255,255,255,.22), rgba(255,255,255,0) 34%)", pointerEvents: "none" }} />
    </div>
  );
}

function Scene({ start, end, children }: { start: number; end: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={sceneStyle(frame, start, end)}>{children}</AbsoluteFill>;
}

function DesktopHero({ payload, type, title, start, end, pan = false }: TemplateProps & { type: AssetType; title: string; start: number; end: number; pan?: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = entrance(frame, start + 2, fps);
  const tuning = sceneTuning(payload, type as SceneKey);
  const motion = motionConfig(payload);
  const internalPan = pan ? interpolate(frame, [start + 18, end - 20], [-20, 22], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }) : 0;
  return (
    <Scene start={start} end={end}>
      <CameraPush start={start} end={end} amount={motion.push}>
      <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 40 }}>
        <KineticText start={start + 6} size={68}>{title}</KineticText>
        <DepthLayer z={60 * motion.depth}>
        <MaskReveal start={start + 4}>
        <div style={{ position: "relative", transform: `translateY(${interpolate(enter, [0, 1], [110, 0]) + float(frame, motion.float, 58)}px) scale(${interpolate(enter, [0, 1], [0.91, 1])}) perspective(1400px) rotateX(2deg) rotateY(-3deg)`, transformOrigin: "center" }}>
          <DesktopMockup src={payload.assets[type]} type={type} pan={internalPan} tuning={tuning} />
          <LightSweep delay={start + 20} />
        </div>
        </MaskReveal>
        </DepthLayer>
      </div>
      </CameraPush>
      <SceneTransition start={start + 2} direction={1} />
    </Scene>
  );
}

function MobileHero({ payload, start, end }: TemplateProps & { start: number; end: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = entrance(frame, start + 3, fps);
  const tuning = sceneTuning(payload, "mobile");
  const motion = motionConfig(payload);
  const vt = visualTheme(payload);
  return (
    <Scene start={start} end={end}>
      <div style={{ height: "100%", display: "grid", gridTemplateRows: "auto 1fr", gap: 38 }}>
        <div>
          <KineticText start={start + 6} size={68}>Tu negocio en tu móvil</KineticText>
          <SupportText start={start + 18}>Consulta ventas y controla tu operación desde cualquier lugar.</SupportText>
        </div>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <SoftGlow color={vt.glow} />
          <div style={{ position: "absolute", width: 620, height: 620, borderRadius: 90, background: "rgba(20,87,217,.08)", transform: "rotate(-12deg)" }} />
          <ParallaxGroup drift={10 * motion.depth}>
          <BlurReveal start={start + 4}>
          <div style={{ position: "relative", transform: `translate(${interpolate(enter, [0, 1], [170, 0])}px, ${interpolate(enter, [0, 1], [210, 0]) + float(frame, motion.float, 46)}px) rotate(${interpolate(enter, [0, 1], [10, -3])}deg) scale(${cameraPush(frame, start, end, motion.push)})` }}>
            <PhoneMockup src={payload.assets.mobile} tuning={tuning} />
            <LightSweep delay={start + 18} opacity={0.2} />
          </div>
          </BlurReveal>
          </ParallaxGroup>
        </div>
      </div>
    </Scene>
  );
}

function MultiDevice({ payload, start, end }: TemplateProps & { start: number; end: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = entrance(frame, start + 2, fps);
  const desktopTuning = sceneTuning(payload, "devices");
  const mobileTuning = sceneTuning(payload, "mobile");
  const motion = motionConfig(payload);
  return (
    <Scene start={start} end={end}>
      <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 52 }}>
        <KineticText start={start + 2} size={62}>PC · Android · iPhone</KineticText>
        <div style={{ height: 760, position: "relative", transform: `translateY(${interpolate(enter, [0, 1], [80, 0]) + float(frame, motion.float * 0.45, 70)}px)` }}>
          <div style={{ position: "absolute", left: -118, top: 86, transform: "scale(.84) perspective(1200px) rotateY(5deg)" }}>
            <DesktopMockup src={payload.assets.billing} type="billing" tuning={desktopTuning} />
          </div>
          <div style={{ position: "absolute", right: -8, top: 2, transform: "scale(.77) rotate(4deg)" }}>
            <PhoneMockup src={payload.assets.mobile} tuning={mobileTuning} />
          </div>
          <div style={{ position: "absolute", right: 260, top: 165, transform: "scale(.58) rotate(-6deg)", opacity: 0.96 }}>
            <PhoneMockup src={payload.assets.products} type="products" tuning={sceneTuning(payload, "products")} />
          </div>
        </div>
      </div>
    </Scene>
  );
}

function AudioLayer({ payload }: TemplateProps) {
  const audio = payload.audio;
  const { durationInFrames, fps } = useVideoConfig();
  if (!audio) return null;
  const voiceStart = Math.round((audio.voiceStartSeconds ?? 0.4) * fps);
  const musicBase = audio.musicVolume ?? 0.2;
  const musicVolume = (currentFrame: number) => {
    const fadeIn = interpolate(currentFrame, [0, fps * 1.2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const fadeOut = interpolate(currentFrame, [durationInFrames - fps * 2.2, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const duck = audio.voiceoverEnabled && audio.voiceOverPath && currentFrame >= voiceStart && currentFrame <= durationInFrames - fps * 2 ? 0.62 : 1;
    return musicBase * fadeIn * fadeOut * duck;
  };
  return (
    <>
      {audio.musicEnabled && audio.musicPath ? <Audio src={audio.musicPath} volume={musicVolume} /> : null}
      {audio.voiceoverEnabled && audio.voiceOverPath ? (
        <Sequence from={voiceStart}>
          <Audio src={audio.voiceOverPath} volume={audio.voiceVolume ?? 1} />
        </Sequence>
      ) : null}
    </>
  );
}

function CTA({ payload, start, end }: TemplateProps & { start: number; end: number }) {
  const frame = useCurrentFrame();
  return (
    <Scene start={start} end={end}>
      <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 54, transform: `scale(${cameraPush(frame, start, end, 0.025)})` }}>
        <BrandMark payload={payload} compact />
        <div style={{ display: "grid", gap: 18 }}>
          <div style={{ fontSize: 92, lineHeight: 1, fontWeight: 930, color: theme.blue, letterSpacing: 0 }}>{payload.brand.offer}</div>
          <div style={{ fontSize: 50, fontWeight: 850, color: theme.ink }}>{payload.brand.price}</div>
          <div style={{ fontSize: 34, color: theme.muted }}>{payload.brand.website}</div>
        </div>
      </div>
    </Scene>
  );
}

export function FullPOSPremiumVertical({ payload }: RootTemplateProps) {
  const safePayload = payload ?? defaultRenderPayload;
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const sceneScale = durationInFrames / 900;
  const globalZoom = interpolate(frame, [0, durationInFrames], [1, 1.035], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const at = (frameNumber: number) => Math.round(frameNumber * sceneScale);
  const useHybrid = safePayload.visual?.aiSceneMode === "hybrid" && Boolean(safePayload.visual?.aiBackgroundVideoPath || safePayload.visual?.aiBackgroundImagePath);

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: theme.panel }}>
      <PremiumBackground payload={safePayload} />
      <AudioLayer payload={safePayload} />
      <AbsoluteFill style={{ transform: `scale(${globalZoom})` }}>
        <Scene start={0} end={at(90)}>
          <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 48 }}>
            <BrandMark payload={safePayload} />
            <KineticText start={8} size={76}>{safePayload.brand.headline}</KineticText>
          </div>
        </Scene>
        {useHybrid ? (
          <Sequence from={at(90)} durationInFrames={at(295) - at(90)}>
            <HybridDesktopHero payload={safePayload} type="billing" title="Factura rápido" />
          </Sequence>
        ) : <DesktopHero payload={safePayload} type="billing" title="Factura rápido" start={at(90)} end={at(295)} />}
        <DesktopHero payload={safePayload} type="products" title="Inventario bajo control" start={at(295)} end={at(435)} pan />
        {useHybrid ? (
          <Sequence from={at(435)} durationInFrames={at(610) - at(435)}>
            <HybridReportsHero payload={safePayload} />
          </Sequence>
        ) : <DesktopHero payload={safePayload} type="reports" title="Decide con información" start={at(435)} end={at(610)} />}
        {useHybrid ? (
          <Sequence from={at(610)} durationInFrames={at(765) - at(610)}>
            <HybridMobileHero payload={safePayload} />
          </Sequence>
        ) : <MobileHero payload={safePayload} start={at(610)} end={at(765)} />}
        {useHybrid ? (
          <Sequence from={at(765)} durationInFrames={at(840) - at(765)}>
            <HybridMultiDeviceHero payload={safePayload} />
          </Sequence>
        ) : <MultiDevice payload={safePayload} start={at(765)} end={at(840)} />}
        <CTA payload={safePayload} start={at(840)} end={durationInFrames} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
