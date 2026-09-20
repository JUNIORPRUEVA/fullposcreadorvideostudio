import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, Sequence, useCurrentFrame } from "remotion";
import type { RenderPayload, VideoScene } from "@fullpos-ad-studio/shared";
import { defaultRenderPayload } from "../payload.js";

const ink = "#0b1728";
const blue = "#1457d9";
const cyan = "#10a8c9";

function ease(frame: number, input: [number, number], output: [number, number]) {
  return interpolate(frame, input, output, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
}

function sceneAt(payload: RenderPayload) {
  return payload.scenesList?.length ? payload.scenesList : quickTutorialScenes(payload.projectId);
}

function quickTutorialScenes(projectId: string): VideoScene[] {
  return [
    { id: "intro", projectId, type: "TITLE", order: 1, title: "Cómo registrar una venta", duration: 2, narrationScript: "Aprende a registrar una venta rápidamente." },
    { id: "buscar", projectId, type: "SCREENSHOT", order: 2, title: "Busca el producto", duration: 6, narrationScript: "Busca el producto que deseas vender.", animation: { callouts: [{ type: "TextCallout", label: "Buscar productos", x: 360, y: 520, width: 360, height: 76, at: 0.8 }] } },
    { id: "agregar", projectId, type: "CALLOUT", order: 3, title: "Agrega al ticket", duration: 6, narrationScript: "Pulsa el botón agregar.", animation: { callouts: [{ type: "CircleCallout", label: "1", x: 730, y: 920, width: 76, height: 76, at: 0.4 }] } },
    { id: "cobrar", projectId, type: "SUMMARY", order: 4, title: "Pulsa cobrar", duration: 5, narrationScript: "Revisa el total y pulsa cobrar.", animation: { callouts: [{ type: "HighlightBox", label: "Cobrar", x: 350, y: 1510, width: 480, height: 95, at: 0.2 }] } }
  ];
}

function courseScenes(projectId: string): VideoScene[] {
  return [
    { id: "intro", projectId, type: "BRAND_INTRO", order: 1, chapter: "Introducción", title: "Curso", duration: 4, narrationScript: "En este curso aprenderás el proceso paso a paso." },
    { id: "billing", projectId, type: "SCREENSHOT", order: 2, chapter: "Facturación", title: "Abrir facturación", duration: 7, narrationScript: "Abre el módulo de facturación.", animation: { callouts: [{ type: "StepBadge", label: "1", x: 1160, y: 215, width: 52, height: 52, at: 0.7 }] } },
    { id: "product", projectId, type: "CALLOUT", order: 3, chapter: "Facturación", title: "Buscar producto", duration: 7, narrationScript: "Localiza el producto y agrégalo al ticket.", animation: { callouts: [{ type: "ArrowCallout", label: "Selecciona el producto", x: 960, y: 500, width: 330, height: 90, at: 0.5 }] } }
  ];
}

function BrandBug({ payload }: { payload: RenderPayload }) {
  const primary = payload.brandProfile?.primaryColor ?? blue;
  const secondary = payload.brandProfile?.secondaryColor ?? cyan;
  return (
    <div style={{ position: "absolute", left: 36, bottom: 28, display: "flex", alignItems: "center", gap: 12, fontFamily: "Inter, Segoe UI, Arial" }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, display: "grid", placeItems: "center", color: "white", fontWeight: 900, background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>{initialsFor(payload.brand.name)}</div>
      <div style={{ color: ink, fontWeight: 800, fontSize: 19 }}>{payload.brand.name}</div>
    </div>
  );
}

function Subtitle({ text }: { text?: string }) {
  if (!text) return null;
  return <div style={{ position: "absolute", left: "10%", right: "10%", bottom: 88, textAlign: "center", background: "rgba(8,18,32,.78)", color: "white", borderRadius: 12, padding: "12px 18px", fontFamily: "Inter, Segoe UI, Arial", fontSize: 24, lineHeight: 1.25 }}>{text}</div>;
}

function CalloutLayer({ scene, width = 1080, height = 1920 }: { scene: VideoScene; width?: number; height?: number }) {
  const frame = useCurrentFrame();
  const fps = 30;
  return (
    <>
      {(scene.animation?.callouts ?? []).map((callout, index) => {
        const start = (callout.at ?? 0) * fps;
        const opacity = ease(frame, [start, start + 12], [0, 1]);
        const scale = ease(frame, [start, start + 14], [0.94, 1]);
        const left = (callout.x / width) * 100;
        const top = (callout.y / height) * 100;
        const w = callout.width ?? 220;
        const h = callout.height ?? 74;
        if (callout.type === "CircleCallout" || callout.type === "StepBadge" || callout.type === "CursorPulse") {
          return <div key={index} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: w, height: h, borderRadius: 999, display: "grid", placeItems: "center", color: "white", fontSize: 28, fontWeight: 900, background: blue, boxShadow: "0 14px 40px rgba(20,87,217,.35)", transform: `translate(-50%, -50%) scale(${scale})`, opacity }}>{callout.label ?? "1"}</div>;
        }
        if (callout.type === "HighlightBox") {
          return <div key={index} style={{ position: "absolute", left: callout.x, top: callout.y, width: w, height: h, borderRadius: 18, border: "5px solid rgba(20,87,217,.92)", boxShadow: "0 0 0 8px rgba(20,87,217,.12)", opacity, transform: `scale(${scale})` }} />;
        }
        return <div key={index} style={{ position: "absolute", left: callout.x, top: callout.y, maxWidth: w, borderRadius: 14, background: "#ffffff", color: ink, padding: "16px 18px", fontFamily: "Inter, Segoe UI, Arial", fontSize: 23, fontWeight: 820, boxShadow: "0 22px 60px rgba(8,18,32,.20)", opacity, transform: `scale(${scale})` }}>{callout.label}</div>;
      })}
    </>
  );
}

