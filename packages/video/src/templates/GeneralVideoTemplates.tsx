import React from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { CustomSubtitleCue, RenderPayload, VideoScene } from "@fullpos-ad-studio/shared";
import { defaultRenderPayload } from "../payload.js";

const ink = "#0b1728";
const blue = "#1457d9";
const cyan = "#10a8c9";

function ease(frame: number, input: [number, number], output: [number, number]) {
  return interpolate(frame, input, output, { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
}

function scenesFor(payload: RenderPayload, mode: "tutorial" | "course") {
  return payload.scenesList?.length ? payload.scenesList : mode === "course" ? courseScenes(payload.projectId) : quickTutorialScenes(payload.projectId);
}

function quickTutorialScenes(projectId: string): VideoScene[] {
  return [
    { id: "intro", projectId, type: "TITLE", order: 1, title: "Cómo registrar una venta", duration: 3, narrationScript: "Aprende a registrar una venta rápidamente." },
    { id: "buscar", projectId, type: "SCREENSHOT", order: 2, title: "Busca el producto", duration: 8, narrationScript: "Busca el producto que deseas vender.", animation: { focus: [{ timeSeconds: 0, x: 0.5, y: 0.5, scale: 1 }, { timeSeconds: 2, x: 0.55, y: 0.35, scale: 1.55 }, { timeSeconds: 6, x: 0.55, y: 0.35, scale: 1.55 }], callouts: [{ type: "TextCallout", label: "Buscar productos", x: 360, y: 520, width: 360, height: 76, startTime: 1, endTime: 6 }] } },
    { id: "agregar", projectId, type: "CALLOUT", order: 3, title: "Agrega al ticket", duration: 8, narrationScript: "Pulsa el botón agregar.", animation: { callouts: [{ type: "ArrowCallout", label: "Agregar", x: 700, y: 850, startX: 320, startY: 620, endX: 700, endY: 850, width: 76, height: 76, startTime: 1, endTime: 6 }, { type: "CursorPulse", label: "Click", x: 700, y: 850, startTime: 3, endTime: 4.4 }] } },
    { id: "cobrar", projectId, type: "SUMMARY", order: 4, title: "Pulsa cobrar", duration: 6, narrationScript: "Revisa el total y pulsa cobrar.", animation: { callouts: [{ type: "HighlightBox", label: "Cobrar", x: 350, y: 1510, width: 480, height: 95, startTime: 1, endTime: 5, style: "soft-glow", animation: "pulse-once" }] } }
  ];
}

function courseScenes(projectId: string): VideoScene[] {
  return [
    { id: "intro", projectId, type: "BRAND_INTRO", order: 1, chapter: "Introducción", title: "Curso", duration: 4, narrationScript: "En este curso aprenderás el proceso paso a paso." },
    { id: "chapter-1", projectId, type: "CHAPTER", order: 2, chapter: "Capítulo 1", title: "Facturación", duration: 3, chapterTitleEnabled: true },
    { id: "billing", projectId, type: "SCREENSHOT", order: 3, chapter: "Facturación", title: "Abrir facturación", duration: 9, narrationScript: "Abre el módulo de facturación.", animation: { callouts: [{ type: "StepBadge", label: "1", x: 1160, y: 215, width: 52, height: 52, startTime: 1, endTime: 6 }] } },
    { id: "product", projectId, type: "CALLOUT", order: 4, chapter: "Facturación", title: "Buscar producto", duration: 9, narrationScript: "Localiza el producto y agrégalo al ticket.", animation: { callouts: [{ type: "ArrowCallout", label: "Selecciona el producto", x: 960, y: 500, startX: 650, startY: 390, endX: 960, endY: 500, width: 330, height: 90, startTime: 1, endTime: 7 }] } },
    { id: "outro", projectId, type: "BRAND_OUTRO", order: 5, title: "Resumen", duration: 4, narrationScript: "Continúa con el siguiente módulo." }
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

function titleCardStyle(payload: RenderPayload): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: 80,
    background: `linear-gradient(135deg, ${payload.brandProfile?.backgroundColor ?? "#f4f8fd"}, #ffffff)`,
    color: payload.brandProfile?.textColor ?? ink,
    fontFamily: `${payload.brandProfile?.fontHeading ?? "Inter"}, Segoe UI, Arial`
  };
}

function BrandIntro({ payload, scene }: { payload: RenderPayload; scene: VideoScene }) {
  return (
    <div style={titleCardStyle(payload)}>
      <div style={{ textAlign: "center", display: "grid", gap: 22 }}>
        <div style={{ margin: "0 auto", width: 118, height: 118, borderRadius: 28, display: "grid", placeItems: "center", color: "white", fontSize: 44, fontWeight: 900, background: `linear-gradient(135deg, ${payload.brandProfile?.primaryColor ?? blue}, ${payload.brandProfile?.secondaryColor ?? cyan})` }}>{initialsFor(payload.brand.name)}</div>
        <div style={{ fontSize: 62, fontWeight: 900 }}>{scene.title || payload.brand.name}</div>
        <div style={{ fontSize: 28, color: "#60758d" }}>{payload.brand.headline}</div>
      </div>
    </div>
  );
}

function BrandOutro({ payload, scene }: { payload: RenderPayload; scene: VideoScene }) {
  return (
    <div style={titleCardStyle(payload)}>
      <div style={{ textAlign: "center", display: "grid", gap: 20 }}>
        <div style={{ fontSize: 66, fontWeight: 900 }}>{payload.brand.name}</div>
        <div style={{ fontSize: 34, color: payload.brandProfile?.primaryColor ?? blue }}>{payload.brandProfile?.defaultCTA ?? scene.narrationScript ?? "Continúa con el siguiente módulo"}</div>
        <div style={{ fontSize: 26, color: "#60758d" }}>{payload.brand.website}</div>
      </div>
    </div>
  );
}

function ChapterCard({ payload, scene, index }: { payload: RenderPayload; scene: VideoScene; index: number }) {
  return (
    <div style={titleCardStyle(payload)}>
      <div style={{ width: "80%", display: "grid", gap: 18 }}>
        <div style={{ color: payload.brandProfile?.primaryColor ?? blue, fontSize: 28, fontWeight: 900, textTransform: "uppercase" }}>{scene.chapter ?? `Capítulo ${index + 1}`}</div>
        <div style={{ fontSize: 72, lineHeight: 1.02, fontWeight: 930 }}>{scene.title}</div>
      </div>
    </div>
  );
}

function sceneAsset(payload: RenderPayload, scene: VideoScene) {
  const key = scene.mediaAssetId as keyof RenderPayload["assets"] | undefined;
  if (key && payload.assets[key]) return payload.assets[key];
  if (scene.type === "SCREEN_RECORDING" || scene.type === "VIDEO") return payload.assets.screen_recording ?? payload.assets.video;
  if (scene.type === "IMAGE") return payload.assets.image ?? payload.assets.additional;
  return payload.assets.billing ?? payload.assets.mobile ?? payload.assets.products ?? payload.assets.additional ?? payload.assets.screen_recording;
}

function focusTransform(scene: VideoScene, frame: number, fps: number) {
  const points = [...(scene.animation?.focus ?? [])]
    .map((point) => ({ ...point, timeSeconds: point.timeSeconds ?? point.time ?? 0 }))
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  const base = { x: scene.positionX ?? 0.5, y: scene.positionY ?? 0.5, scale: scene.scale ?? 1 };
  if (!points.length) return base;
  if (points.length === 1) return { x: points[0].x, y: points[0].y, scale: points[0].scale };
  const seconds = frame / fps;
  const times = points.map((point) => point.timeSeconds);
  return {
    x: interpolate(seconds, times, points.map((point) => point.x), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }),
    y: interpolate(seconds, times, points.map((point) => point.y), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }),
    scale: interpolate(seconds, times, points.map((point) => point.scale), { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) })
  };
}

