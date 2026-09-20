"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  ExternalLink,
  FileVideo,
  FolderKanban,
  Gauge,
  Image as ImageIcon,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Upload
} from "lucide-react";
import type { AssetType, VideoType } from "@fullpos-ad-studio/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Section = "Dashboard" | "Crear anuncio" | "Proyectos" | "Videos" | "Marcas" | "Configuración";

type RenderJob = {
  id: string;
  projectId: string;
  status: "QUEUED" | "RENDERING" | "COMPLETED" | "FAILED";
  progress: number;
  outputPath?: string;
  audioNote?: string;
  errorMessage?: string;
  createdAt?: string;
  project?: { id: string; name: string; productName: string };
};

type AiVideoProfile = {
  id: "preview" | "premium" | "premium-1080p";
  label: string;
  model: string;
  resolution: string;
  duration: 5;
  estimatedCost: number;
  requiresExplicit1080p?: boolean;
};

type AiVideoScene = {
  id: "desktop-hero" | "mobile-hero" | "multi-device-hero";
  label: string;
  assetType: string;
  prompt: string;
};

type AiVideoProfilesResponse = {
  profiles: AiVideoProfile[];
  scenes: AiVideoScene[];
  maxDuration: number;
  maxAiScenesPerProject: number;
};

type AiVideoQuote = {
  provider: string;
  model: string;
  profile: string;
  scene: string;
  sceneLabel: string;
  resolution: string;
  duration: number;
  estimatedCost: number;
  prompt: string;
  requiresConfirmation: boolean;
  canGenerateNow: boolean;
  imageStrategy: string;
  blocker?: string;
  imageUrl?: string;
  expiresAt?: string;
};

type AiTransportStatus = {
  ready: boolean;
  localPort: number;
  localGatewayReady: boolean;
  cloudflaredAvailable: boolean;
  tunnelReady: boolean;
  publicBaseUrl?: string;
  preferredProvider?: string;
  r2Configured?: boolean;
};

type AiVideoJob = {
  id: string;
  scene: string;
  provider: string;
  model: string;
  profile: string;
  status: string;
  estimatedCost: number;
  reportedCost?: number;
  resolution: string;
  duration: number;
  outputPath?: string;
  errorMessage?: string;
  createdAt?: string;
};

type Project = {
  id: string;
  name: string;
  brandProfileId?: string;
  brandProfile?: BrandProfile;
  videoType: VideoType;
  productName: string;
  headline: string;
  subheadline?: string;
  offer: string;
  price: string;
  website: string;
  template: Draft["template"] | "fullpos-premium-vertical";
  format: "9:16" | "16:9" | "1:1" | "4:5";
  durationMode?: string;
  durationSeconds?: number;
  subtitleMode?: string;
  narrationStyle?: string;
  voiceoverEnabled: boolean;
  voiceoverScript?: string;
  voiceProfile: string;
  voiceName: string;
  voiceId?: string;
  voiceReferenceId?: string;
  voiceReferencePath?: string;
  voiceReferenceName?: string;
  voiceSpeed: number;
  voiceVolume: number;
  musicEnabled: boolean;
  musicTrackId?: string;
  musicPath?: string;
  customMusicPath?: string;
  musicVolume: number;
  visualStyle: string;
  motionIntensity: string;
  createdAt: string;
  assets: Array<{ id: string; type: string; filename: string; path: string }>;
  renderJobs: RenderJob[];
  aiVideoJobs?: AiVideoJob[];
  scenes?: StoryScene[];
};

type BrandProfile = {
  id: string;
  name: string;
  slug: string;
  archived: boolean;
  isDefault: boolean;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  website?: string;
  whatsapp?: string;
  email?: string;
  defaultCTA?: string;
  defaultOffer?: string;
  defaultPriceText?: string;
  defaultVoiceProfile?: string;
  defaultNarrationStyle?: Draft["narrationStyle"];
  defaultMusicTrackId?: string;
  defaultMusicVolume: number;
  watermarkEnabled: boolean;
  watermarkPosition: string;
  watermarkOpacity: number;
  fontHeading: string;
  fontBody: string;
  projects?: Array<{ id: string; name: string; videoType: VideoType }>;
};

type StoryScene = {
  id: string;
  type: string;
  order: number;
  chapter?: string;
  chapterTitleEnabled?: boolean;
  title: string;
  duration: number;
  durationMode?: "AUTO" | "MANUAL";
  narrationScript?: string;
  voiceProfile?: string;
  narrationStyle?: Draft["narrationStyle"];
  mediaAssetId?: string;
  trimStartSeconds?: number;
  trimEndSeconds?: number;
  sourceAudioEnabled?: boolean;
  scale?: number;
  positionX?: number;
  positionY?: number;
  cropTop?: number;
  cropRight?: number;
  cropBottom?: number;
  cropLeft?: number;
  customSubtitles?: Array<{ start: number; end: number; text: string }>;
  animation?: {
    focus?: Array<{ timeSeconds: number; x: number; y: number; scale: number }>;
    callouts?: Array<Record<string, unknown>>;
  };
};

type Draft = {
  name: string;
  brandProfileId?: string;
  videoType: VideoType;
  productName: string;
  headline: string;
  subheadline: string;
  offer: string;
  price: string;
  website: string;
  format: "9:16" | "16:9" | "1:1" | "4:5";
  template: "fullpos-premium-vertical" | "saas-premium-ad" | "quick-tutorial" | "professional-course" | "feature-spotlight" | "customer-onboarding" | "visual-support" | "brand-motivational";
  durationMode: string;
  durationSeconds?: number;
  subtitleMode: "OFF" | "AUTO_FROM_NARRATION" | "CUSTOM";
  narrationStyle: "PROMOTIONAL" | "TRAINING" | "QUICK_TUTORIAL" | "CORPORATE" | "MOTIVATIONAL";
  voiceoverEnabled: boolean;
  voiceoverScript: string;
  voiceProfile: string;
  voiceName: string;
  voiceId?: string;
  voiceReferenceId?: string;
  voiceReferencePath?: string;
  voiceReferenceName?: string;
  voiceSpeed: number;
  voiceVolume: number;
  musicEnabled: boolean;
  musicTrackId?: string;
  musicPath?: string;
  customMusicPath?: string;
  musicVolume: number;
  visualStyle: string;
  motionIntensity: string;
  aiEnabled: boolean;
  aiScene: AiVideoScene["id"];
  aiQuality: AiVideoProfile["id"];
  aiSceneMode: "standard" | "hybrid" | "full-ai-experimental";
  aiMotion: "elegant" | "cinematic" | "dynamic";
  aiPrompt: string;
};

type StudioSettings = {
  defaultVoiceName: string;
  voiceoverEnabled: boolean;
  musicEnabled: boolean;
  musicVolume: number;
  voiceVolume: number;
};

type VoiceOption = {
  id: string;
  name: string;
  gender: string;
  culture: string;
  works: boolean;
};

type VoiceProfile = {
  id: string;
  label: string;
  description: string;
  voiceId?: string;
  voiceName?: string;
  culture?: string;
  speed: number;
  available: boolean;
};

type MusicTrack = {
  id: string;
  name: string;
  category: string;
  mood: string;
  filename: string;
  duration: number;
  license: string;
  source: string;
  commercialUse: boolean;
  quality: "DEMO" | "PRODUCTION-READY";
};

const defaultDraft: Draft = {
  name: "Nuevo video",
  videoType: "ADVERTISEMENT",
  productName: "Mi marca",
  headline: "Tu video profesional",
  subheadline: "Contenido claro para tu audiencia.",
  offer: "Conoce más",
  price: "",
  website: "marca.example",
  format: "9:16",
  template: "saas-premium-ad",
  durationMode: "30_SEC",
  subtitleMode: "OFF",
  narrationStyle: "PROMOTIONAL",
  voiceoverEnabled: true,
  voiceoverScript: "Presenta tu marca con un video claro, profesional y fácil de entender.\nExplica el valor principal, muestra la solución y termina con una llamada a la acción.",
  voiceProfile: "dominican-promotional",
  voiceName: "Dominicana promocional",
  voiceId: undefined,
  voiceSpeed: 1,
  voiceVolume: 1,
  musicEnabled: true,
  musicTrackId: "corporate-light",
  musicVolume: 0.15,
  visualStyle: "saas-premium",
  motionIntensity: "cinematic",
  aiEnabled: false,
  aiScene: "mobile-hero",
  aiQuality: "preview",
  aiSceneMode: "hybrid",
  aiMotion: "elegant",
  aiPrompt: ""
};

const defaultSettings: StudioSettings = {
  defaultVoiceName: "female-es",
  voiceoverEnabled: true,
  musicEnabled: true,
  musicVolume: 0.15,
  voiceVolume: 1
};

const uploadFields: Array<{ type: AssetType; label: string; required?: boolean }> = [
  { type: "logo", label: "Logo" },
  { type: "billing", label: "Facturación", required: true },
  { type: "products", label: "Productos / inventario", required: true },
  { type: "reports", label: "Reportes", required: true },
  { type: "mobile", label: "Móvil", required: true },
  { type: "screen_recording", label: "Grabación de pantalla" },
  { type: "additional", label: "Imagen adicional" }
];

const imageMimeTypes = ["image/png", "image/jpeg", "image/webp"];
const mediaMimeTypes = [...imageMimeTypes, "video/mp4", "video/webm"];

const videoTypeCards: Array<{ id: VideoType; label: string; description: string; template: Draft["template"]; format: Draft["format"]; narrationStyle: Draft["narrationStyle"]; subtitleMode: Draft["subtitleMode"]; musicEnabled: boolean; aiEnabled: boolean; durationMode: string }> = [
  { id: "ADVERTISEMENT", label: "Publicidad", description: "Promociona tu producto o servicio", template: "saas-premium-ad", format: "9:16", narrationStyle: "PROMOTIONAL", subtitleMode: "OFF", musicEnabled: true, aiEnabled: true, durationMode: "30_SEC" },
  { id: "QUICK_TUTORIAL", label: "Tutorial rápido", description: "Explica una función en pocos minutos", template: "quick-tutorial", format: "9:16", narrationStyle: "QUICK_TUTORIAL", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "SCENE_BASED" },
  { id: "COURSE", label: "Curso / Capacitación", description: "Capacita usuarios paso a paso", template: "professional-course", format: "16:9", narrationStyle: "TRAINING", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "LONG_FORM" },
  { id: "ONBOARDING", label: "Onboarding", description: "Enseña cómo comenzar", template: "customer-onboarding", format: "16:9", narrationStyle: "TRAINING", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "SCENE_BASED" },
  { id: "FEATURE_SPOTLIGHT", label: "Mostrar una función", description: "Presenta una herramienta específica", template: "feature-spotlight", format: "16:9", narrationStyle: "CORPORATE", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: true, aiEnabled: true, durationMode: "60_SEC" },
  { id: "SUPPORT", label: "Soporte", description: "Explica cómo resolver un problema", template: "visual-support", format: "16:9", narrationStyle: "QUICK_TUTORIAL", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "SCENE_BASED" },
  { id: "BRAND_MOTIVATIONAL", label: "Marca / Motivación", description: "Contenido institucional o inspirador", template: "brand-motivational", format: "9:16", narrationStyle: "MOTIVATIONAL", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: true, aiEnabled: true, durationMode: "60_SEC" },
  { id: "FREEFORM", label: "Video libre", description: "Construye tu video desde cero", template: "brand-motivational", format: "16:9", narrationStyle: "CORPORATE", subtitleMode: "OFF", musicEnabled: false, aiEnabled: false, durationMode: "CUSTOM" }
];

