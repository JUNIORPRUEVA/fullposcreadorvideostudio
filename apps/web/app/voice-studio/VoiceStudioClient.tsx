"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FolderOpen, Loader2, Mic, Pause, Play, RefreshCcw, Star, Volume2 } from "lucide-react";
import {
  DEFAULT_API_URL,
  DEFAULT_SETTINGS,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  PAUSE_OPTIONS,
  MAX_PAUSE_MS,
  PREVIEW_TEXT,
  FULLPOS_VOICE_STORAGE_KEY,
  VOICE_FILTERS,
  absoluteMediaUrl,
  buildGeneratePayload,
  buildOpenFolderPayload,
  buildPreferencePayload,
  buildPreviewPayload,
  buildVoiceGroups,
  clampPause,
  clampSpeed,
  countText,
  describeApiError,
  findVoice,
  formatBytes,
  formatClock,
  formatCount,
  formatDuration,
  isGenerateEnabled,
  isPreviewEnabled,
  parseGeneration,
  parseHealth,
  parseVoices,
  phaseMessage,
  readRememberedVoice,
  rememberFullposVoice,
  resolveVoiceSelection,
  resultRows,
  savedInLabel,
  speedLabel,
  voiceChips,
  voiceLabel,
  type VoiceEngineGroupView,
  type VoiceFilter,
  type VoiceGenerationView,
  type VoiceHealthView,
  type VoiceOptionView,
  type VoiceStudioPhase,
  type VoiceStudioSettings
} from "./voice-studio-state";

class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type VoiceStudioClientProps = {
  apiUrl?: string;
};

/**
 * Opciones del selector agrupadas por motor, tal como las pide la Fase 2:
 * un grupo "Kokoro" y otro "Español latino / Piper".
 */
