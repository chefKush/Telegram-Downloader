const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { writeFileSync, mkdirSync, existsSync, readFileSync } = require("fs");
const path = require("path");
const readline = require("readline");
const SESSION_FILE = "session.txt";

// Load saved session or empty string
const sessionString = existsSync(SESSION_FILE) ? readFileSync(SESSION_FILE, "utf-8") : "";
const stringSession = new StringSession(sessionString);

const apiId = 22869769;
const apiHash = "d9f8983e9dacc30e869a7ea2d34b8087";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function question(query) {
    return new Promise((resolve) => rl.question(query, resolve));
}

// Helper to ensure extension is added only once
function ensureExt(name, ext) {
    name = name.trim();
    // Remove the extension if it already exists at the end
    if (name.toLowerCase().endsWith(ext.toLowerCase())) {
        return name;
    }
    return name + ext;
}

// Helper to sanitize filename
function sanitize(str) {
    if (!str) return "";
    return str.substring(0, 70).trim();
}

// Helper to get proper file extension based on media type
function getFileExtension(media) {
    if (media.video) return ".mp4";
    if (media.photo) return ".jpg";

    if (media.document) {
        const doc = media.document;

        // Check file name first if available
        if (doc.attributes) {
            for (const attr of doc.attributes) {
                if (attr.fileName) {
                    const fileName = attr.fileName.toLowerCase();
                    if (fileName.endsWith('.pdf')) return ".pdf";
                    if (fileName.endsWith('.zip')) return ".zip";
                    if (fileName.endsWith('.mp4')) return ".mp4";
                    if (fileName.endsWith('.mp3')) return ".mp3";
                    if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return ".jpg";
                    if (fileName.endsWith('.png')) return ".png";
                    if (fileName.endsWith('.gif')) return ".gif";
                    if (fileName.endsWith('.txt')) return ".txt";
                    if (fileName.endsWith('.doc')) return ".doc";
                    if (fileName.endsWith('.docx')) return ".docx";
                }
            }
        }

        // Fallback to mime type
        if (doc.mimeType) {
            const mime = doc.mimeType.toLowerCase();
            if (mime.includes("pdf")) return ".pdf";
            if (mime.includes("zip")) return ".zip";
            if (mime.includes("audio")) return ".mp3";
            if (mime.includes("video")) return ".mp4";
            if (mime.includes("image/jpeg")) return ".jpg";
            if (mime.includes("image/png")) return ".png";
            if (mime.includes("image/gif")) return ".gif";
            if (mime.includes("text/plain")) return ".txt";
            if (mime.includes("application/msword")) return ".doc";
            if (mime.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document")) return ".docx";
        }
    }

    return ".dat"; // fallback
}

(async () => {
    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
        timeout: 60000, // Increase timeout to 60 seconds
        requestRetries: 3,
    });

    await client.start({
        phoneNumber: async () => await question("Enter your phone number (with country code): "),
        password: async () => await question("Enter 2FA password (if any, else blank): "),
        phoneCode: async () => await question("Enter the code you received: "),
        onError: (err) => console.log(err),
    });

    // Save session automatically after login
    const newSession = client.session.save();
    writeFileSync(SESSION_FILE, newSession);
    console.log(`Session saved to ${SESSION_FILE}`);

    console.log("Logged in successfully.");

    const channel = await question("Enter the channel username or ID: ");
    let limit = await question("Number of recent messages to fetch (e.g. 200): ");
    limit = parseInt(limit);

    rl.close();

    // Fetch messages
    let messages = await client.getMessages(channel, { limit });
    messages = messages.reverse(); // oldest first to process chronologically

    const downloadBaseFolder = "./downloads";
    if (!existsSync(downloadBaseFolder)) mkdirSync(downloadBaseFolder);

    const startPhrase = "📌 how to instagram ankoor warikoo";
    const stopPhrase = "complete ✅";

    const foundStart = messages.some(msg => (msg.message || "").toLowerCase().includes(startPhrase));
    if (!foundStart) {
        console.log("'start phase' not found in any message. Stopping execution.");
        process.exit(0);
    }

    let startDownloading = false;
    let downloadCount = 0;

    for (const message of messages) {
        const text = (message.message || "").toLowerCase();
        if (!startDownloading) {
            if (text.includes(startPhrase)) {
                startDownloading = true;
                console.log(`Found start phrase in message ${message.id}. Beginning downloads...`);
            } else {
                continue; // skip until startPhrase
            }
        }
        // Stop if stopPhrase encountered
        if (text.includes(stopPhrase)) {
            console.log(`Reached stop phrase in message ${message.id}. Ending downloads.`);
            break;
        }

        if (message.media) {
            const channelFolder = path.join(downloadBaseFolder, channel.replace(/[^a-z0-9]/gi, "_").toLowerCase());
            if (!existsSync(channelFolder)) mkdirSync(channelFolder);

            // Get proper file extension
            const ext = getFileExtension(message.media);

            let fileName = "";
            // PDFs use message text only (sanitized); others use id + short text
            if (ext === ".pdf") {
                let pdfName = sanitize(message.message);
                if (!pdfName) pdfName = `file_${message.id}`;
                fileName = ensureExt(pdfName, ext);
            } else {
                let safeMsg = sanitize(message.message);
                if (!safeMsg) safeMsg = "file";
                fileName = `${message.id}_${safeMsg}${ext}`;
            }

            const filePath = path.join(channelFolder, fileName);

            if (existsSync(filePath)) {
                console.log(`File already downloaded: ${fileName}`);
                continue;
            }

            const MAX_RETRIES = 3;
            let downloadSuccess = false;

            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    console.log(`Downloading "${fileName}" (Attempt ${attempt}/${MAX_RETRIES})...`);

                    // Add timeout wrapper for download
                    const downloadPromise = client.downloadMedia(message.media, {
                        progressCallback: (downloaded, total) => {
                            if (total) {
                                const percent = Math.round((downloaded / total) * 100);
                                if (percent % 10 === 0) { // Show progress every 10%
                                    console.log(`Progress: ${percent}% (${downloaded}/${total} bytes)`);
                                }
                            }
                        }
                    });

                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Download timeout')), 120000); // 2 minutes timeout
                    });

                    const buffer = await Promise.race([downloadPromise, timeoutPromise]);
                    writeFileSync(filePath, buffer);
                    console.log(`✓ Successfully saved: ${fileName}`);
                    downloadCount++;
                    downloadSuccess = true;
                    break;

                } catch (error) {
                    console.log(`✗ Error downloading "${fileName}":`, error.message);
                    if (attempt === MAX_RETRIES) {
                        console.log(`✗ Failed to download "${fileName}" after ${MAX_RETRIES} attempts.`);
                    } else {
                        console.log("Retrying in 5 seconds...");
                        await new Promise(res => setTimeout(res, 5000)); // Wait 5 seconds before retry
                    }
                }
            }

            // Add a small delay between downloads to avoid rate limiting
            if (downloadSuccess) {
                await new Promise(res => setTimeout(res, 1000)); // 1 second delay
            }
        }
    }

    console.log(`\nDownload process completed. Successfully downloaded ${downloadCount} files.`);
    process.exit(0);
})();