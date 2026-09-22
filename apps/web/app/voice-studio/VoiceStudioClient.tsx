"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Mic, Play, RefreshCcw, Star, Volume2 } from "lucide-react";
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
  absoluteMediaUrl,
  buildGeneratePayload,
  buildPreviewPayload,
  clampPause,
  clampSpeed,
  countText,
  describeApiError,
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
  speedLabel,
  voiceLabel,
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

export function VoiceStudioClient({ apiUrl = DEFAULT_API_URL }: VoiceStudioClientProps) {
  // El token del estudio vive en un ref: asi la primera peticion ya lo lleva (el
  // estado se actualiza despues del primer render y llegaria tarde).
  const tokenRef = useRef("");
  const [phase, setPhase] = useState<VoiceStudioPhase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<VoiceHealthView | null>(null);
  const [voices, setVoices] = useState<VoiceOptionView[]>([]);
  const [engineLabel, setEngineLabel] = useState("Kokoro");
  const [settings, setSettings] = useState<VoiceStudioSettings>(DEFAULT_SETTINGS);
  const [script, setScript] = useState("");
  const [generation, setGeneration] = useState<VoiceGenerationView | null>(null);
  const [preview, setPreview] = useState<VoiceGenerationView | null>(null);
  const [savedVoiceId, setSavedVoiceId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counter = useMemo(() => countText(script), [script]);
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
      setEngineLabel(parsed.label);
      setSettings((current) => ({
        ...current,
        voiceId: resolveVoiceSelection(parsed.voices, current.voiceId || remembered || parsed.defaultVoiceId)
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
      remembered = stored?.voiceId ?? null;
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
        body: JSON.stringify(buildPreviewPayload(settings))
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
        body: JSON.stringify(buildGeneratePayload(script, settings))
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

  async function onSaveAsFullposVoice() {
    const voice = voices.find((item) => item.id === settings.voiceId);
    const preference = { voiceId: settings.voiceId, voiceName: voice?.name ?? null, defaultSpeed: settings.speed, defaultPauseMs: settings.pauseMs };
    try {
      await apiFetch("/voice/voice-preference", { method: "PUT", body: JSON.stringify(preference) });
      setSavedVoiceId(settings.voiceId);
      setNotice(`"Voz FullPOS" guardada: ${voice?.name ?? settings.voiceId}.`);
      try {
        window.localStorage.setItem(FULLPOS_VOICE_STORAGE_KEY, rememberFullposVoice(settings.voiceId, voice?.name ?? null));
      } catch {
        // La copia local es opcional.
      }
    } catch (saveError) {
      // Sin base de datos: al menos queda guardada en este navegador.
      setSavedVoiceId(settings.voiceId);
      try {
        window.localStorage.setItem(FULLPOS_VOICE_STORAGE_KEY, rememberFullposVoice(settings.voiceId, voice?.name ?? null));
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

      <EngineStatusCard health={health} engineLabel={engineLabel} notice={notice} apiUrl={apiUrl} />

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
            value={settings.voiceId}
            onChange={(event) => setSettings((current) => ({ ...current, voiceId: event.target.value }))}
            disabled={!voices.length}
            data-testid="voice-select"
          >
            {voices.length === 0 ? <option value="">Cargando voces...</option> : null}
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voiceLabel(voice)}
              </option>
            ))}
          </select>
        </label>

        <div className="buttonRow">
          <button
            className="secondary"
            type="button"
            onClick={() => void onPreview()}
            disabled={!isPreviewEnabled({ settings, phase, engineReady })}
          >
            {phase === "previewing" ? <Loader2 className="spin" size={16} /> : <Play size={16} />} Probar voz
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void onSaveAsFullposVoice()}
            disabled={!settings.voiceId || savedVoiceId === settings.voiceId}
          >
            <Star size={16} /> {savedVoiceId === settings.voiceId ? "Voz FullPOS actual" : "Establecer como voz FullPOS"}
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
            disabled={!isGenerateEnabled({ text: script, settings, phase, engineReady })}
            data-testid="voice-generate"
          >
            {phase === "generating" ? <Loader2 className="spin" size={18} /> : <Volume2 size={18} />} Generar narracion
          </button>
          <button className="secondary" type="button" onClick={() => void loadHealth()} disabled={phase === "generating"}>
            <RefreshCcw size={16} /> Revisar motor
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

      {generation ? <VoiceStudioResult generation={generation} apiUrl={apiUrl} /> : null}
    </main>
  );
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

export function VoiceStudioResult({ generation, apiUrl }: { generation: VoiceGenerationView; apiUrl: string }) {
  const rows = resultRows(generation);
  const audioSrc = absoluteMediaUrl(apiUrl, generation.audioUrl);
  const downloadHref = absoluteMediaUrl(apiUrl, generation.downloadUrl);
  return (
    <section className="card voiceStudioResult" data-testid="voice-result">
      <div className="panelTitle">
        <strong>Narracion generada</strong>
        <small>{formatClock(generation.createdAt)}</small>
      </div>
      <audio controls src={audioSrc} data-testid="voice-player" />
      <dl className="voiceStudioRows">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="buttonRow">
        <a className="primary" href={downloadHref} download={generation.fileName} data-testid="voice-download">
          <Download size={16} /> Descargar {generation.fileName}
        </a>
        {generation.masterUrl ? (
          <a className="secondary" href={absoluteMediaUrl(apiUrl, generation.masterUrl)} download>
            Descargar WAV maestro ({formatBytes(generation.bytes)})
          </a>
        ) : null}
      </div>
      <p className="fieldHint">
        Duracion {formatDuration(generation.durationSeconds)} · {generation.chunks} fragmento(s) · {generation.textWords} palabras
        narradas.
      </p>
    </section>
  );
}

export default VoiceStudioClient;
