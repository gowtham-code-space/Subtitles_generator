import { useState, useRef, useEffect } from 'react'

// ── helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds) {
  const d = new Date(0)
  d.setMilliseconds(seconds * 1000)
  return d.toISOString().substr(11, 12).replace('.', ',')
}

function formatTimeDisplay(seconds) {
  if (isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function generateSRT(segments) {
  return segments
    .map((seg, i) => `${i + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text.trim()}\n`)
    .join('\n')
}

const LAYOUT_OPTIONS = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'White text with shadow',
    preview: { color: 'white', textShadow: '0 0 4px #000,0 0 4px #000' },
  },
  {
    id: 'yellow',
    name: 'Yellow',
    description: 'High-visibility yellow',
    preview: { color: '#FFE500', textShadow: '0 0 4px #000' },
  },
  {
    id: 'black_box',
    name: 'Black Box',
    description: 'Cinematic background',
    preview: { color: 'white', background: 'rgba(0,0,0,0.82)', padding: '2px 8px', borderRadius: 3 },
  },
  {
    id: 'bold_red',
    name: 'Bold Red',
    description: 'Punchy emphasis',
    preview: { color: '#FF3333', fontWeight: 800, textShadow: '0 0 3px #fff' },
  },
]

const LANGUAGES = [
  { code: 'en', label: 'English' }, { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' }, { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' }, { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' }, { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' }, { code: 'hi', label: 'Hindi' },
]

