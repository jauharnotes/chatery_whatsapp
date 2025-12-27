const openai = require('../config/openai');
const retrievalService = require('./retrieval.service');
const schemaService = require('./schema.service');
const connectionRepo = require('../repositories/connection.repo');
const tableConfigRepo = require('../repositories/table-config.repo');
const logger = require('../utils/logger');
const { cacheHelper } = require('@chatery/shared');

// Cache TTL values
const CACHE_TTL_SCHEMA = parseInt(process.env.CACHE_TTL_SCHEMA) || 3600; // 1 hour
const CACHE_TTL_QUERY = parseInt(process.env.CACHE_TTL_QUERY) || 300;    // 5 minutes

class AIService {
  constructor() {
    this.model = 'gpt-4o';
    this.redis = null;
  }

  /**
   * Set Redis client (called from routes)
   */
  setRedis(redis) {
    this.redis = redis;
  }

  /**
   * Main ask function - routes between RAG and SQL Agent modes
   */
  async ask(question, options = {}) {
    const { connectionId } = options;

    try {
      // If connectionId provided, use SQL Agent mode
      if (connectionId) {
        return await this.askWithSqlAgent(question, connectionId);
      }

      // Otherwise, use traditional RAG with documents table
      return await this.askWithRag(question);
    } catch (error) {
      logger.error('Error in AI service:', error);
      throw new Error('Gagal memproses permintaan: ' + error.message);
    }
  }

  /**
   * SQL Agent mode - query user's configured tables with caching
   */
  async askWithSqlAgent(question, connectionId) {
    // Check cache first for identical questions
    if (this.redis) {
      const cacheKey = `answer:${connectionId}:${cacheHelper.hashKey(question)}`;
      const cached = await cacheHelper.get(this.redis, cacheKey);
      if (cached) {
        logger.info('Cache HIT for answer');
        return { ...cached, fromCache: true };
      }
    }

    // 1. Get connection and configured tables
    const connection = await connectionRepo.findById(connectionId);
    if (!connection) {
      throw new Error('Database connection not found');
    }

    const tableConfigs = await tableConfigRepo.findActiveByConnectionId(connectionId);
    if (tableConfigs.length === 0) {
      return {
        answer: 'Belum ada tabel yang dikonfigurasi. Silakan pilih tabel yang ingin diakses di pengaturan.',
        usage: null
      };
    }

    // 2. Get schemas for configured tables (with caching)
    const schemas = await this.getTableSchemas(connection, tableConfigs);

    // 3. Generate SQL query from question
    const sqlQuery = await this.generateSqlQuery(question, schemas, tableConfigs);

    if (!sqlQuery || sqlQuery.includes('TIDAK_RELEVAN')) {
      return {
        answer: 'Maaf, pertanyaan ini tidak dapat dijawab dengan data yang tersedia.',
        usage: null
      };
    }

    // 4. Execute query
    let queryResult;
    try {
      logger.info('Generated SQL:', sqlQuery);
      queryResult = await schemaService.executeQuery(connection, sqlQuery);
      logger.info('Query returned', queryResult.length, 'rows');
    } catch (error) {
      logger.error('SQL execution error:', error);
      return {
        answer: 'Terjadi kesalahan saat mengambil data. Silakan coba pertanyaan yang berbeda.',
        usage: null
      };
    }

    // 5. Generate answer from query result
    const result = await this.generateAnswerFromData(question, queryResult, sqlQuery);
    
    // Cache the result
    if (this.redis && result.answer) {
      const cacheKey = `answer:${connectionId}:${cacheHelper.hashKey(question)}`;
      await cacheHelper.set(this.redis, cacheKey, result, CACHE_TTL_QUERY);
      logger.info('Cached answer for 5 minutes');
    }

    return result;
  }

  /**
   * Get table schemas for context (with caching)
   */
  async getTableSchemas(connection, tableConfigs) {
    const cacheKey = `schema:${connection.id}`;
    
    // Check cache first
    if (this.redis) {
      const cached = await cacheHelper.get(this.redis, cacheKey);
      if (cached) {
        logger.info('Cache HIT for schema');
        return cached;
      }
    }

    const schemas = [];
    for (const config of tableConfigs) {
      try {
        const schema = await schemaService.getTableSchema(connection, config.table_name);
        schemas.push({
          table_name: config.table_name,
          display_name: config.display_name,
          description: config.description,
          columns: schema
        });
      } catch (error) {
        logger.warn(`Failed to get schema for ${config.table_name}:`, error.message);
      }
    }

    // Cache schemas
    if (this.redis && schemas.length > 0) {
      await cacheHelper.set(this.redis, cacheKey, schemas, CACHE_TTL_SCHEMA);
      logger.info('Cached schema for 1 hour');
    }

    return schemas;
  }