function MediaSurface({ payload, scene, mode }: { payload: RenderPayload; scene: VideoScene; mode: "vertical" | "course" }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = sceneAsset(payload, scene);
  const isVideo = scene.type === "SCREEN_RECORDING" || scene.type === "VIDEO" || String(src ?? "").startsWith("data:video/");
  const focus = focusTransform(scene, frame, fps);
  const crop = scene.crop ?? {};
  const startFrom = Math.max(0, Math.round((scene.trimStartSeconds ?? 0) * fps));
  const endAt = scene.trimEndSeconds ? Math.max(startFrom + 1, Math.round(scene.trimEndSeconds * fps)) : undefined;
  const originX = `${focus.x * 100}%`;
  const originY = `${focus.y * 100}%`;
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", borderRadius: mode === "vertical" ? 56 : 18, background: "#fff" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", clipPath: `inset(${crop.top ?? 0}% ${crop.right ?? 0}% ${crop.bottom ?? 0}% ${crop.left ?? 0}%)` }}>
        {src ? (
          isVideo ? (
            <OffthreadVideo
              src={src}
              startFrom={startFrom}
              endAt={endAt}
              muted={!scene.sourceAudioEnabled}
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", transform: `scale(${focus.scale})`, transformOrigin: `${originX} ${originY}` }}
            />
          ) : (
            <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", transform: `scale(${focus.scale})`, transformOrigin: `${originX} ${originY}` }} />
          )
        ) : <div style={{ width: "100%", height: "100%", background: "#eef6ff" }} />}
      </div>
      <CalloutLayer scene={scene} width={mode === "vertical" ? 1080 : 1920} height={mode === "vertical" ? 1920 : 1080} />
    </div>
  );
}

