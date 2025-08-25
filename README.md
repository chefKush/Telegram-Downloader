---

# 🚀 Telegram Media Downloader (Node.js)

💡 *When laziness meets code, automation is born 🤖*

I had 100+ videos to download from a Telegram channel… doing it manually felt boring and time-consuming.
So instead of clicking *Download* 200 times, I built this **Telegram Media Downloader** with Node.js.

---

## ✨ Features

* 🔑 Secure login using Telegram API
* 📌 Detects **start** and **stop** phrases in messages
* 📥 Downloads media (videos, docs, images) with progress tracking
* 📂 Organizes files into neat channel-based folders
* 🔄 Auto-retry on expired file references
* 📊 Shows download speed, file size, and statistics

---

## ⚡ How it Works

1. Enter your **Telegram API ID** & **API Hash**
2. Provide your **phone number** (and 2FA password if enabled)
3. Specify the **channel username/ID** and number of messages to fetch
4. Script automatically starts downloading media once it detects the start phrase
5. Stops when it finds the stop phrase

---

## 🛠️ Tech Stack

* [Node.js](https://nodejs.org/)
* [GramJS (Telegram MTProto client)](https://gram.js.org/)
* File system utilities (fs, path)

---

## 📸 Example Output

```
📥 Downloading: "12345_video.mp4" (Attempt 1)  
📊 100% (45 MB / 45 MB) - 5.2 MB/s  
✅ Successfully saved: 12345_video.mp4  
🎉 Download process completed!  
📊 Statistics:  
   • Files downloaded: 200  
   • Total size: 1.5 GB  
   • Saved to: ./downloads  
```

---

## 🚀 Why I Built This

Because laziness fuels automation 😅
Instead of spending hours downloading manually, this script saved me time ⏳ and gave me a fun side project to improve my Node.js skills.

---
### 🔖 License

MIT License – feel free to fork, learn, and improve!

---