function ScreenSurface({ payload, scene, mode }: { payload: RenderPayload; scene: VideoScene; mode: "vertical" | "course" }) {
  const frame = useCurrentFrame();
  const src = payload.assets.mobile ?? payload.assets.billing ?? payload.assets.screen_recording ?? payload.assets.additional;
  const zoom = scene.animation?.focus?.length ? ease(frame, [0, 90], [1, scene.animation.focus[0]?.scale ?? 1.15]) : ease(frame, [20, 130], [1, mode === "vertical" ? 1.08 : 1.05]);
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: mode === "vertical" ? 56 : 18, background: "#fff" }}>
      {src ? <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", transform: `scale(${zoom})`, transformOrigin: "center 35%" }} /> : <div style={{ width: "100%", height: "100%", background: "#eef6ff" }} />}
      <CalloutLayer scene={scene} width={mode === "vertical" ? 1080 : 1920} height={mode === "vertical" ? 1920 : 1080} />
    </div>
  );
}

export function QuickTutorialTemplate({ payload }: { payload?: RenderPayload }) {
  const safePayload = payload ?? { ...defaultRenderPayload, template: "quick-tutorial" as const, videoType: "QUICK_TUTORIAL" as const };
  const scenes = sceneAt(safePayload);
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #edf6ff, #ffffff)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 75% 12%, rgba(20,87,217,.18), transparent 36%)" }} />
      {scenes.map((scene, index) => {
        const from = Math.round(scenes.slice(0, index).reduce((sum, item) => sum + item.duration, 0) * 30);
        return (
          <Sequence key={scene.id} from={from} durationInFrames={Math.round(scene.duration * 30)}>
            <div style={{ position: "absolute", left: 86, right: 86, top: 98, fontFamily: "Inter, Segoe UI, Arial" }}>
              <div style={{ fontSize: 58, lineHeight: 1.02, fontWeight: 900, color: ink }}>{scene.title}</div>
            </div>
            <div style={{ position: "absolute", left: 172, top: 330, width: 736, height: 1320, borderRadius: 74, padding: 16, background: "linear-gradient(145deg, #101b2e, #030711)", boxShadow: "0 80px 180px rgba(5,14,29,.35)" }}>
              <ScreenSurface payload={safePayload} scene={scene} mode="vertical" />
            </div>
            <Subtitle text={safePayload.subtitleMode === "AUTO_FROM_NARRATION" ? scene.narrationScript : undefined} />
          </Sequence>
        );
      })}
      <BrandBug payload={safePayload} />
      <div style={{ position: "absolute", right: 42, bottom: 34, fontFamily: "Inter, Segoe UI, Arial", color: "#667992", fontSize: 20 }}>{Math.floor(frame / 30) + 1}s</div>
    </AbsoluteFill>
  );
}

export function ProfessionalCourseTemplate({ payload }: { payload?: RenderPayload }) {
  const safePayload = payload ?? { ...defaultRenderPayload, template: "professional-course" as const, videoType: "COURSE" as const };
  const scenes = safePayload.scenesList?.length ? safePayload.scenesList : courseScenes(safePayload.projectId);
  return (
    <AbsoluteFill style={{ background: "#f4f8fd", overflow: "hidden", fontFamily: "Inter, Segoe UI, Arial" }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 76, background: "#ffffff", borderBottom: "1px solid #d8e5f4", display: "flex", alignItems: "center", padding: "0 34px", gap: 18 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", color: "white", fontWeight: 900, background: `linear-gradient(135deg, ${safePayload.brandProfile?.primaryColor ?? blue}, ${safePayload.brandProfile?.secondaryColor ?? cyan})` }}>{initialsFor(safePayload.brand.name)}</div>
        <strong style={{ color: ink, fontSize: 21 }}>{safePayload.brand.name}</strong>
        <span style={{ color: "#60758d", fontSize: 18 }}>Curso / Capacitación</span>
      </div>
      {scenes.map((scene, index) => {
        const from = Math.round(scenes.slice(0, index).reduce((sum, item) => sum + item.duration, 0) * 30);
        return (
          <Sequence key={scene.id} from={from} durationInFrames={Math.round(scene.duration * 30)}>
            <div style={{ position: "absolute", left: 58, top: 116, width: 360, color: ink }}>
              <div style={{ fontSize: 18, color: blue, fontWeight: 820 }}>{scene.chapter ?? `Capítulo ${index + 1}`}</div>
              <div style={{ marginTop: 10, fontSize: 42, lineHeight: 1.05, fontWeight: 900 }}>{scene.title}</div>
              <p style={{ marginTop: 18, color: "#60758d", fontSize: 22, lineHeight: 1.36 }}>{scene.narrationScript}</p>
            </div>
            <div style={{ position: "absolute", right: 58, top: 116, width: 1390, height: 782, borderRadius: 24, background: "#ffffff", padding: 14, boxShadow: "0 40px 110px rgba(8,18,32,.14)", border: "1px solid #dbe7f5" }}>
              <ScreenSurface payload={safePayload} scene={scene} mode="course" />
            </div>
            <Subtitle text={safePayload.subtitleMode === "AUTO_FROM_NARRATION" ? scene.narrationScript : undefined} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

function initialsFor(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VS";
}