export function VoiceSelectGroups({ groups }: { groups: VoiceEngineGroupView[] }) {
  return (
    <>
      {groups.map((group) => (
        <optgroup key={group.id} label={group.label}>
          {group.voices.map((voice) => (
            <option key={voice.key} value={voice.key} disabled={!voice.available}>
              {voiceLabel(voice)}
              {voice.available ? "" : " · no descargada"}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function VoiceStudioClient({ apiUrl = DEFAULT_API_URL }: VoiceStudioClientProps) {
  // El token del estudio vive en un ref: asi la primera peticion ya lo lleva (el
  // estado se actualiza despues del primer render y llegaria tarde).
  const tokenRef = useRef("");
  const [phase, setPhase] = useState<VoiceStudioPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<VoiceHealthView | null>(null);
  const [voices, setVoices] = useState<VoiceOptionView[]>([]);
  const [engines, setEngines] = useState<VoiceEngineGroupView[]>([]);
  const [filter, setFilter] = useState<VoiceFilter>("all");
  const [primaryEngineLabel, setPrimaryEngineLabel] = useState("Kokoro");
  const [settings, setSettings] = useState<VoiceStudioSettings>(DEFAULT_SETTINGS);
  const [script, setScript] = useState("");
  const [generation, setGeneration] = useState<VoiceGenerationView | null>(null);
  const [preview, setPreview] = useState<VoiceGenerationView | null>(null);
  const [savedVoiceId, setSavedVoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);

  const counter = useMemo(() => countText(script), [script]);
  const selectedVoice = useMemo(() => findVoice(voices, settings.voiceKey), [voices, settings.voiceKey]);
  const voiceGroups = useMemo(() => buildVoiceGroups(engines, voices, filter), [engines, voices, filter]);
  const engineWarnings = useMemo(
    () =>
      engines
        .filter((group) => !group.installed || group.voices.length === 0)
        .map((group) => ({
          id: group.id,
          text: `${group.label}: ${group.reason ?? "no hay voces descargadas. Ejecuta npm run voice:setup para bajarlas."}`
        })),
    [engines]
  );
  const hiddenByFilter = voices.length > 0 && voiceGroups.length === 0;
  const engineReady = Boolean(health?.ok);
  const formats = health?.formats?.length ? health.formats : ["wav"];
  const mp3Available = formats.includes("mp3");

  /** Peticion al API del estudio. Normaliza red, HTTP y JSON corrupto. */
  const apiFetch = useCallback(
    async (path: string, init?: RequestInit): Promise<unknown> => {
      const token = tokenRef.current;
      let response: Response;
      try {
        response = await fetch(`${apiUrl}${path}`, {
          ...init,
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(init?.headers ?? {})
          },
          cache: "no-store"
        });
      } catch {
        throw new ApiError(0, describeApiError(0, null, apiUrl));
      }
      const raw = await response.text();
      let payload: unknown = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) throw new ApiError(response.status, describeApiError(response.status, payload, apiUrl));
      return payload;
    },
    [apiUrl]
  );

  const loadHealth = useCallback(async () => {
    try {
      const payload = await apiFetch("/voice/health");
      const parsed = parseHealth(payload);
      setHealth(parsed);
      if (parsed && !parsed.ok) setNotice(parsed.reason ?? "El motor de voz local no esta disponible.");
      else setNotice(null);
    } catch (requestError) {
      setHealth(null);
      setNotice(requestError instanceof ApiError ? requestError.message : "No se pudo comprobar el motor de voz.");
    }
  }, [apiFetch]);

  const loadVoices = useCallback(
    async (remembered: string | null) => {
      const payload = await apiFetch("/voice/voices");
      const parsed = parseVoices(payload);
      setVoices(parsed.voices);
      setEngines(parsed.engines);
      setPrimaryEngineLabel(parsed.label);
      setSettings((current) => ({
        ...current,
        voiceKey: resolveVoiceSelection(parsed.voices, current.voiceKey || remembered || parsed.defaultVoiceKey)
      }));
      return parsed.voices;
    },
    [apiFetch]
  );

  // Arranque: token del estudio (misma sesion, sin inventar autenticacion nueva).
  useEffect(() => {
    let remembered: string | null = null;
    try {
      tokenRef.current = window.localStorage.getItem("videoStudioToken") ?? "";
      const stored = readRememberedVoice(window.localStorage.getItem(FULLPOS_VOICE_STORAGE_KEY));
      remembered = stored?.key ?? null;
      setSavedVoiceId(remembered);
    } catch {
      // Sin almacenamiento local la pagina sigue funcionando.
    }
    void (async () => {
      await loadHealth();
      try {
        await loadVoices(remembered);
        setPhase((current) => (current === "loading" ? "idle" : current));
      } catch (voiceError) {
        const status = voiceError instanceof ApiError ? voiceError.status : -1;
        const message = voiceError instanceof Error ? voiceError.message : "No se pudieron cargar las voces.";
        // Un 401 exige accion del usuario (entrar al estudio): alerta destacada.
        // Si el motor solo esta apagado, ya lo explica la tarjeta de estado.
        if (status === 401) {
          setPhase("error");
          setError(message);
        } else {
          setPhase("idle");
          setNotice(message);
        }
      }
    })();
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Si el motor deja de estar listo, no dejamos el MP3 seleccionado.
  useEffect(() => {
    if (!mp3Available && settings.format === "mp3") {
      setSettings((current) => ({ ...current, format: "wav" }));
    }
  }, [mp3Available, settings.format]);

  async function onPreview() {
    setError(null);
    setPhase("previewing");
    try {
      const payload = await apiFetch("/voice/preview", {
        method: "POST",
        body: JSON.stringify(buildPreviewPayload(settings, selectedVoice))
      });
      const parsed = parseGeneration(payload);
      if (!parsed) throw new ApiError(502, "El motor devolvio una respuesta inesperada al probar la voz.");
      setPreview(parsed);
      setPhase("idle");
    } catch (previewError) {
      setPhase("error");
      setError(previewError instanceof Error ? previewError.message : "No se pudo probar la voz.");
    }
  }

  async function onGenerate() {
    setError(null);
    setGeneration(null);
    setPhase("generating");
    try {
      const payload = await apiFetch("/voice/generate", {
        method: "POST",
        body: JSON.stringify(buildGeneratePayload(script, settings, selectedVoice))
      });
      const parsed = parseGeneration(payload);
      if (!parsed) throw new ApiError(502, "El motor devolvio una respuesta inesperada. Revisa storage/generated-audio.");
      setGeneration(parsed);
      setPhase("done");
    } catch (generationError) {
      setPhase("error");
      setError(generationError instanceof Error ? generationError.message : "No se pudo generar la narracion.");
    }
  }

  /**
   * Abre la carpeta en el explorador de Windows. El navegador no manda rutas: solo el
   * nombre de la carpeta del dia (o nada, para la raiz de audios generados).
   */
  async function onOpenFolder(folder: string | null) {
    setError(null);
    setFolderBusy(true);
    try {
      const payload = await apiFetch("/voice/open-folder", {
        method: "POST",
        body: JSON.stringify(buildOpenFolderPayload(folder))
      });
      const savedIn = readSavedIn(payload);
      setNotice(`Carpeta abierta en el explorador: ${savedIn || "storage/generated-audio"}`);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "No se pudo abrir la carpeta.");
    } finally {
      setFolderBusy(false);
    }
  }

  async function onSaveAsFullposVoice() {
    const voice = selectedVoice;
    const preference = buildPreferencePayload(voice, settings);
    try {
      await apiFetch("/voice/voice-preference", { method: "PUT", body: JSON.stringify(preference) });
      setSavedVoiceId(settings.voiceKey);
      setNotice(`"Voz FullPOS" guardada: ${voice?.name ?? preference.voiceId} (${preference.engine}).`);
      try {
        window.localStorage.setItem(
          FULLPOS_VOICE_STORAGE_KEY,
          rememberFullposVoice({ key: settings.voiceKey, name: voice?.name ?? preference.voiceId })
        );
      } catch {
        // La copia local es opcional.
      }
    } catch (saveError) {
      // Sin base de datos: al menos queda guardada en este navegador.
      setSavedVoiceId(settings.voiceKey);
      try {
        window.localStorage.setItem(
          FULLPOS_VOICE_STORAGE_KEY,
          rememberFullposVoice({ key: settings.voiceKey, name: voice?.name ?? preference.voiceId })
        );
      } catch {
        /* ignore */
      }
      setNotice(
        `${saveError instanceof Error ? saveError.message : "No se pudo guardar la voz."} Se guardo solo en este navegador.`
      );
    }
  }

  return (
    <main className="voiceStudio" data-testid="voice-studio">
      <header className="voiceStudioHeader">
        <div>
          <p className="voiceStudioEyebrow">
            <Mic size={16} /> Narracion local
          </p>
          <h1>FullPOS Voice Studio</h1>
          <p className="voiceStudioSubtitle">Genera narraciones consistentes para tus videos.</p>
        </div>
        <div className="buttonRow">
          <a className="secondary" href="/">
            Volver al estudio
          </a>
        </div>
      </header>

      <EngineStatusCard health={health} engineLabel={primaryEngineLabel} notice={notice} apiUrl={apiUrl} />

      {error ? <VoiceStudioError message={error} /> : null}

      <section className="card voiceStudioScript">
        <div className="panelTitle">
          <strong>Guion</strong>
          <small>
            {formatCount(counter.characters)} caracteres · {formatCount(counter.words)} palabras
          </small>
        </div>
        <label className="field">
          <span>Texto a narrar</span>
          <textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            placeholder="Pega aqui el guion completo del tutorial. No hay limite de 500 caracteres."
            rows={10}
            data-testid="voice-script"
          />
        </label>
        <p className="fieldHint">
          El motor divide el texto por parrafos y oraciones, narra cada fragmento y vuelve a unirlos respetando el orden.
        </p>
      </section>

      <section className="card voiceStudioSettings">
        <div className="panelTitle">
          <strong>Ajustes de voz</strong>
          <small>{speedLabel(settings.speed)} · pausa {settings.pauseMs} ms</small>
        </div>

        <label className="field">
          <span>Voz</span>
          <select
            value={settings.voiceKey}
            onChange={(event) => setSettings((current) => ({ ...current, voiceKey: event.target.value }))}
            disabled={!voices.length}
            data-testid="voice-select"
          >
            {voices.length === 0 ? <option value="">Cargando voces...</option> : <VoiceSelectGroups groups={voiceGroups} />}
          </select>
        </label>

        <div className="voiceStudioFilters" role="group" aria-label="Filtros de voz" data-testid="voice-filters">
          {VOICE_FILTERS.map((item) => (
            <button
              key={item.id}
              className={`voiceFilter ${filter === item.id ? "active" : ""}`}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              data-testid={`voice-filter-${item.id}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {engineWarnings.map((warning) => (
          <p className="fieldHint" key={warning.id} data-testid="voice-engine-warning">
            {warning.text}
          </p>
        ))}

        {hiddenByFilter ? (
          <p className="fieldHint" data-testid="voice-filter-empty">
            Ninguna voz coincide con el filtro. Prueba con otro o vuelve a Todas.
          </p>
        ) : null}

        {selectedVoice ? (
          <ul className="voiceStudioChips" data-testid="voice-meta">
            {voiceChips(selectedVoice).map((chip) => (
              <li key={chip}>{chip}</li>
            ))}
          </ul>
        ) : null}
        {selectedVoice?.note ? (
          <p className="fieldHint" data-testid="voice-note">
            {selectedVoice.note}
          </p>
        ) : null}

        <div className="buttonRow">
          <button
            className="secondary"
            type="button"
            onClick={() => void onPreview()}
            disabled={!isPreviewEnabled({ settings, phase, engineReady, voice: selectedVoice })}
          >
            {phase === "previewing" ? <Loader2 className="spin" size={16} /> : <Play size={16} />} Probar voz
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void onSaveAsFullposVoice()}
            disabled={!settings.voiceKey || savedVoiceId === settings.voiceKey}
          >
            <Star size={16} /> {savedVoiceId === settings.voiceKey ? "Voz FullPOS actual" : "Establecer como voz FullPOS"}
          </button>
        </div>

        {preview ? (
          <div className="voiceStudioPreview">
            <p className="fieldHint">Prueba de voz · texto fijo de comparacion</p>
            <audio controls preload="none" src={absoluteMediaUrl(apiUrl, preview.audioUrl)} data-testid="voice-preview-player" />
            <p className="fieldHint">{PREVIEW_TEXT}</p>
          </div>
        ) : null}

        <label className="field">
          <span>Velocidad: {speedLabel(settings.speed)}</span>
          <input
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={settings.speed}
            onChange={(event) => setSettings((current) => ({ ...current, speed: clampSpeed(Number(event.target.value)) }))}
            data-testid="voice-speed"
          />
        </label>

        <label className="field">
          <span>Pausa entre bloques</span>
          <select
            value={String(settings.pauseMs)}
            onChange={(event) => setSettings((current) => ({ ...current, pauseMs: clampPause(Number(event.target.value)) }))}
            data-testid="voice-pause"
          >
            {PAUSE_OPTIONS.map((pause) => (
              <option key={pause} value={pause}>
                {pause === 0 ? "Sin pausa" : `${pause} ms`}
              </option>
            ))}
          </select>
          <small className="fieldHint">Maximo {MAX_PAUSE_MS} ms para no alargar el audio de mas.</small>
        </label>

        <fieldset className="voiceStudioFormats">
          <legend>Formato</legend>
          {(["wav", "mp3"] as const).map((format) => {
            const disabled = format === "mp3" && !mp3Available;
            return (
              <label key={format} className="toggle">
                <input
                  type="radio"
                  name="voice-format"
                  value={format}
                  checked={settings.format === format}
                  disabled={disabled}
                  onChange={() => setSettings((current) => ({ ...current, format }))}
                />
                <span>{format.toUpperCase()}{disabled ? " (FFmpeg no disponible)" : ""}</span>
              </label>
            );
          })}
        </fieldset>
      </section>

      <section className="card voiceStudioGenerate">
        <div className="buttonRow">
          <button
            className="primary"
            type="button"
            onClick={() => void onGenerate()}
            disabled={!isGenerateEnabled({ text: script, settings, phase, engineReady, voice: selectedVoice })}
            data-testid="voice-generate"
          >
            {phase === "generating" ? <Loader2 className="spin" size={18} /> : <Volume2 size={18} />} Generar narracion
          </button>
          <button className="secondary" type="button" onClick={() => void loadHealth()} disabled={phase === "generating"}>
            <RefreshCcw size={16} /> Revisar motor
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void onOpenFolder(null)}
            disabled={folderBusy || !engineReady}
            data-testid="voice-open-folder-root"
            title="Abrir storage/generated-audio en el explorador de Windows"
          >
            {folderBusy ? <Loader2 className="spin" size={16} /> : <FolderOpen size={16} />} Abrir carpeta de audios
          </button>
        </div>
        <p className="fieldHint" data-testid="voice-phase">
          {phaseMessage(phase)}
        </p>
        {phase === "done" ? (
          <p className="fieldHint">
            <CheckCircle2 size={14} /> Narracion lista. Los archivos quedan en storage/generated-audio.
          </p>
        ) : null}
      </section>

      {generation ? (
        <VoiceStudioResult
          generation={generation}
          apiUrl={apiUrl}
          onOpenFolder={onOpenFolder}
          folderBusy={folderBusy}
        />
      ) : null}
    </main>
  );
}

/** Lee `savedIn` de la respuesta de /voice/open-folder sin confiar en su forma. */
function readSavedIn(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "savedIn" in payload) {
    const value = (payload as { savedIn?: unknown }).savedIn;
    if (typeof value === "string") return value;
  }
  return "";
}

export function EngineStatusCard({
  health,
  engineLabel,
  notice,
  apiUrl
}: {
  health: VoiceHealthView | null;
  engineLabel: string;
  notice: string | null;
  apiUrl: string;
}) {
  const state = health?.ok ? "ok" : health ? "degraded" : "unknown";
  const label =
    state === "ok"
      ? `Motor listo · ${engineLabel}`
      : state === "degraded"
        ? "Motor de voz no disponible"
        : "Comprobando el motor de voz...";
  return (
    <section className="card voiceStudioEngine" data-testid="voice-engine-status">
      <div className="panelTitle">
        <strong>{label}</strong>
        <small>{apiUrl}</small>
      </div>
      {notice ? <p className="fieldHint">{notice}</p> : null}
      {health?.ok ? (
        <ul className="voiceStudioFacts">
          <li>espeak-ng: {health.espeakAvailable ? "disponible" : "no detectado"}</li>
          <li>FFmpeg (MP3): {health.ffmpegAvailable ? "disponible" : "no disponible"}</li>
          <li>Formatos: {health.formats.join(", ")}</li>
        </ul>
      ) : (
        <p className="fieldHint">
          Arranca el motor local con <code>npm run voice:dev</code>. Si nunca se instalo, ejecuta{" "}
          <code>npm run voice:setup</code>.
        </p>
      )}
    </section>
  );
}

export function VoiceStudioError({ message }: { message: string }) {
  return (
    <div className="voiceStudioError" role="alert" data-testid="voice-error">
      <AlertTriangle size={18} />
      <span>{message}</span>
    </div>
  );
}

export function VoiceStudioResult({
  generation,
  apiUrl,
  onOpenFolder,
  folderBusy = false
}: {
  generation: VoiceGenerationView;
  apiUrl: string;
  onOpenFolder?: (folder: string | null) => void;
  folderBusy?: boolean;
}) {
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const rows = resultRows(generation);
  const audioSrc = absoluteMediaUrl(apiUrl, generation.audioUrl);
  const downloadHref = absoluteMediaUrl(apiUrl, generation.downloadUrl);

  function togglePlayback() {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) void player.play();
    else player.pause();
  }

  return (
    <section className="card voiceStudioResult" data-testid="voice-result">
      <div className="panelTitle">
        <strong>Narracion generada</strong>
        <small>{formatClock(generation.createdAt)}</small>
      </div>
      <audio
        ref={playerRef}
        controls
        preload="metadata"
        src={audioSrc}
        data-testid="voice-player"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <dl className="voiceStudioRows">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="buttonRow">
        <button className="secondary" type="button" onClick={togglePlayback} data-testid="voice-play">
          {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pausar" : "Reproducir"}
        </button>
        <a className="primary" href={downloadHref} download={generation.fileName} data-testid="voice-download">
          <Download size={16} /> Descargar
        </a>
        {onOpenFolder ? (
          <button
            className="secondary"
            type="button"
            onClick={() => onOpenFolder(generation.folder)}
            disabled={folderBusy}
            data-testid="voice-open-folder"
            title="Abrir la carpeta donde quedo este archivo"
          >
            {folderBusy ? <Loader2 className="spin" size={16} /> : <FolderOpen size={16} />} Abrir carpeta
          </button>
        ) : null}
        {generation.masterUrl ? (
          <a className="secondary" href={absoluteMediaUrl(apiUrl, generation.masterUrl)} download>
            Descargar WAV maestro ({formatBytes(generation.bytes)})
          </a>
        ) : null}
      </div>
      <p className="fieldHint">
        Guardado localmente en: <code data-testid="voice-saved-in">{savedInLabel(generation)}</code>
      </p>
      <p className="fieldHint">
        Duracion {formatDuration(generation.durationSeconds)} · {generation.chunks} fragmento(s) · {generation.textWords} palabras
        narradas.
      </p>
    </section>
  );
}

export default VoiceStudioClient;
