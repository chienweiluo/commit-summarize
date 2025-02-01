# AI-Powered Commit Message Generator

This Node.js script automatically generates concise and descriptive Git commit messages using OpenAI's API. It analyzes your staged changes and provides a meaningful commit message in two parts:

1. **Summary:** A brief overview (no more than 50 characters).
2. **Description:** Bullet points outlining the changes.

## 🚀 Features
- Extracts staged Git changes
- Utilizes OpenAI GPT-4 for generating commit messages
- Functional programming style using **Ramda** for cleaner code

## 📦 Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install the required packages:
   ```bash
   npm install dotenv axios ramda
   ```

3. Set up your `.env` file:
   ```env
   OPEN_API_KEY_COMMIT=YOUR_KEY
   ```

## ⚡ Usage

Run the script using Node.js:
```bash
node index.cjs
```

If no changes are staged, the script will notify you.

## 🛠️ Code Reference
This script's main idea is inspired by the article:

> [AI Git Commit](https://medium.com/front-end-augustus-study-notes/ai-git-commit-4a544419fe4f)

## 📄 License
This project is licensed under the MIT License.

