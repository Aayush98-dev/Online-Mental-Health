import { GoogleGenAI, Type } from "@google/genai";

export interface Recommendation {
  id: string;
  title: string;
  type: 'video' | 'article' | 'activity' | 'advice';
  summary: string;
  url: string;
  thumbnail?: string;
}

export interface WellnessAnalysis {
  score: number;
  insight: string;
  recommendations: Recommendation[];
  critical: boolean;
}

export interface DetailedActivity {
  title: string;
  explanation: string;
}

const EMOTIONS_LIST = ['Happy', 'Sad', 'Angry', 'Stress', 'Neutral'];

const EMOTION_QUERIES: Record<string, string> = {
  'Happy': 'productivity habits, goal setting for beginners, positivity mindfulness',
  'Sad': 'how to overcome sadness, motivational speeches for depression, cheering up techniques',
  'Angry': 'anger management techniques, calming music for relaxation, deep breathing for anger',
  'Stress': 'yoga for stress relief, workplace stress management, relaxation techniques for anxiety',
  'Neutral': 'general wellness habits, daily meditation for focus, digital detox benefits',
};

function normalizeEmotion(emotion?: string): string {
  if (!emotion) return 'Neutral';
  const found = EMOTIONS_LIST.find(e => e.toLowerCase() === emotion.toLowerCase());
  return found || 'Neutral';
}

export async function analyzeMentalState(params: {
  facialEmotion?: string;
  voiceEmotion?: string;
  textInput?: string;
  history?: string[];
}): Promise<WellnessAnalysis> {
  const { facialEmotion, voiceEmotion, textInput, history = [] } = params;
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  try {
    const prompt = `
      Analyze the mental wellness of a user based on these inputs:
      - Facial Emotion Detected: ${facialEmotion || 'Not available'}
      - Voice Emotion Detected: ${voiceEmotion || 'Not available'}
      - User Written Thoughts: ${textInput || 'Not available'}
      - Recent Emotion History: ${history.join(', ')}

      Tasks:
      1. Calculate a Wellness Score (0-100), where 100 is excellent and 0 is critical.
      2. Provide a 2-3 sentence personalized insight message.
      3. Identify if the state is "critical" (low score or high stress/sadness/anger/negative sentiment in text).
      4. Suggest 3 immediate wellness activities (meditation, breathing, etc.).
      5. Provide 2 pieces of personalized advice.

      Return ONLY a JSON object:
      {
        "score": number,
        "insight": "string",
        "critical": boolean,
        "activities": [{"title": "...", "description": "..."}],
        "advice": [{"title": "...", "description": "..."}]
      }
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            insight: { type: Type.STRING },
            critical: { type: Type.BOOLEAN },
            activities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            },
            advice: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    let text = response.text || '{}';
    // Remove markdown code blocks if present
    if (text.includes('```')) {
      text = text.replace(/```json|```/g, '').trim();
    }
    
    const data = JSON.parse(text);
    const recommendations: Recommendation[] = [];

    // Ensure activities and advice are at least empty arrays
    const activities = data.activities || [];
    const advice = data.advice || [];

    // Add Activities
    activities.forEach((act: any, idx: number) => {
      recommendations.push({
        id: `ai-act-${idx}`,
        title: act.title,
        type: 'activity',
        summary: act.description,
        url: '#'
      });
    });

    // Add Advice
    advice.forEach((adv: any, idx: number) => {
      recommendations.push({
        id: `ai-advice-${idx}`,
        title: adv.title,
        type: 'advice',
        summary: adv.description,
        url: '#'
      });
    });

    // Fetch dynamic content (videos/articles) based on primary emotion or text
    const primaryEmotion = normalizeEmotion(facialEmotion || voiceEmotion || (data.score < 50 ? 'Stress' : 'Neutral'));
    const dynamicContent = await fetchResources({ emotion: primaryEmotion, maxVideos: 2, maxArticles: 2 });
    
    return {
      score: data.score,
      insight: data.insight,
      critical: data.critical,
      recommendations: [...recommendations, ...dynamicContent]
    };

  } catch (err) {
    console.error("Mental State Analysis Failed:", err);
    return {
      score: 50,
      insight: "Biometric synchronization encounterd a variance. Let's focus on foundational wellness protocols.",
      critical: false,
      recommendations: [
        { id: 'fallback-1', title: 'Box Breathing', type: 'activity', summary: 'A tactical breathing technique to reset your nervous system.', url: '#' },
        { id: 'fallback-2', title: 'Mindful Grounding', type: 'activity', summary: 'Connect with your immediate surroundings to reduce cognitive load.', url: '#' },
        { id: 'fallback-3', title: 'Hydration Sync', type: 'advice', summary: 'Ensure optimal biometric performance with proper hydration.', url: '#' }
      ]
    };
  }
}

export async function fetchResources(params: { emotion: string; maxVideos?: number; maxArticles?: number }): Promise<Recommendation[]> {
  const emotion = normalizeEmotion(params.emotion);
  const { maxVideos = 5, maxArticles = 5 } = params;
  const recommendations: Recommendation[] = [];
  
  const queryBase = EMOTION_QUERIES[emotion] || 'wellness';
  
  // 1. YouTube Fetching
  const youtubeKey = (import.meta as any).env.VITE_YOUTUBE_API_KEY;
  if (youtubeKey) {
    try {
      const query = encodeURIComponent(`mental health ${queryBase}`);
      const ytResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${maxVideos}&q=${query}&type=video&videoDuration=short&key=${youtubeKey}`
      );
      if (!ytResponse.ok) throw new Error(`YouTube API error: ${ytResponse.status}`);
      const ytData = await ytResponse.json();
      
      ytData.items?.forEach((item: any) => {
        if (item.id.videoId) {
          recommendations.push({
            id: item.id.videoId,
            title: item.snippet.title,
            type: 'video',
            summary: item.snippet.description,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            thumbnail: item.snippet.thumbnails.high.url
          });
        }
      });
    } catch (e) {
      console.error("YouTube fetch failed", e);
    }
  }

  // 2. Wikipedia/Article Fetching
  try {
    const wikiQuery = encodeURIComponent(queryBase.split(',')[0]);
    const wikiResponse = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${wikiQuery}&format=json&origin=*&srlimit=${maxArticles}`
    );
    if (!wikiResponse.ok) throw new Error(`Wikipedia API error: ${wikiResponse.status}`);
    const wikiData = await wikiResponse.json();
    
    wikiData.query?.search?.forEach((item: any) => {
      recommendations.push({
        id: `wiki-${item.pageid}`,
        title: item.title,
        type: 'article',
        summary: item.snippet.replace(/<[^>]*>/g, ''),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`
      });
    });
  } catch (e) {
    console.error("Wikipedia fetch failed", e);
  }

  return recommendations;
}

export async function fetchDetailedActivities(emotion: string): Promise<DetailedActivity[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `User is feeling ${emotion}. Suggest 3 simple, effective mental health activities with short explanations tailored to this emotion. Return as JSON array of objects: [{"title": "...", "explanation": "..."}]`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["title", "explanation"]
          }
        }
      }
    });
    
    return JSON.parse(response.text || '[]');
  } catch (e) {
    console.error("Gemini activity skip failed", e);
    return [
      { title: "Deep Breathing", explanation: "Focus on your breath for 2 minutes to center yourself." },
      { title: "Short Walk", explanation: "A brief change of environment can help reset your mood." },
      { title: "Journaling", explanation: "Write down your thoughts to process them better." }
    ];
  }
}
