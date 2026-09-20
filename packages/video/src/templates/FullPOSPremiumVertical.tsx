import React from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import type { AssetType, RenderPayload } from "@fullpos-ad-studio/shared";
import { defaultRenderPayload } from "../payload.js";

const theme = {
  ink: "#111d2f",
  muted: "#5d718a",
  blue: "#1457d9",
  cyan: "#11a8c9",
  navy: "#091527",
  panel: "#f8fbff"
};

const safe = { top: 170, side: 86, bottom: 230 };

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

function sceneStyle(frame: number, start: number, end: number): React.CSSProperties {
  return {
    opacity: fadeScene(frame, start, end),
    padding: `${safe.top}px ${safe.side}px ${safe.bottom}px`,
    fontFamily: "Inter, Segoe UI, Arial, Helvetica, sans-serif"
  };
}

function PremiumBackground() {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 120) * 18;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(155deg, #f7fbff 0%, #edf5ff 45%, #ffffff 100%)" }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 22% 16%, rgba(17,168,201,.22), transparent 30%), radial-gradient(circle at 78% 18%, rgba(20,87,217,.17), transparent 34%), radial-gradient(circle at 52% 80%, rgba(8,21,39,.10), transparent 38%)"
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
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 18 : 24 }}>
      <div style={{ width: size, height: size, borderRadius: compact ? 22 : 32, background: logo ? "#fff" : `linear-gradient(135deg, ${theme.blue}, ${theme.cyan})`, boxShadow: "0 34px 90px rgba(20,87,217,.24)", display: "grid", placeItems: "center", overflow: "hidden", border: "1px solid rgba(255,255,255,.8)" }}>
        {logo ? <Img src={logo} style={{ width: "82%", height: "82%", objectFit: "contain" }} /> : <span style={{ color: "white", fontSize: compact ? 34 : 50, fontWeight: 900 }}>FP</span>}
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
    additional: "FullPOS",
    logo: "FullPOS"
  };
  return (
    <div style={{ width: "100%", height: "100%", background: "#fbfdff", color: theme.ink }}>
      <div style={{ height: 76, background: theme.navy, color: "#fff", display: "flex", alignItems: "center", padding: "0 28px", gap: 14 }}>
        <strong style={{ fontSize: 23 }}>FullPOS Cloud</strong>
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

function Screenshot({ src, type, fit = "contain" }: { src?: string; type: AssetType; fit?: "contain" | "cover" }) {
  if (src) {
    return <Img src={src} style={{ width: "100%", height: "100%", objectFit: fit, background: "#f8fbff" }} />;
  }
  return <PlaceholderScreen type={type} />;
}

function DesktopMockup({ src, type, pan = 0 }: { src?: string; type: AssetType; pan?: number }) {
  return (
    <div style={{ width: 920, position: "relative", transformStyle: "preserve-3d" }}>
      <div style={{ height: 600, borderRadius: 34, background: "linear-gradient(145deg, #18263b, #07111f)", padding: 18, boxShadow: "0 60px 150px rgba(9,21,39,.30), 0 18px 35px rgba(20,87,217,.13)", border: "1px solid rgba(255,255,255,.20)", overflow: "hidden", position: "relative" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 22, overflow: "hidden", background: "#fff" }}>
          <div style={{ width: "100%", height: "100%", transform: `translateX(${pan}px) scale(1.01)` }}>
            <Screenshot src={src} type={type} fit="contain" />
          </div>
        </div>
        <div style={{ position: "absolute", inset: 18, borderRadius: 22, background: "linear-gradient(115deg, rgba(255,255,255,.26), rgba(255,255,255,0) 38%)", pointerEvents: "none" }} />
      </div>
      <div style={{ width: 210, height: 92, margin: "0 auto", background: "linear-gradient(180deg, #152236, #0a1424)", clipPath: "polygon(26% 0, 74% 0, 92% 100%, 8% 100%)", filter: "drop-shadow(0 28px 35px rgba(9,21,39,.22))" }} />
      <div style={{ width: 430, height: 22, margin: "-2px auto 0", borderRadius: 999, background: "linear-gradient(90deg, #07111f, #22314a, #07111f)", boxShadow: "0 25px 45px rgba(9,21,39,.20)" }} />
    </div>
  );
}

function PhoneMockup({ src, type = "mobile" }: { src?: string; type?: AssetType }) {
  return (
    <div style={{ width: 430, height: 875, borderRadius: 66, background: "linear-gradient(145deg, #101c2f, #020812)", padding: 17, position: "relative", boxShadow: "0 70px 145px rgba(9,21,39,.34), 0 16px 34px rgba(20,87,217,.18)", border: "1px solid rgba(255,255,255,.24)", overflow: "hidden" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 50, overflow: "hidden", background: "#fff" }}>
        <Screenshot src={src} type={type} fit="contain" />
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
  const internalPan = pan ? interpolate(frame, [start + 18, end - 20], [-20, 22], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }) : 0;
  return (
    <Scene start={start} end={end}>
      <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 48, transform: `scale(${cameraPush(frame, start, end, 0.045)})` }}>
        <KineticText start={start + 6} size={68}>{title}</KineticText>
        <div style={{ transform: `translateY(${interpolate(enter, [0, 1], [110, 0]) + float(frame, 5, 58)}px) scale(${interpolate(enter, [0, 1], [0.91, 1])}) perspective(1400px) rotateX(2deg) rotateY(-3deg)`, transformOrigin: "center" }}>
          <DesktopMockup src={payload.assets[type]} type={type} pan={internalPan} />
        </div>
      </div>
    </Scene>
  );
}