const nav: Array<[Section, typeof Gauge]> = [
  ["Dashboard", Gauge],
  ["Crear anuncio", Clapperboard],
  ["Proyectos", FolderKanban],
  ["Videos", FileVideo],
  ["Marcas", Sparkles],
  ["Configuración", Settings]
];

export default function Home() {
  const [section, setSection] = useState<Section>("Dashboard");
  const [projects, setProjects] = useState<Project[]>([]);
  const [brands, setBrands] = useState<BrandProfile[]>([]);
  const [videos, setVideos] = useState<RenderJob[]>([]);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [settings, setSettings] = useState<StudioSettings>(defaultSettings);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [musicLibrary, setMusicLibrary] = useState<MusicTrack[]>([]);
  const [aiProfiles, setAiProfiles] = useState<AiVideoProfilesResponse | null>(null);
  const [aiQuote, setAiQuote] = useState<AiVideoQuote | null>(null);
  const [aiJobs, setAiJobs] = useState<AiVideoJob[]>([]);
  const [aiTransport, setAiTransport] = useState<AiTransportStatus | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState("");
  const [mixPreviewUrl, setMixPreviewUrl] = useState("");
  const [stylePreviewUrl, setStylePreviewUrl] = useState("");
  const [hybridPreviewUrl, setHybridPreviewUrl] = useState("");
  const [trainingPreviewUrl, setTrainingPreviewUrl] = useState("");
  const [customMusicUrl, setCustomMusicUrl] = useState("");
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const [activePreview, setActivePreview] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [assetNames, setAssetNames] = useState<Record<string, string>>({});
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState({ type: "info", text: "Listo para crear un video." });

  useEffect(() => {
    void refreshAll();
    void loadBrands();
    void loadSettings();
    void loadVoices();
    void loadVoiceProfiles();
    void loadMusicLibrary();
    void loadAiProfiles();
    void loadAiTransportStatus();
  }, []);

  useEffect(() => {
    if (!renderJob || !["QUEUED", "RENDERING"].includes(renderJob.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchJson<RenderJob>(`${API_URL}/renders/${renderJob.id}`);
        setRenderJob(next);
        if (next.status === "COMPLETED") {
          show("success", "Video generado correctamente.");
          await refreshAll();
        }
        if (next.status === "FAILED") show("error", next.errorMessage ?? "El render falló.");
      } catch (error) {
        show("error", getErrorMessage(error));
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [renderJob]);

  const stats = useMemo(() => {
    const jobs = projects.flatMap((project) => project.renderJobs ?? []);
    return {
      projects: projects.length,
      completed: jobs.filter((job) => job.status === "COMPLETED").length,
      rendering: jobs.filter((job) => job.status === "QUEUED" || job.status === "RENDERING").length
    };
  }, [projects]);

  const selectedProject = projects.find((project) => project.id === projectId);
  const latestJob = renderJob ?? selectedProject?.renderJobs?.[0] ?? null;
  const isRendering = latestJob?.status === "QUEUED" || latestJob?.status === "RENDERING";
  const downloadUrl = latestJob?.status === "COMPLETED" ? `${API_URL}/renders/${latestJob.id}/file` : "";
  const streamUrl = latestJob?.status === "COMPLETED" ? `${API_URL}/renders/${latestJob.id}/stream` : "";

  async function refreshAll() {
    await Promise.all([loadProjects(), loadVideos(), loadBrands()]);
  }

  async function loadBrands() {
    try {
      const next = await fetchJson<BrandProfile[]>(`${API_URL}/brands`);
      setBrands(next);
      const preferred = next.find((brand) => brand.isDefault) ?? next[0];
      if (preferred) {
        setDraft((current) => current.brandProfileId ? current : applyBrandToDraft(current, preferred));
      }
    } catch {
      setBrands([]);
    }
  }

  async function loadProjects() {
    try {
      setProjects(await fetchJson<Project[]>(`${API_URL}/projects`));
    } catch (error) {
      show("error", `No se pudieron cargar los proyectos: ${getErrorMessage(error)}`);
    }
  }

  async function loadVideos() {
    try {
      setVideos(await fetchJson<RenderJob[]>(`${API_URL}/renders`));
    } catch {
      setVideos([]);
    }
  }

  async function loadSettings() {
    try {
      const next = await fetchJson<StudioSettings>(`${API_URL}/settings`);
      setSettings(next);
      setDraft((current) => ({ ...current, voiceName: next.defaultVoiceName, voiceoverEnabled: next.voiceoverEnabled, musicEnabled: next.musicEnabled }));
    } catch {
      setSettings(defaultSettings);
    }
  }

  async function loadVoices() {
    try {
      const next = await fetchJson<VoiceOption[]>(`${API_URL}/audio/voices`);
      setVoices(next);
      const preferred = next.find((voice) => voice.gender === "Female") ?? next[0];
      if (preferred) {
        setDraft((current) => ({ ...current, voiceName: preferred.id }));
      }
    } catch {
      setVoices([]);
    }
  }

  async function loadVoiceProfiles() {
    try {
      const next = await fetchJson<VoiceProfile[]>(`${API_URL}/audio/voice-profiles`);
      setVoiceProfiles(next);
      const preferred = next.find((profile) => profile.id === defaultDraft.voiceProfile) ?? next[0];
      if (preferred) {
        setDraft((current) => ({ ...current, voiceProfile: preferred.id, voiceName: preferred.label, voiceId: preferred.voiceId, voiceSpeed: current.voiceSpeed || preferred.speed }));
      }
    } catch {
      setVoiceProfiles([]);
    }
  }

  async function loadMusicLibrary() {
    try {
      setMusicLibrary(await fetchJson<MusicTrack[]>(`${API_URL}/audio/music-library`));
    } catch {
      setMusicLibrary([]);
    }
  }

  async function loadAiProfiles() {
    try {
      setAiProfiles(await fetchJson<AiVideoProfilesResponse>(`${API_URL}/ai-video/profiles`));
    } catch {
      setAiProfiles(null);
    }
  }

  async function loadAiJobs(id = projectId) {
    if (!id) return setAiJobs([]);
    try {
      setAiJobs(await fetchJson<AiVideoJob[]>(`${API_URL}/projects/${id}/ai-video/jobs`));
    } catch {
      setAiJobs([]);
    }
  }

  async function loadAiTransportStatus() {
    try {
      setAiTransport(await fetchJson<AiTransportStatus>(`${API_URL}/ai-video/transport/status`));
    } catch {
      setAiTransport(null);
    }
  }

  async function ensureProject() {
    if (projectId) {
      await saveDraft(projectId, false);
      return projectId;
    }
    validateDraft();
    const project = await fetchJson<Project>(`${API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    setProjectId(project.id);
    setRenderJob(null);
    await refreshAll();
    show("success", "Proyecto creado.");
    return project.id;
  }

  async function saveDraft(id = projectId, notify = true) {
    if (!id) {
      validateDraft();
      const project = await fetchJson<Project>(`${API_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      setProjectId(project.id);
      await refreshAll();
      if (notify) show("success", "Borrador creado.");
      return;
    }
    validateDraft();
    await fetchJson<Project>(`${API_URL}/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    await refreshAll();
    if (notify) show("success", "Borrador guardado.");
  }

  async function onUpload(type: AssetType, file?: File) {
    if (!file) return;
    const allowed = type === "screen_recording" || type === "video" ? mediaMimeTypes : imageMimeTypes;
    if (!allowed.includes(file.type)) return show("error", type === "screen_recording" ? "Usa MP4 o WebM para grabaciones." : "Usa PNG, JPG, JPEG o WEBP.");
    const maxSize = type === "screen_recording" || type === "video" ? 250 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) return show("error", `El archivo supera ${Math.round(maxSize / 1024 / 1024)}MB.`);
    try {
      setBusy(`upload-${type}`);
      const id = await ensureProject();
      const form = new FormData();
      form.append("file", file);
      await fetchJson(`${API_URL}/projects/${id}/assets?type=${type}`, { method: "POST", body: form });
      setPreviews((current) => ({ ...current, [type]: URL.createObjectURL(file) }));
      setAssetNames((current) => ({ ...current, [type]: file.name }));
      await refreshAll();
      show("success", `${file.name} cargado.`);
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function selectVideoType(card: (typeof videoTypeCards)[number]) {
    setDraft((current) => ({
      ...current,
      videoType: card.id,
      template: card.template,
      format: card.format,
      narrationStyle: card.narrationStyle,
      subtitleMode: card.subtitleMode,
      musicEnabled: card.musicEnabled,
      aiEnabled: card.aiEnabled,
      durationMode: card.durationMode,
      name: card.id === "COURSE" ? "Curso profesional — Cómo registrar una venta" : current.name
    }));
    setAiQuote(null);
    show("info", `${card.label} seleccionado.`);
  }

  function selectBrand(brand: BrandProfile) {
    setDraft((current) => applyBrandToDraft(current, brand));
    show("info", `Marca seleccionada: ${brand.name}.`);
  }

  async function createBrand() {
    try {
      setBusy("brand-create");
      const brand = await fetchJson<BrandProfile>(`${API_URL}/brands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Nueva marca",
          website: "marca.example",
          primaryColor: "#2563eb",
          secondaryColor: "#14b8a6",
          accentColor: "#f59e0b",
          backgroundColor: "#f8fbff",
          textColor: "#111827",
          defaultCTA: "Conoce más",
          defaultOffer: "Nueva solución",
          defaultPriceText: "",
          defaultNarrationStyle: "CORPORATE",
          defaultMusicVolume: 0.12
        })
      });
      await loadBrands();
      selectBrand(brand);
      show("success", "Marca creada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function duplicateBrand(id: string) {
    try {
      setBusy(`brand-duplicate-${id}`);
      await fetchJson(`${API_URL}/brands/${id}/duplicate`, { method: "POST" });
      await loadBrands();
      show("success", "Marca duplicada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function archiveBrand(id: string) {
    try {
      setBusy(`brand-archive-${id}`);
      await fetchJson(`${API_URL}/brands/${id}/archive`, { method: "POST" });
      await loadBrands();
      show("success", "Marca archivada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function onUploadMany(files?: FileList | File[], startType?: AssetType) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const invalid = selected.find((file) => !imageMimeTypes.includes(file.type) || file.size > 10 * 1024 * 1024);
    if (invalid) {
      return show("error", `${invalid.name} no es válido. Usa PNG, JPG, JPEG o WEBP de máximo 10MB.`);
    }

    const startIndex = startType ? uploadFields.findIndex((field) => field.type === startType) : -1;
    const orderedFields = startIndex >= 0 ? [...uploadFields.slice(startIndex), ...uploadFields.slice(0, startIndex)] : uploadFields;
    const existingTypes = new Set([...(selectedProject?.assets.map((asset) => asset.type) ?? []), ...Object.keys(previews), ...Object.keys(assetNames)]);
    const targets = startType
      ? orderedFields
      : [...orderedFields.filter((field) => !existingTypes.has(field.type)), ...orderedFields.filter((field) => existingTypes.has(field.type))];
    const uploadable = selected.slice(0, targets.length);

    try {
      setBusy("upload-many");
      const id = await ensureProject();
      const nextPreviews: Record<string, string> = {};
      const nextNames: Record<string, string> = {};

      for (const [index, file] of uploadable.entries()) {
        const target = targets[index];
        if (!target) break;
        const form = new FormData();
        form.append("file", file);
        await fetchJson(`${API_URL}/projects/${id}/assets?type=${target.type}`, { method: "POST", body: form });
        nextPreviews[target.type] = URL.createObjectURL(file);
        nextNames[target.type] = file.name;
      }

      setPreviews((current) => ({ ...current, ...nextPreviews }));
      setAssetNames((current) => ({ ...current, ...nextNames }));
      await refreshAll();
      const ignored = selected.length - uploadable.length;
      show("success", `${uploadable.length} imagen${uploadable.length === 1 ? "" : "es"} cargada${uploadable.length === 1 ? "" : "s"}${ignored > 0 ? `. ${ignored} no se cargó porque no hay más espacios.` : "."}`);
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function onMusicUpload(file?: File) {
    if (!file) return;
    if (!["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"].includes(file.type)) return show("error", "Usa MP3, WAV o M4A para la música.");
    try {
      setBusy("music");
      const id = await ensureProject();
      const form = new FormData();
      form.append("file", file);
      const project = await fetchJson<Project>(`${API_URL}/projects/${id}/music`, { method: "POST", body: form });
      setDraft(projectToDraft(project));
      setCustomMusicUrl(`${API_URL}/projects/${project.id}/music/file`);
      await refreshAll();
      show("success", "Música cargada y asociada al proyecto.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function onVoiceReferenceUpload(file?: File) {
    if (!file) return;
    if (!["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav"].includes(file.type)) return show("error", "Usa MP3, WAV o M4A para la referencia de voz.");
    try {
      setBusy("voice-reference");
      const id = await ensureProject();
      const form = new FormData();
      form.append("file", file);
      const project = await fetchJson<Project>(`${API_URL}/projects/${id}/voice-reference`, { method: "POST", body: form });
      setDraft(projectToDraft(project));
      await refreshAll();
      show("success", "Referencia de voz guardada. Úsala solo con permiso de la persona grabada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function previewVoice() {
    try {
      setBusy("voice-preview");
      const preview = await fetchJson<{ url: string }>(`${API_URL}/audio/voice-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft.voiceoverScript, voice: draft.voiceId, voiceProfile: draft.voiceProfile, speed: draft.voiceSpeed })
      });
      const url = `${API_URL}${preview.url}`;
      setVoicePreviewUrl(url);
      playAudio(url, "voice-preview");
      show("success", "Preview de voz generado.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function previewVoiceProfile(profile: VoiceProfile) {
    try {
      setBusy(`voice-profile-${profile.id}`);
      const preview = await fetchJson<{ url: string }>(`${API_URL}/audio/voice-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Presenta tu marca con una voz clara, cercana y profesional.",
          voice: profile.voiceId,
          voiceProfile: profile.id,
          speed: draft.voiceSpeed || profile.speed
        })
      });
      playAudio(`${API_URL}${preview.url}`, `voice-profile-${profile.id}`);
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function previewMusic(track: MusicTrack) {
    const key = `music-${track.id}`;
    if (activePreview === key) {
      activeAudio?.pause();
      setActivePreview("");
      return;
    }
    playAudio(`${API_URL}/audio/music/${track.id}/file`, key, 15);
  }

  function previewCustomMusic() {
    const url = customMusicUrl;
    if (!url) return show("info", "Sube una pista personalizada para escucharla.");
    playAudio(url, "custom-music", 15);
  }

  async function previewMix() {
    try {
      setBusy("mix-preview");
      const preview = await fetchJson<{ url: string; note?: string }>(`${API_URL}/audio/mix-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: draft.voiceoverScript,
          voice: draft.voiceId,
          voiceProfile: draft.voiceProfile,
          speed: draft.voiceSpeed,
          voiceVolume: draft.voiceVolume,
          musicTrackId: draft.musicTrackId,
          musicPath: draft.musicPath,
          customMusicPath: draft.customMusicPath,
          musicVolume: draft.musicVolume
        })
      });
      const url = `${API_URL}${preview.url}`;
      setMixPreviewUrl(url);
      playAudio(url, "mix-preview", 12);
      show(preview.note ? "info" : "success", preview.note ?? "Preview de voz + música generado.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function playAudio(url: string, key: string, maxSeconds?: number) {
    activeAudio?.pause();
    const audio = new window.Audio(url);
    setActiveAudio(audio);
    setActivePreview(key);
    let timer: number | undefined;
    if (maxSeconds) {
      timer = window.setTimeout(() => {
        audio.pause();
        setActivePreview("");
      }, maxSeconds * 1000);
    }
    audio.onended = () => {
      if (timer) window.clearTimeout(timer);
      setActivePreview("");
    };
    audio.play().catch(() => show("info", "Preview generado. Usa el reproductor para escucharlo."));
  }

  async function generateVideo(regenerate = false) {
    try {
      validateDraft();
      if (!regenerate) validateAssets();
      setBusy("render");
      const id = await ensureProject();
      show("info", "Preparando recursos.");
      const job = await fetchJson<RenderJob>(`${API_URL}/projects/${id}/render`, { method: "POST" });
      setRenderJob(job);
      setSection("Crear anuncio");
      setStep(5);
      show("info", renderStage(job));
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function previewStyle() {
    try {
      setBusy("style-preview");
      const preview = await fetchJson<{ streamUrl: string }>(`${API_URL}/renders/style-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visualStyle: draft.visualStyle, motionIntensity: draft.motionIntensity })
      });
      setStylePreviewUrl(`${API_URL}${preview.streamUrl}`);
      show("success", "Vista previa del estilo generada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function previewHybridScene() {
    try {
      setBusy("hybrid-preview");
      const id = projectId ? await ensureProject() : undefined;
      const preview = await fetchJson<{ streamUrl: string }>(`${API_URL}/renders/hybrid-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, motion: draft.aiMotion })
      });
      setHybridPreviewUrl(`${API_URL}${preview.streamUrl}`);
      show("success", "Preview híbrido generado sin costo IA.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function quoteAiVideo() {
    try {
      setBusy("ai-quote");
      validateDraft();
      const id = await ensureProject();
      const quote = await fetchJson<AiVideoQuote>(`${API_URL}/projects/${id}/ai-video/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: draft.aiScene,
          profile: draft.aiQuality,
          duration: 5,
          motion: draft.aiMotion,
          prompt: draft.aiPrompt
        })
      });
      setAiQuote(quote);
      show(quote.canGenerateNow ? "success" : "info", quote.blocker ?? "Costo IA calculado. Confirma antes de generar.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function prepareAiTransport() {
    try {
      setBusy("ai-transport");
      const status = await fetchJson<AiTransportStatus>(`${API_URL}/ai-video/transport/prepare`, { method: "POST" });
      setAiTransport(status);
      show(status.ready ? "success" : "info", status.ready ? "Conexión IA temporal lista." : "Conexión IA no lista. Revisa si cloudflared está instalado.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function stopAiTransport() {
    try {
      setBusy("ai-transport-stop");
      const status = await fetchJson<AiTransportStatus>(`${API_URL}/ai-video/transport/stop`, { method: "POST" });
      setAiTransport(status);
      show("info", "Conexión IA temporal detenida.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function confirmAiVideo() {
    if (!aiQuote) return show("info", "Calcula el costo IA antes de confirmar.");
    try {
      setBusy("ai-generate");
      const id = await ensureProject();
      const result = await fetchJson<{ job: AiVideoJob; message?: string; charged: boolean; realRunpodRequestMade: boolean }>(`${API_URL}/projects/${id}/ai-video/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene: draft.aiScene,
          profile: draft.aiQuality,
          duration: 5,
          motion: draft.aiMotion,
          prompt: draft.aiPrompt,
          confirmCost: true
        })
      });
      await loadAiJobs(id);
      show(result.job.status === "COMPLETED" ? "success" : "info", result.message ?? `Job IA ${result.job.status}. Cobrado: ${result.charged ? "sí" : "no"}.`);
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function addScene() {
    try {
      setBusy("scene-add");
      const id = await ensureProject();
      const count = selectedProject?.scenes?.length ?? 0;
      await fetchJson(`${API_URL}/projects/${id}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SCREENSHOT", order: count + 1, title: "Nueva escena", duration: 5, narrationScript: "Describe este paso." })
      });
      await refreshAll();
      show("success", "Escena agregada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function duplicateScene(sceneId: string) {
    if (!projectId) return;
    try {
      setBusy(`scene-duplicate-${sceneId}`);
      await fetchJson(`${API_URL}/projects/${projectId}/scenes/${sceneId}/duplicate`, { method: "POST" });
      await refreshAll();
      show("success", "Escena duplicada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function deleteScene(sceneId: string) {
    if (!projectId) return;
    try {
      setBusy(`scene-delete-${sceneId}`);
      await fetchJson(`${API_URL}/projects/${projectId}/scenes/${sceneId}`, { method: "DELETE" });
      await refreshAll();
      show("success", "Escena eliminada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function updateScene(sceneId: string, patch: Partial<StoryScene>) {
    if (!projectId) return;
    try {
      setBusy(`scene-update-${sceneId}`);
      await fetchJson(`${API_URL}/projects/${projectId}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      await refreshAll();
      show("success", "Escena actualizada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function moveScene(sceneId: string, direction: -1 | 1) {
    if (!projectId || !selectedProject?.scenes?.length) return;
    const scenes = [...selectedProject.scenes].sort((a, b) => a.order - b.order);
    const index = scenes.findIndex((scene) => scene.id === sceneId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= scenes.length) return;
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    try {
      setBusy(`scene-move-${sceneId}`);
      await fetchJson(`${API_URL}/projects/${projectId}/scenes/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: scenes.map((scene) => scene.id) })
      });
      await refreshAll();
      show("success", "Orden actualizado.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function previewTrainingScene(sceneId?: string, chapter?: string) {
    if (!projectId) return show("info", "Guarda o abre un proyecto para previsualizar.");
    try {
      setBusy(sceneId ? `scene-preview-${sceneId}` : "chapter-preview");
      const endpoint = draft.videoType === "COURSE" || draft.format === "16:9" ? "course-scene-preview" : "quick-tutorial-preview";
      const preview = await fetchJson<{ streamUrl: string }>(`${API_URL}/renders/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId, chapter })
      });
      setTrainingPreviewUrl(`${API_URL}${preview.streamUrl}`);
      show("success", sceneId ? "Vista previa de escena generada." : "Vista previa de capítulo generada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function openProject(project: Project) {
    setProjectId(project.id);
    setDraft(projectToDraft(project));
    setRenderJob(project.renderJobs?.[0] ?? null);
    setAiQuote(null);
    setAiJobs(project.aiVideoJobs ?? []);
    setPreviews({});
    setAssetNames(Object.fromEntries(project.assets.map((asset) => [asset.type, asset.filename])));
    setCustomMusicUrl(project.customMusicPath ? `${API_URL}/projects/${project.id}/music/file` : "");
    setSection("Crear anuncio");
    setStep(1);
    show("info", `Proyecto abierto: ${project.name}`);
  }

  async function duplicateProject(project: Project) {
    try {
      setBusy(`duplicate-${project.id}`);
      const copy = await fetchJson<Project>(`${API_URL}/projects/${project.id}/duplicate`, { method: "POST" });
      await refreshAll();
      openProject(copy);
      show("success", "Proyecto duplicado.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Eliminar "${project.name}"? Esta acción solo afecta este proyecto local.`)) return;
    try {
      setBusy(`delete-${project.id}`);
      await fetchJson(`${API_URL}/projects/${project.id}`, { method: "DELETE" });
      if (projectId === project.id) resetDraft();
      await refreshAll();
      show("success", "Proyecto eliminado.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function saveSettings() {
    try {
      setBusy("settings");
      const next = await fetchJson<StudioSettings>(`${API_URL}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      setSettings(next);
      show("success", "Configuración guardada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function resetDraft() {
    setProjectId(null);
    setDraft({ ...defaultDraft, voiceName: "Dominicana promocional", voiceoverEnabled: settings.voiceoverEnabled, musicEnabled: settings.musicEnabled, musicVolume: settings.musicVolume });
    setRenderJob(null);
    setPreviews({});
    setAssetNames({});
    setCustomMusicUrl("");
    setVoicePreviewUrl("");
    setMixPreviewUrl("");
    setAiQuote(null);
    setAiJobs([]);
    setStep(1);
    setSection("Crear anuncio");
    show("info", "Nuevo video listo.");
  }

  function validateDraft() {
    const required = [
      ["Nombre del proyecto", draft.name],
      ["Producto", draft.productName],
      ["Headline", draft.headline],
      ["Oferta", draft.offer],
      ["Precio", draft.price],
      ["Website", draft.website]
    ];
    const missing = required.find(([, value]) => !value.trim());
    if (missing) throw new Error(`${missing[0]} es obligatorio.`);
    if (draft.voiceoverEnabled && !draft.voiceoverScript.trim()) throw new Error("Activa voz en off solo si tienes un guion.");
  }

  function validateAssets() {
    const uploaded = new Set([...(selectedProject?.assets.map((asset) => asset.type) ?? []), ...Object.keys(previews)]);
    const missing = uploadFields.filter((field) => field.required && !uploaded.has(field.type)).map((field) => field.label);
    if (missing.length) throw new Error(`Faltan recursos para un video premium: ${missing.join(", ")}.`);
  }

  function show(type: string, text: string) {
    setMessage({ type, text });
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">VS</div>
          <div>
            <strong>Video Studio</strong>
            <div className="muted">Videos profesionales para publicidad, capacitación y contenido de marca.</div>
          </div>
        </div>
        <nav className="nav">
          {nav.map(([label, Icon]) => (
            <button key={label} className={`navItem ${section === label ? "active" : ""}`} type="button" onClick={() => setSection(label)}>
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <section className="topbar">
          <div className="title">
            <h1>{section}</h1>
            <p>{sectionSubtitle(section)}</p>
          </div>
          <button className="primary" type="button" onClick={resetDraft}>
            <Plus size={18} />
            Crear video
          </button>
        </section>

        <div className={`notice ${message.type}`}>{message.text}</div>

        {section === "Dashboard" && (
          <>
            <section className="grid stats">
              <Stat label="Proyectos recientes" value={stats.projects} />
              <Stat label="Videos generados" value={stats.completed} />
              <Stat label="Renderizando" value={stats.rendering} />
            </section>
            <section className="dashboardGrid">
              <div className="card">
                <h2>Flujo recomendado</h2>
                <p className="muted">Elige tipo de video, organiza escenas, carga medios, revisa audio y exporta MP4.</p>
                <button className="primary" type="button" onClick={() => setSection("Crear anuncio")}>
                  <Clapperboard size={18} />
                  Continuar creación
                </button>
              </div>
              <ProjectList projects={projects.slice(0, 4)} onOpen={openProject} onDuplicate={duplicateProject} onDelete={deleteProject} busy={busy} compact />
            </section>
          </>
        )}

        {section === "Crear anuncio" && (
          <section className="workspace">
            <div className="card">
              <div className="steps">
                {["Marca y tipo", "Información", "Storyboard", "Medios", "Audio", "Generar"].map((label, index) => (
                  <button key={label} type="button" className={`step ${step === index + 1 ? "active" : ""}`} onClick={() => setStep(index + 1)}>
                    {index + 1}. {label}
                  </button>
                ))}
              </div>

              {step === 1 && <VideoTypeStep draft={draft} brands={brands} onSelectBrand={selectBrand} onSelect={selectVideoType} />}
              {step === 2 && <InfoStep draft={draft} setDraft={setDraft} />}
              {step === 3 && <StoryboardStep project={selectedProject} busy={busy} previewUrl={trainingPreviewUrl} onAddScene={addScene} onDuplicateScene={duplicateScene} onDeleteScene={deleteScene} onUpdateScene={(sceneId, patch) => void updateScene(sceneId, patch)} onMoveScene={(sceneId, direction) => void moveScene(sceneId, direction)} onPreviewScene={(sceneId) => void previewTrainingScene(sceneId)} onPreviewChapter={(chapter) => void previewTrainingScene(undefined, chapter)} />}
              {step === 4 && (
                <>
                  <FormatStep draft={draft} setDraft={setDraft} busy={busy} stylePreviewUrl={stylePreviewUrl} onPreviewStyle={previewStyle} />
                  <AssetsStep previews={previews} assetNames={assetNames} project={selectedProject} busy={busy} onUpload={onUpload} onUploadMany={onUploadMany} />
                </>
              )}
              {step === 5 && (
                <AudioStep
                  draft={draft}
                  setDraft={setDraft}
                  voices={voices}
                  voiceProfiles={voiceProfiles}
                  musicLibrary={musicLibrary}
                  busy={busy}
                  activePreview={activePreview}
                  voicePreviewUrl={voicePreviewUrl}
                  mixPreviewUrl={mixPreviewUrl}
                  customMusicUrl={customMusicUrl}
                  onPreviewVoice={previewVoice}
                  onPreviewVoiceProfile={previewVoiceProfile}
                  onPreviewMusic={previewMusic}
                  onPreviewCustomMusic={previewCustomMusic}
                  onPreviewMix={previewMix}
                  onMusicUpload={onMusicUpload}
                  onVoiceReferenceUpload={onVoiceReferenceUpload}
                />
              )}
              {step === 6 && (
                <div className="grid">
                  <AiEnhancementStep
                    draft={draft}
                    setDraft={(next) => {
                      setDraft(next);
                      setAiQuote(null);
                    }}
                    profiles={aiProfiles}
                    quote={aiQuote}
                    jobs={aiJobs}
                    transport={aiTransport}
                    busy={busy}
                    onPrepareTransport={prepareAiTransport}
                    onStopTransport={stopAiTransport}
                    onPreviewHybrid={previewHybridScene}
                    onQuote={quoteAiVideo}
                    onConfirm={confirmAiVideo}
                    hybridPreviewUrl={hybridPreviewUrl}
                  />
                  <ProjectPreview draft={draft} previews={previews} assetNames={assetNames} project={selectedProject} />
                  <div className="buttonRow">
                    <button className="primary" type="button" onClick={() => void generateVideo()} disabled={busy === "render" || isRendering}>
                      <Play size={18} />
                      Generar video
                    </button>
                    <button className="secondary" type="button" onClick={() => void saveDraft()} disabled={busy !== null}>
                      <Save size={18} />
                      Guardar borrador
                    </button>
                    {latestJob ? (
                      <button className="secondary" type="button" onClick={() => void generateVideo(true)} disabled={busy === "render" || isRendering}>
                        <RefreshCcw size={18} />
                        Regenerar
                      </button>
                    ) : null}
                    {downloadUrl ? <VideoLinks downloadUrl={downloadUrl} streamUrl={streamUrl} /> : null}
                  </div>
                </div>
              )}

              <div className="actions">
                <button className="secondary" type="button" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>Atrás</button>
                <button className="secondary" type="button" onClick={() => void saveDraft()} disabled={busy !== null}><Save size={16} />Guardar borrador</button>
                <button className="primary" type="button" disabled={step === 6} onClick={() => setStep((value) => Math.min(6, value + 1))}>Siguiente</button>
              </div>
            </div>

            <aside className="card">
              <div className="previewFrame">
                {streamUrl ? <video controls src={streamUrl} /> : <Upload size={42} color="#1457d9" />}
              </div>
              <div className="status">
                <strong>{latestJob ? renderStage(latestJob) : message.text}</strong>
                <span>{latestJob ? `${latestJob.status} · ${latestJob.progress}%` : "Sin render activo"}</span>
                {latestJob?.audioNote ? <span className="warningText">{latestJob.audioNote}</span> : null}
                <div className="progress"><span style={{ width: `${latestJob?.progress ?? 0}%` }} /></div>
                {downloadUrl ? <VideoLinks downloadUrl={downloadUrl} streamUrl={streamUrl} /> : null}
              </div>
            </aside>
          </section>
        )}

        {section === "Proyectos" && <ProjectList projects={projects} onOpen={openProject} onDuplicate={duplicateProject} onDelete={deleteProject} busy={busy} />}
        {section === "Videos" && <VideoList videos={videos} />}
        {section === "Marcas" && <BrandManager brands={brands} busy={busy} selectedBrandId={draft.brandProfileId} onSelect={selectBrand} onCreate={createBrand} onDuplicate={duplicateBrand} onArchive={archiveBrand} />}
        {section === "Configuración" && (
          <section className="card settingsPanel">
            <h2>Preferencias locales</h2>
            <p className="muted">Se guardan en SQLite local. La voz real usa voces SAPI instaladas en Windows; si no existe una voz española, se guarda el guion y el render continúa con música.</p>
            <label className="field">
              <span>Voz predeterminada</span>
              <select value={settings.defaultVoiceName} onChange={(event) => setSettings({ ...settings, defaultVoiceName: event.target.value })}>
                <option value="female-es">Femenina en español local</option>
                <option value="spanish">Cualquier voz española local</option>
              </select>
            </label>
            <Toggle label="Activar voz en off por defecto" checked={settings.voiceoverEnabled} onChange={(voiceoverEnabled) => setSettings({ ...settings, voiceoverEnabled })} />
            <Toggle label="Activar música por defecto" checked={settings.musicEnabled} onChange={(musicEnabled) => setSettings({ ...settings, musicEnabled })} />
            <label className="field"><span>Volumen música</span><input type="number" min="0" max="1" step="0.01" value={settings.musicVolume} onChange={(event) => setSettings({ ...settings, musicVolume: Number(event.target.value) })} /></label>
            <label className="field"><span>Volumen voz</span><input type="number" min="0" max="1" step="0.01" value={settings.voiceVolume} onChange={(event) => setSettings({ ...settings, voiceVolume: Number(event.target.value) })} /></label>
            <button className="primary" type="button" onClick={() => void saveSettings()} disabled={busy === "settings"}><Save size={18} />Guardar configuración</button>
          </section>
        )}
      </main>
    </div>
  );
}

function VideoTypeStep({ draft, brands, onSelectBrand, onSelect }: { draft: Draft; brands: BrandProfile[]; onSelectBrand: (brand: BrandProfile) => void; onSelect: (card: (typeof videoTypeCards)[number]) => void }) {
  return (
    <div className="sectionBlock">
      <div className="sectionHeader">
        <div>
          <strong>Seleccionar marca</strong>
          <p className="muted">La marca define logo, colores, website, CTA, voz, música y watermark por defecto.</p>
        </div>
      </div>
      <div className="brandGrid">
        {brands.map((brand) => (
          <button key={brand.id} type="button" className={`brandCard ${draft.brandProfileId === brand.id ? "selected" : ""}`} onClick={() => onSelectBrand(brand)}>
            <span className="brandSwatch" style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }}>{brand.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
            <strong>{brand.name}</strong>
            <small>{brand.website ?? brand.slug}{brand.isDefault ? " · Default" : ""}</small>
          </button>
        ))}
      </div>
      <div className="sectionHeader">
        <div>
          <strong>¿Qué quieres crear?</strong>
          <p className="muted">Cada tipo ajusta plantilla, formato, música, subtítulos, narración y política de IA.</p>
        </div>
      </div>
      <div className="formatOptions">
        {videoTypeCards.map((card) => (
          <button key={card.id} type="button" className={`option ${draft.videoType === card.id ? "selected" : ""}`} onClick={() => onSelect(card)}>
            <strong>{card.label}</strong>
            <p>{card.description}</p>
            <span className="muted">{card.template} · {card.format}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function InfoStep({ draft, setDraft }: { draft: Draft; setDraft: (draft: Draft) => void }) {
  return (
    <div className="formGrid">
      <Field label="Nombre del proyecto" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
      <Field label="Producto" value={draft.productName} onChange={(value) => setDraft({ ...draft, productName: value })} />
      <Field label="Headline" value={draft.headline} onChange={(value) => setDraft({ ...draft, headline: value })} />
      <Field label="Texto secundario" value={draft.subheadline} onChange={(value) => setDraft({ ...draft, subheadline: value })} />
      <Field label="Oferta" value={draft.offer} onChange={(value) => setDraft({ ...draft, offer: value })} />
      <Field label="Precio" value={draft.price} onChange={(value) => setDraft({ ...draft, price: value })} />
      <Field label="Website" value={draft.website} onChange={(value) => setDraft({ ...draft, website: value })} full />
    </div>
  );
}

function StoryboardStep({
  project,
  busy,
  previewUrl,
  onAddScene,
  onDuplicateScene,
  onDeleteScene,
  onUpdateScene,
  onMoveScene,
  onPreviewScene,
  onPreviewChapter
}: {
  project?: Project;
  busy: string | null;
  previewUrl: string;
  onAddScene: () => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, patch: Partial<StoryScene>) => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  onPreviewScene: (sceneId: string) => void;
  onPreviewChapter: (chapter: string) => void;
}) {
  const scenes = [...(project?.scenes ?? [])].sort((a, b) => a.order - b.order);
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = scenes.find((scene) => scene.id === selectedId) ?? scenes[0];
  const chapters = Array.from(new Set(scenes.map((scene) => scene.chapter).filter(Boolean))) as string[];
  function patchSelected(patch: Partial<StoryScene>) {
    if (selected) onUpdateScene(selected.id, patch);
  }
  function addFocus() {
    if (!selected) return;
    const focus = selected.animation?.focus ?? [];
    patchSelected({ animation: { ...(selected.animation ?? {}), focus: [...focus, { timeSeconds: selected.duration / 2, x: 0.5, y: 0.5, scale: 1.6 }] } });
  }
  function addCallout(type: string) {
    if (!selected) return;
    const callouts = selected.animation?.callouts ?? [];
    const next = type === "ArrowCallout"
      ? { type, label: "Indicación", x: 960, y: 520, startX: 620, startY: 360, endX: 960, endY: 520, startTime: 1, endTime: Math.max(2, selected.duration - 1) }
      : { type, label: type === "BlurRegion" ? "" : "Importante", x: 600, y: 360, width: 360, height: 120, startTime: 1, endTime: Math.max(2, selected.duration - 1), style: type === "HighlightBox" ? "soft-glow" : "outline" };
    patchSelected({ animation: { ...(selected.animation ?? {}), callouts: [...callouts, next] } });
  }
  return (
    <div className="sectionBlock">
      <div className="sectionHeader">
        <div>
          <strong>Storyboard</strong>
          <p className="muted">Organiza escenas, capítulos, narración y foco visual sin una línea de tiempo compleja.</p>
        </div>
      </div>
      <div className="trainingEditor">
        <div className="storyboard">
          {scenes.length === 0 ? <p className="muted">Guarda el proyecto para crear el storyboard inicial según el tipo de video.</p> : null}
          {scenes.map((scene, index) => (
            <div className={`storyCard ${selected?.id === scene.id ? "selected" : ""}`} key={scene.id} onClick={() => setSelectedId(scene.id)}>
              <span>{scene.order}</span>
              <div>
                <strong>{scene.title}</strong>
                <small>{scene.chapter ?? scene.type} · {scene.duration}s</small>
                {scene.narrationScript ? <p>{scene.narrationScript}</p> : null}
              </div>
              <div className="rowActions">
                <button className="secondary iconButton" type="button" disabled={index === 0 || busy === `scene-move-${scene.id}`} onClick={(event) => { event.stopPropagation(); onMoveScene(scene.id, -1); }} title="Subir"><ChevronLeft size={15} /></button>
                <button className="secondary iconButton" type="button" disabled={index === scenes.length - 1 || busy === `scene-move-${scene.id}`} onClick={(event) => { event.stopPropagation(); onMoveScene(scene.id, 1); }} title="Bajar"><ChevronRight size={15} /></button>
                <button className="secondary iconButton" type="button" disabled={busy === `scene-duplicate-${scene.id}`} onClick={(event) => { event.stopPropagation(); onDuplicateScene(scene.id); }} title="Duplicar escena"><Copy size={15} /></button>
                <button className="danger iconButton" type="button" disabled={busy === `scene-delete-${scene.id}`} onClick={(event) => { event.stopPropagation(); onDeleteScene(scene.id); }} title="Eliminar escena"><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
          <button className="secondary" type="button" disabled={busy === "scene-add"} onClick={onAddScene}><Plus size={16} />Agregar escena</button>
          <div className="chapterList">
            <strong>Capítulos</strong>
            {chapters.map((chapter) => <button key={chapter} className="secondary" type="button" onClick={() => onPreviewChapter(chapter)}><Play size={14} />{chapter}</button>)}
          </div>
        </div>
        <div className="trainingPreview">
          {previewUrl ? <video controls src={previewUrl} /> : <div className="assetPlaceholder"><Play size={34} />Vista previa de escena o capítulo</div>}
        </div>
        {selected ? (
          <div className="sceneProperties">
            <div className="tabs"><span>Contenido</span><span>Encuadre</span><span>Anotaciones</span><span>Narración</span><span>Subtítulos</span></div>
            <label className="field"><span>Tipo</span><select value={selected.type} onChange={(event) => patchSelected({ type: event.target.value })}>{["TITLE", "CHAPTER", "SCREENSHOT", "SCREEN_RECORDING", "CALLOUT", "TEXT", "SUMMARY", "BRAND_INTRO", "BRAND_OUTRO", "CTA", "VIDEO", "IMAGE"].map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <Field label="Título" value={selected.title} onChange={(title) => patchSelected({ title })} />
            <Field label="Capítulo" value={selected.chapter ?? ""} onChange={(chapter) => patchSelected({ chapter })} />
            <label className="field"><span>Duración</span><input type="number" min="1" step="0.5" value={selected.duration} onChange={(event) => patchSelected({ duration: Number(event.target.value) })} /></label>
            <label className="field"><span>Modo duración</span><select value={selected.durationMode ?? "AUTO"} onChange={(event) => patchSelected({ durationMode: event.target.value as StoryScene["durationMode"] })}><option value="AUTO">AUTO</option><option value="MANUAL">MANUAL</option></select></label>
            <Toggle label="Tarjeta de capítulo" checked={Boolean(selected.chapterTitleEnabled)} onChange={(chapterTitleEnabled) => patchSelected({ chapterTitleEnabled })} />
            <div className="formGrid compact">
              <label className="field"><span>Inicio trim</span><input type="number" min="0" step="0.1" value={selected.trimStartSeconds ?? 0} onChange={(event) => patchSelected({ trimStartSeconds: Number(event.target.value) })} /></label>
              <label className="field"><span>Fin trim</span><input type="number" min="0" step="0.1" value={selected.trimEndSeconds ?? selected.duration} onChange={(event) => patchSelected({ trimEndSeconds: Number(event.target.value) })} /></label>
              <Toggle label="Audio original" checked={Boolean(selected.sourceAudioEnabled)} onChange={(sourceAudioEnabled) => patchSelected({ sourceAudioEnabled })} />
            </div>
            <div className="formGrid compact">
              <label className="field"><span>Zoom</span><input type="number" min="0.5" max="4" step="0.05" value={selected.scale ?? 1} onChange={(event) => patchSelected({ scale: Number(event.target.value) })} /></label>
              <label className="field"><span>X</span><input type="number" min="0" max="1" step="0.01" value={selected.positionX ?? 0.5} onChange={(event) => patchSelected({ positionX: Number(event.target.value) })} /></label>
              <label className="field"><span>Y</span><input type="number" min="0" max="1" step="0.01" value={selected.positionY ?? 0.5} onChange={(event) => patchSelected({ positionY: Number(event.target.value) })} /></label>
              <button className="secondary" type="button" onClick={() => patchSelected({ scale: 1, positionX: 0.5, positionY: 0.5, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 })}>Restablecer encuadre</button>
            </div>
            <div className="buttonRow">
              <button className="secondary" type="button" onClick={addFocus}><Plus size={14} />Añadir enfoque</button>
              <button className="secondary" type="button" onClick={() => addCallout("HighlightBox")}>Highlight</button>
              <button className="secondary" type="button" onClick={() => addCallout("ArrowCallout")}>Flecha</button>
              <button className="secondary" type="button" onClick={() => addCallout("SpotlightCallout")}>Spotlight</button>
              <button className="secondary" type="button" onClick={() => addCallout("BlurRegion")}>Blur</button>
              <button className="secondary" type="button" onClick={() => addCallout("CursorPulse")}>Click</button>
            </div>
            <label className="field full"><span>Narración de escena</span><textarea rows={4} value={selected.narrationScript ?? ""} onChange={(event) => patchSelected({ narrationScript: event.target.value })} /></label>
            <label className="field full"><span>Subtítulos personalizados JSON</span><textarea rows={3} value={JSON.stringify(selected.customSubtitles ?? [], null, 0)} onChange={(event) => { try { patchSelected({ customSubtitles: JSON.parse(event.target.value) }); } catch { /* keep typing */ } }} /></label>
            <div className="buttonRow">
              <button className="primary" type="button" disabled={busy === `scene-preview-${selected.id}`} onClick={() => onPreviewScene(selected.id)}><Play size={16} />Vista previa de escena</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AssetsStep({ previews, assetNames, project, busy, onUpload, onUploadMany }: { previews: Record<string, string>; assetNames: Record<string, string>; project?: Project; busy: string | null; onUpload: (type: AssetType, file?: File) => void; onUploadMany: (files?: FileList | File[], startType?: AssetType) => void }) {
  const existing = Object.fromEntries((project?.assets ?? []).map((asset) => [asset.type, asset.filename]));
  const uploadBusy = busy?.startsWith("upload");
  return (
    <div className="uploadGrid">
      <label className="bulkUpload">
        <span><Upload size={20} />Subir varias imágenes</span>
        <p className="muted">Selecciona varias imágenes y se asignarán en orden a los espacios disponibles.</p>
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" disabled={uploadBusy} onChange={(event) => void onUploadMany(event.target.files ?? undefined)} />
      </label>
      {uploadFields.map((field) => (
        <label className="uploadBox" key={field.type}>
          <strong>{field.label}{field.required ? " *" : ""}</strong>
          <p className="muted">{field.type === "screen_recording" ? "MP4, WEBM" : "PNG, JPG, JPEG, WEBP"}</p>
          <input
            type="file"
            multiple={field.type !== "screen_recording"}
            accept={field.type === "screen_recording" ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp"}
            disabled={uploadBusy}
            onChange={(event) => {
              const files = event.target.files;
              if ((files?.length ?? 0) > 1) void onUploadMany(files ?? undefined, field.type);
              else void onUpload(field.type, files?.[0]);
            }}
          />
          {previews[field.type] ? <img src={previews[field.type]} alt="" /> : <div className="assetPlaceholder">{field.type === "screen_recording" ? <FileVideo size={24} /> : <ImageIcon size={24} />}{existing[field.type] ?? assetNames[field.type] ?? "Pendiente"}</div>}
        </label>
      ))}
    </div>
  );
}

function FormatStep({ draft, setDraft, busy, stylePreviewUrl, onPreviewStyle }: { draft: Draft; setDraft: (draft: Draft) => void; busy: string | null; stylePreviewUrl: string; onPreviewStyle: () => void }) {
  return (
    <div className="audioGrid">
      <div className="formatOptions full">
        {[
          ["9:16", "1080x1920", "Reels / Stories / TikTok"],
          ["16:9", "1920x1080", "Cursos / YouTube / Desktop"],
          ["1:1", "1080x1080", "Social Square"],
          ["4:5", "1080x1350", "Feed vertical"]
        ].map(([format, size, use]) => (
          <button key={format} type="button" className={`option ${draft.format === format ? "selected" : ""}`} onClick={() => setDraft({ ...draft, format: format as Draft["format"] })}>
            <strong>{format}</strong>
            <p>{size}</p>
            <span className="muted">{use}</span>
          </button>
        ))}
      </div>
      <label className="field"><span>Estilo visual</span><select value={draft.visualStyle} onChange={(event) => setDraft({ ...draft, visualStyle: event.target.value })}><option value="saas-premium">SaaS Premium</option><option value="technology-cinematic">Technology Cinematic</option><option value="clean-corporate">Clean Corporate</option></select></label>
      <label className="field"><span>Movimiento</span><select value={draft.motionIntensity} onChange={(event) => setDraft({ ...draft, motionIntensity: event.target.value })}><option value="elegant">Elegante</option><option value="dynamic">Dinámico</option><option value="cinematic">Cinemático</option></select></label>
      <div className="buttonRow full"><button className="secondary" type="button" disabled={busy === "style-preview"} onClick={onPreviewStyle}><Play size={18} />Vista previa del estilo</button>{stylePreviewUrl ? <video controls src={stylePreviewUrl} style={{ width: 180, borderRadius: 8 }} /> : null}</div>
    </div>
  );
}

function AudioStep({
  draft,
  setDraft,
  voices,
  voiceProfiles,
  musicLibrary,
  busy,
  activePreview,
  voicePreviewUrl,
  mixPreviewUrl,
  customMusicUrl,
  onPreviewVoice,
  onPreviewVoiceProfile,
  onPreviewMusic,
  onPreviewCustomMusic,
  onPreviewMix,
  onMusicUpload,
  onVoiceReferenceUpload
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  voices: VoiceOption[];
  voiceProfiles: VoiceProfile[];
  musicLibrary: MusicTrack[];
  busy: string | null;
  activePreview: string;
  voicePreviewUrl: string;
  mixPreviewUrl: string;
  customMusicUrl: string;
  onPreviewVoice: () => void;
  onPreviewVoiceProfile: (profile: VoiceProfile) => void;
  onPreviewMusic: (track: MusicTrack) => void;
  onPreviewCustomMusic: () => void;
  onPreviewMix: () => void;
  onMusicUpload: (file?: File) => void;
  onVoiceReferenceUpload: (file?: File) => void;
}) {
  const voiceOptions = voices.length ? voices : [{ id: draft.voiceName, name: "Voz femenina español local", gender: "Female", culture: "es", works: true }];
  const profiles = voiceProfiles.length
    ? voiceProfiles
    : [{ id: "dominican-promotional", label: "Dominicana promocional", description: "Fallback local disponible", voiceId: voiceOptions[0]?.id, voiceName: voiceOptions[0]?.name, culture: voiceOptions[0]?.culture, speed: 1.05, available: Boolean(voiceOptions[0]) }];
  const selectedProfile = profiles.find((profile) => profile.id === draft.voiceProfile) ?? profiles[0];
  function chooseProfile(profile: VoiceProfile) {
    setDraft({ ...draft, voiceProfile: profile.id, voiceName: profile.label, voiceId: profile.voiceId, voiceSpeed: draft.voiceSpeed || profile.speed });
  }
  return (
    <div className="audioGrid">
      <Toggle label="Activar voz en off" checked={draft.voiceoverEnabled} onChange={(voiceoverEnabled) => setDraft({ ...draft, voiceoverEnabled })} />
      <Toggle label="Activar música de fondo" checked={draft.musicEnabled} onChange={(musicEnabled) => setDraft({ ...draft, musicEnabled })} />
      <label className="field"><span>Idioma</span><input value="Español" disabled /></label>
      <label className="field"><span>Voz real instalada</span><select value={draft.voiceId ?? selectedProfile?.voiceId ?? ""} onChange={(event) => setDraft({ ...draft, voiceId: event.target.value })}>{voiceOptions.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.gender} · {voice.culture}</option>)}</select></label>
      <label className="field"><span>Perfil</span><select value={draft.voiceProfile} onChange={(event) => chooseProfile(profiles.find((profile) => profile.id === event.target.value) ?? profiles[0])}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select><small className="muted">{selectedProfile?.voiceName ?? "Sin voz"} · {selectedProfile?.culture ?? "sin locale"}</small></label>
      <label className="field"><span>Velocidad</span><select value={draft.voiceSpeed} onChange={(event) => setDraft({ ...draft, voiceSpeed: Number(event.target.value) })}><option value={0.9}>0.90</option><option value={0.95}>0.95</option><option value={1}>1.00</option><option value={1.05}>1.05</option><option value={1.1}>1.10</option></select></label>
      <label className="field"><span>Volumen voz</span><input type="range" min="0" max="1" step="0.05" value={draft.voiceVolume} onChange={(event) => setDraft({ ...draft, voiceVolume: Number(event.target.value) })} /><small className="muted">{Math.round(draft.voiceVolume * 100)}%</small></label>
      <label className="field full"><span>Guion de voz en off</span><textarea rows={6} value={draft.voiceoverScript} onChange={(event) => setDraft({ ...draft, voiceoverScript: event.target.value })} /></label>
      <div className="buttonRow full"><button className="secondary" type="button" disabled={busy === "voice-preview"} onClick={onPreviewVoice}><Play size={18} />Probar voz</button>{voicePreviewUrl ? <audio controls src={voicePreviewUrl} /> : null}</div>
      <div className="voiceCompare full">
        <strong>Comparador de voces</strong>
        <div className="buttonRow">
          {profiles.map((profile) => (
            <button className="secondary" key={profile.id} type="button" disabled={busy === `voice-profile-${profile.id}`} onClick={() => onPreviewVoiceProfile(profile)}>
              {activePreview === `voice-profile-${profile.id}` ? <Square size={16} /> : <Play size={16} />}
              {profile.label}
            </button>
          ))}
        </div>
      </div>
      <label className="field full">
        <span>Agregar voz de referencia autorizada</span>
        <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" disabled={busy === "voice-reference"} onChange={(event) => onVoiceReferenceUpload(event.target.files?.[0])} />
        <small className="muted">Usa una muestra propia o con permiso: 10-30 segundos, una sola persona, voz limpia, sin música ni eco.</small>
        {draft.voiceReferenceName ? <small className="successText">Referencia guardada: {draft.voiceReferenceName}</small> : null}
      </label>
      <div className="musicLibrary full">
        <strong>Música de fondo</strong>
        <label className={`musicOption ${!draft.musicEnabled ? "selected" : ""}`}>
          <input type="radio" checked={!draft.musicEnabled} onChange={() => setDraft({ ...draft, musicEnabled: false, musicTrackId: undefined })} />
          <span><b>Sin música</b><small>Solo narración</small></span>
        </label>
        {musicLibrary.map((track) => (
          <label className={`musicOption ${draft.musicEnabled && draft.musicTrackId === track.id ? "selected" : ""}`} key={track.id}>
            <input type="radio" checked={draft.musicEnabled && draft.musicTrackId === track.id} onChange={() => setDraft({ ...draft, musicEnabled: true, musicTrackId: track.id, musicPath: undefined, customMusicPath: undefined })} />
            <span><b>{track.name}</b><small>{track.category} · {track.mood} · {track.quality}</small></span>
            <button className="secondary" type="button" onClick={(event) => { event.preventDefault(); onPreviewMusic(track); }}>
              {activePreview === `music-${track.id}` ? <Square size={16} /> : <Play size={16} />}
              {activePreview === `music-${track.id}` ? "Detener" : "Escuchar"}
            </button>
            {draft.musicTrackId === track.id ? <em>Seleccionada</em> : null}
          </label>
        ))}
        <label className={`musicOption ${draft.customMusicPath ? "selected" : ""}`}>
          <input type="radio" checked={Boolean(draft.customMusicPath)} onChange={() => setDraft({ ...draft, musicEnabled: true, musicTrackId: undefined })} />
          <span><b>Subir mi propia música</b><small>MP3, WAV o M4A</small></span>
          <input type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" disabled={busy === "music"} onChange={(event) => onMusicUpload(event.target.files?.[0])} />
          {customMusicUrl || draft.customMusicPath ? <button className="secondary" type="button" onClick={(event) => { event.preventDefault(); onPreviewCustomMusic(); }}><Play size={16} />Escuchar</button> : null}
          {draft.customMusicPath ? <em>Mi pista</em> : null}
        </label>
      </div>
      <label className="field full"><span>Volumen música</span><input type="range" min="0" max="1" step="0.01" value={draft.musicVolume} onChange={(event) => setDraft({ ...draft, musicVolume: Number(event.target.value) })} /><small className="muted">{Math.round(draft.musicVolume * 100)}%</small></label>
      <div className="buttonRow full"><button className="primary" type="button" disabled={busy === "mix-preview"} onClick={onPreviewMix}><Play size={18} />Probar voz + música</button>{mixPreviewUrl ? <audio controls src={mixPreviewUrl} /> : null}</div>
    </div>
  );
}

function AiEnhancementStep({
  draft,
  setDraft,
  profiles,
  quote,
  jobs,
  transport,
  busy,
  onPrepareTransport,
  onStopTransport,
  onPreviewHybrid,
  onQuote,
  onConfirm,
  hybridPreviewUrl
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  profiles: AiVideoProfilesResponse | null;
  quote: AiVideoQuote | null;
  jobs: AiVideoJob[];
  transport: AiTransportStatus | null;
  busy: string | null;
  onPrepareTransport: () => void;
  onStopTransport: () => void;
  onPreviewHybrid: () => void;
  onQuote: () => void;
  onConfirm: () => void;
  hybridPreviewUrl: string;
}) {
  const availableProfiles = profiles?.profiles ?? [
    { id: "preview", label: "Preview IA WAN2.2 720p", model: "wan-2-2-i2v", resolution: "1280x720", duration: 5, estimatedCost: 0.3 },
    { id: "premium", label: "Premium WAN2.6 720p", model: "wan-2-6-i2v", resolution: "1280x720", duration: 5, estimatedCost: 0.5 },
    { id: "premium-1080p", label: "Premium WAN2.6 1080p", model: "wan-2-6-i2v", resolution: "1920x1080", duration: 5, estimatedCost: 0.75, requiresExplicit1080p: true }
  ] satisfies AiVideoProfile[];
  const scenes = profiles?.scenes ?? [
    { id: "desktop-hero", label: "Desktop Hero", assetType: "billing", prompt: "" },
    { id: "mobile-hero", label: "Mobile Hero", assetType: "mobile", prompt: "" },
    { id: "multi-device-hero", label: "Multi-device Hero", assetType: "billing", prompt: "" }
  ] satisfies AiVideoScene[];
  return (
    <section className="aiPanel">
      <div className="sectionHeader">
        <div>
          <strong><Sparkles size={18} />Mejora con IA</strong>
          <p className="muted">Generación image-to-video preparada con RunPod. Siempre confirma costo antes de cualquier solicitud paga.</p>
        </div>
        <Toggle label="Activar IA" checked={draft.aiEnabled} onChange={(aiEnabled) => setDraft({ ...draft, aiEnabled })} />
      </div>
      {draft.aiEnabled ? (
        <div className="audioGrid">
          <div className={`transportStatus full ${transport?.ready ? "ready" : ""}`}>
            <div>
              <strong>{transport?.r2Configured ? "● R2 listo" : "○ R2 no configurado"}</strong>
              <span>Almacenamiento IA · {transport?.preferredProvider === "r2-signed-url" ? "R2 signed URL" : `túnel temporal puerto ${transport?.localPort ?? 4100}`}</span>
              <small>{transport?.r2Configured ? "Bucket privado con URL firmada temporal." : transport?.cloudflaredAvailable === false ? "Fallback disponible sólo si instalas cloudflared." : "Prepara el gateway dedicado y el túnel temporal."}</small>
            </div>
            <div className="buttonRow">
              <button className="secondary" type="button" disabled={busy === "ai-transport"} onClick={onPrepareTransport}>Preparar conexión IA</button>
              <button className="secondary" type="button" disabled={busy === "ai-transport-stop"} onClick={onStopTransport}>Detener conexión IA</button>
            </div>
          </div>
          <label className="field"><span>Escena</span><select value={draft.aiScene} onChange={(event) => setDraft({ ...draft, aiScene: event.target.value as Draft["aiScene"] })}>{scenes.map((scene) => <option key={scene.id} value={scene.id}>{scene.label}</option>)}</select></label>
          <label className="field"><span>Duración</span><input value="5 segundos" disabled /></label>
          <div className="formatOptions full">
            <button type="button" className={`option ${draft.aiSceneMode === "standard" ? "selected" : ""}`} onClick={() => setDraft({ ...draft, aiSceneMode: "standard" })}>
              <strong>Standard</strong>
              <p>Solo Remotion con pantallas reales.</p>
            </button>
            <button type="button" className={`option ${draft.aiSceneMode === "hybrid" ? "selected" : ""}`} onClick={() => setDraft({ ...draft, aiSceneMode: "hybrid" })}>
              <strong>Hybrid AI <span className="badge">Recommended</span></strong>
              <p>Fondo IA + dispositivo y UI reales.</p>
            </button>
            <button type="button" className={`option ${draft.aiSceneMode === "full-ai-experimental" ? "selected" : ""}`} onClick={() => setDraft({ ...draft, aiSceneMode: "full-ai-experimental" })}>
              <strong>Full AI Experimental</strong>
              <p>Puede alterar textos e interfaz.</p>
            </button>
          </div>
          <div className="costGuard full">
            <strong>AI background: clip generado existente</strong>
            <span>Real UI: mobile.png · Modo recomendado: Hybrid AI · RunPod no se ejecuta para el preview local.</span>
          </div>
          <div className="formatOptions full">
            {availableProfiles.map((profile) => (
              <button key={profile.id} type="button" className={`option ${draft.aiQuality === profile.id ? "selected" : ""}`} onClick={() => setDraft({ ...draft, aiQuality: profile.id })}>
                <strong>{profile.label}</strong>
                <p>{profile.model} · {profile.resolution}</p>
                <span className="muted">~US${profile.estimatedCost.toFixed(2)} / 5s</span>
              </button>
            ))}
          </div>
          <label className="field"><span>AI Motion Intensity</span><select value={draft.aiMotion} onChange={(event) => setDraft({ ...draft, aiMotion: event.target.value as Draft["aiMotion"] })}><option value="elegant">Elegant</option><option value="cinematic">Cinematic</option><option value="dynamic">Dynamic</option></select></label>
          <label className="field full"><span>Prompt para nuevo fondo IA</span><textarea rows={4} value={draft.aiPrompt} onChange={(event) => setDraft({ ...draft, aiPrompt: event.target.value })} placeholder="Premium SaaS technology commercial background, no text, no logos, no devices, no interface." /></label>
          <div className="buttonRow full">
            <button className="secondary" type="button" disabled={busy === "hybrid-preview"} onClick={onPreviewHybrid}><Play size={18} />Preview escena</button>
            <button className="primary" type="button" onClick={() => setDraft({ ...draft, aiSceneMode: "hybrid" })}>Usar en anuncio</button>
            <button className="secondary" type="button" disabled={busy === "ai-quote"} onClick={onQuote}>Cambiar fondo IA</button>
            <button className="secondary" type="button" disabled={busy === "ai-quote"} onClick={onQuote}><Sparkles size={18} />Generar nuevo fondo IA</button>
            {quote ? <button className="primary" type="button" disabled={busy === "ai-generate"} onClick={onConfirm}>Confirmar generación</button> : null}
          </div>
          {hybridPreviewUrl ? (
            <div className="full">
              <video controls src={hybridPreviewUrl} style={{ width: 220, borderRadius: 8, border: "1px solid #d7e4f4" }} />
            </div>
          ) : null}
          {quote ? (
            <div className="costGuard full">
              <strong>{quote.model} · {quote.resolution} · {quote.duration}s · US${quote.estimatedCost.toFixed(2)}</strong>
              <span>{quote.canGenerateNow ? `Temporary URL ready · expires in ${minutesUntil(quote.expiresAt)} min` : quote.blocker}</span>
            </div>
          ) : null}
          {jobs.length ? (
            <div className="aiJobs full">
              <strong>Jobs IA recientes</strong>
              {jobs.slice(0, 3).map((job) => (
                <div className="projectRow" key={job.id}>
                  <div><strong>{job.scene}</strong><div className="muted">{job.status} · {job.model} · {job.resolution} · US${(job.reportedCost ?? job.estimatedCost).toFixed(2)}</div>{job.errorMessage ? <small className="warningText">{job.errorMessage}</small> : null}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProjectPreview({ draft, previews, assetNames, project }: { draft: Draft; previews: Record<string, string>; assetNames: Record<string, string>; project?: Project }) {
  const existing = Object.fromEntries((project?.assets ?? []).map((asset) => [asset.type, asset.filename]));
  return (
    <div className="review">
      <div><strong>Preview del proyecto</strong><p className="muted">Textos, formato, audio, plantilla y recursos antes de renderizar.</p></div>
      <div className="reviewGrid">
        <span><strong>Proyecto</strong>{draft.name}</span><span><strong>Producto</strong>{draft.productName}</span><span><strong>Formato</strong>{draft.format}</span>
        <span><strong>Plantilla</strong>{templateLabel(draft.template)}</span><span><strong>Voz</strong>{draft.voiceoverEnabled ? `${draft.voiceName} · ${draft.voiceSpeed}` : "Desactivada"}</span><span><strong>Música</strong>{draft.musicEnabled ? `${draft.musicTrackId ?? (draft.customMusicPath ? "Mi pista" : "Auto")} · ${Math.round(draft.musicVolume * 100)}%` : "Desactivada"}</span>
      </div>
      <div className="assetStrip">
        {uploadFields.slice(0, 5).map((field) => (
          <div className="assetThumb" key={field.type}>{previews[field.type] ? <img src={previews[field.type]} alt="" /> : <ImageIcon size={22} />}<span>{field.label}</span><small>{assetNames[field.type] ?? existing[field.type] ?? "Pendiente"}</small></div>
        ))}
      </div>
    </div>
  );
}

function ProjectList({ projects, onOpen, onDuplicate, onDelete, busy, compact = false }: { projects: Project[]; onOpen: (project: Project) => void; onDuplicate: (project: Project) => void; onDelete: (project: Project) => void; busy: string | null; compact?: boolean }) {
  const [brandFilter, setBrandFilter] = useState("ALL");
  const brands = Array.from(new Set(projects.map((project) => project.brandProfile?.name ?? project.productName))).sort();
  const visibleProjects = brandFilter === "ALL" ? projects : projects.filter((project) => (project.brandProfile?.name ?? project.productName) === brandFilter);
  return (
    <section className="card projectList">
      <div className="sectionHeader">
        <strong>Proyectos recientes</strong>
        {!compact ? <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}><option value="ALL">Todas las marcas</option>{brands.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select> : null}
      </div>
      {visibleProjects.length === 0 ? <p className="muted">Aún no hay proyectos.</p> : null}
      {visibleProjects.map((project) => (
        <div className="projectRow" key={project.id}>
          <div><strong>{project.name}</strong><div className="muted">{project.brandProfile?.name ?? project.productName} · {project.videoType} · {new Date(project.createdAt).toLocaleDateString("es-DO")} · {project.renderJobs?.[0]?.status ?? "Sin render"}</div></div>
          <div className="rowActions">
            <button className="secondary iconButton" type="button" onClick={() => onOpen(project)} title="Abrir proyecto"><ExternalLink size={16} /></button>
            {!compact ? <button className="secondary iconButton" type="button" onClick={() => onDuplicate(project)} disabled={busy === `duplicate-${project.id}`} title="Duplicar proyecto"><Copy size={16} /></button> : null}
            {!compact ? <button className="danger iconButton" type="button" onClick={() => onDelete(project)} disabled={busy === `delete-${project.id}`} title="Eliminar proyecto"><Trash2 size={16} /></button> : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function VideoList({ videos }: { videos: RenderJob[] }) {
  return (
    <section className="card projectList">
      <strong>Videos generados</strong>
      {videos.length === 0 ? <p className="muted">Aún no hay videos.</p> : null}
      {videos.map((video) => (
        <div className="projectRow" key={video.id}>
          <div><strong>{video.project?.name ?? video.id}</strong><div className="muted">{video.status} · {video.progress}%{video.audioNote ? ` · ${video.audioNote}` : ""}</div></div>
          <div className="rowActions">
            {video.status === "COMPLETED" ? <a className="secondary iconButton" href={`${API_URL}/renders/${video.id}/stream`} target="_blank"><ExternalLink size={16} /></a> : null}
            {video.status === "COMPLETED" ? <a className="secondary iconButton" href={`${API_URL}/renders/${video.id}/file`}><Download size={16} /></a> : null}
          </div>
        </div>
      ))}
    </section>
  );
}

function BrandManager({ brands, busy, selectedBrandId, onSelect, onCreate, onDuplicate, onArchive }: { brands: BrandProfile[]; busy: string | null; selectedBrandId?: string; onSelect: (brand: BrandProfile) => void; onCreate: () => void; onDuplicate: (id: string) => void; onArchive: (id: string) => void }) {
  return (
    <section className="card">
      <div className="sectionHeader">
        <div>
          <h2>Mis marcas</h2>
          <p className="muted">Gestiona perfiles reutilizables de marca sin mezclar logos, CTAs, website, voz ni música entre clientes.</p>
        </div>
        <button className="primary" type="button" disabled={busy === "brand-create"} onClick={onCreate}><Plus size={18} />Nueva marca</button>
      </div>
      <div className="brandManagerGrid">
        {brands.map((brand) => (
          <div className={`brandManagerCard ${selectedBrandId === brand.id ? "selected" : ""}`} key={brand.id}>
            <div className="brandPreview" style={{ background: brand.backgroundColor, color: brand.textColor }}>
              <span className="brandSwatch" style={{ background: `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }}>{brand.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
              <div>
                <strong>{brand.name}</strong>
                <small>{brand.website ?? brand.slug}</small>
              </div>
              <em style={{ background: brand.primaryColor, color: "#fff" }}>{brand.defaultCTA ?? "CTA"}</em>
            </div>
            <div className="reviewGrid">
              <span><strong>Color</strong>{brand.primaryColor}</span>
              <span><strong>Voz</strong>{brand.defaultVoiceProfile ?? "Sin default"}</span>
              <span><strong>Watermark</strong>{brand.watermarkEnabled ? `${brand.watermarkPosition} · ${Math.round(brand.watermarkOpacity * 100)}%` : "OFF"}</span>
              <span><strong>Proyectos</strong>{brand.projects?.length ?? 0}</span>
            </div>
            <div className="buttonRow">
              <button className="secondary" type="button" onClick={() => onSelect(brand)}>Open</button>
              <button className="secondary" type="button" onClick={() => onSelect(brand)}>Edit</button>
              <button className="secondary" type="button" disabled={busy === `brand-duplicate-${brand.id}`} onClick={() => onDuplicate(brand.id)}><Copy size={16} />Duplicate</button>
              <button className="danger" type="button" disabled={busy === `brand-archive-${brand.id}` || brand.isDefault} onClick={() => onArchive(brand.id)}>Archive</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function VideoLinks({ downloadUrl, streamUrl }: { downloadUrl: string; streamUrl: string }) {
  return <><a className="secondary" href={streamUrl} target="_blank"><ExternalLink size={18} />Abrir video</a><a className="secondary" href={downloadUrl}><Download size={18} />Descargar MP4</a></>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card"><div className="muted">{label}</div><div className="statValue">{value}</div></div>;
}

function Field({ label, value, onChange, full = false }: { label: string; value: string; onChange: (value: string) => void; full?: boolean }) {
  return <label className={`field ${full ? "full" : ""}`}><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function templateLabel(template: Draft["template"]) {
  const labels: Record<Draft["template"], string> = {
    "fullpos-premium-vertical": "Anuncio premium",
    "saas-premium-ad": "Anuncio premium",
    "quick-tutorial": "Tutorial rápido",
    "professional-course": "Curso profesional",
    "feature-spotlight": "Función destacada",
    "customer-onboarding": "Onboarding",
    "visual-support": "Soporte visual",
    "brand-motivational": "Marca / Motivación"
  };
  return labels[template] ?? template;
}

function projectToDraft(project: Project): Draft {
  return {
    name: project.name,
    brandProfileId: project.brandProfileId,
    videoType: project.videoType ?? "ADVERTISEMENT",
    productName: project.productName,
    headline: project.headline,
    subheadline: project.subheadline ?? "",
    offer: project.offer,
    price: project.price,
    website: project.website,
    format: project.format,
    template: (project.template === "fullpos-premium-vertical" ? "saas-premium-ad" : project.template) as Draft["template"],
    durationMode: project.durationMode ?? defaultDraft.durationMode,
    durationSeconds: project.durationSeconds,
    subtitleMode: (project.subtitleMode ?? defaultDraft.subtitleMode) as Draft["subtitleMode"],
    narrationStyle: (project.narrationStyle ?? defaultDraft.narrationStyle) as Draft["narrationStyle"],
    voiceoverEnabled: project.voiceoverEnabled,
    voiceoverScript: project.voiceoverScript ?? defaultDraft.voiceoverScript,
    voiceProfile: project.voiceProfile ?? defaultDraft.voiceProfile,
    voiceName: project.voiceName,
    voiceId: project.voiceId,
    voiceReferenceId: project.voiceReferenceId,
    voiceReferencePath: project.voiceReferencePath,
    voiceReferenceName: project.voiceReferenceName,
    voiceSpeed: project.voiceSpeed ?? 1,
    voiceVolume: project.voiceVolume ?? 1,
    musicEnabled: project.musicEnabled,
    musicTrackId: project.musicTrackId,
    musicPath: project.musicPath,
    customMusicPath: project.customMusicPath,
    musicVolume: project.musicVolume ?? 0.15,
    visualStyle: project.visualStyle ?? defaultDraft.visualStyle,
    motionIntensity: project.motionIntensity ?? defaultDraft.motionIntensity,
    aiEnabled: defaultDraft.aiEnabled,
    aiScene: defaultDraft.aiScene,
    aiQuality: defaultDraft.aiQuality,
    aiSceneMode: defaultDraft.aiSceneMode,
    aiMotion: defaultDraft.aiMotion,
    aiPrompt: defaultDraft.aiPrompt
  };
}

function applyBrandToDraft(current: Draft, brand: BrandProfile): Draft {
  return {
    ...current,
    brandProfileId: brand.id,
    productName: brand.name,
    website: brand.website ?? current.website,
    offer: brand.defaultOffer ?? current.offer,
    price: brand.defaultPriceText ?? current.price,
    voiceProfile: brand.defaultVoiceProfile ?? current.voiceProfile,
    voiceName: brand.defaultVoiceProfile ?? current.voiceName,
    narrationStyle: brand.defaultNarrationStyle ?? current.narrationStyle,
    musicTrackId: brand.defaultMusicTrackId ?? current.musicTrackId,
    musicVolume: brand.defaultMusicVolume ?? current.musicVolume
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function renderStage(job: RenderJob) {
  if (job.status === "QUEUED") return "Preparando recursos";
  if (job.status === "FAILED") return job.errorMessage ?? "El render falló";
  if (job.status === "COMPLETED") return "Finalizado";
  if (job.progress < 12) return "Preparando recursos";
  if (job.progress < 82) return "Renderizando";
  if (job.progress < 96) return "Procesando video";
  return "Finalizando";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado.";
}

function minutesUntil(value?: string) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((Date.parse(value) - Date.now()) / 60_000));
}

function sectionSubtitle(section: Section) {
  if (section === "Dashboard") return "Resumen local del estudio y actividad reciente.";
  if (section === "Crear anuncio") return "Crea publicidad, tutoriales, cursos, soporte y videos de marca.";
  if (section === "Proyectos") return "Abre, duplica o elimina proyectos locales.";
  if (section === "Videos") return "Revisa, abre y descarga videos generados.";
  if (section === "Marcas") return "Administra perfiles visuales, voz, música y activos por empresa.";
  return "Ajustes locales de audio y generación.";
}