  /**
   * Generate SQL query from natural language question
   */
  async generateSqlQuery(question, schemas, tableConfigs) {
    const schemaContext = schemas.map(s => {
      const cols = s.columns.map(c => `  - ${c.column_name} (${c.data_type})`).join('\n');
      return `Tabel: ${s.table_name} (${s.display_name || s.table_name})\n${s.description ? `Deskripsi: ${s.description}\n` : ''}Kolom:\n${cols}`;
    }).join('\n\n');

    const systemPrompt = `Kamu adalah SQL query generator EXPERT. Tugas kamu adalah mengubah pertanyaan user menjadi PostgreSQL query yang OPTIMAL dan INFORMATIF.

ATURAN PENTING:
1. Hanya gunakan tabel dan kolom yang ada di schema berikut
2. SELALU gunakan query SELECT (READ ONLY)
3. Jangan gunakan DELETE, UPDATE, INSERT, DROP, atau ALTER
4. Batasi hasil dengan LIMIT jika tidak spesifik (max 20 rows)
5. Jika pertanyaan tidak relevan dengan data, jawab: TIDAK_RELEVAN
6. Output HANYA query SQL, tanpa penjelasan
7. Gunakan ILIKE untuk pencarian teks (case insensitive)

ATURAN KUALITAS DATA:
8. SELALU gunakan JOIN untuk mendapatkan NAMA yang readable, BUKAN hanya ID
9. Contoh: Jika ada topic_id, JOIN ke tabel topics untuk ambil topics.name
10. Contoh: Jika ada trainer_ids, usahakan ambil nama trainer dari tabel trainers
11. Pilih kolom yang INFORMATIF untuk user (nama, deskripsi, tanggal) bukan kolom teknis (id, created_at)
12. Gunakan alias AS untuk penamaan kolom yang jelas (contoh: t.name AS topic_name)

SCHEMA DATABASE:
${schemaContext}`;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0,
      max_tokens: 500
    });

    const response = completion.choices[0].message.content.trim();
    
    // Clean up response (remove markdown code blocks if any)
    let sql = response.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
    
    // Security check - use word boundaries to avoid false positives on column names
    const forbidden = ['DELETE', 'UPDATE', 'INSERT', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE'];
    const upperSql = sql.toUpperCase();
    for (const keyword of forbidden) {
      // Use regex with word boundary to avoid matching column names like 'updated_at'
      const regex = new RegExp(`\\b${keyword}\\b(?!_)`, 'i');
      if (regex.test(upperSql) && !upperSql.trim().startsWith('SELECT')) {
        throw new Error('Query tidak diizinkan');
      }
    }

    return sql;
  }

  /**
   * Generate natural language answer from query results
   */
  async generateAnswerFromData(question, data, sqlQuery) {
    if (!data || data.length === 0) {
      return {
        answer: 'Tidak ditemukan data yang sesuai dengan pertanyaan Anda.',
        usage: null
      };
    }

    const dataContext = JSON.stringify(data, null, 2);

    const systemPrompt = `Kamu adalah asisten AI yang AHLI dalam menyampaikan informasi dengan cara yang MUDAH DIPAHAMI dan MENARIK.

ATURAN PENTING:
1. Jawab pertanyaan berdasarkan DATA yang diberikan
2. Gunakan bahasa yang NATURAL, RAMAH, dan CONVERSATIONAL
3. JANGAN tampilkan ID atau data teknis - fokus pada informasi yang berguna untuk user
4. Format jawaban dengan RAPI:
   - Gunakan emoji yang relevan untuk memperjelas (📅 untuk tanggal, 👨‍🏫 untuk trainer, 📚 untuk training, dll)
   - Jika berupa list, gunakan bullet points atau numbering
   - Highlight informasi penting
5. Jangan mengarang informasi di luar data yang diberikan
6. Jawab dalam bahasa yang sama dengan pertanyaan
7. Jika ada tanggal, format dengan rapi (contoh: "20 Februari 2025")
8. Berikan konteks dan ringkasan singkat jika ada banyak data

Contoh format yang BAGUS:
"Berikut 3 training yang akan datang:

1. 📚 **Data Analytics untuk Bisnis**
   👨‍🏫 Trainer: Budi Santoso, Ani Wijaya
   📅 Tanggal: 20 Februari 2025
   📍 Online via Zoom"

DATA HASIL QUERY:
${dataContext}`;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0.3,
      max_tokens: 1000
    });

    return {
      answer: completion.choices[0].message.content.trim(),
      usage: completion.usage,
      debug: { sqlQuery, rowCount: data.length }
    };
  }

  /**
   * Traditional RAG mode with documents table
   */
  async askWithRag(question) {
    const documents = await retrievalService.retrieveContext(question);
    const contextText = retrievalService.formatContext(documents);

    if (!contextText) {
      return {
        answer: "Maaf, informasi tersebut tidak ditemukan dalam dokumentasi internal.",
        usage: null
      };
    }

    const systemPrompt = `
You are an AI Internal Knowledge Assistant for a company.
Your goal is to answer user questions STRICTLY based on the provided context.

*** CRITICAL RULES ***
1. You must answer ONLY using the facts from the "CONTEXT" section below.
2. If the answer is not explicitly in the CONTEXT, you must reply EXACTLY with:
   "Maaf, informasi tersebut tidak ditemukan dalam dokumentasi internal."
3. Do NOT make up, assume, or hallucinate information.
4. Do NOT use outside knowledge.
5. Do NOT mention "According to the context" or "The documents say". Just answer the question directly.
6. If the context contains conflicting information, state the conflict.

*** CONTEXT ***
${contextText}
`;

    const completion = await openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question }
      ],
      temperature: 0,
      max_tokens: 500
    });

    return {
      answer: completion.choices[0].message.content.trim(),
      usage: completion.usage
    };
  }

  async generateImage(prompt) {
    try {
      const response = await openai.images.generate({
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024",
      });

      return {
        imageUrl: response.data[0].url,
        usage: { total_tokens: '1 Image (1024x1024)' }
      };
    } catch (error) {
      logger.error('Error generating image:', error);
      throw new Error('Gagal membuat gambar.');
    }
  }
}

module.exports = new AIService();
