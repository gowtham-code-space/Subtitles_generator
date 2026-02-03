# AI Subtitle Generator Usage

## Running the Application

You need to run both the backend server and the frontend client.

1.  **Start the Backend Server**:
    Open a terminal and run:
    ```bash
    node server/index.js
    ```
    The server will start on `http://localhost:3000`.

2.  **Start the Frontend Client**:
    Open a **new** terminal and run:
    ```bash
    npm run dev
    ```
    Open the link shown (usually `http://localhost:5173`) in your browser.

## Usage

1.  Select the **language** of the video audio.
2.  **Upload** the video file.
3.  Click **Generate Subtitles**.
4.  Wait for processing (audio extraction -> transcription -> subtitle burning).
5.  View and **Download** the resulting video.