function isVisible(callout: NonNullable<NonNullable<VideoScene["animation"]>["callouts"]>[number], frame: number, fps: number) {
  const start = callout.startTime ?? callout.at ?? 0;
  const end = callout.endTime ?? start + 3;
  const seconds = frame / fps;
  return seconds >= start && seconds <= end;
}

function calloutOpacity(callout: NonNullable<NonNullable<VideoScene["animation"]>["callouts"]>[number], frame: number, fps: number) {
  const start = (callout.startTime ?? callout.at ?? 0) * fps;
  const end = (callout.endTime ?? ((callout.startTime ?? callout.at ?? 0) + 3)) * fps;
  return Math.min(ease(frame, [start, start + 10], [0, 1]), ease(frame, [end - 10, end], [1, 0]));
}

function CalloutLayer({ scene, width, height }: { scene: VideoScene; width: number; height: number }) {
  const frame = useCurrentFrame();
  const fps = 30;
  return (
    <>
      {(scene.animation?.callouts ?? []).map((callout, index) => {
        if (!isVisible(callout, frame, fps)) return null;
        const opacity = calloutOpacity(callout, frame, fps);
        const scale = callout.animation === "pulse-once" ? 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.035 : ease(frame, [0, 12], [0.98, 1]);
        const left = (callout.x / width) * 100;
        const top = (callout.y / height) * 100;
        const w = callout.width ?? 220;
        const h = callout.height ?? 74;
        if (callout.type === "ArrowCallout") {
          const sx = callout.startX ?? callout.x - 180;
          const sy = callout.startY ?? callout.y - 120;
          const ex = callout.endX ?? callout.x;
          const ey = callout.endY ?? callout.y;
          return (
            <svg key={index} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, opacity, overflow: "visible" }}>
              <defs><marker id={`arrowhead-${scene.id}-${index}`} markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 Z" fill={blue} /></marker></defs>
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={blue} strokeWidth="7" strokeLinecap="round" markerEnd={`url(#arrowhead-${scene.id}-${index})`} />
              {callout.label ? <text x={sx} y={sy - 18} fill={ink} fontSize="32" fontWeight="800" fontFamily="Inter, Segoe UI, Arial">{callout.label}</text> : null}
            </svg>
          );
        }
        if (callout.type === "BlurRegion") {
          return <div key={index} style={{ position: "absolute", left: callout.x, top: callout.y, width: w, height: h, borderRadius: 12, backdropFilter: "blur(14px)", background: "rgba(240,247,255,.55)", opacity }} />;
        }
        if (callout.type === "SpotlightCallout") {
          return (
            <div key={index} style={{ position: "absolute", inset: 0, opacity, background: `radial-gradient(circle at ${left}% ${top}%, transparent 0 ${Math.max(w, h) / 2}px, rgba(5,14,29,.56) ${Math.max(w, h) / 2 + 24}px)` }} />
          );
        }
        if (callout.type === "CircleCallout" || callout.type === "StepBadge" || callout.type === "CursorPulse") {
          const pulse = callout.type === "CursorPulse" ? `0 0 0 ${Math.max(0, Math.sin(frame / 5) * 18)}px rgba(20,87,217,.18), 0 14px 40px rgba(20,87,217,.35)` : "0 14px 40px rgba(20,87,217,.35)";
          return <div key={index} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, width: w, height: h, borderRadius: 999, display: "grid", placeItems: "center", color: "white", fontSize: 28, fontWeight: 900, background: blue, boxShadow: pulse, transform: `translate(-50%, -50%) scale(${scale})`, opacity }}>{callout.label ?? (callout.type === "CursorPulse" ? "" : "1")}</div>;
        }
        if (callout.type === "HighlightBox") {
          const dim = callout.style === "dim-outside";
          return (
            <React.Fragment key={index}>
              {dim ? <div style={{ position: "absolute", inset: 0, background: "rgba(5,14,29,.38)", opacity }} /> : null}
              <div style={{ position: "absolute", left: callout.x, top: callout.y, width: w, height: h, borderRadius: 18, border: "5px solid rgba(20,87,217,.92)", boxShadow: callout.style === "soft-glow" ? "0 0 0 8px rgba(20,87,217,.12), 0 0 44px rgba(20,87,217,.38)" : "0 0 0 8px rgba(20,87,217,.12)", opacity, transform: `scale(${scale})` }} />
            </React.Fragment>
          );
        }
        return <div key={index} style={{ position: "absolute", left: callout.x, top: callout.y, maxWidth: w, borderRadius: 14, background: "#ffffff", color: ink, padding: "16px 18px", fontFamily: "Inter, Segoe UI, Arial", fontSize: 23, fontWeight: 820, boxShadow: "0 22px 60px rgba(8,18,32,.20)", opacity, transform: `scale(${scale})` }}>{callout.label}</div>;
      })}
    </>
  );
}

