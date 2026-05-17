# ActSignLearn

Real-time ASL learning with AI-powered personalized study plans and per-joint hand feedback.

---

<img width="1470" height="956" alt="Screenshot 2026-05-17 at 9 25 53 AM" src="https://github.com/user-attachments/assets/326b85aa-c47f-4785-a1dc-e8ac007b32dc" />

## What is it?

ActSignLearn is an ASL learning platform that watches your hands through your webcam and tells you exactly what to adjust — down to the individual finger joint. Unlike passive video tutorials, feedback happens every single frame, in real time.

Built at a hackathon. Built for the 48 million Americans with some degree of hearing loss — and everyone who wants to reach them.

---

## Features

- **Learn Mode** — Study each sign through a rotating 2D reference model with step-by-step instructions
- **Practice Mode** — Real-time webcam feedback with per-joint red/green dot coloring and a cosine similarity accuracy score
- **Game Mode** — Reinforce material through multiple game formats
- **AI Study Plan** — Groq-powered agent generates a personalized week-by-week plan based on your onboarding quiz
- **Gesture Navigation** — Pinch to click, index finger as cursor. The entire app works without a mouse or keyboard

---

## Tech Stack

React 18 · MediaPipe Hands · TensorFlow.js · Groq API · IconScout API · HTML5 Canvas · WebRTC · Node.js

Our Kaggle Dataset Source: https://www.kaggle.com/datasets/jaisuryaprabu/sign-language-landmarks?utm_source=chatgpt.com

<img width="500" height="296" alt="neural network_image" src="https://github.com/user-attachments/assets/a70581fd-96f4-4402-8fe5-c04a61f5f6a6" />

---

## Running Locally

### Prerequisites
- Node.js 16+
- A webcam
- A Groq API key

### Setup

```bash
# Clone the repo
git clone https://github.com/your-username/actsignlearn.git
cd actsignlearn

# Create a .env file in the root
echo "REACT_APP_GROQ_API_KEY=your_key_here" > .env
echo "ICONSCOUT_CLIENT_ID" > .env
echo "ICONSCOUT_CLIENT_SECRET" > .env
echo "ICONSCOUT_API_KEY" > .env
```

### Start the app

```bash
# Install dependencies (first time only)
npm install

# Run the backend
npm run server

# In a separate terminal, run the frontend
npm start
```

Frontend runs at `http://localhost:3000` · Backend runs at `http://localhost:4000`

---

## The Team

Built with ❤️ at Uncommon Hacks 2026 by Team ActSignLearn.

---

## License

MIT — do whatever you want with it, just keep teaching ASL :)
