# AI Internal Knowledge Assistant (Backend)

Secure, deterministic AI backend for answering questions based strictly on internal documentation.

## Features
- **Strict Guardrails**: Answers ONLY from provided context.
- **RAG Architecture**: Uses `pgvector` for semantic search.
- **Security**: No data leakage, explicit rejection if info missing.

## Setup

1. **Prerequisites**
   - Node.js (v18+)
   - PostgreSQL (with `vector` extension installed)
   - OpenAI API Key

2. **Installation**
   ```bash
   npm install
   ```

3. **Configuration**
   Copy `.env.example` to `.env` and fill in values:
   ```bash
   cp .env.example .env
   ```

4. **Database**
   Ensure your Postgres database exists. The app will automatically enable the `vector` extension and create the `documents` table on startup.

5. **Running**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## Docker Usage (Recommended)

Run the entire stack with a single command:

1. **Configure Environment**
   Ensure your `.env` file has the `OPENAI_API_KEY`.

2. **Start Services**
   ```bash
   docker-compose up --build
   ```

3. **Access Application**
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:3000

4. **Seed Data (Optional)**
   To seed data into the running Docker container:
   ```bash
   # Enter the backend container
   docker-compose exec backend node scripts/seed.js
   ```

## API Usage


### 1. Ingest Document (Internal)
**POST** `/api/documents`
```json
{
  "content": "Our remote work policy states that employees can work from home 3 days a week.",
  "metadata": { "source": "HR-SOP-2024", "category": "policy" }
}
```

### 2. Ask Question
**POST** `/api/ask`
```json
{
  "question": "What is the remote work policy?"
}
```

## Structure
- `src/services/ai.service.js`: Contains the system prompt and guardrails.
- `src/repositories/document.repo.js`: Handles vector storage and retrieval.
