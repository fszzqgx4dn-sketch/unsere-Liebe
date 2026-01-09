
import { GoogleGenAI } from "@google/genai";
import { PromptCategory } from "../types";

export async function generateQuestion(category: PromptCategory, daysToVisit?: number, location?: string): Promise<string> {
  // Create a new GoogleGenAI instance right before making an API call to ensure it always uses the most up-to-date API key.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  
  let context = `Generate a thoughtful, deep, or fun question for a long-distance couple in the category: ${category}.`;
  
  if (daysToVisit !== undefined && daysToVisit < 7 && location) {
    context += ` They are seeing each other in ${daysToVisit} days in ${location}. Focus on their excitement, things they want to do together, or specific details of their upcoming visit.`;
  } else {
    context += ` Keep it romantic, engaging, and focused on building emotional intimacy.`;
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: context,
      config: {
        systemInstruction: "You are a relationship counselor and romantic companion AI for a couple in a long-distance relationship. Your goal is to help them feel closer. Keep questions concise and open-ended.",
        temperature: 0.8,
      }
    });

    // Directly access the .text property of GenerateContentResponse as per guidelines.
    return response.text || "Tell me something you love about our journey together.";
  } catch (error) {
    console.error("Error generating question:", error);
    return "What is one small thing you're looking forward to doing with me soon?";
  }
}
