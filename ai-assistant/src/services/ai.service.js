const openai = require('../config/openai');
const retrievalService = require('./retrieval.service');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.model = 'gpt-4o'; // Or gpt-3.5-turbo if cost is a concern, but 4o is better for reasoning
  }

  async ask(question) {
    try {
      // 1. Retrieve relevant context
      const documents = await retrievalService.retrieveContext(question);
      
      // GUARDRAIL 1: If no context is found, reject immediately without calling LLM (optional, but saves cost)
      // However, we'll let the LLM decide if the context is *relevant* enough, 
      // but if the vector search returns documents with very low similarity (logic not here yet),
      // we could filter them out. For now, we pass retrieved docs.
      
      const contextText = retrievalService.formatContext(documents);

      if (!contextText) {
        return "Maaf, informasi tersebut tidak ditemukan dalam dokumentasi internal.";
      }

      // 2. Construct System Prompt with Guardrails
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

      // 3. Call OpenAI
      const completion = await openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        temperature: 0, // Deterministic
        max_tokens: 500
      });

      const answer = completion.choices[0].message.content.trim();
      return {
        answer,
        usage: completion.usage // { prompt_tokens, completion_tokens, total_tokens }
      };

    } catch (error) {
      logger.error('Error in AI service:', error);
      throw new Error('Gagal memproses permintaan.');
    }
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
        usage: { total_tokens: '1 Image (1024x1024)' } // Mock usage for images
      };
    } catch (error) {
      logger.error('Error generating image:', error);
      throw new Error('Gagal membuat gambar.');
    }
  }
}

module.exports = new AIService();
