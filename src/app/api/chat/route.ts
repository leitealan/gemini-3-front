import { VertexAI } from '@google-cloud/vertexai';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

// Initialize Vertex AI
// Ensure Google Credentials are set
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Assuming the file is in the root of the project
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(process.cwd(), 'google-credentials.json');
}

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'sonar-484112'; // Defaulting to the one saw in previous file
const LOCATION = 'us-central1';

const vertexAI = new VertexAI({ project: PROJECT_ID, location: LOCATION });

// Fallback to 1.0 Pro for maximum compatibility
const MODEL_NAME = 'gemini-1.0-pro-001';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { messages } = body;

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: "Invalid messages format" }, { status: 400 });
        }

        // Convert frontend messages to Gemini format
        // Frontend: { role: 'user' | 'assistant', content: string }
        // Gemini: { role: 'user' | 'model', parts: [{ text: string }] }
        const history = messages.slice(0, -1).map((msg: any) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const lastMessage = messages[messages.length - 1];
        const userMessage = lastMessage.content;

        const generativeModel = vertexAI.getGenerativeModel({ model: MODEL_NAME });

        const chat = generativeModel.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 8192,
                temperature: 0.7,
                topP: 0.95,
            },
        });

        const result = await chat.sendMessageStream(userMessage);

        // Create a ReadableStream from the generator
        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const item of result.stream) {
                        const text = item.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        if (text) {
                            controller.enqueue(new TextEncoder().encode(text));
                        }
                    }
                    controller.close();
                } catch (err) {
                    controller.error(err);
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Transfer-Encoding': 'chunked',
            },
        });

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