// ── UploadStep ────────────────────────────────────────────────────────────────
function UploadStep({ onSubmit }) {
  const [file, setFile] = useState(null)
  const [language, setLanguage] = useState('en')
  const [layout, setLayout] = useState('classic')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const pick = (f) => { if (f && f.type.startsWith('video/')) setFile(f) }

  return (
    <div className="upload-screen">
      <div className="upload-hero">
        <div className="logo-mark">⬡</div>
        <h1 className="brand">SubCraft</h1>
        <p className="tagline">AI-powered subtitle generation &amp; editor</p>
      </div>

      <div className="upload-card">
        <div
          className={`drop-zone ${dragging ? 'drag-over' : ''} ${file ? 'has-file' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files[0]) }}
          onClick={() => inputRef.current.click()}
        >
          <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }}
            onChange={(e) => pick(e.target.files[0])} />
          {file ? (
            <div className="file-chosen">
              <span className="file-icon">🎬</span>
              <div>
                <div className="file-name">{file.name}</div>
                <div className="file-meta">{(file.size / 1e6).toFixed(1)} MB</div>
              </div>
              <button className="clear-file" onClick={(e) => { e.stopPropagation(); setFile(null) }}>✕</button>
            </div>
          ) : (
            <>
              <div className="drop-icon">↑</div>
              <div className="drop-title">Drop your video here</div>
              <div className="drop-sub">or click to browse · MP4, MOV, MKV…</div>
            </>
          )}
        </div>

        <div className="options-row">
          <div className="opt-group">
            <label>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>
        </div>

        <div className="layout-section">
          <label className="section-label">Subtitle Style</label>
          <div className="layout-grid">
            {LAYOUT_OPTIONS.map((opt) => (
              <div key={opt.id} className={`layout-tile ${layout === opt.id ? 'active' : ''}`}
                onClick={() => setLayout(opt.id)}>
                <div className="layout-preview">
                  <span style={opt.preview}>Abc</span>
                </div>
                <div className="layout-tile-name">{opt.name}</div>
                <div className="layout-tile-desc">{opt.description}</div>
                {layout === opt.id && <div className="layout-check">✓</div>}
              </div>
            ))}
          </div>
        </div>

        <button className="cta-btn" disabled={!file}
          onClick={() => onSubmit({ file, language, layout })}>
          <span>Generate Subtitles</span>
          <span className="btn-arrow">→</span>
        </button>
      </div>
    </div>
  )
}

// ── TranscriptItem ────────────────────────────────────────────────────────────
function TranscriptItem({ seg, index, isCurrent, onSelect, onChange }) {
  const ref = useRef()

  useEffect(() => {
    if (isCurrent && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isCurrent])

  return (
    <div
      ref={ref}
      className={`transcript-item ${isCurrent ? 'current' : ''}`}
      onClick={() => onSelect(seg.start)}
    >
      <div className="t-meta">
        <span className="t-index">#{index + 1}</span>
        <span className="t-time">{formatTimeDisplay(seg.start)} → {formatTimeDisplay(seg.end)}</span>
      </div>
      <textarea
        className="t-text"
        value={seg.text}
        rows={2}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(index, e.target.value)}
      />
    </div>
  )
}

// ── EditorScreen ──────────────────────────────────────────────────────────────
function EditorScreen({ file, language, layout: initialLayout, onReset }) {
  const [segments, setSegments] = useState([])
  const [layout, setLayout] = useState(initialLayout)
  const [transcribing, setTranscribing] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [resultUrl, setResultUrl] = useState(null)
  const [error, setError] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [dirty, setDirty] = useState(false)
  const videoRef = useRef(null)

  // Set src directly on the DOM node — sidesteps all React state/blob URL timing issues
  // No state, no useMemo, no empty string on first render, no Strict Mode double-invoke problem
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const url = URL.createObjectURL(file)
    el.src = url
    el.load()
    return () => {
      el.src = ''
      URL.revokeObjectURL(url)
    }
  }, [file])

  useEffect(() => {
    transcribeVideo()
  }, [])

  async function transcribeVideo() {
    setTranscribing(true)
    setError(null)
    const form = new FormData()
    form.append('video', file)
    form.append('language', language)
    try {
      const res = await fetch('http://localhost:3000/transcribe-only', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setSegments(data.segments.map((s) => ({ ...s, text: s.text.trim() })))
    } catch (e) {
      setError('Transcription failed: ' + e.message)
    } finally {
      setTranscribing(false)
    }
  }

  const currentSegIndex = segments.findIndex(
    (s) => currentTime >= s.start && currentTime <= s.end
  )

  function seekTo(t) {
    if (videoRef.current) {
      videoRef.current.currentTime = t
      videoRef.current.play()
    }
  }

  function updateSegment(i, text) {
    setSegments((prev) => prev.map((s, idx) => idx === i ? { ...s, text } : s))
    setDirty(true)
    setResultUrl(null)
  }

  async function handleBurnSubtitles() {
    setProcessing(true)
    setError(null)
    const srt = generateSRT(segments)
    const form = new FormData()
    form.append('video', file)
    form.append('language', language)
    form.append('subtitleLayout', layout)
    form.append('srtContent', srt)
    try {
      const res = await fetch('http://localhost:3000/process-video', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setResultUrl(data.url)
      setDirty(false)
    } catch (e) {
      setError('Processing failed: ' + e.message)
    } finally {
      setProcessing(false)
    }
  }

  function downloadSRT() {
    const blob = new Blob([generateSRT(segments)], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'subtitles.srt'
    a.click()
  }

  const currentPreviewStyle = LAYOUT_OPTIONS.find(o => o.id === layout)?.preview

  return (
    <div className="editor-screen">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo-sm">⬡ SubCraft</span>
          <span className="topbar-sep">/</span>
          <span className="topbar-file">{file.name}</span>
          {dirty && <span className="dirty-badge">Unsaved edits</span>}
        </div>
        <div className="topbar-actions">
          <button className="tb-btn" onClick={downloadSRT} disabled={segments.length === 0}>↓ SRT</button>
          <button className="tb-btn tb-save" onClick={handleBurnSubtitles}
            disabled={processing || segments.length === 0}>
            {processing ? <><span className="spinner" /> Rendering…</> : '⚡ Burn & Export'}
          </button>
          <button className="tb-btn tb-reset" onClick={onReset}>✕ New</button>
        </div>
      </header>

      {error && (
        <div className="error-bar">
          {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {resultUrl && (
        <div className="success-bar">
          ✅ Video ready!&nbsp;
          <a href={resultUrl} download="subtitled_video.mp4">Download MP4</a>
          &nbsp;·&nbsp;
          <a href={resultUrl} target="_blank" rel="noreferrer">Preview</a>
          <button onClick={() => setResultUrl(null)}>✕</button>
        </div>
      )}

      <div className="editor-body">
        <aside className="transcript-panel">
          <div className="panel-header">
            <span className="panel-title">Transcript</span>
            <span className="panel-count">{segments.length} segments</span>
          </div>
          {transcribing ? (
            <div className="loading-state">
              <div className="pulse-ring" />
              <div>Transcribing audio…</div>
              <div className="loading-sub">This may take a moment</div>
            </div>
          ) : segments.length === 0 ? (
            <div className="empty-state">No segments found</div>
          ) : (
            <div className="transcript-list">
              {segments.map((seg, i) => (
                <TranscriptItem
                  key={i} seg={seg} index={i}
                  isCurrent={i === currentSegIndex}
                  onSelect={seekTo}
                  onChange={updateSegment}
                />
              ))}
            </div>
          )}
        </aside>

        <main className="video-panel">
          <div className="video-wrap">
            {/* src set imperatively via useEffect — no React state involved */}
            <video
              ref={videoRef}
              className="video-el"
              controls
              onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
            />
            {currentSegIndex >= 0 && segments[currentSegIndex] && (
              <div className="subtitle-overlay">
                <span style={currentPreviewStyle}>
                  {segments[currentSegIndex].text}
                </span>
              </div>
            )}
          </div>

          <div className="style-strip">
            <span className="strip-label">Style</span>
            {LAYOUT_OPTIONS.map((opt) => (
              <button key={opt.id}
                className={`style-chip ${layout === opt.id ? 'active' : ''}`}
                onClick={() => setLayout(opt.id)}>
                <span style={{ ...opt.preview, fontSize: 11 }}>Aa</span>
                <span>{opt.name}</span>
              </button>
            ))}
          </div>

          <div className="meta-strip">
            <span>🌐 {LANGUAGES.find((l) => l.code === language)?.label}</span>
            <span>·</span>
            <span>⏱ {segments.length > 0 ? formatTimeDisplay(segments[segments.length - 1]?.end) : '—'} total</span>
          </div>
        </main>
      </div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState('upload')
  const [jobConfig, setJobConfig] = useState(null)

  function handleUploadSubmit(config) {
    setJobConfig(config)
    setStep('editor')
  }

  if (step === 'editor' && jobConfig) {
    return (
      <>
        <Style />
        <EditorScreen
          file={jobConfig.file}
          language={jobConfig.language}
          layout={jobConfig.layout}
          onReset={() => { setJobConfig(null); setStep('upload') }}
        />
      </>
    )
  }

  return (
    <>
      <Style />
      <UploadStep onSubmit={handleUploadSubmit} />
    </>
  )
}

// ── Injected Styles ───────────────────────────────────────────────────────────
function Style() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');

      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      :root {
        --bg: #0b0c10;
        --surface: #13151b;
        --surface2: #1c1f28;
        --border: rgba(255,255,255,0.07);
        --accent: #5b6bff;
        --accent2: #8b5cf6;
        --green: #22d3a5;
        --text: #e8eaf0;
        --text2: #8a8fa8;
        --text3: #5a5f73;
        --radius: 12px;
        --font-head: 'Syne', sans-serif;
        --font-body: 'DM Sans', sans-serif;
      }

      body { background: var(--bg); color: var(--text); font-family: var(--font-body); min-height: 100vh; }

      /* Upload */
      .upload-screen {
        min-height: 100vh; display: flex; flex-direction: column;
        align-items: center; justify-content: center; padding: 40px 20px;
        background: radial-gradient(ellipse at 30% 20%, rgba(91,107,255,0.12) 0%, transparent 60%),
                    radial-gradient(ellipse at 80% 80%, rgba(139,92,246,0.1) 0%, transparent 50%),
                    var(--bg);
      }
      .upload-hero { text-align: center; margin-bottom: 40px; }
      .logo-mark {
        font-size: 40px; display: block; color: var(--accent);
        filter: drop-shadow(0 0 20px rgba(91,107,255,0.6));
        margin-bottom: 12px; animation: float 3s ease-in-out infinite;
      }
      @keyframes float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      .brand {
        font-family: var(--font-head); font-size: 42px; font-weight: 800; letter-spacing: -1px;
        background: linear-gradient(135deg, #fff 30%, var(--accent));
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      }
      .tagline { color: var(--text2); font-size: 15px; margin-top: 8px; font-weight: 300; }
      .upload-card {
        background: var(--surface); border: 1px solid var(--border); border-radius: 20px;
        padding: 32px; width: 100%; max-width: 560px;
        box-shadow: 0 40px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset;
        display: flex; flex-direction: column; gap: 24px;
      }
      .drop-zone {
        border: 2px dashed rgba(91,107,255,0.35); border-radius: var(--radius);
        padding: 40px 20px; text-align: center; cursor: pointer; transition: all .2s;
        background: rgba(91,107,255,0.03);
        display: flex; flex-direction: column; align-items: center; gap: 10px;
      }
      .drop-zone:hover, .drop-zone.drag-over { border-color: var(--accent); background: rgba(91,107,255,0.08); }
      .drop-zone.has-file { border-style: solid; border-color: var(--green); background: rgba(34,211,165,0.05); }
      .drop-icon { font-size: 36px; color: var(--accent); }
      .drop-title { font-family: var(--font-head); font-size: 16px; font-weight: 600; }
      .drop-sub { font-size: 13px; color: var(--text2); }
      .file-chosen { display: flex; align-items: center; gap: 14px; width: 100%; }
      .file-icon { font-size: 28px; }
      .file-name { font-weight: 600; font-size: 14px; word-break: break-all; text-align: left; }
      .file-meta { font-size: 12px; color: var(--text2); text-align: left; }
      .clear-file {
        margin-left: auto; background: none; border: 1px solid var(--border);
        color: var(--text2); border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;
      }
      .clear-file:hover { border-color: #ff6b6b; color: #ff6b6b; }
      .options-row { display: flex; gap: 16px; }
      .opt-group { display: flex; flex-direction: column; gap: 6px; flex: 1; }
      .opt-group label { font-size: 12px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; }
      .opt-group select {
        background: var(--surface2); border: 1px solid var(--border); color: var(--text);
        border-radius: 8px; padding: 8px 12px; font-size: 14px; font-family: var(--font-body);
        outline: none; cursor: pointer; appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238a8fa8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px;
      }
      .opt-group select:focus { border-color: var(--accent); }
      .section-label { font-size: 12px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .5px; display: block; margin-bottom: 10px; }
      .layout-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .layout-tile {
        background: var(--surface2); border: 2px solid var(--border); border-radius: 10px;
        padding: 12px; cursor: pointer; transition: all .18s; position: relative; overflow: hidden;
      }
      .layout-tile:hover { border-color: rgba(91,107,255,0.4); transform: translateY(-1px); }
      .layout-tile.active { border-color: var(--accent); background: rgba(91,107,255,0.08); }
      .layout-preview {
        background: linear-gradient(135deg, #2a2d3a, #1a1d27); height: 44px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 6px; margin-bottom: 8px; font-size: 15px;
      }
      .layout-tile-name { font-family: var(--font-head); font-size: 13px; font-weight: 600; }
      .layout-tile-desc { font-size: 11px; color: var(--text3); margin-top: 2px; }
      .layout-check {
        position: absolute; top: 8px; right: 8px; width: 18px; height: 18px;
        background: var(--accent); border-radius: 50%;
        display: flex; align-items: center; justify-content: center; font-size: 10px; color: white;
      }
      .cta-btn {
        background: linear-gradient(135deg, var(--accent), var(--accent2));
        color: white; border: none; border-radius: 10px;
        padding: 14px 24px; font-size: 15px; font-weight: 600; font-family: var(--font-head);
        cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
        transition: all .2s; box-shadow: 0 4px 24px rgba(91,107,255,0.35);
      }
      .cta-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(91,107,255,0.5); }
      .cta-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-arrow { font-size: 18px; }

      /* Editor */
      .editor-screen { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: var(--bg); }

      .topbar {
        height: 52px; background: var(--surface); border-bottom: 1px solid var(--border);
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 20px; flex-shrink: 0; z-index: 10;
      }
      .topbar-left { display: flex; align-items: center; gap: 10px; font-size: 14px; }
      .logo-sm { font-family: var(--font-head); font-weight: 800; color: var(--accent); font-size: 16px; }
      .topbar-sep { color: var(--text3); }
      .topbar-file { color: var(--text2); font-size: 13px; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dirty-badge { background: rgba(255,200,50,0.12); color: #ffc832; border-radius: 20px; padding: 2px 10px; font-size: 11px; font-weight: 600; }
      .topbar-actions { display: flex; gap: 8px; align-items: center; }
      .tb-btn {
        background: var(--surface2); border: 1px solid var(--border); color: var(--text);
        border-radius: 8px; padding: 6px 14px; font-size: 13px; font-family: var(--font-body);
        cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all .15s;
      }
      .tb-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
      .tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .tb-save { background: linear-gradient(135deg, var(--accent), var(--accent2)); border-color: transparent; color: white; font-weight: 600; }
      .tb-save:hover:not(:disabled) { opacity: 0.9; color: white !important; border-color: transparent !important; }
      .tb-reset { border-color: rgba(255,100,100,0.2); }
      .tb-reset:hover { border-color: #ff6b6b !important; color: #ff6b6b !important; }
      .spinner {
        display: inline-block; width: 12px; height: 12px;
        border: 2px solid rgba(255,255,255,0.3); border-top-color: white;
        border-radius: 50%; animation: spin .7s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      .error-bar {
        background: rgba(255,70,70,0.12); border-bottom: 1px solid rgba(255,70,70,0.25);
        color: #ff8888; padding: 8px 20px; font-size: 13px;
        display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
      }
      .error-bar button { background: none; border: none; color: #ff8888; cursor: pointer; font-size: 16px; }
      .success-bar {
        background: rgba(34,211,165,0.1); border-bottom: 1px solid rgba(34,211,165,0.2);
        color: var(--green); padding: 8px 20px; font-size: 13px;
        display: flex; align-items: center; gap: 8px; flex-shrink: 0;
      }
      .success-bar a { color: var(--green); font-weight: 600; }
      .success-bar button { background: none; border: none; color: var(--green); cursor: pointer; margin-left: auto; font-size: 16px; }

      .editor-body {
        display: grid; grid-template-columns: 340px 1fr;
        min-height: 0; flex: 1; overflow: hidden;
      }

      /* Transcript */
      .transcript-panel {
        background: var(--surface); border-right: 1px solid var(--border);
        display: flex; flex-direction: column; overflow: hidden; min-height: 0;
      }
      .panel-header {
        padding: 14px 16px; border-bottom: 1px solid var(--border);
        display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
      }
      .panel-title { font-family: var(--font-head); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--text2); }
      .panel-count { font-size: 12px; color: var(--text3); background: var(--surface2); border-radius: 20px; padding: 2px 8px; }
      .transcript-list {
        flex: 1; overflow-y: auto; padding: 8px;
        scrollbar-width: thin; scrollbar-color: var(--border) transparent;
      }
      .transcript-list::-webkit-scrollbar { width: 4px; }
      .transcript-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
      .transcript-item {
        border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px;
        margin-bottom: 6px; cursor: pointer; transition: all .15s; background: transparent;
      }
      .transcript-item:hover { background: var(--surface2); border-color: rgba(91,107,255,0.25); }
      .transcript-item.current {
        background: rgba(91,107,255,0.1); border-color: var(--accent);
        box-shadow: 0 0 0 1px rgba(91,107,255,0.2);
      }
      .t-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
      .t-index { font-size: 10px; color: var(--text3); font-weight: 600; background: var(--surface2); padding: 1px 6px; border-radius: 4px; }
      .t-time { font-size: 11px; color: var(--text2); font-variant-numeric: tabular-nums; }
      .t-text {
        width: 100%; background: transparent; border: none; color: var(--text);
        font-family: var(--font-body); font-size: 13px; line-height: 1.5; resize: none; outline: none; cursor: text;
      }
      .transcript-item.current .t-text { color: white; }
      .t-text:focus { background: rgba(255,255,255,0.03); border-radius: 4px; padding: 2px 4px; margin: -2px -4px; }
      .loading-state {
        flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 16px; color: var(--text2); font-size: 14px;
      }
      .loading-sub { font-size: 12px; color: var(--text3); }
      .pulse-ring {
        width: 44px; height: 44px; border-radius: 50%;
        border: 3px solid rgba(91,107,255,0.15); border-top-color: var(--accent);
        animation: spin 1s linear infinite;
      }
      .empty-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text3); font-size: 14px; }

      /* Video Panel */
      .video-panel {
        display: flex; flex-direction: column;
        background: #0d0e14; overflow: hidden; min-height: 0;
      }
      .video-wrap {
        flex: 1; min-height: 0;
        display: flex; align-items: center; justify-content: center;
        position: relative; overflow: hidden; padding: 24px;
        background: radial-gradient(ellipse at center, #161820 0%, #0b0c10 100%);
      }

      /* ✅ Critical: video fills the available space without overflowing */
      .video-el {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: 8px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.7);
        display: block;
      }

      .subtitle-overlay {
        position: absolute; bottom: 44px; left: 50%; transform: translateX(-50%);
        pointer-events: none; font-size: 18px; line-height: 1.4;
        text-align: center; max-width: 80%;
        font-family: Arial, sans-serif; font-weight: 600; white-space: pre-wrap;
      }

      .style-strip {
        flex-shrink: 0; border-top: 1px solid var(--border); padding: 10px 16px;
        display: flex; align-items: center; gap: 8px; background: var(--surface); overflow-x: auto;
      }
      .strip-label { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text3); letter-spacing: .5px; margin-right: 4px; flex-shrink: 0; }
      .style-chip {
        background: var(--surface2); border: 1px solid var(--border); color: var(--text);
        border-radius: 20px; padding: 5px 14px; font-size: 12px; font-family: var(--font-body);
        cursor: pointer; display: flex; align-items: center; gap: 6px; white-space: nowrap;
        transition: all .15s; flex-shrink: 0;
      }
      .style-chip:hover { border-color: var(--accent); }
      .style-chip.active { background: rgba(91,107,255,0.15); border-color: var(--accent); color: white; }

      .meta-strip {
        flex-shrink: 0; border-top: 1px solid var(--border); padding: 8px 16px;
        display: flex; align-items: center; gap: 12px;
        font-size: 12px; color: var(--text3); background: var(--surface);
      }
    `}</style>
  )
}