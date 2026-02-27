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
app.use('/output', express.static(path.join(__dirname, 'output')));

const outputBaseDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputBaseDir)) {
    fs.mkdirSync(outputBaseDir, { recursive: true });
}

const upload = multer({ dest: path.join(__dirname, 'temp_uploads') });

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function formatTime(seconds) {
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    return date.toISOString().substr(11, 12).replace('.', ',');
}

function generateSRT(segments) {
    return segments.map((segment, index) => {
        const start = formatTime(segment.start);
        const end = formatTime(segment.end);
        return `${index + 1}\n${start} --> ${end}\n${segment.text.trim()}\n`;
    }).join('\n');
}

function makeOutputDir() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    const folderName = istTime.toISOString()
        .replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const dir = path.join(__dirname, 'output', folderName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return { dir, folderName };
}

// On Windows, fluent-ffmpeg can't always find ffprobe automatically — set it explicitly
import { execSync } from 'child_process';

function findFfprobePath() {
    try {
        // Try to find ffprobe in PATH
        const result = execSync('where ffprobe', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim().split('\n')[0].trim();
        return result || null;
    } catch {
        return null;
    }
}

const ffprobePath = findFfprobePath();
if (ffprobePath) {
    ffmpeg.setFfprobePath(ffprobePath);
    console.log('ffprobe path set to:', ffprobePath);
} else {
    console.warn('ffprobe not found in PATH — audio stream detection disabled, extraction will still be attempted');
}

// Probe whether the file actually has an audio stream
async function hasAudioStream(inputPath) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
                console.warn('ffprobe error (non-fatal, will attempt extraction anyway):', err.message);
                resolve(true); // assume audio exists if probe fails — let FFmpeg decide
                return;
            }
            const found = metadata.streams?.some(s => s.codec_type === 'audio');
            console.log(`ffprobe: audio stream ${found ? 'FOUND' : 'NOT FOUND'} in`, path.basename(inputPath));
            resolve(!!found);
        });
    });
}

// Extract audio — probes first, surfaces clear errors
async function extractAudio(inputPath, audioPath) {
    const audioFound = await hasAudioStream(inputPath);
    if (!audioFound) {
        throw new Error('This video has no audio track — nothing to transcribe.');
    }

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .output(audioPath)
            .noVideo()
            .audioCodec('libmp3lame')
            .audioFrequency(16000)   // Whisper works best at 16kHz
            .audioChannels(1)        // Mono: smaller file, faster upload to Groq
            .outputOptions(['-q:a 4'])
            .on('start', (cmd) => console.log('FFmpeg extract cmd:', cmd))
            .on('end', () => { console.log('Audio extracted:', audioPath); resolve(); })
            .on('error', (err, _stdout, stderr) => {
                console.error('FFmpeg extract failed:', err.message);
                console.error('FFmpeg stderr:', stderr);
                let hint = '';
                if (stderr?.includes('Invalid data'))  hint = ' [corrupted or incomplete file]';
                if (stderr?.includes('No such file'))  hint = ' [file not found — upload may have failed]';
                if (stderr?.includes('codec'))         hint = ' [unsupported audio codec]';
                reject(new Error('FFmpeg audio extraction failed' + hint + ': ' + err.message));
            })
            .run();
    });
}

// Safe delete — never throws
function safeUnlink(filePath) {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (e) {
        console.warn('Could not delete file:', filePath, e.message);
    }
}

// ── /transcribe-only ──────────────────────────────────────────────────────────
app.post('/transcribe-only', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).send('No video file uploaded.');

    const { dir } = makeOutputDir();
    const inputPath = path.join(dir, req.file.originalname);
    fs.renameSync(req.file.path, inputPath);

    const audioPath = path.join(dir, 'audio.mp3');
    const language = req.body.language || 'en';

    try {
        await extractAudio(inputPath, audioPath);

        if (!fs.existsSync(audioPath)) {
            throw new Error('Audio file was not created — FFmpeg may have exited silently.');
        }

        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: 'whisper-large-v3',
            language,
            response_format: 'verbose_json',
        });

        safeUnlink(audioPath);
        res.json({ segments: transcription.segments });

    } catch (err) {
        console.error('Transcribe error:', err.message);
        safeUnlink(audioPath);
        res.status(500).send('Error transcribing: ' + err.message);
    }
});

