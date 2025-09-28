
import { GoogleGenAI, Type } from "@google/genai";
import type { Feedback, Hint } from './types';

const MODEL_NAME = 'gemini-2.5-flash';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const withRetry = async <T,>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    console.error("API call failed after multiple retries:", error);
    throw error;
  }
};

export const generateParagraph = async (topic: string): Promise<string> => {
  return withRetry(async () => {
    const prompt = `Dựa trên chủ đề "${topic}", hãy viết một đoạn văn tiếng Việt hoàn toàn mới, dài khoảng 8-12 câu, ở trình độ B1-B2. Đoạn văn phải tự nhiên và phù hợp cho người học tiếng Anh. Trả về một đối tượng JSON với khóa "paragraph" chứa toàn bộ đoạn văn dưới dạng một chuỗi duy nhất.`;
    
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            paragraph: { type: Type.STRING },
          },
          required: ["paragraph"],
        },
      },
    });

    const result = JSON.parse(response.text);
    return result.paragraph;
  });
};

export const getFeedbackForSentence = async (vietnameseSentence: string, userTranslation: string): Promise<Feedback> => {
    return withRetry(async () => {
        const prompt = `Bạn là một gia sư AI chuyên nghiệp, tập trung vào tốc độ phản hồi và chấm điểm sửa lỗi trọng tâm. Cho câu tiếng Việt gốc: "${vietnameseSentence}" và bản dịch của học viên: "${userTranslation}". Hãy thực hiện các công việc sau và trả về một đối tượng JSON: 
1. Cung cấp một bản dịch tiếng Anh "chuẩn" (correct_translation) - phải là một câu tự nhiên, hay nhất.
2. So sánh bản dịch của học viên với bản dịch chuẩn và đưa ra điểm chính xác từ 0 đến 100 (accuracy_score).
3. Liệt kê các lỗi cụ thể trong một mảng "errors". Các lỗi này phải là **trọng tâm và quan trọng nhất** (ví dụ: lỗi Ngữ pháp, lỗi Chọn từ, lỗi Cấu trúc câu). Mỗi lỗi là một đối tượng có "type" (ví dụ: 'Ngữ pháp', 'Từ vựng') và "explanation" (giải thích lỗi bằng tiếng Việt, trong đó các từ hoặc cụm từ quan trọng được đặt trong dấu nháy đơn, ví dụ: 'word'). Tối đa 3 lỗi.
4. Đưa ra một nhận xét chung, động viên bằng tiếng Việt (general_feedback, sử dụng dấu nháy đơn cho các từ/cụm từ quan trọng).`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        correct_translation: { type: Type.STRING },
                        accuracy_score: { type: Type.NUMBER },
                        errors: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    type: { type: Type.STRING },
                                    explanation: { type: Type.STRING },
                                },
                                required: ["type", "explanation"],
                            },
                        },
                        general_feedback: { type: Type.STRING },
                    },
                    required: ["correct_translation", "accuracy_score", "general_feedback"],
                },
            },
        });
        
        return JSON.parse(response.text);
    });
};

export const getHintForSentence = async (vietnameseSentence: string): Promise<Hint[]> => {
    return withRetry(async () => {
        const prompt = `Cho câu tiếng Việt sau: "${vietnameseSentence}". Hãy liệt kê 3-5 từ vựng tiếng Anh quan trọng nhất có trong câu này mà người học có thể cần biết để dịch. Với mỗi từ, cung cấp nghĩa tiếng Việt của nó. Trả về một mảng JSON các đối tượng có khóa "english_word" và "vietnamese_meaning".`;

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            english_word: { type: Type.STRING },
                            vietnamese_meaning: { type: Type.STRING },
                        },
                        required: ["english_word", "vietnamese_meaning"],
                    },
                },
            },
        });

        return JSON.parse(response.text);
    });
};
