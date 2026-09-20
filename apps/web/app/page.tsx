"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clapperboard,
  Download,
  FileVideo,
  FolderKanban,
  Gauge,
  Image as ImageIcon,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Upload
} from "lucide-react";
import type { AssetType } from "@fullpos-ad-studio/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Project = {
  id: string;
  name: string;
  productName: string;
  headline: string;
  offer: string;
  price: string;
  website: string;
  createdAt: string;
  assets: Array<{ id: string; type: string; path: string }>;
  renderJobs: RenderJob[];
};

type RenderJob = {
  id: string;
  status: "QUEUED" | "RENDERING" | "COMPLETED" | "FAILED";
  progress: number;
  outputPath?: string;
  errorMessage?: string;
};

type Draft = {
  name: string;
  productName: string;
  headline: string;
  subheadline: string;
  offer: string;
  price: string;
  website: string;
  format: "9:16" | "16:9" | "1:1";
  template: "fullpos-premium-vertical";
};

const defaultDraft: Draft = {
  name: "Campaña FullPOS Cloud",
  productName: "FullPOS Cloud",
  headline: "Tu negocio bajo control",
  subheadline: "Facturación, inventario y reportes en una sola plataforma.",
  offer: "7 días gratis",
  price: "Desde RD$1,000/mes",
  website: "fullposcloud.fulltechrd.com",
  format: "9:16",
  template: "fullpos-premium-vertical"
};

const uploadFields: Array<{ type: AssetType; label: string }> = [
  { type: "logo", label: "Logo" },
  { type: "billing", label: "Facturación" },
  { type: "products", label: "Productos / inventario" },
  { type: "reports", label: "Reportes" },
  { type: "mobile", label: "Móvil" },
  { type: "additional", label: "Imagen adicional" }
];

