"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileVideo,
  FolderKanban,
  Gauge,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Menu,
  Mic,
  MousePointer,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X,
  ZoomIn
} from "lucide-react";
import type { AssetType, VideoType } from "@fullpos-ad-studio/shared";
import {
  assetReadiness,
  idleMediaOperation,
  isMediaOperationRunning,
  isLatestResponse,
  mediaOperationLabel,
  mediaPanelStatus,
  normalizeScene,
  resolveSelectedScene,
  shouldReplaceStarterStoryboard,
  subtitleCues,
  visibleStoryScenes,
  type MediaOperation
} from "./storyboard-state";

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Section = "Dashboard" | "Crear video" | "Biblioteca" | "Proyectos" | "Videos" | "Marcas" | "Configuración";

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
  /* URLs firmadas por el API para reproducir audio sin cabeceras. */
  customMusicUrl?: string | null;
  voiceReferenceUrl?: string | null;
  musicVolume: number;
  visualStyle: string;
  motionIntensity: string;
  createdAt: string;
  assets: Array<ProjectAsset>;
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
  logoPrimaryAssetId?: string;
  logoLightAssetId?: string;
  logoDarkAssetId?: string;
  watermarkAssetId?: string;
  assets?: BrandAsset[];
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

type TrainingPreviewState = {
  status: "idle" | "loading" | "ready" | "error";
  message: string;
  mode?: "scene" | "chapter" | "full";
  sceneId?: string;
  chapter?: string;
};

type ProjectAsset = { id: string; type: string; filename: string; path: string; mimeType?: string; durationSeconds?: number };

type BrandAsset = {
  id: string;
  type: string;
  filename: string;
  mimeType: string;
};

type BrandForm = {
  name: string;
  description: string;
  website: string;
  whatsapp: string;
  email: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  defaultVoiceProfile: string;
  defaultNarrationStyle: Draft["narrationStyle"];
  defaultMusicTrackId: string;
  defaultCTA: string;
  watermarkEnabled: boolean;
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
  mediaAssetId?: string | null;
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
  /* URL firmada por el API para poder escucharla sin cabeceras. */
  url?: string;
};

