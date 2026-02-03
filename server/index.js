import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Groq from 'groq-sdk';
import ffmpeg from 'fluent-ffmpeg';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const require = createRequire(import.meta.url);

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const upload = multer({ dest: path.join(__dirname, 'uploads') });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function formatTime(seconds) {
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    const timeStr = date.toISOString().substr(11, 12).replace('.', ',');
    return timeStr;
}

function generateSRT(segments) {
    return segments.map((segment, index) => {
        const start = formatTime(segment.start);
        const end = formatTime(segment.end);
        return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}\n`;
    }).join('\n');
}

app.post('/process-video', upload.single('video'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No video file uploaded.');
    }

    const inputPath = req.file.path;
    // Keep original extension or just use .mp4 for output
    const originalName = req.file.originalname;
    const baseName = path.parse(originalName).name;
    const audioPath = path.join(__dirname, 'uploads', `${req.file.filename}.mp3`);
    const srtPath = path.join(__dirname, 'uploads', `${req.file.filename}.srt`);
    const outputPath = path.join(__dirname, 'uploads', `processed_${req.file.filename}.mp4`);
    
    // User desired language
    const language = req.body.language || 'en';

    console.log(`Processing ${originalName} in language ${language}...`);

    try {
        // 1. Extract Audio
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .output(audioPath)
                .noVideo()
                .audioCodec('libmp3lame')
                .on('end', resolve)
                .on('error', reject)
                .run();
        });

        console.log('Audio extracted.');

        // 2. Transcribe with Groq
        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-large-v3",
            language: language,
            response_format: "verbose_json",
        });

        console.log('Transcription complete.');

        // 3. Generate SRT
        const srtContent = generateSRT(transcription.segments);
        fs.writeFileSync(srtPath, srtContent);

        console.log('SRT generated.');

        // 4. Burn Subtitles
        // Windows path handling for subtitles filter is tricky.
        // The path must be escaped properly. 
        // A common workaround is to change the working directory or use relative paths carefully.
        // But ffmpeg-fluent handles simple strings reasonably well, except backslashes on windows in filter strings.
        // We will try to convert backslashes to forward slashes.
        const srtPathForwardSlashes = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .videoFilters(`subtitles='${srtPathForwardSlashes}'`)
                .output(outputPath)
                .on('end', resolve)
                .on('error', (err) => {
                    console.error('FFmpeg burn error:', err);
                    reject(err);
                })
                .run();
        });

        console.log('Video processed.');

        // Construct public URL
        const fileUrl = `http://localhost:${port}/uploads/processed_${req.file.filename}.mp4`;
        
        // Clean up temp files (optional, leaving them for debugging for now)
        // fs.unlinkSync(inputPath);
        // fs.unlinkSync(audioPath);
        // fs.unlinkSync(srtPath);

        res.json({ url: fileUrl });

    } catch (error) {
        console.error('Error processing:', error);
        res.status(500).send('Error processing video: ' + error.message);
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