function subtitleCues(scene: VideoScene, mode: RenderPayload["subtitleMode"]): CustomSubtitleCue[] {
  if (mode === "OFF") return [];
  if (mode === "CUSTOM") return scene.customSubtitles ?? [];
  const text = scene.narrationScript?.trim();
  if (!text) return [];
  const words = text.split(/\s+/);
  const chunkSize = 8;
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) chunks.push(words.slice(i, i + chunkSize).join(" "));
  const duration = Math.max(scene.narrationDurationSeconds ?? scene.duration, scene.duration);
  return chunks.map((chunk, index) => ({ start: (duration / chunks.length) * index, end: (duration / chunks.length) * (index + 1), text: chunk }));
}

function Subtitles({ scene, mode, vertical }: { scene: VideoScene; mode: RenderPayload["subtitleMode"]; vertical: boolean }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const cue = subtitleCues(scene, mode).find((item) => seconds >= item.start && seconds <= item.end);
  if (!cue) return null;
  return <div style={{ position: "absolute", left: vertical ? "8%" : "16%", right: vertical ? "8%" : "16%", bottom: vertical ? 96 : 54, textAlign: "center", background: "rgba(8,18,32,.80)", color: "white", borderRadius: 12, padding: vertical ? "16px 20px" : "12px 18px", fontFamily: "Inter, Segoe UI, Arial", fontSize: vertical ? 30 : 25, lineHeight: 1.25 }}>{cue.text}</div>;
}

function SceneAudio({ scene }: { scene: VideoScene }) {
  return scene.narrationAudioPath ? <Audio src={scene.narrationAudioPath} volume={1} /> : null;
}

