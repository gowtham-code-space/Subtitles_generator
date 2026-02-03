import { useState } from 'react'
import './App.css'

function App() {
  const [file, setFile] = useState(null)
  const [language, setLanguage] = useState('en')
  const [processing, setProcessing] = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError] = useState(null)

  const handleFileChange = (e) => {
    if (e.target.files) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return

    setProcessing(true)
    setError(null)
    setVideoUrl(null)

    const formData = new FormData()
    formData.append('video', file)
    formData.append('language', language)

    try {
      const response = await fetch('http://localhost:3000/process-video', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(errText || 'Failed to process video')
      }

      const data = await response.json()
      setVideoUrl(data.url)
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="container">
      <h1>AI Subtitle Generator</h1>
      <p>Upload a video, choose the language, and get auto-generated subtitles.</p>

      <form onSubmit={handleSubmit} className="upload-form">
        <div className="form-group">
          <label htmlFor="language">Video Language:</label>
          <select 
            id="language" 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="nl">Dutch</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
            <option value="hi">Hindi</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="video">Select Video:</label>
          <input 
            type="file" 
            id="video" 
            accept="video/*" 
            onChange={handleFileChange} 
            required
          />
        </div>

        <button type="submit" disabled={!file || processing}>
          {processing ? 'Processing...' : 'Generate Subtitles'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {videoUrl && (
        <div className="result">
          <h2>Result</h2>
          <video controls src={videoUrl} width="100%"></video>
          <div className="actions">
            <a href={videoUrl} download="subtitled_video.mp4" className="download-btn">
              Download Video
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