// ── /process-video ────────────────────────────────────────────────────────────
app.post('/process-video', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).send('No video file uploaded.');

    const originalName = req.file.originalname;
    const { dir: videoOutputDir, folderName } = makeOutputDir();

    const inputPath = path.join(videoOutputDir, originalName);
    fs.renameSync(req.file.path, inputPath);

    const audioPath = path.join(videoOutputDir, 'audio.mp3');
    const srtPath = path.join(videoOutputDir, 'subtitles.srt');
    const outputPath = path.join(videoOutputDir, 'processed_video.mp4');
    const detailsPath = path.join(videoOutputDir, 'details.json');

    const language = req.body.language || 'en';
    const subtitleLayout = req.body.subtitleLayout || 'classic';
    const providedSRT = req.body.srtContent || null;

    const videoDetails = {
        originalName, uploadTime: new Date().toISOString(),
        language, layout: subtitleLayout, status: 'processing'
    };
    fs.writeFileSync(detailsPath, JSON.stringify(videoDetails, null, 2));

    console.log(`Processing ${originalName} | lang:${language} | layout:${subtitleLayout} | customSRT:${!!providedSRT}`);

    try {
        let srtContent;

        if (providedSRT) {
            srtContent = providedSRT;
        } else {
            await extractAudio(inputPath, audioPath);

            if (!fs.existsSync(audioPath)) {
                throw new Error('Audio file was not created — FFmpeg may have exited silently.');
            }

            const transcription = await groq.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: 'whisper-large-v3',
                language,
                response_format: 'verbose_json',
            });
            console.log('Transcription complete.');

            safeUnlink(audioPath);
            srtContent = generateSRT(transcription.segments);
        }

        fs.writeFileSync(srtPath, srtContent);
        console.log('SRT written.');

        const styles = {
            classic:   'Fontname=Arial,PrimaryColour=&H00FFFFFF,BorderStyle=1,Outline=1,Shadow=1,MarginV=20,Alignment=2',
            yellow:    'Fontname=Arial,PrimaryColour=&H0000FFFF,BorderStyle=1,Outline=1,Shadow=1,MarginV=20,Alignment=2',
            black_box: 'Fontname=Arial,PrimaryColour=&H00FFFFFF,BorderStyle=3,BackColour=&H00000000,Outline=2,Shadow=0,MarginV=20,Alignment=2',
            bold_red:  'Fontname=Arial,Bold=1,PrimaryColour=&H000000FF,BorderStyle=1,Outline=1,Shadow=1,MarginV=20,Alignment=2',
        };

        const forceStyle = styles[subtitleLayout] || styles.classic;
        const relativeSrtPath = path.relative(process.cwd(), srtPath).replace(/\\/g, '/');

        await new Promise((resolve, reject) => {
            const subtitleFilter = `subtitles='${relativeSrtPath}':force_style='${forceStyle}'`;
            ffmpeg(inputPath)
                .videoFilters(subtitleFilter)
                .output(outputPath)
                .outputOptions(['-c:v libx264', '-preset ultrafast', '-pix_fmt yuv420p', '-c:a aac'])
                .on('start', (cmd) => console.log('FFmpeg burn cmd:', cmd))
                .on('end', () => {
                    videoDetails.status = 'completed';
                    videoDetails.processedPath = outputPath;
                    fs.writeFileSync(detailsPath, JSON.stringify(videoDetails, null, 2));
                    resolve();
                })
                .on('error', (err, _stdout, stderr) => {
                    console.error('FFmpeg burn error:', err.message);
                    console.error('FFmpeg stderr:', stderr);
                    reject(new Error('FFmpeg burn failed: ' + err.message));
                })
                .run();
        });

        console.log('Video processed.');
        res.json({ url: `http://localhost:${port}/output/${folderName}/processed_video.mp4` });

    } catch (error) {
        console.error('Error processing:', error.message);
        safeUnlink(audioPath);
        res.status(500).send('Error processing video: ' + error.message);
    }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));