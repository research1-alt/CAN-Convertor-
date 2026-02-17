import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { CANFrame, SignalAnalysis } from "../types.ts";
import { authService, User } from "./authService.ts";

/**
 * Analyzes CAN bus traffic using Gemini AI and logs the query to the Google Script backend.
 */
export async function analyzeCANData(
  frames: CANFrame[], 
  user?: User, 
  sessionId?: string
): Promise<SignalAnalysis> {
  // Use gemini-3-pro-preview for complex engineering tasks
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-pro-preview';
  
  const frameSummary = frames.slice(-50).map(f => ({
    id: f.id,
    data: f.data.join(' '),
    period: f.periodMs + 'ms'
  }));

  const prompt = `
    As a senior automotive embedded engineer, analyze this snippet of CAN bus traffic captured from an OSM Electric Vehicle.
    Frames: ${JSON.stringify(frameSummary)}
    
    1. Identify the likely protocol (OBD-II, J1939, UDS, or OSM proprietary).
    2. Look for patterns in the data bytes that suggest specific signals or faults.
    3. DETECT IMPACT: If an anomaly exists, explain exactly how the vehicle's behavior is affected (e.g., limp mode, loss of torque, thermal shutdown).
    4. Suggest immediate diagnostic steps for the service technician.
    
    Provide your analysis in a professional, structured format. Focus on operational safety and impact.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [{ parts: [{ text: prompt }] }],
    });

    // CRITICAL: Access .text property directly, not as a method.
    const text = response.text || "Analysis result unavailable. Check connectivity.";
    const isUnclear = text.length < 50 || text.toLowerCase().includes("cannot determine");

    if (user && sessionId) {
      authService.logQuery(user, prompt.substring(0, 500), text, isUnclear, sessionId).catch(console.error);
    }

    return {
      summary: text,
      detectedProtocols: text.toLowerCase().includes('j1939') ? ['J1939'] : text.toLowerCase().includes('obd') ? ['OBD-II'] : ['Generic CAN / OSM Proprietary'],
      anomalies: text.toLowerCase().includes('anomaly') || text.toLowerCase().includes('fault') ? ['Potential behavioral anomaly detected'] : [],
      recommendations: "Refer to the OSM Technical Manual (v8.4) for active fault code verification.",
      sources: [] 
    };
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
}