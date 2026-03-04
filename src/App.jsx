import React, { useState, useRef } from "react";
import Groq from "groq-sdk";

const SUPPORTED_EXTENSIONS = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"];
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2).padStart(5, "0");
  return h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`
    : `${String(m).padStart(2, "0")}:${s}`;
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [showSegments, setShowSegments] = useState(true);
  const [audioUrl, setAudioUrl] = useState(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);

  // ─── File Validation ──────────────────────────────────────────────────────

  function validateFile(selectedFile) {
    const ext = selectedFile.name.split(".").pop().toLowerCase();

    if (!SUPPORTED_EXTENSIONS.includes(ext)) {
      return `Unsupported format ".${ext}". Supported: ${SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(", ")}`;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      const sizeMB = (selectedFile.size / 1024 / 1024).toFixed(1);
      return `File too large: ${sizeMB} MB. Maximum allowed is ${MAX_FILE_SIZE_MB} MB.`;
    }

    return null;
  }

  // ─── File Selection ───────────────────────────────────────────────────────

  function handleFileChange(e) {
    const selected = e.target.files[0];
    if (!selected) return;
    applyFile(selected);
  }

  function applyFile(selected) {
    setTranscript("");
    setSegments([]);
    setError("");
    setStatus("idle");

    const validationError = validateFile(selected);
    if (validationError) {
      setError(validationError);
      setFile(null);
      setAudioUrl(null);
      return;
    }

    setFile(selected);
    setAudioUrl(URL.createObjectURL(selected));
  }

  // ─── Drag and Drop ────────────────────────────────────────────────────────

  function handleDragOver(e) {
    e.preventDefault();
    dropZoneRef.current?.classList.add("drag-over");
  }

  function handleDragLeave() {
    dropZoneRef.current?.classList.remove("drag-over");
  }

  function handleDrop(e) {
    e.preventDefault();
    dropZoneRef.current?.classList.remove("drag-over");
    const dropped = e.dataTransfer.files[0];
    if (dropped) applyFile(dropped);
  }

  // ─── Transcription ────────────────────────────────────────────────────────

  async function handleTranscribe() {
    if (!file) return;

    const apiKey = import.meta.env.VITE_GROQ_API_KEY;

    if (!apiKey || apiKey === "gsk-your-real-api-key-here") {
      setError("Missing API key. Add VITE_GROQ_API_KEY to your .env file and restart the dev server.");
      return;
    }

    setStatus("loading");
    setError("");
    setTranscript("");
    setSegments([]);

    try {
      const client = new Groq({
        apiKey,
        dangerouslyAllowBrowser: true,
      });

      const response = await client.audio.transcriptions.create({
        file,
        model: "whisper-large-v3-turbo",
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      setTranscript(response.text);
      setSegments(response.segments || []);
      setStatus("success");
    } catch (err) {
      console.error(err);
      const message =
        err?.error?.message ||
        err?.message ||
        "An unknown error occurred. Check the console for details.";
      setError(message);
      setStatus("error");
    }
  }

  // ─── Copy to Clipboard ────────────────────────────────────────────────────

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(transcript);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = transcript;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  function handleDownload() {
    let content = transcript;

    if (showSegments && segments.length > 0) {
      const segmentText = segments
        .map((s) => `[${formatTimestamp(s.start)} → ${formatTimestamp(s.end)}]  ${s.text.trim()}`)
        .join("\n");
      content = `TRANSCRIPT\n${"─".repeat(40)}\n${transcript}\n\nSEGMENTS\n${"─".repeat(40)}\n${segmentText}`;
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${file?.name?.replace(/\.[^.]+$/, "") ?? "transcript"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Reset ────────────────────────────────────────────────────────────────

  function handleReset() {
    setFile(null);
    setTranscript("");
    setSegments([]);
    setStatus("idle");
    setError("");
    setAudioUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app">
      <header className="header">
        <div className="header-icon">🎙</div>
        <h1>Audio Transcribe</h1>
        <p className="subtitle">Free transcription powered by Groq + Whisper</p>
      </header>

      <main className="main">

        {/* ── Drop Zone ── */}
        <div
          ref={dropZoneRef}
          className={`drop-zone ${file ? "has-file" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !file && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(",")}
            onChange={handleFileChange}
            className="file-input"
          />

          {file ? (
            <div className="file-info">
              <span className="file-icon">🎵</span>
              <div className="file-details">
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatFileSize(file.size)}</span>
              </div>
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); handleReset(); }}
                title="Remove file"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="drop-prompt">
              <span className="drop-icon">📂</span>
              <p><strong>Drop your audio file here</strong></p>
              <p className="drop-hint">or click to browse</p>
              <p className="drop-formats">
                {SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(" · ")} · max {MAX_FILE_SIZE_MB} MB
              </p>
            </div>
          )}
        </div>

        {/* ── Audio Preview ── */}
        {audioUrl && (
          <div className="audio-preview">
            <audio controls src={audioUrl} key={audioUrl} />
          </div>
        )}

        {/* ── Error Banner ── */}
        {error && (
          <div className="error-banner">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Transcribe Button ── */}
        <button
          className="btn-primary"
          onClick={handleTranscribe}
          disabled={!file || status === "loading"}
        >
          {status === "loading" ? (
            <>
              <span className="spinner" />
              Transcribing…
            </>
          ) : (
            "Transcribe"
          )}
        </button>

        {/* ── Results ── */}
        {status === "success" && (
          <div className="results">

            <div className="result-section">
              <div className="result-header">
                <h2>Transcript</h2>
                <div className="result-actions">
                  <button className="btn-secondary" onClick={handleCopy}>Copy</button>
                  <button className="btn-secondary" onClick={handleDownload}>Download .txt</button>
                </div>
              </div>
              <div className="transcript-box">
                <p>{transcript}</p>
              </div>
            </div>

            {segments.length > 0 && (
              <div className="result-section">
                <div className="result-header">
                  <h2>Segments</h2>
                  <button
                    className="btn-secondary"
                    onClick={() => setShowSegments((v) => !v)}
                  >
                    {showSegments ? "Hide" : "Show"}
                  </button>
                </div>

                {showSegments && (
                  <div className="segments-box">
                    {segments.map((seg, i) => (
                      <div key={i} className="segment-row">
                        <span className="segment-time">
                          {formatTimestamp(seg.start)} → {formatTimestamp(seg.end)}
                        </span>
                        <span className="segment-text">{seg.text.trim()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}
      </main>

      <footer className="footer">
        <p>
          ⚡ Powered by <strong>Groq</strong> · Free tier: 7,200 seconds of audio per day
        </p>
      </footer>
    </div>
  );
}