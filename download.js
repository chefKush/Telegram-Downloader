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

// Helper to sanitize filename
function sanitize(str) {
    if (!str) return "";
    // Remove invalid filename characters and limit length
    return str.replace(/[<>:"/\\|?*]/g, "").substring(0, 70).trim();
}

// Helper to check if file should be skipped
function shouldSkipFile(media) {
    if (media.document && media.document.attributes) {
        for (const attr of media.document.attributes) {
            if (attr.fileName) {
                const fileName = attr.fileName.toLowerCase();
                // Skip system files and unwanted files
                const skipPatterns = ['.ds_store', 'thumbs.db', '.tmp', '.temp', '.cache', '.log'];
                if (skipPatterns.some(pattern => fileName.includes(pattern))) {
                    console.log(`⏭️  Skipping system file: ${fileName}`);
                    return true;
                }
            }
        }
    }
    return false;
}

// Helper to get proper file extension based on media type
function getFileExtension(media) {
    if (media.photo) return ".jpg";

    if (media.video) {
        // Check if it has attributes with fileName
        if (media.video.attributes) {
            for (const attr of media.video.attributes) {
                if (attr.fileName) {
                    const fileName = attr.fileName.toLowerCase();
                    if (fileName.includes('.')) {
                        return '.' + fileName.split('.').pop();
                    }
                }
            }
        }
        return ".mp4"; // default for video
    }

    if (media.document) {
        const doc = media.document;

        // Check file name first if available
        if (doc.attributes) {
            for (const attr of doc.attributes) {
                if (attr.fileName) {
                    const fileName = attr.fileName.toLowerCase();
                    if (fileName.includes('.')) {
                        return '.' + fileName.split('.').pop();
                    }
                }
            }
        }

        // Fallback to mime type
        if (doc.mimeType) {
            const mime = doc.mimeType.toLowerCase();
            if (mime.includes("pdf")) return ".pdf";
            if (mime.includes("zip")) return ".zip";
            if (mime.includes("audio")) return ".mp3";
            if (mime.includes("video/mp4")) return ".mp4";
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

// Helper to format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper to calculate download speed
function formatSpeed(bytesPerSecond) {
    return formatBytes(bytesPerSecond) + '/s';
}

(async () => {
    console.log("🚀 Starting Telegram Media Downloader...\n");

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 10,
        timeout: 300000, // 5 minutes timeout
        requestRetries: 5,
        retryDelay: 2000,
    });

    await client.start({
        phoneNumber: async () => await question("📱 Enter your phone number (with country code): "),
        password: async () => await question("🔐 Enter 2FA password (if any, else blank): "),
        phoneCode: async () => await question("💬 Enter the code you received: "),
        onError: (err) => console.log("❌", err),
    });

    // Save session automatically after login
    const newSession = client.session.save();
    writeFileSync(SESSION_FILE, newSession);
    console.log(`✅ Session saved to ${SESSION_FILE}`);
    console.log("✅ Logged in successfully.\n");

    const channel = await question("📺 Enter the channel username or ID: ");
    let limit = await question("📊 Number of recent messages to fetch (e.g. 200): ");
    limit = parseInt(limit);

    rl.close();

    console.log(`\n📥 Fetching ${limit} messages from ${channel}...`);

    // Fetch messages
    let messages = await client.getMessages(channel, { limit });
    messages = messages.reverse(); // oldest first to process chronologically

    const downloadBaseFolder = "./downloads";
    if (!existsSync(downloadBaseFolder)) mkdirSync(downloadBaseFolder);

    const startPhrase = "📌 how to instagram ankoor warikoo";
    const stopPhrase = "complete ✅";

    const foundStart = messages.some(msg => (msg.message || "").toLowerCase().includes(startPhrase));
    if (!foundStart) {
        console.log("❌ 'start phase' not found in any message. Stopping execution.");
        process.exit(0);
    }

    let startDownloading = false;
    let downloadCount = 0;
    let totalSize = 0;

    console.log(`\n🔍 Searching for media files...`);

    for (const message of messages) {
        const text = (message.message || "").toLowerCase();
        if (!startDownloading) {
            if (text.includes(startPhrase)) {
                startDownloading = true;
                console.log(`✅ Found start phrase in message ${message.id}. Beginning downloads...\n`);
            } else {
                continue; // skip until startPhrase
            }
        }
        // Stop if stopPhrase encountered
        if (text.includes(stopPhrase)) {
            console.log(`\n🛑 Reached stop phrase in message ${message.id}. Ending downloads.`);
            break;
        }

        if (message.media) {
            // Skip unwanted system files
            if (shouldSkipFile(message.media)) {
                continue;
            }

            const channelFolder = path.join(downloadBaseFolder, channel.replace(/[^a-z0-9]/gi, "_").toLowerCase());
            if (!existsSync(channelFolder)) mkdirSync(channelFolder);

            // Get proper file extension
            const ext = getFileExtension(message.media);

            let fileName = "";
            // PDFs use message text only (sanitized); others use id + short text
            if (ext === ".pdf") {
                let pdfName = sanitize(message.message);
                if (!pdfName) pdfName = `file_${message.id}`;
                fileName = pdfName.endsWith(ext) ? pdfName : pdfName + ext;
            } else {
                let safeMsg = sanitize(message.message);
                if (!safeMsg) safeMsg = "file";
                fileName = `${message.id}_${safeMsg}${ext}`;
            }

            const filePath = path.join(channelFolder, fileName);

            if (existsSync(filePath)) {
                console.log(`⏭️  File already exists: ${fileName}`);
                continue;
            }

            let downloadSuccess = false;
            let attempt = 0;

            // Keep retrying until download succeeds - don't move to next file until this one is complete
            while (!downloadSuccess) {
                attempt++;
                try {
                    console.log(`\n📥 Downloading: "${fileName}" (Attempt ${attempt})`);

                    let lastPercent = 0;
                    let startTime = Date.now();

                    const buffer = await client.downloadMedia(message.media, {
                        progressCallback: (downloaded, total) => {
                            if (total > 0) {
                                const percent = Math.round((downloaded / total) * 100);

                                // Only update every 5% to avoid spam and update same line
                                if (percent >= lastPercent + 5 || percent === 100) {
                                    const elapsed = (Date.now() - startTime) / 1000;
                                    const speed = elapsed > 0 ? downloaded / elapsed : 0;
                                    const speedText = formatSpeed(speed);

                                    // Use \r to overwrite the same line
                                    process.stdout.write(`\r📊 ${percent}% (${formatBytes(downloaded)}/${formatBytes(total)}) - ${speedText}`);

                                    if (percent === 100) {
                                        process.stdout.write('\n'); // New line when complete
                                    }

                                    lastPercent = percent;
                                }
                            }
                        }
                    });

                    writeFileSync(filePath, buffer);

                    const fileSize = buffer.length;
                    totalSize += fileSize;

                    console.log(`✅ Successfully saved: ${fileName} (${formatBytes(fileSize)})`);
                    downloadCount++;
                    downloadSuccess = true;

                } catch (error) {
                    console.log(`❌ Error downloading "${fileName}": ${error.message}`);

                    // Calculate retry delay based on attempt number (exponential backoff)
                    const retryDelay = Math.min(5000 * Math.pow(1.5, attempt - 1), 30000); // Max 30 seconds
                    console.log(`🔄 Retrying in ${Math.round(retryDelay / 1000)} seconds... (Attempt ${attempt + 1})`);

                    // Wait before retrying
                    await new Promise(res => setTimeout(res, retryDelay));

                    // Optional: Add user input to skip file after many attempts
                    if (attempt >= 10) {
                        console.log(`\n⚠️  File "${fileName}" has failed ${attempt} times.`);
                        console.log(`📝 Options:`);
                        console.log(`   1. Continue retrying (press Enter)`);
                        console.log(`   2. Skip this file (type 'skip')`);
                        console.log(`   3. Exit program (type 'exit')`);

                        const userChoice = await new Promise((resolve) => {
                            const rl2 = readline.createInterface({
                                input: process.stdin,
                                output: process.stdout,
                            });
                            rl2.question('Your choice: ', (answer) => {
                                rl2.close();
                                resolve(answer.trim().toLowerCase());
                            });
                        });

                        if (userChoice === 'skip') {
                            console.log(`⏭️  Skipping "${fileName}" and moving to next file...`);
                            downloadSuccess = true; // Exit the while loop without incrementing downloadCount
                        } else if (userChoice === 'exit') {
                            console.log(`👋 Exiting program as requested.`);
                            process.exit(0);
                        } else {
                            console.log(`🔄 Continuing to retry "${fileName}"...`);
                        }
                    }
                }
            }

            // Add a small delay between downloads to avoid rate limiting
            await new Promise(res => setTimeout(res, 2000)); // 2 second delay
        }
    }

    console.log(`\n🎉 Download process completed!`);
    console.log(`📊 Statistics:`);
    console.log(`   • Files downloaded: ${downloadCount}`);
    console.log(`   • Total size: ${formatBytes(totalSize)}`);
    console.log(`   • Saved to: ${path.resolve(downloadBaseFolder)}`);

    process.exit(0);
})();