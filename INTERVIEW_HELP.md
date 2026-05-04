# Interview Guide: Serenity AI (Technical Architecture)

## 1. Project Overview
**Serenity AI** is a Holistic Mental Health Support System. It uses AI to detect emotional states via facial and speech analysis and provides real-time support.

## 2. Tech Stack (The "Big Four")
1.  **Frontend:** React (Vite) - For a fast, responsive Single Page Application.
2.  **Custom Backend:** Node.js & Express (`server.ts`) - Handles data persistence and history.
3.  **Database:** 
    *   **MongoDB Atlas:** Stores long-term history (Logins, Detections, Contacts).
    *   **Firebase Firestore:** Handles real-time user profiles and basic app state.
4.  **AI Engine:** Google Gemini Pro (`@google/genai`) - Powers the emotion analysis and the AI therapist.

---

## 3. How the APIs Work (Explain this to the Interviewer)

### A. The "Custom Backend" (Express + MongoDB)
You created a file called `server.ts`. This is your server.
*   **The Model:** You used **Mongoose** to define "Schemas". 
    *   `LoginHistory`: Tracks logins including **Device Info** and **IP Address**.
    *   `DetectionHistory`: Saves AI results including emotions and **BPM (Heart Rate)**.
    *   `ContactHistory`: Logs therapist inquiries with a 'pending' status tracker.
*   **The Routes (Endpoints):**
    *   `POST /api/auth/login-history`: Logs authentication events professionally.
    *   `POST /api/history/detection`: Records AI analysis to the database.
    *   `GET /api/stats/:userId`: **The Star Feature!** Uses MongoDB Aggregation to generate emotional trends and BPM graphs.

### B. Professional Middleware & Security
*   **Morgan:** Used for real-time HTTP request logging in the server terminal.
*   **Helmet:** Secures your app by setting various HTTP headers to prevent attacks.
*   **Global Error Handling:** I implemented a centralized middleware to catch all server errors, ensuring the app doesn't just "crash" silently.

### C. The AI API (Gemini)
*   You use the **Gemini API** via `geminiService.ts`. 
*   It takes camera/microphone data as text or image descriptions and returns a structured mental health analysis.

### D. Connecting MongoDB Atlas
*   **The Secret:** The database connection string (`MONGODB_URI`) is kept in **Environment Variables**. This is the professional way to handle secrets so they are not leaked in the source code.
*   **Verification:** You can check the `server.ts` logs. If it says "✅ Connected to MongoDB Atlas", it means your backend successfully handshake with the cloud database.
*   **IP Whitelisting:** Mention to the interviewer that you configured the MongoDB Atlas cluster to allow access (Network Access) so the backend can write data from the server.

---

## 4. Why a "Custom Backend" instead of a separate folder?
**Interviewer Question:** *"Why is your backend in the same project instead of a separate 'backend' and 'frontend' folder?"*

**Your Answer (The Pro Response):**
> "I chose an **Integrated Full-Stack Architecture** using Vite as Middleware. 
> 
> 1.  **Developer Efficiency:** In modern startups, we often use 'Monorepos'. By running Express and Vite together, I ensure that my frontend and backend stay perfectly in sync. If I change a type in my API, I can see the effect in the frontend immediately.
> 2.  **Deployment Simplicity:** This architecture allows the entire application to be containerized and deployed as a single unit (on platforms like Google Cloud Run or AWS App Runner). It reduces 'Cold Start' times and simplifies DevOps.
> 3.  **Cross-Origin Security:** Since they run on the same port in production, I don't have to deal with complex CORS (Cross-Origin Resource Sharing) issues that often cause security vulnerabilities in split-folder projects."

---

## 5. Security Features to Mention
*   **Environment Variables:** "I don't hardcode keys. I use `.env` files for MongoDB URIs and API Keys to keep the project secure."
*   **Firebase Auth:** "I integrated Google Firebase for enterprise-grade authentication. It handles the security, while my custom backend handles the professional data logging."
*   **Mongoose Validation:** "My backend uses strict Mongoose schemas to ensure that invalid data cannot be saved to the database."