type AuthStatus = {
  ownerConfigured: boolean;
  authRequired: boolean;
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

const videoTypeCards: Array<{ id: VideoType; icon: string; label: string; description: string; meta: string; template: Draft["template"]; format: Draft["format"]; narrationStyle: Draft["narrationStyle"]; subtitleMode: Draft["subtitleMode"]; musicEnabled: boolean; aiEnabled: boolean; durationMode: string }> = [
  { id: "ADVERTISEMENT", icon: "AD", label: "Publicidad", description: "Promociona tu producto o servicio", meta: "9:16 · Música · IA opcional", template: "saas-premium-ad", format: "9:16", narrationStyle: "PROMOTIONAL", subtitleMode: "OFF", musicEnabled: true, aiEnabled: true, durationMode: "30_SEC" },
  { id: "QUICK_TUTORIAL", icon: "TU", label: "Tutorial rápido", description: "Explica una función en pocos minutos", meta: "9:16 o 16:9 · Narración · Subtítulos", template: "quick-tutorial", format: "9:16", narrationStyle: "QUICK_TUTORIAL", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "SCENE_BASED" },
  { id: "COURSE", icon: "CA", label: "Curso / Capacitación", description: "Capacita usuarios paso a paso", meta: "16:9 · Capítulos · Narración", template: "professional-course", format: "16:9", narrationStyle: "TRAINING", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "LONG_FORM" },
  { id: "ONBOARDING", icon: "PS", label: "Primeros pasos", description: "Enseña a nuevos usuarios cómo comenzar", meta: "16:9 · Paso a paso", template: "customer-onboarding", format: "16:9", narrationStyle: "TRAINING", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "SCENE_BASED" },
  { id: "FEATURE_SPOTLIGHT", icon: "UI", label: "Mostrar una función", description: "Presenta una herramienta específica", meta: "16:9 o 9:16 · UI real · IA opcional", template: "feature-spotlight", format: "16:9", narrationStyle: "CORPORATE", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: true, aiEnabled: true, durationMode: "60_SEC" },
  { id: "SUPPORT", icon: "SO", label: "Soporte", description: "Explica cómo resolver un problema", meta: "16:9 · Claro y directo", template: "visual-support", format: "16:9", narrationStyle: "QUICK_TUTORIAL", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: false, aiEnabled: false, durationMode: "SCENE_BASED" },
  { id: "BRAND_MOTIVATIONAL", icon: "BR", label: "Marca / Motivación", description: "Crea contenido institucional o inspirador", meta: "Flexible · Música · IA opcional", template: "brand-motivational", format: "9:16", narrationStyle: "MOTIVATIONAL", subtitleMode: "AUTO_FROM_NARRATION", musicEnabled: true, aiEnabled: true, durationMode: "60_SEC" },
  { id: "FREEFORM", icon: "LI", label: "Video libre", description: "Construye el video a tu manera", meta: "Formato y estructura personalizados", template: "brand-motivational", format: "16:9", narrationStyle: "CORPORATE", subtitleMode: "OFF", musicEnabled: false, aiEnabled: false, durationMode: "CUSTOM" }
];

const nav: Array<[Section, typeof Gauge]> = [
  ["Dashboard", Gauge],
  ["Crear video", Clapperboard],
  ["Biblioteca", Archive],
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
  const [trainingPreviewState, setTrainingPreviewState] = useState<TrainingPreviewState>({ status: "idle", message: "" });
  const [customMusicUrl, setCustomMusicUrl] = useState("");
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const [activePreview, setActivePreview] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [assetNames, setAssetNames] = useState<Record<string, string>>({});
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /* Operacion de medios en curso (subida/asociacion/commit). Mientras corre, la
     UI se queda en el ultimo estado estable y solo muestra el progreso. */
  const [mediaOperation, setMediaOperation] = useState<MediaOperation>(idleMediaOperation);
  const [message, setMessage] = useState({ type: "info", text: "Listo para crear un video." });
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [authToken, setAuthToken] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [brandModal, setBrandModal] = useState<{ mode: "create" | "edit"; brand?: BrandProfile } | null>(null);
  const [brandForm, setBrandForm] = useState<BrandForm>(emptyBrandForm());
  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null);
  const [brandLogoPreview, setBrandLogoPreview] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sceneSaveTimers = useRef<Record<string, number>>({});
  const scenePendingPatches = useRef<Record<string, Partial<StoryScene>>>({});
  /* Secuencia de peticiones de proyectos para descartar respuestas viejas. */
  const projectsRequestId = useRef(0);
  /* Ultima revalidacion de la sesion, para no repetirla en cada cambio de pestaña. */
  const lastSessionCheck = useRef(0);

  useEffect(() => {
    setAuthToken(window.localStorage.getItem("videoStudioToken") ?? "");
    setSidebarExpanded(window.localStorage.getItem("videoStudioSidebar") === "expanded");
    void loadAuthStatus();
    void refreshSession();
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setAuthToken("");
      setSessionExpired(true);
      setProjects([]);
      setBrands([]);
      setVideos([]);
      setMobileSidebarOpen(false);
    }
    function handleVisibility() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastSessionCheck.current < SESSION_RECHECK_MS) return;
      void refreshSession();
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // Solo al montar: las funciones usan setters estables y localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function preventAppZoom(event: WheelEvent) {
      if (event.ctrlKey) event.preventDefault();
    }
    function preventZoomKeys(event: KeyboardEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      if (["+", "-", "=", "0"].includes(event.key)) event.preventDefault();
    }
    window.addEventListener("wheel", preventAppZoom, { passive: false });
    window.addEventListener("keydown", preventZoomKeys);
    return () => {
      window.removeEventListener("wheel", preventAppZoom);
      window.removeEventListener("keydown", preventZoomKeys);
      Object.values(sceneSaveTimers.current).forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!authStatus) return;
    if (authStatus.authRequired && !authToken) return;
    void refreshAll();
    void loadBrands();
    void loadSettings();
    void loadVoices();
    void loadVoiceProfiles();
    void loadMusicLibrary();
    void loadAiProfiles();
    void loadAiTransportStatus();
  }, [authStatus, authToken]);

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
  const selectedBrand = brands.find((brand) => brand.id === draft.brandProfileId);
  const latestJob = renderJob ?? selectedProject?.renderJobs?.[0] ?? null;
  const isRendering = latestJob?.status === "QUEUED" || latestJob?.status === "RENDERING";
  const downloadUrl = latestJob?.status === "COMPLETED" ? `${API_URL}/renders/${latestJob.id}/file` : "";
  const streamUrl = latestJob?.status === "COMPLETED" ? `${API_URL}/renders/${latestJob.id}/stream` : "";

  async function loadAuthStatus() {
    try {
      setAuthStatus(await fetchJson<AuthStatus>(`${API_URL}/auth/status`, { skipAuth: true }));
    } catch {
      setAuthStatus({ ownerConfigured: false, authRequired: false });
    }
  }

  /**
   * Revalida la sesion guardada. El API devuelve un token nuevo cuando al actual le queda
   * menos de la mitad de su vida, asi que la sesion no caduca mientras se use el estudio.
   * Si el token ya no sirve, el 401 lo descarta y vuelve la pantalla de acceso.
   */
  async function refreshSession() {
    if (!window.localStorage.getItem("videoStudioToken")) return;
    lastSessionCheck.current = Date.now();
    try {
      const result = await fetchJson<{ token?: string }>(`${API_URL}/auth/me`);
      if (!result.token) return;
      window.localStorage.setItem("videoStudioToken", result.token);
      setAuthToken(result.token);
    } catch {
      // El 401 ya limpia el token y muestra el acceso; un fallo de red no cierra sesion.
    }
  }

  async function login() {
    try {
      setBusy("login");
      const result = await fetchJson<{ token: string }>(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
        skipAuth: true
      });
      window.localStorage.setItem("videoStudioToken", result.token);
      setAuthToken(result.token);
      setSessionExpired(false);
      show("success", "Sesión iniciada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function logout() {
    window.localStorage.removeItem("videoStudioToken");
    setAuthToken("");
    setSessionExpired(false);
    setProjects([]);
    setBrands([]);
    setVideos([]);
    setMobileSidebarOpen(false);
  }

  function toggleSidebar() {
    setSidebarExpanded((current) => {
      const next = !current;
      window.localStorage.setItem("videoStudioSidebar", next ? "expanded" : "collapsed");
      return next;
    });
  }

  function navigateTo(nextSection: Section) {
    if (section === "Crear video" && nextSection !== "Crear video" && !validateCurrentStep(5)) return;
    setSection(nextSection);
    setMobileSidebarOpen(false);
  }

  function openMobileSidebar() {
    setMobileSidebarOpen(true);
  }

  async function refreshAll() {
    await Promise.all([loadProjects(), loadVideos(), loadBrands()]);
  }

  async function loadBrands() {
    try {
      const next = await fetchJson<BrandProfile[]>(`${API_URL}/brands?includeArchived=true`);
      setBrands(next);
      const active = next.filter((brand) => !brand.archived && !isDemoBrand(brand));
      const preferred = active.find((brand) => brand.isDefault) ?? active[0];
      if (preferred) {
        setDraft((current) => current.brandProfileId ? current : applyBrandToDraft(current, preferred));
      }
    } catch {
      setBrands([]);
    }
  }

  async function loadProjects() {
    // latest-wins: una respuesta vieja no puede sobrescribir el estado final.
    const requestId = ++projectsRequestId.current;
    try {
      const next = await fetchJson<Project[]>(`${API_URL}/projects`);
      if (!isLatestResponse(requestId, projectsRequestId.current)) return;
      // Los campos JSON de la escena llegan como texto desde la base de datos.
      setProjects(next.map((project) => ({ ...project, scenes: (project.scenes ?? []).map(normalizeScene) })));
    } catch (error) {
      if (!isLatestResponse(requestId, projectsRequestId.current)) return;
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

  async function ensureProject(options?: { quiet?: boolean }) {
    const quiet = options?.quiet === true;
    if (projectId) {
      await saveDraft(projectId, !quiet);
      return projectId;
    }
    validateDraft();
    const project = await fetchJson<Project>(`${API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, starterStoryboard: false })
    });
    setProjectId(project.id);
    setRenderJob(null);
    // En una operacion de medios no refrescamos a medias: el flujo termina con
    // su propia relectura autoritativa y un unico commit visual.
    if (!quiet) {
      await refreshAll();
      show("success", "Proyecto creado.");
    }
    return project.id;
  }

  async function saveDraft(id = projectId, notify = true) {
    if (!id) {
      validateDraft();
      const project = await fetchJson<Project>(`${API_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, starterStoryboard: false })
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
      await uploadProjectAsset(id, type, file);
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

  async function uploadSceneMedia(insertAfterSceneId: string | undefined, files?: FileList | File[]) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return [];
    const validFiles: File[] = [];
    for (const file of selectedFiles) {
      const isVideo = file.type === "video/mp4" || file.type === "video/webm";
      const isImage = imageMimeTypes.includes(file.type);
      if (!isVideo && !isImage) {
        show("error", "Usa imágenes PNG, JPG, WEBP o videos MP4/WEBM.");
        return [];
      }
      const maxSize = isVideo ? 250 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        show("error", `${file.name} supera ${Math.round(maxSize / 1024 / 1024)}MB.`);
        return [];
      }
      validFiles.push(file);
    }
    try {
      setBusy("scene-media-batch");
      setMediaOperation({ stage: "UPLOADING", index: 1, total: validFiles.length, filename: validFiles[0].name });
      const id = await ensureProject({ quiet: true });
      const currentProject = await fetchJson<Project>(`${API_URL}/projects/${id}`);
      const starterScenes = [...(currentProject.scenes ?? [])].sort((a, b) => a.order - b.order);
      const replacingStarter = shouldReplaceStarterStoryboard(starterScenes);
      if (replacingStarter) {
        await Promise.all(starterScenes.map((scene) => fetchJson(`${API_URL}/projects/${id}/scenes/${scene.id}`, { method: "DELETE" })));
      }
      const orderedScenes = replacingStarter ? [] : starterScenes;
      const insertIndex = insertAfterSceneId ? orderedScenes.findIndex((scene) => scene.id === insertAfterSceneId) + 1 : orderedScenes.length;
      const chapter = replacingStarter ? defaultMediaChapter(currentProject.videoType, validFiles.length) : insertAfterSceneId ? orderedScenes.find((scene) => scene.id === insertAfterSceneId)?.chapter : orderedScenes.at(-1)?.chapter;
      const createdIds: string[] = [];
      for (const [index, file] of validFiles.entries()) {
        // Un solo indicador contextual (el panel y el preview) en vez de toasts.
        setMediaOperation({ stage: "UPLOADING", index: index + 1, total: validFiles.length, filename: file.name });
        const isVideo = file.type === "video/mp4" || file.type === "video/webm";
        const type: AssetType = isVideo ? "screen_recording" : "image";
        const asset = await uploadProjectAsset(id, type, file);
        setMediaOperation({ stage: "ASSOCIATING", index: index + 1, total: validFiles.length, filename: file.name });
        const scene = await fetchJson<StoryScene>(`${API_URL}/projects/${id}/scenes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: isVideo ? "SCREEN_RECORDING" : "IMAGE",
            order: orderedScenes.length + index + 1,
            chapter,
            title: cleanFileTitle(file.name) || `Paso ${orderedScenes.length + index + 1}`,
            duration: isVideo ? Math.min(Math.max(Math.round(asset.durationSeconds ?? 6), 3), 18) : 5,
            durationMode: "AUTO",
            mediaAssetId: asset.id,
            narrationScript: ""
          })
        });
        if (scene.mediaAssetId !== asset.id) throw new Error(`No se pudo asociar ${file.name} al paso creado.`);
        createdIds.push(scene.id);
      }
      setMediaOperation({ stage: "COMMITTING", total: validFiles.length });
      const nextOrder = [
        ...orderedScenes.slice(0, insertIndex).map((scene) => scene.id),
        ...createdIds,
        ...orderedScenes.slice(insertIndex).map((scene) => scene.id)
      ];
      // Si los pasos nuevos ya van al final el orden es correcto: evitamos una
      // escritura extra (contra la DB remota cada request cuesta segundos).
      if (insertIndex !== orderedScenes.length) {
        await fetchJson(`${API_URL}/projects/${id}/scenes/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: nextOrder })
        });
      }
      const verified = await fetchJson<Project>(`${API_URL}/projects/${id}`);
      const orphan = createdIds
        .map((sceneId) => verified.scenes?.find((scene) => scene.id === sceneId))
        .find((scene) => !scene?.mediaAssetId);
      if (orphan) throw new Error(`El paso "${orphan.title}" se guardó sin medio. No se marcará como cargado.`);
      // Solo la lista de proyectos cambia con una subida: refrescar videos y
      // marcas serian dos viajes extra innecesarios.
      await loadProjects();
      setMediaOperation(idleMediaOperation);
      show("success", `${validFiles.length} archivo${validFiles.length === 1 ? "" : "s"} agregado${validFiles.length === 1 ? "" : "s"} · ${createdIds.length} paso${createdIds.length === 1 ? "" : "s"} creado${createdIds.length === 1 ? "" : "s"}`);
      return createdIds;
    } catch (error) {
      setMediaOperation({ stage: "ERROR", error: "No se pudo agregar la imagen. Reintentar." });
      show("error", getErrorMessage(error));
      return [];
    } finally {
      setBusy(null);
    }
  }

  async function assignMediaToScene(sceneId: string, files?: FileList | File[]) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return false;
    if (selectedFiles.length > 1) {
      show("info", "Para reemplazar el medio de un paso, selecciona un solo archivo.");
      return false;
    }
    const file = selectedFiles[0];
    const isVideo = file.type === "video/mp4" || file.type === "video/webm";
    const isImage = imageMimeTypes.includes(file.type);
    if (!isVideo && !isImage) {
      show("error", "Usa imágenes PNG, JPG, WEBP o videos MP4/WEBM.");
      return false;
    }
    const maxSize = isVideo ? 250 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      show("error", `${file.name} supera ${Math.round(maxSize / 1024 / 1024)}MB.`);
      return false;
    }
    try {
      setBusy(`scene-media-${sceneId}`);
      const id = await ensureProject({ quiet: true });
      setMediaOperation({ stage: "UPLOADING", filename: file.name });
      const assetType: AssetType = isVideo ? "screen_recording" : "image";
      const asset = await uploadProjectAsset(id, assetType, file);
      setMediaOperation({ stage: "ASSOCIATING", filename: file.name });
      const updated = await fetchJson<StoryScene>(`${API_URL}/projects/${id}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaAssetId: asset.id,
          type: isVideo ? "SCREEN_RECORDING" : "IMAGE",
          duration: isVideo ? Math.min(Math.max(Math.round(asset.durationSeconds ?? 6), 3), 18) : undefined,
          durationMode: "AUTO"
        })
      });
      if (updated.mediaAssetId !== asset.id) throw new Error(`No se pudo asociar ${file.name} al paso actual.`);
      const verified = await fetchJson<Project>(`${API_URL}/projects/${id}`);
      const savedScene = verified.scenes?.find((scene) => scene.id === sceneId);
      const savedAsset = verified.assets.find((item) => item.id === asset.id);
      if (savedScene?.mediaAssetId !== asset.id || !savedAsset) throw new Error(`La asociación de ${file.name} no quedó persistida.`);
      setMediaOperation({ stage: "COMMITTING", filename: file.name });
      await loadProjects();
      setMediaOperation(idleMediaOperation);
      show("success", `${file.name} cargado y asociado al paso.`);
      return true;
    } catch (error) {
      setMediaOperation({ stage: "ERROR", error: "No se pudo agregar la imagen. Reintentar." });
      show("error", getErrorMessage(error));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function createStepsFromLibrary(insertAfterSceneId?: string) {
    try {
      setBusy("scene-library-batch");
      setMediaOperation({ stage: "ASSOCIATING" });
      const id = await ensureProject({ quiet: true });
      const currentProject = await fetchJson<Project>(`${API_URL}/projects/${id}`);
      const mediaAssets = (currentProject.assets ?? []).filter((asset) => {
        const mime = asset.mimeType ?? "";
        return mime.startsWith("image/") || mime.startsWith("video/");
      });
      if (!mediaAssets.length) {
        show("info", "No hay medios en la biblioteca todavía. Sube imágenes o grabaciones primero.");
        return [];
      }
      const starterScenes = [...(currentProject.scenes ?? [])].sort((a, b) => a.order - b.order);
      const replacingStarter = shouldReplaceStarterStoryboard(starterScenes);
      if (replacingStarter) {
        await Promise.all(starterScenes.map((scene) => fetchJson(`${API_URL}/projects/${id}/scenes/${scene.id}`, { method: "DELETE" })));
      }
      const orderedScenes = replacingStarter ? [] : starterScenes;
      const insertIndex = insertAfterSceneId ? orderedScenes.findIndex((scene) => scene.id === insertAfterSceneId) + 1 : orderedScenes.length;
      const chapter = replacingStarter ? defaultMediaChapter(currentProject.videoType, mediaAssets.length) : insertAfterSceneId ? orderedScenes.find((scene) => scene.id === insertAfterSceneId)?.chapter : orderedScenes.at(-1)?.chapter;
      const createdIds: string[] = [];
      for (const [index, asset] of mediaAssets.entries()) {
        const isVideo = Boolean(asset.mimeType?.startsWith("video/"));
        const scene = await fetchJson<StoryScene>(`${API_URL}/projects/${id}/scenes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: isVideo ? "SCREEN_RECORDING" : "IMAGE",
            order: orderedScenes.length + index + 1,
            chapter,
            title: cleanFileTitle(asset.filename) || `Paso ${orderedScenes.length + index + 1}`,
            duration: isVideo ? Math.min(Math.max(Math.round(asset.durationSeconds ?? 6), 3), 18) : 5,
            durationMode: "AUTO",
            mediaAssetId: asset.id,
            narrationScript: ""
          })
        });
        createdIds.push(scene.id);
      }
      setMediaOperation({ stage: "COMMITTING" });
      const nextOrder = [
        ...orderedScenes.slice(0, insertIndex).map((scene) => scene.id),
        ...createdIds,
        ...orderedScenes.slice(insertIndex).map((scene) => scene.id)
      ];
      if (insertIndex !== orderedScenes.length) {
        await fetchJson(`${API_URL}/projects/${id}/scenes/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: nextOrder })
        });
      }
      await loadProjects();
      setMediaOperation(idleMediaOperation);
      show("success", `${mediaAssets.length} medio${mediaAssets.length === 1 ? "" : "s"} elegido${mediaAssets.length === 1 ? "" : "s"} · ${createdIds.length} paso${createdIds.length === 1 ? "" : "s"} creado${createdIds.length === 1 ? "" : "s"}`);
      return createdIds;
    } catch (error) {
      setMediaOperation({ stage: "ERROR", error: "No se pudieron agregar los medios. Reintentar." });
      show("error", getErrorMessage(error));
      return [];
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

  async function selectBrand(brand: BrandProfile) {
    const nextDraft = applyBrandToDraft(draft, brand);
    setDraft(nextDraft);
    if (projectId) {
      try {
        await fetchJson<Project>(`${API_URL}/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextDraft)
        });
        await refreshAll();
        show("success", `Empresa seleccionada: ${brand.name}. Guardado.`);
        return;
      } catch (error) {
        show("error", getErrorMessage(error));
        return;
      }
    }
    show("info", `Empresa seleccionada: ${brand.name}.`);
  }

  function openBrandModal(mode: "create" | "edit", brand?: BrandProfile) {
    setBrandModal({ mode, brand });
    setBrandForm(brand ? brandToForm(brand) : emptyBrandForm());
    setBrandLogoFile(null);
    setBrandLogoPreview(brand ? logoUrl(brand) : "");
  }

  async function saveBrand() {
    try {
      if (!brandForm.name.trim()) return show("error", "El nombre de empresa es obligatorio.");
      setBusy("brand-save");
      const editing = brandModal?.mode === "edit" && brandModal.brand;
      const brand = await fetchJson<BrandProfile>(editing ? `${API_URL}/brands/${brandModal.brand!.id}` : `${API_URL}/brands`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brandPayload(brandForm))
      });
      let saved = brand;
      if (brandLogoFile) {
        await uploadBrandAsset(brand.id, "LOGO", brandLogoFile);
        saved = await fetchJson<BrandProfile>(`${API_URL}/brands/${brand.id}`);
      }
      await loadBrands();
      await selectBrand(saved);
      setBrandModal(null);
      show("success", "Empresa guardada.");
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

  async function restoreBrand(id: string) {
    try {
      setBusy(`brand-restore-${id}`);
      await fetchJson(`${API_URL}/brands/${id}/restore`, { method: "POST" });
      await loadBrands();
      show("success", "Empresa restaurada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function deleteBrand(brand: BrandProfile) {
    const count = brand.projects?.length ?? 0;
    if (brand.isDefault) return show("error", "No puedes eliminar la empresa predeterminada. Selecciona otra como predeterminada primero.");
    if (count > 0) return show("error", `Esta empresa está siendo usada por ${count} proyecto${count === 1 ? "" : "s"}. Archívala o reasigna antes de eliminar.`);
    if (!window.confirm("¿Eliminar esta empresa? Esta acción no se puede deshacer.")) return;
    try {
      setBusy(`brand-delete-${brand.id}`);
      await fetchJson(`${API_URL}/brands/${brand.id}`, { method: "DELETE" });
      await loadBrands();
      show("success", "Empresa eliminada.");
    } catch (error) {
      show("error", getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function setDefaultBrand(id: string) {
    try {
      setBusy(`brand-default-${id}`);
      await fetchJson(`${API_URL}/brands/${id}/default`, { method: "POST" });
      await loadBrands();
      show("success", "Empresa predeterminada actualizada.");
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
        await uploadProjectAsset(id, target.type, file);
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
      setCustomMusicUrl(project.customMusicUrl ?? `${API_URL}/projects/${project.id}/music/file`);
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
    // La URL viene firmada por el API (un <audio> no puede enviar el token).
    playAudio(track.url ? `${API_URL}${track.url}` : `${API_URL}/audio/music/${track.id}/file`, key, 15);
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
      setSection("Crear video");
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
    setProjects((current) => current.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        scenes: project.scenes?.map((scene) => scene.id === sceneId ? { ...scene, ...patch } : scene)
      };
    }));
    scenePendingPatches.current[sceneId] = { ...(scenePendingPatches.current[sceneId] ?? {}), ...patch };
    if (sceneSaveTimers.current[sceneId]) window.clearTimeout(sceneSaveTimers.current[sceneId]);
    sceneSaveTimers.current[sceneId] = window.setTimeout(async () => {
      const pending = scenePendingPatches.current[sceneId];
      delete scenePendingPatches.current[sceneId];
      delete sceneSaveTimers.current[sceneId];
      if (!pending) return;
      try {
        await fetchJson(`${API_URL}/projects/${projectId}/scenes/${sceneId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pending)
        });
      } catch (error) {
        show("error", getErrorMessage(error));
        await refreshAll();
      }
    }, 650);
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

  /* El API firma la URL del MP4 (valida unos minutos), asi el tag <video>
     puede pedirlo sin cabecera Authorization y se reproduce en streaming. */
  function clearTrainingPreviewUrl() {
    setTrainingPreviewUrl("");
  }

  async function previewTrainingScene(sceneId?: string, chapter?: string) {
    if (!projectId) return show("info", "Guarda o abre un proyecto para previsualizar.");
    const previewBusyKey = sceneId ? `scene-preview-${sceneId}` : chapter ? `chapter-preview-${chapter}` : "full-preview";
    const loadingMessage = sceneId
      ? "Generando vista previa del paso..."
      : chapter
        ? `Generando vista previa del capítulo "${chapter}" desde su primer paso...`
        : "Generando vista previa completa...";
    try {
      setBusy(previewBusyKey);
      clearTrainingPreviewUrl();
      setTrainingPreviewState({ status: "loading", message: loadingMessage, mode: sceneId ? "scene" : chapter ? "chapter" : "full", sceneId, chapter });
      const endpoint = draft.videoType === "COURSE" || draft.format === "16:9" ? "course-scene-preview" : "quick-tutorial-preview";
      const preview = await fetchJson<{ streamUrl: string }>(`${API_URL}/renders/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId, chapter })
      });
      const objectUrl = `${API_URL}${preview.streamUrl}`;
      setTrainingPreviewUrl(objectUrl);
      setTrainingPreviewState({ status: "ready", message: sceneId ? "Vista previa del paso lista." : chapter ? "Vista previa del capítulo lista." : "Vista previa completa lista.", mode: sceneId ? "scene" : chapter ? "chapter" : "full", sceneId, chapter });
      show("success", sceneId ? "Vista previa del Paso lista para reproducir." : chapter ? "Vista previa del capítulo lista para reproducir." : "Vista previa completa lista para reproducir.");
    } catch (error) {
      const message = getErrorMessage(error);
      clearTrainingPreviewUrl();
      setTrainingPreviewState({ status: "error", message, mode: sceneId ? "scene" : chapter ? "chapter" : "full", sceneId, chapter });
      show("error", `No se pudo generar la vista previa: ${message}`);
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
    clearTrainingPreviewUrl();
    setTrainingPreviewState({ status: "idle", message: "" });
    setAssetNames(Object.fromEntries(project.assets.map((asset) => [asset.type, asset.filename])));
    setCustomMusicUrl(project.customMusicUrl ?? (project.customMusicPath ? `${API_URL}/projects/${project.id}/music/file` : ""));
    setSection("Crear video");
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
    clearTrainingPreviewUrl();
    setTrainingPreviewState({ status: "idle", message: "" });
    setAiQuote(null);
    setAiJobs([]);
    setStep(1);
    setSection("Crear video");
    show("info", "Nuevo video listo.");
  }

  function validateDraft() {
    // Solo el nombre del proyecto y el producto son obligatorios: oferta, precio y sitio web
    // son opcionales (una capacitación o un tutorial no siempre los necesitan).
    const required = [
      ["Nombre del proyecto", draft.name],
      ["Producto", draft.productName]
    ];
    const missing = required.find(([, value]) => !value.trim());
    if (missing) throw new Error(`${missing[0]} es obligatorio.`);
    if (draft.voiceoverEnabled && !draft.voiceoverScript.trim()) throw new Error("Activa voz en off solo si tienes un guion.");
  }

  function validateCurrentStep(targetStep = step) {
    try {
      if (step <= 1 && targetStep > 1) {
        if (!draft.brandProfileId) throw new Error("Selecciona una empresa o marca antes de continuar.");
        if (!draft.videoType) throw new Error("Selecciona el tipo de video antes de continuar.");
      }
      if (step <= 2 && targetStep > 2) validateDraft();
      if (step <= 3 && targetStep > 3) validateStoryboardReady();
      if (step <= 4 && targetStep > 4 && draft.voiceoverEnabled && !draft.voiceoverScript.trim()) {
        throw new Error("Completa el guion de voz o desactiva la voz antes de exportar.");
      }
      return true;
    } catch (error) {
      show("error", getErrorMessage(error));
      return false;
    }
  }

  function validateStoryboardReady() {
    const scenes = visibleStoryScenes(selectedProject?.scenes ?? []);
    if (!scenes.length) throw new Error("Agrega al menos un paso en Editar antes de continuar.");
    const missingMedia = scenes.find((scene) => !scene.mediaAssetId);
    if (missingMedia) throw new Error(`El paso "${missingMedia.title}" no tiene imagen o video asociado.`);
  }

  function validateAssets() {
    const readiness = assetReadiness({
      scenes: visibleStoryScenes(selectedProject?.scenes ?? []),
      requiredFields: uploadFields,
      uploadedTypes: [...(selectedProject?.assets.map((asset) => asset.type) ?? []), ...Object.keys(previews)]
    });
    if (!readiness.ok) throw new Error(readiness.message);
  }

  function goToStep(nextStep: number) {
    if (nextStep === step) return;
    if (nextStep > step && !validateCurrentStep(nextStep)) return;
    setStep(nextStep);
  }

  function show(type: string, text: string) {
    setMessage({ type, text });
  }

  if (authStatus?.authRequired && !authToken) {
    return (
      <main className="loginShell">
        <section className="loginCard">
          <div className="brandMark">VS</div>
          <h1>FullPOS Video Studio</h1>
          <p className="muted">Inicia sesión para administrar marcas, proyectos y videos.</p>
          {sessionExpired ? <div className="notice error">La sesión caducó. Vuelve a entrar; después ya no se pedirá de nuevo.</div> : null}
          {!authStatus.ownerConfigured ? <div className="notice error">El propietario inicial no está configurado. Define OWNER_EMAIL y OWNER_PASSWORD en el backend.</div> : null}
          <label className="field"><span>Correo electrónico</span><input value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} /></label>
          <label className="field"><span>Contraseña</span><input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} /></label>
          <button className="primary" type="button" disabled={busy === "login" || !authStatus.ownerConfigured} onClick={() => void login()}>Entrar</button>
        </section>
      </main>
    );
  }

  const isMainEditorMode = section === "Crear video" && step === 3;
  const isConfigMode = section === "Crear video" && (step === 1 || step === 2);

  return (
    <div className={`shell ${sidebarExpanded ? "sidebarExpanded" : "sidebarCollapsed"} ${mobileSidebarOpen ? "mobileNavOpen" : ""}`}>
      <div className="mobileScrim" role="presentation" onClick={() => setMobileSidebarOpen(false)} />
      <aside className="sidebar" aria-label="Navegación principal">
        <div className="brand">
          <div className="brandMark">VS</div>
          <div className="brandText">
            <strong>Video Studio</strong>
            <div className="muted">Creador de videos</div>
          </div>
          <button className="sidebarToggle mobileClose" type="button" aria-label="Cerrar menú" onClick={() => setMobileSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <button className="sidebarToggle desktopToggle" type="button" aria-label={sidebarExpanded ? "Contraer menú" : "Expandir menú"} title={sidebarExpanded ? "Contraer menú" : "Expandir menú"} onClick={toggleSidebar}>
          {sidebarExpanded ? <ChevronLeft size={20} /> : <Menu size={20} />}
        </button>
        <nav className="nav" aria-label="Secciones">
          {nav.filter(([label]) => label !== "Configuración").map(([label, Icon]) => (
            <button key={label} className={`navItem ${section === label ? "active" : ""}`} type="button" aria-label={label} title={label} onClick={() => navigateTo(label)}>
              <Icon size={21} strokeWidth={2} />
              <span className="navLabel">{label}</span>
              <span className="navTooltip" aria-hidden="true">{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebarSpacer" />
        <nav className="nav navBottom" aria-label="Ajustes">
          {nav.filter(([label]) => label === "Configuración").map(([label, Icon]) => (
            <button key={label} className={`navItem ${section === label ? "active" : ""}`} type="button" aria-label={label} title={label} onClick={() => navigateTo(label)}>
              <Icon size={21} strokeWidth={2} />
              <span className="navLabel">{label}</span>
              <span className="navTooltip" aria-hidden="true">{label}</span>
            </button>
          ))}
          {authStatus?.authRequired ? (
            <button className="navItem" type="button" aria-label="Salir" title="Salir" onClick={logout}>
              <LogOut size={21} strokeWidth={2} />
              <span className="navLabel">Salir</span>
              <span className="navTooltip" aria-hidden="true">Salir</span>
            </button>
          ) : null}
          {/* Fase 1: herramienta de narracion local. Vive fuera del editor de video. */}
          <a className="navItem" href="/voice-studio" aria-label="Voice Studio" title="Voice Studio">
            <Mic size={21} strokeWidth={2} />
            <span className="navLabel">Voice Studio</span>
            <span className="navTooltip" aria-hidden="true">Voice Studio</span>
          </a>
        </nav>
      </aside>

      <main className={`main ${isMainEditorMode ? "mainEditorMode" : ""} ${isConfigMode ? "configMode" : ""}`}>
        <section className={`topbar ${section === "Crear video" ? "topbarWithSteps" : ""}`}>
          <button className="mobileMenuButton secondary iconButton" type="button" aria-label="Abrir menú" onPointerDown={openMobileSidebar} onMouseDown={openMobileSidebar} onClick={openMobileSidebar}>
            <Menu size={20} />
          </button>
          <div className="topbarMain">
            <div className="title">
              <h1>{section}</h1>
              {!isConfigMode && !isMainEditorMode && sectionSubtitle(section) ? <p>{sectionSubtitle(section)}</p> : null}
            </div>
            {section === "Crear video" ? (
              isMainEditorMode ? (
                <span className="appbarChip appbarProject" title={`${draft.name} · ${draft.productName} · ${videoTypeLabel(draft.videoType)}`}>
                  <strong>{draft.name || "Proyecto sin nombre"}</strong>
                  <small>{draft.productName ? `${draft.productName} · ` : ""}{videoTypeLabel(draft.videoType)} · {draft.format}</small>
                </span>
              ) : (
                <span className="appbarChip">{videoTypeLabel(draft.videoType)}</span>
              )
            ) : null}
          </div>
          {section === "Crear video" ? (
            <div className="steps appbarSteps">
              {["Configuración", "Contenido", "Editar", "Voz y música", "Exportar"].map((label, index) => (
                <button key={label} type="button" className={`step ${step === index + 1 ? "active" : ""}`} onClick={() => goToStep(index + 1)}>
                  {index + 1}. {label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="rowActions">
            {isMainEditorMode ? (
              <>
                {latestJob ? (
                  <div className={`renderPill ${latestJob.status === "COMPLETED" ? "ready" : ""}`}>
                    <span>{renderStage(latestJob)}</span>
                    <small>{latestJob.progress}%</small>
                    {streamUrl ? <a href={streamUrl} target="_blank">Ver</a> : null}
                  </div>
                ) : null}
                <button className="primary" type="button" disabled={!selectedProject || !(selectedProject.scenes?.length) || busy === "full-preview"} onClick={() => void previewTrainingScene()}>
                  {busy === "full-preview" ? <Loader2 className="spinIcon" size={16} /> : <Play size={16} />}
                  {busy === "full-preview" ? "Generando..." : "Vista previa completa"}
                </button>
              </>
            ) : (
              <button className="primary" type="button" onClick={resetDraft}>
                <Plus size={18} />
                Crear video
              </button>
            )}
          </div>
        </section>

        {message.text ? <div className={`notice ${message.type}`}>{message.text}</div> : null}

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
                <button className="primary" type="button" onClick={() => setSection("Crear video")}>
                  <Clapperboard size={18} />
                  Continuar creación
                </button>
              </div>
              <ProjectList projects={projects.slice(0, 4)} onOpen={openProject} onDuplicate={duplicateProject} onDelete={deleteProject} busy={busy} compact />
            </section>
          </>
        )}

        {section === "Crear video" && (
          <section className="workspace editorWorkspace">
            <div className="card">
              <div className="editorHeader">
                <div>
                  <strong>{draft.name}</strong>
                  <span>{draft.productName} · {videoTypeLabel(draft.videoType)} · {draft.format}</span>
                </div>
              </div>
              <div className="stepBody">
              {step === 1 && (
                <VideoTypeStep
                  draft={draft}
                  brands={brands}
                  selectedBrand={selectedBrand}
                  search={brandSearch}
                  setSearch={setBrandSearch}
                  onSelectBrand={(brand) => void selectBrand(brand)}
                  onCreateBrand={() => openBrandModal("create")}
                  onEditBrand={(brand) => openBrandModal("edit", brand)}
                  onDuplicateBrand={duplicateBrand}
                  onArchiveBrand={archiveBrand}
                  onDeleteBrand={deleteBrand}
                  onSelect={selectVideoType}
                />
              )}
              {step === 2 && <InfoStep draft={draft} setDraft={setDraft} />}
              {step === 3 && <StoryboardStep project={selectedProject} busy={busy} operation={mediaOperation} previewUrl={trainingPreviewUrl} previewState={trainingPreviewState} onAddScene={addScene} onDuplicateScene={duplicateScene} onDeleteScene={deleteScene} onUpdateScene={(sceneId, patch) => void updateScene(sceneId, patch)} onMoveScene={(sceneId, direction) => void moveScene(sceneId, direction)} onPreviewScene={(sceneId) => void previewTrainingScene(sceneId)} onPreviewChapter={(chapter) => void previewTrainingScene(undefined, chapter)} onPreviewFull={() => void previewTrainingScene()} onClearPreview={() => { clearTrainingPreviewUrl(); setTrainingPreviewState({ status: "idle", message: "" }); }} onUploadSceneMedia={(sceneId, files) => uploadSceneMedia(sceneId, files)} onAssignSceneMedia={(sceneId, files) => assignMediaToScene(sceneId, files)} onCreateStepsFromLibrary={(sceneId) => createStepsFromLibrary(sceneId)} />}
              {step === 4 && (
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
              {step === 5 && (
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
              </div>

              <div className="actions">
                <button className="secondary" type="button" disabled={step === 1} onClick={() => goToStep(Math.max(1, step - 1))}>Atrás</button>
                {step > 1 ? <button className="secondary" type="button" onClick={() => void saveDraft()} disabled={busy !== null}><Save size={16} />Guardar borrador</button> : <span className="autosaveHint">Guardado automatico al continuar</span>}
                <button className="primary" type="button" disabled={step === 5 || (step === 1 && (!draft.brandProfileId || !draft.videoType))} onClick={() => goToStep(Math.min(5, step + 1))}>{step === 1 ? "Continuar" : "Siguiente"}</button>
              </div>
            </div>

          </section>
        )}

        {section === "Biblioteca" && (
          <LibrarySection
            project={selectedProject}
            previews={previews}
            assetNames={assetNames}
            videos={videos}
            busy={busy}
            onUpload={onUpload}
            onUploadMany={onUploadMany}
            onOpenProjects={() => setSection("Proyectos")}
            onCreateVideo={() => setSection("Crear video")}
          />
        )}

        {section === "Proyectos" && <ProjectList projects={projects} onOpen={openProject} onDuplicate={duplicateProject} onDelete={deleteProject} busy={busy} />}
        {section === "Videos" && <VideoList videos={videos} />}
        {section === "Marcas" && (
          <BrandManager
            brands={brands}
            busy={busy}
            selectedBrandId={draft.brandProfileId}
            onSelect={(brand) => void selectBrand(brand)}
            onCreate={() => openBrandModal("create")}
            onEdit={(brand) => openBrandModal("edit", brand)}
            onDuplicate={duplicateBrand}
            onArchive={archiveBrand}
            onRestore={restoreBrand}
            onDelete={deleteBrand}
            onSetDefault={setDefaultBrand}
          />
        )}
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
      {brandModal ? (
        <BrandModal
          mode={brandModal.mode}
          form={brandForm}
          setForm={setBrandForm}
          logoPreview={brandLogoPreview}
          busy={busy}
          onLogo={(file) => {
            setBrandLogoFile(file);
            setBrandLogoPreview(file ? URL.createObjectURL(file) : brandModal.brand ? logoUrl(brandModal.brand) : "");
          }}
          onClose={() => setBrandModal(null)}
          onSave={() => void saveBrand()}
        />
      ) : null}
    </div>
  );
}

function LibrarySection({
  project,
  previews,
  assetNames,
  videos,
  busy,
  onUpload,
  onUploadMany,
  onOpenProjects,
  onCreateVideo
}: {
  project?: Project;
  previews: Record<string, string>;
  assetNames: Record<string, string>;
  videos: RenderJob[];
  busy: string | null;
  onUpload: (type: AssetType, file?: File) => void;
  onUploadMany: (files?: FileList | File[], startType?: AssetType) => void;
  onOpenProjects: () => void;
  onCreateVideo: () => void;
}) {
  const projectVideos = project ? videos.filter((video) => video.projectId === project.id) : videos;
  return (
    <div className="libraryGrid">
      <section className="card libraryPanel">
        <div className="sectionHeader">
          <div>
            <strong>Biblioteca de medios</strong>
            <p className="muted">{project ? `Proyecto abierto: ${project.name}` : "Abre un proyecto para ver y subir imágenes o grabaciones."}</p>
          </div>
          <div className="rowActions">
            <button className="secondary" type="button" onClick={onOpenProjects}><FolderKanban size={16} />Proyectos</button>
            <button className="primary" type="button" onClick={onCreateVideo}><Clapperboard size={16} />Crear video</button>
          </div>
        </div>
        {project ? (
          <>
            <AssetsStep previews={previews} assetNames={assetNames} project={project} busy={busy} onUpload={onUpload} onUploadMany={onUploadMany} />
            <div className="assetLibrary">
              {(project.assets ?? []).length === 0 ? <p className="muted">Aún no hay archivos en este proyecto.</p> : null}
              {(project.assets ?? []).map((asset) => {
                const isVideo = asset.mimeType?.startsWith("video/");
                return (
                  <div className="assetLibraryItem" key={asset.id}>
                    <div className="assetLibraryPreview">
                      <ProjectMediaPreview projectId={project.id} assetId={asset.id} isVideo={Boolean(isVideo)} filename={asset.filename} />
                    </div>
                    <strong>{asset.filename}</strong>
                    <small>{asset.type} · {asset.mimeType}</small>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="emptyState">
            <Archive size={40} />
            <p>Selecciona un proyecto para administrar su biblioteca.</p>
            <button className="primary" type="button" onClick={onOpenProjects}>Abrir proyectos</button>
          </div>
        )}
      </section>
      <VideoList videos={projectVideos} />
    </div>
  );
}

function VideoTypeStep({
  draft,
  brands,
  selectedBrand,
  search,
  setSearch,
  onSelectBrand,
  onCreateBrand,
  onEditBrand,
  onDuplicateBrand,
  onArchiveBrand,
  onDeleteBrand,
  onSelect
}: {
  draft: Draft;
  brands: BrandProfile[];
  selectedBrand?: BrandProfile;
  search: string;
  setSearch: (value: string) => void;
  onSelectBrand: (brand: BrandProfile) => void;
  onCreateBrand: () => void;
  onEditBrand: (brand: BrandProfile) => void;
  onDuplicateBrand: (id: string) => void;
  onArchiveBrand: (id: string) => void;
  onDeleteBrand: (brand: BrandProfile) => void;
  onSelect: (card: (typeof videoTypeCards)[number]) => void;
}) {
  const normalBrands = brands.filter((brand) => !brand.archived && !isDemoBrand(brand));
  const visibleBrands = normalBrands.filter((brand) => brand.name.toLowerCase().includes(search.toLowerCase()) || (brand.website ?? brand.slug).toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="configStep">
      <section className="configGroup">
        <div className="sectionHeader">
          <div>
            <strong>Empresa / Marca</strong>
            <p className="muted">Selecciona una empresa guardada o crea una nueva.</p>
          </div>
          <div className="rowActions">
            {selectedBrand ? <button className="secondary" type="button" onClick={() => onEditBrand(selectedBrand)}><Pencil size={16} />Editar empresa</button> : null}
            <button className="primary" type="button" onClick={onCreateBrand}><Plus size={18} />Nueva empresa</button>
          </div>
        </div>
        {normalBrands.length > 6 ? <input className="searchInput" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar empresa..." /> : null}
        {visibleBrands.length === 0 ? (
          <div className="emptyState compactEmpty">
            <strong>Aun no tienes empresas guardadas.</strong>
            <button className="primary" type="button" onClick={onCreateBrand}><Plus size={18} />Crear primera empresa</button>
          </div>
        ) : (
          <div className="brandGrid compactBrands">
            {visibleBrands.map((brand) => (
              <div key={brand.id} className={`brandCardShell ${draft.brandProfileId === brand.id ? "selected" : ""}`}>
                <button type="button" className="brandCard compactBrandCard" onClick={() => onSelectBrand(brand)}>
                  <LogoMark brand={brand} />
                  <span>
                    <strong>{brand.name}</strong>
                    <small>{brand.website ?? brand.slug}{brand.isDefault ? " · Predeterminada" : ""}</small>
                  </span>
                  {draft.brandProfileId === brand.id ? <span className="selectedCheck">✓</span> : null}
                </button>
                <details className="compactMenu">
                  <summary><MoreVertical size={16} /></summary>
                  <div>
                    <button type="button" onClick={() => onEditBrand(brand)}><Pencil size={14} />Editar</button>
                    <button type="button" onClick={() => onDuplicateBrand(brand.id)}><Copy size={14} />Duplicar</button>
                    <button type="button" onClick={() => onArchiveBrand(brand.id)}><Archive size={14} />Archivar</button>
                    <button type="button" onClick={() => onDeleteBrand(brand)}><Trash2 size={14} />Eliminar</button>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="configGroup">
        <div className="sectionHeader">
          <div>
            <strong>¿Qué quieres crear?</strong>
            <p className="muted">Elige el tipo de video para ajustar formato, narración y estructura.</p>
          </div>
        </div>
        <div className="videoTypeGrid">
          {videoTypeCards.map((card) => (
            <button key={card.id} type="button" className={`videoTypeCard ${draft.videoType === card.id ? "selected" : ""}`} onClick={() => onSelect(card)}>
              <span className="typeIcon">{card.icon}</span>
              <strong>{card.label}</strong>
              <p>{card.description}</p>
              <small>{card.meta}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function LogoMark({ brand }: { brand: BrandProfile }) {
  const url = logoUrl(brand);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [url]);
  const showImage = Boolean(url) && !failed;
  return (
    <span className="brandLogoMark" style={{ background: showImage ? undefined : `linear-gradient(135deg, ${brand.primaryColor}, ${brand.secondaryColor})` }}>
      {showImage ? <img src={url} alt="" onError={() => setFailed(true)} /> : initials(brand.name)}
    </span>
  );
}

function BrandModal({ mode, form, setForm, logoPreview, busy, onLogo, onClose, onSave }: { mode: "create" | "edit"; form: BrandForm; setForm: (form: BrandForm) => void; logoPreview: string; busy: string | null; onLogo: (file: File | null) => void; onClose: () => void; onSave: () => void }) {
  return (
    <div className="modalBackdrop" role="dialog" aria-modal="true">
      <section className="brandModal">
        <div className="modalHeader">
          <div>
            <h2>{mode === "create" ? "Nueva empresa" : "Editar empresa"}</h2>
            <p className="muted">Guarda datos reutilizables para todos los videos de esta marca.</p>
          </div>
          <button className="secondary iconButton" type="button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modalSection">
          <strong>Identidad</strong>
          <div className="brandIdentityGrid">
            <label className="logoUploader">
              <span className="logoPreview">{logoPreview ? <img src={logoPreview} alt="" /> : <ImageIcon size={32} />}</span>
              <span><Upload size={16} />Subir logo</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onLogo(event.target.files?.[0] ?? null)} />
            </label>
            <div className="formGrid compact">
              <Field label="Nombre de empresa / marca" value={form.name} onChange={(name) => setForm({ ...form, name })} />
              <Field label="Descripcion corta" value={form.description} onChange={(description) => setForm({ ...form, description })} />
            </div>
          </div>
        </div>

        <div className="modalSection">
          <strong>Información</strong>
          <div className="formGrid compact">
            <Field label="Sitio web" value={form.website} onChange={(website) => setForm({ ...form, website })} />
            <Field label="WhatsApp" value={form.whatsapp} onChange={(whatsapp) => setForm({ ...form, whatsapp })} />
            <Field label="Correo electrónico" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          </div>
        </div>

        <div className="modalSection">
          <strong>Estilo</strong>
          <div className="colorGrid">
            <ColorField label="Color principal" value={form.primaryColor} onChange={(primaryColor) => setForm({ ...form, primaryColor })} />
            <ColorField label="Color secundario" value={form.secondaryColor} onChange={(secondaryColor) => setForm({ ...form, secondaryColor })} />
            <ColorField label="Color de acento" value={form.accentColor} onChange={(accentColor) => setForm({ ...form, accentColor })} />
          </div>
        </div>

        <details className="optionalPrefs">
          <summary>Preferencias opcionales</summary>
          <div className="formGrid compact">
            <label className="field"><span>Voz predeterminada</span><input value={form.defaultVoiceProfile} onChange={(event) => setForm({ ...form, defaultVoiceProfile: event.target.value })} /></label>
            <label className="field"><span>Estilo de narración</span><select value={form.defaultNarrationStyle} onChange={(event) => setForm({ ...form, defaultNarrationStyle: event.target.value as Draft["narrationStyle"] })}><option value="PROMOTIONAL">Promocional</option><option value="TRAINING">Capacitación</option><option value="CORPORATE">Corporativo</option><option value="MOTIVATIONAL">Motivacional</option></select></label>
            <Field label="CTA predeterminado" value={form.defaultCTA} onChange={(defaultCTA) => setForm({ ...form, defaultCTA })} />
            <Toggle label="Watermark activo" checked={form.watermarkEnabled} onChange={(watermarkEnabled) => setForm({ ...form, watermarkEnabled })} />
          </div>
        </details>

        <div className="modalActions">
          <button className="secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="primary" type="button" disabled={busy === "brand-save"} onClick={onSave}>Guardar empresa</button>
        </div>
      </section>
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field colorField">
      <span>{label}</span>
      <div>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <input value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
    </label>
  );
}

function InfoStep({ draft, setDraft }: { draft: Draft; setDraft: (draft: Draft) => void }) {
  return (
    <div className="configStep">
      <section className="configGroup">
        <div className="sectionHeader">
          <div>
            <strong>Contenido del video</strong>
            <p className="muted">Textos que aparecerán en el video. Solo el nombre del proyecto y el producto son obligatorios.</p>
          </div>
        </div>
        <div className="formGrid">
          <Field label="Nombre del proyecto" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} full placeholder="Ej. Curso profesional — Cómo registrar una venta" />
          <Field label="Producto" value={draft.productName} onChange={(value) => setDraft({ ...draft, productName: value })} placeholder="Ej. FullPOS" />
          <Field label="Titular" hint="Opcional" value={draft.headline} onChange={(value) => setDraft({ ...draft, headline: value })} placeholder="Frase principal del video" />
          <Field label="Subtítulo" hint="Opcional" value={draft.subheadline} onChange={(value) => setDraft({ ...draft, subheadline: value })} placeholder="Frase de apoyo" />
          <Field label="Oferta" hint="Opcional" value={draft.offer} onChange={(value) => setDraft({ ...draft, offer: value })} placeholder="Ej. 7 días gratis" />
          <Field label="Precio" hint="Opcional" value={draft.price} onChange={(value) => setDraft({ ...draft, price: value })} placeholder="Deja vacío si no aplica" />
          <Field label="Sitio web" hint="Opcional" value={draft.website} onChange={(value) => setDraft({ ...draft, website: value })} placeholder="https://tu-sitio.com" />
        </div>
      </section>
    </div>
  );
}

function StoryboardStep({
  project,
  busy,
  operation,
  previewUrl,
  previewState,
  onAddScene,
  onDuplicateScene,
  onDeleteScene,
  onUpdateScene,
  onMoveScene,
  onPreviewScene,
  onPreviewChapter,
  onPreviewFull,
  onClearPreview,
  onUploadSceneMedia,
  onAssignSceneMedia,
  onCreateStepsFromLibrary
}: {
  project?: Project;
  busy: string | null;
  operation: MediaOperation;
  previewUrl: string;
  previewState: TrainingPreviewState;
  onAddScene: () => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onUpdateScene: (sceneId: string, patch: Partial<StoryScene>) => void;
  onMoveScene: (sceneId: string, direction: -1 | 1) => void;
  onPreviewScene: (sceneId: string) => void;
  onPreviewChapter: (chapter: string) => void;
  onPreviewFull: () => void;
  onClearPreview: () => void;
  onUploadSceneMedia: (insertAfterSceneId: string | undefined, files?: FileList | File[]) => Promise<string[]>;
  onAssignSceneMedia: (sceneId: string, files?: FileList | File[]) => Promise<boolean>;
  onCreateStepsFromLibrary: (insertAfterSceneId?: string) => Promise<string[]>;
}) {
  const scenes = visibleStoryScenes(project?.scenes ?? []);
  const [selectedId, setSelectedId] = useState<string>("");
  const [openSection, setOpenSection] = useState<"content" | "highlight" | "narration" | "subtitles" | "advanced">("content");
  const [activeTool, setActiveTool] = useState<"zoom" | "highlight" | "arrow" | "circle" | "click" | "blur" | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [previewPlaybackError, setPreviewPlaybackError] = useState("");
  /* Zoom de inspeccion de la vista previa: Ctrl + rueda (1 = ajustar al marco). */
  const [previewZoom, setPreviewZoom] = useState(1);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const [localMediaPreview, setLocalMediaPreview] = useState<{ sceneId: string; url: string; isVideo: boolean; filename: string; pending: boolean } | null>(null);
  const [pendingPreview, setPendingPreview] = useState<{ url: string; isVideo: boolean; filename: string } | null>(null);
  const selected = resolveSelectedScene(scenes, selectedId);
  const chapters = Array.from(new Set(scenes.map((scene) => scene.chapter).filter(Boolean))) as string[];
  const selectedAsset = (project?.assets ?? []).find((asset) => asset.id === selected?.mediaAssetId || asset.type === selected?.mediaAssetId);
  const activeLocalPreview = localMediaPreview && selected?.id === localMediaPreview.sceneId ? localMediaPreview : null;
  /* Operacion en curso: la UI mantiene el ultimo estado estable y solo añade
     un indicador de progreso. Nada de snapshots intermedios del backend. */
  const mediaRunning = isMediaOperationRunning(operation);
  const uploading = mediaRunning || Boolean(pendingPreview);
  const operationLabel = mediaOperationLabel(operation);
  /* Los subtitulos personalizados pueden llegar como texto JSON desde la base
     de datos: se normalizan una vez y ya no puede romperse la pantalla. */
  const selectedSubtitles = subtitleCues(selected?.customSubtitles);
  const mediaUrl = project && selectedAsset ? `${API_URL}/projects/${project.id}/assets/${selectedAsset.id}/file` : "";
  const isVideoMedia = Boolean(selectedAsset?.mimeType?.startsWith("video/"));
  const selectedDuration = Math.max(0, (selected?.trimEndSeconds ?? selected?.duration ?? 0) - (selected?.trimStartSeconds ?? 0));
  const narrationSeconds = estimateSpeechSeconds(selected?.narrationScript ?? "");
  const isCourse = project?.videoType === "COURSE";
  const hasScenes = scenes.length > 0;
  const selectedChapterBusy = selected?.chapter ? busy === `chapter-preview-${selected.chapter}` : false;
  const previewIsCurrent = previewState.mode !== "scene" || !previewState.sceneId || previewState.sceneId === selected?.id;
  const realMediaNode = activeLocalPreview
    ? activeLocalPreview.isVideo
      ? <video controls src={activeLocalPreview.url} />
      : <img src={activeLocalPreview.url} alt={activeLocalPreview.filename} />
    : pendingPreview
      ? pendingPreview.isVideo
        ? <video controls src={pendingPreview.url} />
        : <img src={pendingPreview.url} alt={pendingPreview.filename} />
      : mediaUrl && project && selectedAsset
        ? <ProjectMediaPreview projectId={project.id} assetId={selectedAsset.id} isVideo={isVideoMedia} filename={selectedAsset.filename} />
        : null;
  const retryPreview = () => {
    if (previewState.mode === "chapter" && previewState.chapter) return onPreviewChapter(previewState.chapter);
    if (previewState.mode === "full") return onPreviewFull();
    if (selected) return onPreviewScene(previewState.sceneId ?? selected.id);
  };
  useEffect(() => {
    setPreviewPlaybackError("");
  }, [previewUrl]);
  useEffect(() => {
    setPreviewZoom(1);
  }, [selected?.id]);
  /* Ctrl + rueda: acerca/aleja la imagen del centro. Se registra a mano porque
     el evento wheel de React es pasivo y no permitiria cancelar el scroll. */
  useEffect(() => {
    const node = previewBoxRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      setPreviewZoom((current) => Math.min(8, Math.max(0.5, Number((current * step).toFixed(3)))));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [selected?.id, previewUrl, activeLocalPreview?.url]);
  function resetPreviewZoom() {
    setPreviewZoom(1);
  }
  useEffect(() => () => {
    if (localMediaPreview?.url) URL.revokeObjectURL(localMediaPreview.url);
  }, [localMediaPreview?.url]);
  /* La imagen se ve al instante con un objeto local; cuando el proyecto ya
     tiene el medio real, se suelta el objeto local sin parpadeo. */
  useEffect(() => {
    if (!pendingPreview) return;
    if (isMediaOperationRunning(operation)) return;
    const timer = window.setTimeout(() => {
      setPendingPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return null;
      });
    }, selectedAsset ? 2500 : 4000);
    return () => window.clearTimeout(timer);
  }, [pendingPreview, operation, selectedAsset]);
  useEffect(() => () => {
    if (pendingPreview?.url) URL.revokeObjectURL(pendingPreview.url);
  }, [pendingPreview?.url]);
  function patchSelected(patch: Partial<StoryScene>) {
    if (selected) onUpdateScene(selected.id, patch);
  }

  /* Muestra el archivo al instante (antes de subirlo) y deja que la subida
     siga en segundo plano. */
  function showPendingPreview(file: File) {
    const nextUrl = URL.createObjectURL(file);
    setPendingPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { url: nextUrl, isVideo: file.type.startsWith("video/"), filename: file.name };
    });
    setPreviewPlaybackError("");
  }

  async function addMediaFiles(files?: FileList | File[]) {
    const first = Array.from(files ?? []).find((file) => file.type.startsWith("image/") || file.type.startsWith("video/"));
    if (first) showPendingPreview(first);
    const createdIds = await onUploadSceneMedia(selected?.id, files);
    if (createdIds[0]) setSelectedId(createdIds[0]);
  }
  async function replaceSelectedMedia(files?: FileList | File[]) {
    if (!selected) {
      await addMediaFiles(files);
      return;
    }
    const sceneId = selected.id;
    const file = Array.from(files ?? [])[0];
    if (file) {
      const nextUrl = URL.createObjectURL(file);
      setLocalMediaPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { sceneId, url: nextUrl, isVideo: file.type.startsWith("video/"), filename: file.name, pending: true };
      });
      setPreviewPlaybackError("");
    }
    const updated = await onAssignSceneMedia(sceneId, files);
    if (updated) {
      // Confirmado por el backend: la vista previa local deja de estar pendiente
      // (se usa para mostrar el archivo sin parpadeo, no como estado falso).
      setSelectedId(sceneId);
      setLocalMediaPreview((current) => (current && current.sceneId === sceneId ? { ...current, pending: false } : current));
    } else {
      // Fallo: no se deja una imagen falsa como si estuviera guardada.
      setLocalMediaPreview((current) => {
        if (current && current.sceneId === sceneId) {
          if (current.url) URL.revokeObjectURL(current.url);
          return null;
        }
        return current;
      });
    }
  }
  async function chooseFromLibrary() {
    const createdIds = await onCreateStepsFromLibrary(selected?.id);
    if (createdIds[0]) setSelectedId(createdIds[0]);
  }
  function addFocus(x = 0.5, y = 0.5, intensity: "soft" | "normal" | "close" = "normal") {
    if (!selected) return;
    const focus = selected.animation?.focus ?? [];
    const scale = intensity === "close" ? 2 : intensity === "soft" ? 1.25 : 1.6;
    patchSelected({ animation: { ...(selected.animation ?? {}), focus: [...focus, { timeSeconds: selected.duration / 2, x, y, scale }] } });
  }
  function addCallout(type: string, box?: { x: number; y: number; width: number; height: number }, arrow?: { startX: number; startY: number; endX: number; endY: number }) {
    if (!selected) return;
    const callouts = selected.animation?.callouts ?? [];
    const next = type === "ArrowCallout"
      ? { type, label: "Indicación", x: arrow?.endX ?? 960, y: arrow?.endY ?? 520, startX: arrow?.startX ?? 620, startY: arrow?.startY ?? 360, endX: arrow?.endX ?? 960, endY: arrow?.endY ?? 520, startTime: 1, endTime: Math.max(2, selected.duration - 1) }
      : { type, label: type === "BlurRegion" ? "" : type === "CursorPulse" ? "Click" : "Importante", x: box?.x ?? 600, y: box?.y ?? 360, width: box?.width ?? 360, height: box?.height ?? 120, startTime: 1, endTime: Math.max(2, selected.duration - 1), style: type === "HighlightBox" ? "soft-glow" : "outline" };
    patchSelected({ animation: { ...(selected.animation ?? {}), callouts: [...callouts, next] } });
  }
  function updateChapter(oldChapter: string, chapter: string) {
    scenes.filter((scene) => scene.chapter === oldChapter).forEach((scene) => onUpdateScene(scene.id, { chapter }));
  }
  function previewPoint(event: MouseEvent<HTMLDivElement>) {
    const rect = (previewStageRef.current ?? event.currentTarget).getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x, y, px: Math.round(x * 1920), py: Math.round(y * 1080) };
  }
  function onPreviewClick(event: MouseEvent<HTMLDivElement>) {
    if (!activeTool || activeTool === "highlight" || activeTool === "arrow" || activeTool === "blur") return;
    const point = previewPoint(event);
    if (activeTool === "zoom") addFocus(point.x, point.y);
    if (activeTool === "circle") addCallout("CircleCallout", { x: point.px - 70, y: point.py - 70, width: 140, height: 140 });
    if (activeTool === "click") addCallout("CursorPulse", { x: point.px, y: point.py, width: 90, height: 90 });
    setActiveTool(null);
  }
  function onPreviewMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (activeTool === "highlight" || activeTool === "arrow" || activeTool === "blur") setDragStart(previewPoint(event));
  }
  function onPreviewMouseUp(event: MouseEvent<HTMLDivElement>) {
    if (!activeTool || !dragStart) return;
    const end = previewPoint(event);
    const x = Math.min(dragStart.px, end.px);
    const y = Math.min(dragStart.py, end.py);
    const width = Math.max(80, Math.abs(end.px - dragStart.px));
    const height = Math.max(60, Math.abs(end.py - dragStart.py));
    if (activeTool === "highlight") addCallout("HighlightBox", { x, y, width, height });
    if (activeTool === "blur") addCallout("BlurRegion", { x, y, width, height });
    if (activeTool === "arrow") addCallout("ArrowCallout", undefined, { startX: dragStart.px, startY: dragStart.py, endX: end.px, endY: end.py });
    setDragStart(null);
    setActiveTool(null);
  }
  const grouped = chapters.length
    ? chapters.map((chapter) => ({ chapter, scenes: scenes.filter((scene) => scene.chapter === chapter) }))
    : [{ chapter: "", scenes }];
  const emptyEditor = !hasScenes;
  return (
    <div className="sectionBlock editorDark">
      {emptyEditor && !uploading ? (
        <div
          className="editorEmptyState"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void addMediaFiles(event.dataTransfer.files);
          }}
        >
          <ImageIcon size={44} />
          <div className="buttonRow">
            <label className="primary fileButton"><Upload size={16} />Subir archivos<input type="file" multiple accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={(event) => void addMediaFiles(event.target.files ?? undefined)} /></label>
            <button className="secondary" type="button" disabled={!project?.assets?.length || busy === "scene-library-batch"} onClick={() => void chooseFromLibrary()}>Elegir de biblioteca</button>
          </div>
        </div>
      ) : (
      <div className="trainingEditor">
        <div className="storyboard">
          <div className="panelTitle"><strong>Pasos del video</strong><small>{scenes.length ? `${scenes.length} pasos` : uploading ? "Preparando el primer paso..." : "Sin pasos"}</small></div>
          {emptyEditor ? (
            <p className="pendingSteps"><Loader2 className="spinIcon" size={13} />{operationLabel || "Preparando el primer paso..."}</p>
          ) : null}
          {grouped.map((group) => (
            <div className="chapterGroup" key={group.chapter || "all"}>
              {group.chapter ? (
                <label className="chapterName">
                  <input value={group.chapter} onChange={(event) => updateChapter(group.chapter, event.target.value)} aria-label="Renombrar capítulo" />
                </label>
              ) : null}
              {group.scenes.map((scene, index) => {
                const globalIndex = scenes.findIndex((item) => item.id === scene.id);
                return (
                  <div className={`simpleStepCard ${selected?.id === scene.id ? "selected" : ""}`} key={scene.id} role="button" tabIndex={0} onClick={() => setSelectedId(scene.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedId(scene.id); }}>
                    <span>{sceneIcon(scene.type)}</span>
                    <div>
                      <strong>{globalIndex + 1}. {scene.title}</strong>
                      <small>{Math.round(scene.duration * 10) / 10} s</small>
                    </div>
                    <span className="menuHint"><MoreVertical size={16} /></span>
                    <div className="stepMenu" onClick={(event) => event.stopPropagation()}>
                      <button type="button" disabled={globalIndex === 0} onClick={() => onMoveScene(scene.id, -1)}>Subir</button>
                      <button type="button" disabled={globalIndex === scenes.length - 1} onClick={() => onMoveScene(scene.id, 1)}>Bajar</button>
                      <button type="button" onClick={() => onDuplicateScene(scene.id)}>Duplicar</button>
                      <button type="button" onClick={() => onDeleteScene(scene.id)}>Eliminar</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <button className="secondary fullWidth" type="button" disabled={busy === "scene-add" || uploading} onClick={onAddScene}><Plus size={16} />Agregar paso</button>
          {isCourse ? <div className="chapterList">
            {chapters.map((chapter) => <button key={chapter} className="secondary" type="button" title={`Ver ${chapter}`} onClick={() => onPreviewChapter(chapter)}><Play size={12} />{chapter}</button>)}
            <button className="secondary" type="button" disabled={!selected} onClick={() => selected && patchSelected({ chapter: selected.chapter ? `${selected.chapter} 2` : "Nuevo capítulo", chapterTitleEnabled: true })}><Plus size={12} />Capítulo</button>
          </div> : null}
        </div>
        <div className="previewColumn">
          <div className="panelTitle"><strong>Vista previa</strong><small>{activeTool ? toolInstruction(activeTool) : activeLocalPreview?.filename ?? pendingPreview?.filename ?? selectedAsset?.filename ?? (uploading ? "Preparando el archivo..." : "Selecciona o sube un medio")}</small></div>
          <div
            className={`trainingPreview directPreview ${activeTool ? "isTargeting" : ""}`}
            ref={previewBoxRef}
            onClick={onPreviewClick}
            onMouseDown={onPreviewMouseDown}
            onMouseUp={onPreviewMouseUp}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void replaceSelectedMedia(event.dataTransfer.files);
            }}
          >
            <div className="previewStage" ref={previewStageRef} style={{ transform: `scale(${previewZoom})` }}>
            {previewUrl && previewIsCurrent && !previewPlaybackError ? <video controls autoPlay src={previewUrl} onError={() => setPreviewPlaybackError("El preview fue generado, pero el navegador no pudo reproducir el stream. Intenta generarlo otra vez o revisa que el backend pueda servir el archivo MP4.")} /> : realMediaNode ? realMediaNode : previewState.status === "error" || previewPlaybackError ? <PreviewStatus state={previewState.status === "error" ? previewState : { status: "error", message: previewPlaybackError }} onRetry={retryPreview} onDismiss={() => { setPreviewPlaybackError(""); onClearPreview(); }} /> : previewState.status === "loading" ? <PreviewStatus state={previewState} /> : <div className="emptyState uploadDropzone"><ImageIcon size={34} /><p>{selected?.mediaAssetId ? "No se pudo cargar el medio asociado." : "Agrega capturas o grabaciones para comenzar."}</p><small>{selected?.mediaAssetId ? "El archivo existe en el paso, pero la vista previa no respondió." : "Arrastra un archivo aquí o selecciónalo para asociarlo a este paso."}</small><div className="buttonRow"><label className="secondary fileButton"><Upload size={16} />Agregar archivo<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={(event) => void replaceSelectedMedia(event.target.files ?? undefined)} /></label><button className="secondary" type="button" onClick={() => setOpenSection("content")}>Elegir de biblioteca</button></div></div>}
            </div>
            {uploading && operationLabel ? <span className="previewBadge loading"><Loader2 className="spinIcon" size={14} />{operationLabel}</span> : previewState.status === "loading" && realMediaNode ? <span className="previewBadge loading"><Loader2 className="spinIcon" size={14} />Generando el video del paso... tarda unos segundos.</span> : previewPlaybackError && realMediaNode ? <span className="previewBadge warn">No se pudo reproducir la vista previa: mostrando el medio original.</span> : null}
            {previewZoom !== 1 ? (
              <button className="previewZoomChip" type="button" onClick={resetPreviewZoom} title="Restablecer zoom (o Ctrl + rueda)">
                <ZoomIn size={13} />{Math.round(previewZoom * 100)}%  ✕
              </button>
            ) : null}
          </div>
          <div className="previewControls">
            <button className="primary" type="button" disabled={!selected || busy === `scene-preview-${selected?.id}`} onClick={() => selected && onPreviewScene(selected.id)}>{busy === `scene-preview-${selected?.id}` ? <Loader2 className="spinIcon" size={16} /> : <Play size={16} />}{busy === `scene-preview-${selected?.id}` ? "Generando..." : "Ver paso"}</button>
            {selected?.chapter ? <button className="secondary" type="button" disabled={selectedChapterBusy} onClick={() => onPreviewChapter(selected.chapter!)}>{selectedChapterBusy ? <Loader2 className="spinIcon" size={16} /> : <Play size={16} />}{selectedChapterBusy ? "Generando..." : "Ver capítulo"}</button> : null}
            {isVideoMedia ? <span>{formatSeconds(selected?.trimStartSeconds ?? 0)} / {formatSeconds(selectedAsset?.durationSeconds ?? selected?.duration ?? 0)}</span> : null}
          </div>
        </div>
        {selected ? (
          <div className="sceneProperties">
            <div className="panelTitle"><strong>Editar paso</strong><small>{mediaPanelStatus({ hasSelection: true, mediaAssetId: selected.mediaAssetId, operation, pendingLocalPreview: Boolean(activeLocalPreview?.pending), saving: busy === `scene-update-${selected.id}` })}</small></div>
            <EditorSection id="content" label="Contenido" open={openSection} setOpen={setOpenSection}>
              <Field label="Título del paso" value={selected.title} onChange={(title) => patchSelected({ title })} />
              {isCourse ? <Field label="Capítulo" value={selected.chapter ?? ""} onChange={(chapter) => patchSelected({ chapter })} /> : null}
              <label className="field"><span>Medio</span><select value={selected.mediaAssetId ?? ""} onChange={(event) => patchSelected({ mediaAssetId: event.target.value || null, type: assetSceneType(project?.assets.find((asset) => asset.id === event.target.value)) })}><option value="">Sin medio</option>{(project?.assets ?? []).map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}</select></label>
              <label className="field fileButton secondary"><Upload size={16} />Agregar archivo<input type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" onChange={(event) => void replaceSelectedMedia(event.target.files ?? undefined)} /></label>
              <small className="muted">Este control reemplaza el medio del paso actual. Usa "Subir archivos" en el panel inicial para crear muchos pasos.</small>
              <label className="field"><span>Duración</span><input type="number" min="1" step="0.5" value={selected.duration} onChange={(event) => patchSelected({ duration: Number(event.target.value) })} /></label>
              {isVideoMedia ? <div className="trimBox"><strong>Recortar video</strong><div className="formGrid compact"><label className="field"><span>Inicio</span><input type="number" min="0" step="0.1" value={selected.trimStartSeconds ?? 0} onChange={(event) => patchSelected({ trimStartSeconds: Number(event.target.value) })} /></label><label className="field"><span>Fin</span><input type="number" min="0" step="0.1" value={selected.trimEndSeconds ?? selectedAsset?.durationSeconds ?? selected.duration} onChange={(event) => patchSelected({ trimEndSeconds: Number(event.target.value) })} /></label></div><small>Seleccionado: {formatSeconds(selectedDuration)}</small><button className="secondary" type="button" onClick={() => onPreviewScene(selected.id)}><Play size={14} />Reproducir selección</button></div> : null}
            </EditorSection>
            <EditorSection id="highlight" label="Destacar" open={openSection} setOpen={setOpenSection}>
              <p className="muted">¿Qué quieres que mire el usuario?</p>
              <div className="toolGrid">
                <button type="button" onClick={() => setActiveTool("zoom")} title="Acerca la cámara a una parte de la pantalla.">🔍<span>Zoom</span></button>
                <button type="button" onClick={() => setActiveTool("highlight")} title="Marca un botón o área importante.">▢<span>Resaltar</span></button>
                <button type="button" onClick={() => setActiveTool("arrow")} title="Señala exactamente dónde debe mirar el usuario.">➜<span>Flecha</span></button>
                <button type="button" onClick={() => setActiveTool("circle")}>◎<span>Círculo</span></button>
                <button type="button" onClick={() => setActiveTool("click")}><MousePointer size={18} /><span>Click</span></button>
                <button type="button" onClick={() => setActiveTool("blur")} title="Protege información privada.">▧<span>Ocultar dato</span></button>
              </div>
              <div className="annotationList">{(selected.animation?.callouts ?? []).map((item, index) => <div key={index} className="annotationCard"><strong>{friendlyCallout(String(item.type ?? ""))} {index + 1}</strong><span>Aparece: {Number(item.startTime ?? 0).toFixed(1)} s · Desaparece: {Number(item.endTime ?? selected.duration).toFixed(1)} s</span></div>)}</div>
            </EditorSection>
            <EditorSection id="narration" label="Narración" open={openSection} setOpen={setOpenSection}>
              <label className="field full"><span>¿Qué quieres explicar en este paso?</span><textarea rows={5} placeholder="Ahora busca el producto que deseas vender." value={selected.narrationScript ?? ""} onChange={(event) => patchSelected({ narrationScript: event.target.value })} /></label>
              <div className="narrationInfo"><span>Narración: {narrationSeconds.toFixed(1)} segundos</span><span>Escena: {selected.duration} segundos</span>{narrationSeconds > selected.duration ? <button className="secondary" type="button" onClick={() => patchSelected({ duration: Math.ceil(narrationSeconds + 0.6), durationMode: "AUTO" })}>Ajustar duración automáticamente</button> : null}</div>
            </EditorSection>
            <EditorSection id="subtitles" label="Subtítulos" open={openSection} setOpen={setOpenSection}>
              <div className="segmented"><button type="button" className={!selectedSubtitles.length ? "active" : ""}>Automáticos</button><button type="button" onClick={() => patchSelected({ customSubtitles: selectedSubtitles.length ? selectedSubtitles : [{ start: 0, end: Math.min(4, selected.duration), text: selected.narrationScript ?? selected.title }] })}>Personalizados</button><button type="button" onClick={() => patchSelected({ customSubtitles: [] })}>Sin subtítulos</button></div>
              <p className="muted">{selected.narrationScript ? selected.narrationScript.slice(0, 180) : "Los subtítulos automáticos se generan desde la narración del paso."}</p>
              {selectedSubtitles.length ? <label className="field full"><span>Texto personalizado</span><textarea rows={3} value={selectedSubtitles.map((cue) => cue.text).join("\n")} onChange={(event) => patchSelected({ customSubtitles: event.target.value.split("\n").filter(Boolean).map((text, index) => ({ start: index * 3, end: index * 3 + 3, text })) })} /></label> : null}
            </EditorSection>
            <EditorSection id="advanced" label="Opciones avanzadas" open={openSection} setOpen={setOpenSection}>
              <label className="field"><span>Tipo interno</span><select value={selected.type} onChange={(event) => patchSelected({ type: event.target.value })}>{["TITLE", "CHAPTER", "SCREENSHOT", "SCREEN_RECORDING", "CALLOUT", "TEXT", "SUMMARY", "BRAND_INTRO", "BRAND_OUTRO", "CTA", "VIDEO", "IMAGE"].map((type) => <option key={type} value={type}>{friendlySceneType(type)}</option>)}</select></label>
              <label className="field"><span>Modo duración</span><select value={selected.durationMode ?? "AUTO"} onChange={(event) => patchSelected({ durationMode: event.target.value as StoryScene["durationMode"] })}><option value="AUTO">Automática</option><option value="MANUAL">Manual</option></select></label>
              {isCourse ? <Toggle label="Título de capítulo" checked={Boolean(selected.chapterTitleEnabled)} onChange={(chapterTitleEnabled) => patchSelected({ chapterTitleEnabled })} /> : null}
              <Toggle label="Usar audio original" checked={Boolean(selected.sourceAudioEnabled)} onChange={(sourceAudioEnabled) => patchSelected({ sourceAudioEnabled })} />
              <div className="formGrid compact"><label className="field"><span>Zoom exacto</span><input type="number" min="0.5" max="4" step="0.05" value={selected.scale ?? 1} onChange={(event) => patchSelected({ scale: Number(event.target.value) })} /></label><label className="field"><span>X exacta</span><input type="number" min="0" max="1" step="0.01" value={selected.positionX ?? 0.5} onChange={(event) => patchSelected({ positionX: Number(event.target.value) })} /></label><label className="field"><span>Y exacta</span><input type="number" min="0" max="1" step="0.01" value={selected.positionY ?? 0.5} onChange={(event) => patchSelected({ positionY: Number(event.target.value) })} /></label></div>
              <button className="secondary" type="button" onClick={() => patchSelected({ scale: 1, positionX: 0.5, positionY: 0.5, cropTop: 0, cropRight: 0, cropBottom: 0, cropLeft: 0 })}>Restablecer encuadre</button>
            </EditorSection>
          </div>
        ) : (
          /* Sin paso todavia (proyecto nuevo): panel estable con el estado real
             de la operacion en curso, nunca datos de un snapshot intermedio. */
          <div className="sceneProperties pendingProperties">
            <div className="panelTitle"><strong>Editar paso</strong><small>{operationLabel || "Guardando medio..."}</small></div>
            <p className="pendingHint"><Loader2 className="spinIcon" size={14} />El archivo se esta guardando en el servidor. El paso aparecera aqui en cuanto se confirme.</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function EditorSection({
  id,
  label,
  open,
  setOpen,
  children
}: {
  id: "content" | "highlight" | "narration" | "subtitles" | "advanced";
  label: string;
  open: "content" | "highlight" | "narration" | "subtitles" | "advanced";
  setOpen: (id: "content" | "highlight" | "narration" | "subtitles" | "advanced") => void;
  children: ReactNode;
}) {
  const expanded = open === id;
  return (
    <section className={`editorSection ${expanded ? "expanded" : ""}`}>
      <button type="button" className="editorSectionHeader" onClick={() => setOpen(id)}>
        <strong>{label}</strong>
        <span>{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? <div className="editorSectionBody">{children}</div> : null}
    </section>
  );
}

function friendlySceneType(type: string) {
  const labels: Record<string, string> = {
    BRAND_INTRO: "Introducción de marca",
    SCREEN_RECORDING: "Grabación de pantalla",
    SCREENSHOT: "Captura",
    IMAGE: "Imagen / Captura",
    VIDEO: "Video",
    CALLOUT: "Indicador",
    SUMMARY: "Resumen",
    BRAND_OUTRO: "Cierre de marca",
    TITLE: "Título",
    CHAPTER: "Capítulo",
    TEXT: "Texto",
    CTA: "Llamada a la acción"
  };
  return labels[type] ?? "Paso";
}

function friendlyCallout(type: string) {
  const labels: Record<string, string> = {
    HighlightBox: "Resaltado",
    ArrowCallout: "Flecha",
    SpotlightCallout: "Luz",
    CircleCallout: "Círculo",
    CursorPulse: "Click",
    BlurRegion: "Dato oculto"
  };
  return labels[type] ?? "Indicador";
}

function sceneIcon(type: string) {
  if (type === "SCREEN_RECORDING" || type === "VIDEO") return "▶";
  if (type === "IMAGE" || type === "SCREENSHOT") return "▧";
  if (type === "BRAND_INTRO") return "★";
  if (type === "BRAND_OUTRO" || type === "CTA") return "✓";
  if (type === "CHAPTER" || type === "TITLE") return "T";
  return "•";
}

function toolInstruction(tool: "zoom" | "highlight" | "arrow" | "circle" | "click" | "blur") {
  const labels = {
    zoom: "Selecciona en la pantalla dónde quieres acercar.",
    highlight: "Arrastra sobre el elemento que quieres destacar.",
    arrow: "Arrastra desde donde inicia la flecha hasta el elemento.",
    circle: "Haz clic donde quieres dibujar el círculo.",
    click: "Haz clic donde quieres mostrar el click.",
    blur: "Arrastra sobre nombres, teléfonos o información privada."
  };
  return labels[tool];
}

function assetSceneType(asset?: Project["assets"][number]) {
  if (!asset) return undefined;
  return asset.mimeType?.startsWith("video/") ? "SCREEN_RECORDING" : "IMAGE";
}

function PreviewStatus({ state, onRetry, onDismiss }: { state: TrainingPreviewState; onRetry?: () => void; onDismiss?: () => void }) {
  const isLoading = state.status === "loading";
  return (
    <div className={`previewStatus ${state.status}`}>
      {isLoading ? <Loader2 className="spinIcon" size={38} /> : <ImageIcon size={38} />}
      <p>{isLoading ? "Preparando vista previa..." : "No se pudo mostrar la vista previa"}</p>
      <small>{state.message || (isLoading ? "Estamos renderizando el video con el contenido seleccionado." : "Revisa los medios del proyecto e inténtalo otra vez.")}</small>
      {!isLoading && (onRetry || onDismiss) ? (
        <div className="buttonRow">
          {onRetry ? <button className="secondary" type="button" onClick={onRetry}><Play size={14} />Reintentar</button> : null}
          {onDismiss ? <button className="secondary" type="button" onClick={onDismiss}>Ver medio original</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function ProjectMediaPreview({ projectId, assetId, isVideo, filename }: { projectId: string; assetId: string; isVideo: boolean; filename: string }) {
  const [source, setSource] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl = "";

    async function load() {
      setSource("");
      setFailed(false);
      try {
        const access = await fetchJson<{ url?: string | null }>(`${API_URL}/projects/${projectId}/assets/${assetId}/access-url`);
        if (!alive) return;
        if (access.url) {
          setSource(access.url);
          return;
        }

        const headers = new Headers();
        const token = window.localStorage.getItem("videoStudioToken");
        if (token) headers.set("Authorization", `Bearer ${token}`);
        const response = await fetch(`${API_URL}/projects/${projectId}/assets/${assetId}/file`, { headers });
        if (!response.ok) throw new Error(await response.text());
        objectUrl = URL.createObjectURL(await response.blob());
        if (alive) setSource(objectUrl);
      } catch {
        if (alive) setFailed(true);
      }
    }

    void load();
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, assetId]);

  if (failed) return <div className="emptyState"><ImageIcon size={34} /><p>No se pudo cargar el medio asociado.</p><small>{filename}</small></div>;
  if (!source) return <div className="emptyState"><Loader2 className="spinIcon" size={34} /><p>Cargando medio...</p><small>{filename}</small></div>;
  return isVideo ? <video controls src={source} /> : <img src={source} alt={filename} />;
}

function estimateSpeechSeconds(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words ? Math.max(1.2, words / 2.35) : 0;
}

function formatSeconds(value: number) {
  return `${Math.max(0, value).toFixed(1)} s`;
}

function cleanFileTitle(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultMediaChapter(videoType: VideoType, count: number) {
  if (videoType === "COURSE") return count > 1 ? "Contenido" : "Principal";
  return undefined;
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
  const assetsById = Object.fromEntries((project?.assets ?? []).map((asset) => [asset.id, asset]));
  const scenes = visibleStoryScenes(project?.scenes ?? []);
  return (
    <div className="review">
      <div><strong>Preview del proyecto</strong><p className="muted">Textos, formato, audio, plantilla y recursos antes de renderizar.</p></div>
      <div className="reviewGrid">
        <span><strong>Proyecto</strong>{draft.name}</span><span><strong>Producto</strong>{draft.productName}</span><span><strong>Formato</strong>{draft.format}</span>
        <span><strong>Plantilla</strong>{templateLabel(draft.template)}</span><span><strong>Voz</strong>{draft.voiceoverEnabled ? `${draft.voiceName} · ${draft.voiceSpeed}` : "Desactivada"}</span><span><strong>Música</strong>{draft.musicEnabled ? `${draft.musicTrackId ?? (draft.customMusicPath ? "Mi pista" : "Auto")} · ${Math.round(draft.musicVolume * 100)}%` : "Desactivada"}</span>
      </div>
      {scenes.length ? (
        /* El video se arma con los pasos: se muestran los pasos reales, no los
           recursos por tipo del flujo antiguo (que ya no se usan). */
        <div className="assetStrip">
          {scenes.map((scene, index) => {
            const media = scene.mediaAssetId ? assetsById[scene.mediaAssetId] : undefined;
            return (
              <div className="assetThumb" key={scene.id}>
                <ImageIcon size={22} />
                <span>{index + 1}. {scene.title}</span>
                <small>{media ? media.filename : "Sin medio"}</small>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="assetStrip">
          {uploadFields.slice(0, 5).map((field) => (
            <div className="assetThumb" key={field.type}>{previews[field.type] ? <img src={previews[field.type]} alt="" /> : <ImageIcon size={22} />}<span>{field.label}</span><small>{assetNames[field.type] ?? existing[field.type] ?? "Pendiente"}</small></div>
          ))}
        </div>
      )}
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

function BrandManager({
  brands,
  busy,
  selectedBrandId,
  onSelect,
  onCreate,
  onEdit,
  onDuplicate,
  onArchive,
  onRestore,
  onDelete,
  onSetDefault
}: {
  brands: BrandProfile[];
  busy: string | null;
  selectedBrandId?: string;
  onSelect: (brand: BrandProfile) => void;
  onCreate: () => void;
  onEdit: (brand: BrandProfile) => void;
  onDuplicate: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (brand: BrandProfile) => void;
  onSetDefault: (id: string) => void;
}) {
  const activeBrands = brands.filter((brand) => !brand.archived);
  const archivedBrands = brands.filter((brand) => brand.archived || isDemoBrand(brand));
  return (
    <section className="card">
      <div className="sectionHeader">
        <div>
          <h2>Empresas / Marcas</h2>
          <p className="muted">Gestiona perfiles reutilizables sin mezclar logos, CTAs, website, voz ni música entre clientes.</p>
        </div>
        <button className="primary" type="button" disabled={busy === "brand-save"} onClick={onCreate}><Plus size={18} />Nueva empresa</button>
      </div>
      <BrandManagerGrid title="Activas" brands={activeBrands.filter((brand) => !isDemoBrand(brand))} busy={busy} selectedBrandId={selectedBrandId} onSelect={onSelect} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} onSetDefault={onSetDefault} />
      <BrandManagerGrid title="Archivadas / Demo" brands={archivedBrands} busy={busy} selectedBrandId={selectedBrandId} archived onSelect={onSelect} onEdit={onEdit} onDuplicate={onDuplicate} onArchive={onArchive} onRestore={onRestore} onDelete={onDelete} onSetDefault={onSetDefault} />
    </section>
  );
}

function BrandManagerGrid({ title, brands, busy, selectedBrandId, archived = false, onSelect, onEdit, onDuplicate, onArchive, onRestore, onDelete, onSetDefault }: { title: string; brands: BrandProfile[]; busy: string | null; selectedBrandId?: string; archived?: boolean; onSelect: (brand: BrandProfile) => void; onEdit: (brand: BrandProfile) => void; onDuplicate: (id: string) => void; onArchive: (id: string) => void; onRestore: (id: string) => void; onDelete: (brand: BrandProfile) => void; onSetDefault: (id: string) => void }) {
  return (
    <div className="brandManagerSection">
      <h3>{title}</h3>
      {brands.length === 0 ? <p className="muted">No hay empresas en esta sección.</p> : null}
      <div className="brandManagerGrid">
        {brands.map((brand) => (
          <div className={`brandManagerCard ${selectedBrandId === brand.id ? "selected" : ""}`} key={brand.id}>
            <div className="brandPreview">
              <LogoMark brand={brand} />
              <div>
                <strong>{brand.name}</strong>
                <small>{brand.website ?? brand.slug}{brand.isDefault ? " · Predeterminada" : ""}</small>
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
              {!archived ? <button className="secondary" type="button" onClick={() => onSelect(brand)}>Usar</button> : null}
              <button className="secondary" type="button" onClick={() => onEdit(brand)}><Pencil size={16} />Editar</button>
              <button className="secondary" type="button" disabled={busy === `brand-duplicate-${brand.id}`} onClick={() => onDuplicate(brand.id)}><Copy size={16} />Duplicar</button>
              {!brand.isDefault && !archived ? <button className="secondary" type="button" disabled={busy === `brand-default-${brand.id}`} onClick={() => onSetDefault(brand.id)}>Predeterminada</button> : null}
              {archived && !isDemoBrand(brand) ? <button className="secondary" type="button" disabled={busy === `brand-restore-${brand.id}`} onClick={() => onRestore(brand.id)}><RotateCcw size={16} />Restaurar</button> : null}
              {!archived ? <button className="secondary" type="button" disabled={busy === `brand-archive-${brand.id}` || brand.isDefault} onClick={() => onArchive(brand.id)}><Archive size={16} />Archivar</button> : null}
              <button className="danger" type="button" disabled={busy === `brand-delete-${brand.id}`} onClick={() => onDelete(brand)}><Trash2 size={16} />Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
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

function Field({ label, value, onChange, full = false, hint, placeholder }: { label: string; value: string; onChange: (value: string) => void; full?: boolean; hint?: string; placeholder?: string }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label}
        {hint ? <em className="fieldHint">{hint}</em> : null}
      </span>
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
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

function videoTypeLabel(type: VideoType) {
  const labels: Record<VideoType, string> = {
    ADVERTISEMENT: "Publicidad",
    QUICK_TUTORIAL: "Tutorial",
    COURSE: "Curso / Capacitación",
    ONBOARDING: "Onboarding",
    FEATURE_SPOTLIGHT: "Función destacada",
    SUPPORT: "Soporte",
    BRAND_MOTIVATIONAL: "Marca",
    FREEFORM: "Video libre"
  };
  return labels[type] ?? "Video";
}

function formatUseLabel(format: Draft["format"]) {
  const labels: Record<Draft["format"], string> = {
    "9:16": "Vertical para redes",
    "16:9": "Horizontal para cursos",
    "1:1": "Cuadrado para feed",
    "4:5": "Vertical para feed"
  };
  return labels[format] ?? format;
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

function emptyBrandForm(): BrandForm {
  return {
    name: "",
    description: "",
    website: "",
    whatsapp: "",
    email: "",
    primaryColor: "#2563eb",
    secondaryColor: "#14b8a6",
    accentColor: "#f59e0b",
    defaultVoiceProfile: "dominican-promotional",
    defaultNarrationStyle: "CORPORATE",
    defaultMusicTrackId: "",
    defaultCTA: "Conoce más",
    watermarkEnabled: false
  };
}

function brandToForm(brand: BrandProfile): BrandForm {
  return {
    name: brand.name,
    description: brand.defaultOffer ?? "",
    website: brand.website ?? "",
    whatsapp: brand.whatsapp ?? "",
    email: brand.email ?? "",
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    accentColor: brand.accentColor,
    defaultVoiceProfile: brand.defaultVoiceProfile ?? "",
    defaultNarrationStyle: brand.defaultNarrationStyle ?? "CORPORATE",
    defaultMusicTrackId: brand.defaultMusicTrackId ?? "",
    defaultCTA: brand.defaultCTA ?? "",
    watermarkEnabled: brand.watermarkEnabled
  };
}

function brandPayload(form: BrandForm) {
  return {
    name: form.name,
    website: form.website || undefined,
    whatsapp: form.whatsapp || undefined,
    email: form.email || undefined,
    primaryColor: form.primaryColor,
    secondaryColor: form.secondaryColor,
    accentColor: form.accentColor,
    backgroundColor: "#07111f",
    textColor: "#edf5ff",
    defaultOffer: form.description || undefined,
    defaultCTA: form.defaultCTA || undefined,
    defaultVoiceProfile: form.defaultVoiceProfile || undefined,
    defaultNarrationStyle: form.defaultNarrationStyle,
    defaultMusicTrackId: form.defaultMusicTrackId || undefined,
    defaultMusicVolume: 0.12,
    watermarkEnabled: form.watermarkEnabled
  };
}

function logoUrl(brand: BrandProfile) {
  const id = brand.logoPrimaryAssetId ?? brand.logoLightAssetId ?? brand.logoDarkAssetId ?? brand.watermarkAssetId;
  return id ? `${API_URL}/brands/${brand.id}/assets/${id}/public-image` : "";
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "VS";
}

function isDemoBrand(brand: BrandProfile) {
  const value = `${brand.name} ${brand.slug}`.toLowerCase();
  return value.includes("demo");
}

type StudioRequestInit = RequestInit & { skipAuth?: boolean };

type UploadIntent = {
  objectKey: string;
  signedUrl: string;
  expiresInSeconds: number;
};

/* Sesion del estudio: el token vive en localStorage y el API lo renueva antes de que
   caduque. Un 401 significa que ya no sirve: se descarta y vuelve la pantalla de acceso. */
const UNAUTHORIZED_EVENT = "videoStudio:unauthorized";
/* Revalidar la sesion cuesta una peticion: una vez cada 5 minutos mantiene la sesion viva
   sin repetirla en cada cambio de pestaña. */
const SESSION_RECHECK_MS = 5 * 60 * 1000;

async function fetchJson<T>(url: string, init?: StudioRequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const usesStoredToken = !init?.skipAuth && typeof window !== "undefined";
  if (usesStoredToken) {
    const token = window.localStorage.getItem("videoStudioToken");
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const { skipAuth, ...requestInit } = init ?? {};
  const response = await fetch(url, { ...requestInit, headers });
  if (response.status === 401 && usesStoredToken) clearStoredSession();
  if (!response.ok) throw new Error(await responseErrorMessage(response));
  return response.json() as Promise<T>;
}

/** Descarta la sesion caducada y avisa a la interfaz para que pida acceso otra vez. */
function clearStoredSession() {
  try {
    window.localStorage.removeItem("videoStudioToken");
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  } catch {
    /* Sin almacenamiento local no hay nada que limpiar. */
  }
}

async function responseErrorMessage(response: Response) {
  const text = await response.text();
  if (!text.trim()) return `Solicitud falló con HTTP ${response.status}.`;
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: unknown; statusCode?: unknown };
    if (Array.isArray(parsed.message)) return parsed.message.join(" ");
    if (typeof parsed.message === "string") return parsed.message;
    if (typeof parsed.error === "string") return parsed.error;
  } catch {
    return text;
  }
  return text;
}

async function uploadProjectAsset(projectId: string, type: AssetType, file: File) {
  try {
    const intent = await fetchJson<UploadIntent>(`${API_URL}/projects/${projectId}/assets/upload-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, filename: file.name, mimeType: file.type, sizeBytes: file.size })
    });
    const upload = await fetch(intent.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });
    if (!upload.ok) throw new Error("No se pudo cargar el archivo en almacenamiento.");
    const checksum = await sha256BrowserFile(file);
    return await fetchJson<{ id: string; durationSeconds?: number }>(`${API_URL}/projects/${projectId}/assets/complete-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, filename: file.name, mimeType: file.type, sizeBytes: file.size, checksum, objectKey: intent.objectKey })
    });
  } catch {
    return uploadProjectAssetViaApi(projectId, type, file);
  }
}

async function uploadBrandAsset(brandId: string, type: string, file: File) {
  try {
    const intent = await fetchJson<UploadIntent>(`${API_URL}/brands/${brandId}/assets/upload-intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, filename: file.name, mimeType: file.type, sizeBytes: file.size })
    });
    const upload = await fetch(intent.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });
    if (!upload.ok) throw new Error("No se pudo cargar el logo en almacenamiento.");
    const checksum = await sha256BrowserFile(file);
    return await fetchJson<BrandAsset>(`${API_URL}/brands/${brandId}/assets/complete-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, filename: file.name, mimeType: file.type, sizeBytes: file.size, checksum, objectKey: intent.objectKey })
    });
  } catch {
    return uploadBrandAssetViaApi(brandId, type, file);
  }
}

async function uploadProjectAssetViaApi(projectId: string, type: AssetType, file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetchJson<{ id: string; durationSeconds?: number }>(`${API_URL}/projects/${projectId}/assets?type=${encodeURIComponent(type)}`, {
    method: "POST",
    body: form
  });
}

async function uploadBrandAssetViaApi(brandId: string, type: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return fetchJson<BrandAsset>(`${API_URL}/brands/${brandId}/assets?type=${encodeURIComponent(type)}`, {
    method: "POST",
    body: form
  });
}

async function sha256BrowserFile(file: File) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
  if (section === "Dashboard") return "Actividad reciente del estudio.";
  if (section === "Crear video") return "Configura, edita y exporta.";
  if (section === "Biblioteca") return "Medios del proyecto y videos generados.";
  if (section === "Proyectos") return "Borradores y trabajos guardados.";
  if (section === "Videos") return "Renders listos para revisar.";
  if (section === "Marcas") return "Perfiles visuales reutilizables.";
  return "Preferencias del estudio.";
}
