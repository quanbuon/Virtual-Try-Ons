import { GoogleGenAI } from "@google/genai";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readImage(value, name) {
  if (typeof value !== "string") {
    throw new Error(`The "${name}" image is required.`);
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) {
    throw new Error(`The "${name}" image must be a valid base64 image.`);
  }

  return { mimeType: match[1], data: match[2] };
}

export default async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not configured.");
    return jsonResponse({ error: "Image generation is not configured." }, 500);
  }

  let modelImage;
  let clothingImage;
  try {
    const body = await request.json();
    modelImage = readImage(body?.model, "model");
    clothingImage = readImage(body?.clothing, "clothing");
  } catch (error) {
    return jsonResponse({ error: error.message || "Invalid JSON request body." }, 400);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Create a photorealistic virtual try-on image. Keep the person, pose, face, body shape, and background from the model photo unchanged. Put the clothing item from the clothing photo on the person, preserving its design, color, and details. Return the edited image.",
            },
            { inlineData: modelImage },
            { inlineData: clothingImage },
          ],
        },
      ],
    });

    const imagePart = result.candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .find((part) => part.inlineData?.data);

    if (!imagePart) {
      console.error("Gemini did not return an image.");
      return jsonResponse({ error: "The image could not be generated. Please try again." }, 502);
    }

    const mimeType = imagePart.inlineData.mimeType || "image/png";
    return jsonResponse({
      image: `data:${mimeType};base64,${imagePart.inlineData.data}`,
    });
  } catch (error) {
    console.error("Gemini image generation failed:", error);
    return jsonResponse({ error: "The image could not be generated. Please try again." }, 502);
  }
};