function MobileHero({ payload, start, end }: TemplateProps & { start: number; end: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = entrance(frame, start + 3, fps);
  return (
    <Scene start={start} end={end}>
      <div style={{ height: "100%", display: "grid", gridTemplateRows: "auto 1fr", gap: 38 }}>
        <div>
          <KineticText start={start + 6} size={68}>Tu negocio en tu móvil</KineticText>
          <SupportText start={start + 18}>Consulta ventas y controla tu operación desde cualquier lugar.</SupportText>
        </div>
        <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", width: 620, height: 620, borderRadius: 90, background: "rgba(20,87,217,.08)", transform: "rotate(-12deg)" }} />
          <div style={{ transform: `translate(${interpolate(enter, [0, 1], [170, 0])}px, ${interpolate(enter, [0, 1], [210, 0]) + float(frame, 7, 46)}px) rotate(${interpolate(enter, [0, 1], [10, -3])}deg) scale(${cameraPush(frame, start, end, 0.035)})` }}>
            <PhoneMockup src={payload.assets.mobile} />
          </div>
        </div>
      </div>
    </Scene>
  );
}

function MultiDevice({ payload, start, end }: TemplateProps & { start: number; end: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = entrance(frame, start + 2, fps);
  return (
    <Scene start={start} end={end}>
      <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 52 }}>
        <KineticText start={start + 2} size={62}>PC · Android · iPhone</KineticText>
        <div style={{ height: 760, position: "relative", transform: `translateY(${interpolate(enter, [0, 1], [80, 0])}px)` }}>
          <div style={{ position: "absolute", left: -80, top: 92, transform: "scale(.76) perspective(1200px) rotateY(5deg)" }}>
            <DesktopMockup src={payload.assets.billing} type="billing" />
          </div>
          <div style={{ position: "absolute", right: 22, top: 16, transform: "scale(.74) rotate(4deg)" }}>
            <PhoneMockup src={payload.assets.mobile} />
          </div>
          <div style={{ position: "absolute", right: 245, top: 155, transform: "scale(.55) rotate(-6deg)", opacity: 0.96 }}>
            <PhoneMockup src={payload.assets.products} type="products" />
          </div>
        </div>
      </div>
    </Scene>
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
  const globalZoom = interpolate(frame, [0, durationInFrames], [1, 1.035], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: theme.panel }}>
      <PremiumBackground />
      <AbsoluteFill style={{ transform: `scale(${globalZoom})` }}>
        <Scene start={0} end={90}>
          <div style={{ height: "100%", display: "grid", alignContent: "center", gap: 48 }}>
            <BrandMark payload={safePayload} />
            <KineticText start={8} size={76}>{safePayload.brand.headline}</KineticText>
          </div>
        </Scene>
        <DesktopHero payload={safePayload} type="billing" title="Factura rápido" start={90} end={240} />
        <DesktopHero payload={safePayload} type="products" title="Inventario bajo control" start={240} end={330} pan />
        <MobileHero payload={safePayload} start={330} end={480} />
        <DesktopHero payload={safePayload} type="reports" title="Decide con información" start={480} end={600} />
        <MultiDevice payload={safePayload} start={600} end={675} />
        <CTA payload={safePayload} start={675} end={750} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