const nav = [
  ["Dashboard", Gauge],
  ["Crear anuncio", Clapperboard],
  ["Proyectos", FolderKanban],
  ["Videos", FileVideo],
  ["Configuración", Settings]
] as const;

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [assetNames, setAssetNames] = useState<Record<string, string>>({});
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [message, setMessage] = useState("Listo para crear un anuncio vertical.");

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (!renderJob || !["QUEUED", "RENDERING"].includes(renderJob.status)) return;
    const timer = window.setInterval(async () => {
      const next = await fetchJson<RenderJob>(`${API_URL}/renders/${renderJob.id}`);
      setRenderJob(next);
      if (next.status === "COMPLETED") {
        setMessage("Video generado correctamente.");
        await loadProjects();
      }
      if (next.status === "FAILED") {
        setMessage(next.errorMessage ?? "El render falló.");
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

  async function loadProjects() {
    try {
      setProjects(await fetchJson<Project[]>(`${API_URL}/projects`));
    } catch {
      setProjects([]);
    }
  }

  async function ensureProject() {
    if (projectId) return projectId;
    const project = await fetchJson<Project>(`${API_URL}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    setProjectId(project.id);
    await loadProjects();
    return project.id;
  }

  async function onUpload(type: AssetType, file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("Usa PNG, JPG, JPEG o WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage("El archivo supera 10MB.");
      return;
    }
    const id = await ensureProject();
    const form = new FormData();
    form.append("file", file);
    await fetchJson(`${API_URL}/projects/${id}/assets?type=${type}`, {
      method: "POST",
      body: form
    });
    setPreviews((current) => ({ ...current, [type]: URL.createObjectURL(file) }));
    setAssetNames((current) => ({ ...current, [type]: file.name }));
    setMessage(`${file.name} cargado.`);
  }

  async function generateVideo() {
    const id = await ensureProject();
    setMessage("Preparando recursos.");
    const job = await fetchJson<RenderJob>(`${API_URL}/projects/${id}/render`, { method: "POST" });
    setRenderJob(job);
    setMessage(renderStage(job));
  }

  const downloadUrl = renderJob?.status === "COMPLETED" ? `${API_URL}/renders/${renderJob.id}/file` : "";
  const progressLabel = renderJob ? renderStage(renderJob) : "Sin render activo";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">FP</div>
          <div>
            <strong>FullPOS Ad Studio</strong>
            <div className="muted">Video ads SaaS</div>
          </div>
        </div>
        <nav className="nav">
          {nav.map(([label, Icon], index) => (
            <button key={label} className={`navItem ${index < 2 ? "active" : ""}`} type="button">
              <Icon size={18} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <section className="topbar">
          <div className="title">
            <h1>Dashboard</h1>
            <p>Genera anuncios verticales profesionales sin abrir un editor de video.</p>
          </div>
          <button className="primary" type="button" onClick={() => setStep(1)}>
            <Plus size={18} />
            Crear nuevo anuncio
          </button>
        </section>

        <section className="grid stats">
          <Stat label="Proyectos recientes" value={stats.projects} />
          <Stat label="Videos generados" value={stats.completed} />
          <Stat label="Renderizando" value={stats.rendering} />
        </section>

        <section className="workspace">
          <div className="card">
            <div className="steps">
              {["Información", "Recursos", "Formato", "Plantilla", "Generar"].map((label, index) => (
                <button key={label} type="button" className={`step ${step === index + 1 ? "active" : ""}`} onClick={() => setStep(index + 1)}>
                  {index + 1}. {label}
                </button>
              ))}
            </div>

            {step === 1 && (
              <div className="formGrid">
                <Field label="Nombre del proyecto" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
                <Field label="Producto" value={draft.productName} onChange={(value) => setDraft({ ...draft, productName: value })} />
                <Field label="Headline" value={draft.headline} onChange={(value) => setDraft({ ...draft, headline: value })} />
                <Field label="Texto secundario" value={draft.subheadline} onChange={(value) => setDraft({ ...draft, subheadline: value })} />
                <Field label="Oferta" value={draft.offer} onChange={(value) => setDraft({ ...draft, offer: value })} />
                <Field label="Precio" value={draft.price} onChange={(value) => setDraft({ ...draft, price: value })} />
                <Field label="Website" value={draft.website} onChange={(value) => setDraft({ ...draft, website: value })} full />
              </div>
            )}

            {step === 2 && (
              <div className="uploadGrid">
                {uploadFields.map((field) => (
                  <label className="uploadBox" key={field.type}>
                    <strong>{field.label}</strong>
                    <p className="muted">PNG, JPG, JPEG, WEBP</p>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void onUpload(field.type, event.target.files?.[0])} />
                    {previews[field.type] ? <img src={previews[field.type]} alt="" /> : null}
                  </label>
                ))}
              </div>
            )}

            {step === 3 && (
              <div className="formatOptions">
                {[
                  ["9:16", "1080x1920", "Reels / Stories / TikTok"],
                  ["16:9", "1920x1080", "YouTube / web"],
                  ["1:1", "1080x1080", "Feed"]
                ].map(([format, size, use]) => (
                  <button key={format} type="button" className={`option ${draft.format === format ? "selected" : ""}`} onClick={() => setDraft({ ...draft, format: format as Draft["format"] })}>
                    <strong>{format}</strong>
                    <p>{size}</p>
                    <span className="muted">{use}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 4 && (
              <button className="option selected" type="button">
                <strong>FullPOS Premium Vertical</strong>
                <p className="muted">25 segundos, 30 FPS, formato 9:16.</p>
              </button>
            )}

            {step === 5 && (
              <div className="grid">
                <ProjectPreview draft={draft} previews={previews} assetNames={assetNames} />
                <button className="primary" type="button" onClick={() => void generateVideo()} disabled={renderJob?.status === "QUEUED" || renderJob?.status === "RENDERING"}>
                  <Play size={18} />
                  Generar video
                </button>
                {downloadUrl ? (
                  <a className="secondary" href={downloadUrl}>
                    <Download size={18} />
                    Descargar MP4
                  </a>
                ) : null}
                {renderJob ? (
                  <button className="secondary" type="button" onClick={() => void generateVideo()}>
                    <RefreshCcw size={18} />
                    Generar otra vez
                  </button>
                ) : null}
              </div>
            )}

            <div className="actions">
              <button className="secondary" type="button" disabled={step === 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>
                Atrás
              </button>
              <button className="primary" type="button" disabled={step === 5} onClick={() => setStep((value) => Math.min(5, value + 1))}>
                Siguiente
              </button>
            </div>
          </div>

          <aside className="card">
            <div className="previewFrame">
              {downloadUrl ? <video controls src={downloadUrl} /> : <Upload size={42} color="#1457d9" />}
            </div>
            <div className="status">
              <strong>{renderJob ? progressLabel : message}</strong>
              <span>{renderJob ? `${renderJob.status} · ${renderJob.progress}%` : "Sin render activo"}</span>
              <div className="progress"><span style={{ width: `${renderJob?.progress ?? 0}%` }} /></div>
              {downloadUrl ? <a className="secondary" href={downloadUrl}>Descargar MP4</a> : null}
            </div>
          </aside>
        </section>

        <section className="card projectList">
          <strong>Proyectos recientes</strong>
          {projects.length === 0 ? <p className="muted">Aún no hay proyectos.</p> : null}
          {projects.slice(0, 5).map((project) => (
            <div className="projectRow" key={project.id}>
              <div>
                <strong>{project.name}</strong>
                <div className="muted">{project.productName} · {new Date(project.createdAt).toLocaleDateString("es-DO")}</div>
              </div>
              <span className="muted">{project.renderJobs?.[0]?.status ?? "Sin render"}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

function ProjectPreview({ draft, previews, assetNames }: { draft: Draft; previews: Record<string, string>; assetNames: Record<string, string> }) {
  return (
    <div className="review">
      <div>
        <strong>Preview del proyecto</strong>
        <p className="muted">Textos, formato, plantilla y recursos antes de renderizar.</p>
      </div>
      <div className="reviewGrid">
        <span><strong>Proyecto</strong>{draft.name}</span>
        <span><strong>Producto</strong>{draft.productName}</span>
        <span><strong>Formato</strong>{draft.format}</span>
        <span><strong>Plantilla</strong>FullPOS Premium Vertical</span>
        <span><strong>Oferta</strong>{draft.offer}</span>
        <span><strong>Precio</strong>{draft.price}</span>
      </div>
      <div className="assetStrip">
        {uploadFields.slice(0, 5).map((field) => (
          <div className="assetThumb" key={field.type}>
            {previews[field.type] ? <img src={previews[field.type]} alt="" /> : <ImageIcon size={22} />}
            <span>{field.label}</span>
            <small>{assetNames[field.type] ?? "Pendiente"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="statValue">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, full = false }: { label: string; value: string; onChange: (value: string) => void; full?: boolean }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }
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
