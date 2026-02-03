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

// Ensure output directory exists and use it as base
const outputBaseDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputBaseDir)) {
    fs.mkdirSync(outputBaseDir, { recursive: true });
}

// Multer will upload to a temporary temp folder first, then we move it
const upload = multer({ dest: path.join(__dirname, 'temp_uploads') });

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

    const originalName = req.file.originalname;
    const baseName = path.parse(originalName).name;
    
    // Create specific folder for this video using IST timestamp
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC + 5:30
    const istTime = new Date(now.getTime() + istOffset);
    const folderName = istTime.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-').slice(0, -1);
    
    const videoOutputDir = path.join(__dirname, 'output', folderName);
    
    if (!fs.existsSync(videoOutputDir)){
        fs.mkdirSync(videoOutputDir, { recursive: true });
    }

    const inputPath = path.join(videoOutputDir, originalName);
    
    // Move the uploaded file from temp to specific folder
    fs.renameSync(req.file.path, inputPath);

    const audioPath = path.join(videoOutputDir, 'audio.mp3');
    const srtPath = path.join(videoOutputDir, 'subtitles.srt');
    const outputPath = path.join(videoOutputDir, 'processed_video.mp4');
    const detailsPath = path.join(videoOutputDir, 'details.json');
    
    // User desired language and layout
    const language = req.body.language || 'en';
    const subtitleLayout = req.body.subtitleLayout || 'classic';

    // Save video details
    const videoDetails = {
        originalName: originalName,
        uploadTime: new Date().toISOString(),
        language: language,
        layout: subtitleLayout,
        status: 'processing'
    };
    fs.writeFileSync(detailsPath, JSON.stringify(videoDetails, null, 2));

    console.log(`Processing ${originalName} in language ${language} with layout ${subtitleLayout}...`);

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

        // Define subtitle styles with ASS format
        // Colors are &HAABBGGRR (Alpha, Blue, Green, Red) in Hex
        // BorderStyle=3 is Opaque Box. BackColour is the box color.
        const styles = {
            'classic': 'Fontname=Arial,PrimaryColour=&H00FFFFFF,BorderStyle=1,Outline=1,Shadow=1,MarginV=20,Alignment=2',
            'yellow': 'Fontname=Arial,PrimaryColour=&H0000FFFF,BorderStyle=1,Outline=1,Shadow=1,MarginV=20,Alignment=2',
            'black_box': 'Fontname=Arial,PrimaryColour=&H00FFFFFF,BorderStyle=3,BackColour=&H00000000,Outline=2,Shadow=0,MarginV=20,Alignment=2', 
            'bold_red': 'Fontname=Arial,Bold=1,PrimaryColour=&H000000FF,BorderStyle=1,Outline=1,Shadow=1,MarginV=20,Alignment=2'
        };

        const forceStyle = styles[subtitleLayout] || styles['classic'];
        console.log(`Applying style for ${subtitleLayout}: ${forceStyle}`);

        // 4. Burn Subtitles
        // Switching back to CPU encoding to ensure stability as GPU (NVENC) can be flaky with path escaping/formats.
        // We use relative path to avoid Windows absolute path escaping issues with the subtitles filter.
        const relativeSrtPath = path.relative(process.cwd(), srtPath).replace(/\\/g, '/');

        await new Promise((resolve, reject) => {
            const command = ffmpeg(inputPath);

            // Apply subtitles filter
            let subtitleFilter = `subtitles='${relativeSrtPath}'`;
            if (forceStyle) {
                subtitleFilter += `:force_style='${forceStyle}'`;
            }

            command
                .videoFilters(subtitleFilter)
                .output(outputPath)
                .outputOptions([
                    '-c:v libx264',     // Standard CPU encoder (reliable)
                    '-preset ultrafast', // Fast encoding speed
                    '-pix_fmt yuv420p', // Ensure wide compatibility
                    '-c:a aac',         // Convert audio to AAC for MP4
                ])
                .on('start', (cmdLine) => {
                    console.log('FFmpeg command:', cmdLine);
                })
                .on('end', () => {
                   // update details status
                   videoDetails.status = 'completed';
                   videoDetails.processedPath = outputPath;
                   fs.writeFileSync(detailsPath, JSON.stringify(videoDetails, null, 2));
                   resolve();
                })
                .on('error', (err) => {
                    console.error('FFmpeg burn error:', err);
                    reject(err);
                })
                .run();
        });

        console.log('Video processed.');

        // Construct public URL
        const fileUrl = `http://localhost:${port}/output/${folderName}/processed_video.mp4`;
        
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