function InstructionScene({ payload, scene, mode }: { payload: RenderPayload; scene: VideoScene; mode: "vertical" | "course" }) {
  const isCourse = mode === "course";
  return (
    <AbsoluteFill style={{ background: isCourse ? "#f4f8fd" : "linear-gradient(160deg, #edf6ff, #ffffff)", overflow: "hidden", fontFamily: "Inter, Segoe UI, Arial" }}>
      <SceneAudio scene={scene} />
      {isCourse ? (
        <>
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 76, background: "#ffffff", borderBottom: "1px solid #d8e5f4", display: "flex", alignItems: "center", padding: "0 34px", gap: 18 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", color: "white", fontWeight: 900, background: `linear-gradient(135deg, ${payload.brandProfile?.primaryColor ?? blue}, ${payload.brandProfile?.secondaryColor ?? cyan})` }}>{initialsFor(payload.brand.name)}</div>
            <strong style={{ color: ink, fontSize: 21 }}>{payload.brand.name}</strong>
            <span style={{ color: "#60758d", fontSize: 18 }}>{scene.chapter ?? "Capacitación"}</span>
          </div>
          <div style={{ position: "absolute", left: 58, top: 116, width: 360, color: ink }}>
            <div style={{ fontSize: 18, color: blue, fontWeight: 820 }}>{scene.chapter ?? "Paso"}</div>
            <div style={{ marginTop: 10, fontSize: 42, lineHeight: 1.05, fontWeight: 900 }}>{scene.title}</div>
            <p style={{ marginTop: 18, color: "#60758d", fontSize: 22, lineHeight: 1.36 }}>{scene.narrationScript}</p>
          </div>
          <div style={{ position: "absolute", right: 58, top: 116, width: 1390, height: 782, borderRadius: 24, background: "#ffffff", padding: 14, boxShadow: "0 40px 110px rgba(8,18,32,.14)", border: "1px solid #dbe7f5" }}>
            <MediaSurface payload={payload} scene={scene} mode="course" />
          </div>
          <Subtitles scene={scene} mode={payload.subtitleMode} vertical={false} />
        </>
      ) : (
        <>
          <div style={{ position: "absolute", left: 86, right: 86, top: 98 }}>
            <div style={{ fontSize: 58, lineHeight: 1.02, fontWeight: 900, color: ink }}>{scene.title}</div>
          </div>
          <div style={{ position: "absolute", left: 172, top: 330, width: 736, height: 1320, borderRadius: 74, padding: 16, background: "linear-gradient(145deg, #101b2e, #030711)", boxShadow: "0 80px 180px rgba(5,14,29,.35)" }}>
            <MediaSurface payload={payload} scene={scene} mode="vertical" />
          </div>
          <Subtitles scene={scene} mode={payload.subtitleMode} vertical />
          <BrandBug payload={payload} />
        </>
      )}
    </AbsoluteFill>
  );
}

function SceneRenderer({ payload, scene, mode, index }: { payload: RenderPayload; scene: VideoScene; mode: "vertical" | "course"; index: number }) {
  if (scene.type === "BRAND_INTRO" || scene.type === "TITLE") return <BrandIntro payload={payload} scene={scene} />;
  if (scene.type === "BRAND_OUTRO" || scene.type === "CTA" || scene.type === "SUMMARY") return <BrandOutro payload={payload} scene={scene} />;
  if (scene.type === "CHAPTER" || scene.chapterTitleEnabled) return <ChapterCard payload={payload} scene={scene} index={index} />;
  return <InstructionScene payload={payload} scene={scene} mode={mode} />;
}

function Timeline({ payload, mode }: { payload: RenderPayload; mode: "vertical" | "course" }) {
  const scenes = scenesFor(payload, mode === "course" ? "course" : "tutorial");
  return (
    <AbsoluteFill>
      {scenes.map((scene, index) => {
        const from = Math.round(scenes.slice(0, index).reduce((sum, item) => sum + item.duration, 0) * 30);
        return (
          <Sequence key={scene.id} from={from} durationInFrames={Math.max(1, Math.round(scene.duration * 30))}>
            <SceneRenderer payload={payload} scene={scene} mode={mode} index={index} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

export function QuickTutorialTemplate({ payload }: { payload?: RenderPayload }) {
  const safePayload = payload ?? { ...defaultRenderPayload, template: "quick-tutorial" as const, videoType: "QUICK_TUTORIAL" as const };
  return <Timeline payload={safePayload} mode={safePayload.format === "16:9" ? "course" : "vertical"} />;
}

export function ProfessionalCourseTemplate({ payload }: { payload?: RenderPayload }) {
  const safePayload = payload ?? { ...defaultRenderPayload, template: "professional-course" as const, videoType: "COURSE" as const };
  return <Timeline payload={safePayload} mode="course" />;
}

function initialsFor(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VS";
}
