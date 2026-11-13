import { generateText } from "ai";
import { z } from "zod";
import { requireOpenRouterCostUsd } from "@/server/lib/chatAgent";
import { buildChatAgentModel } from "@/server/lib/openrouter";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Pictures come from OpenRouter's image API, on the same key and credits as
// the article writing. GPT Image Flare gave clear, on-topic editorial photos
// in about 10 seconds for about $0.03; Nano Banana is the fallback when the
// first model refuses the request (OpenAI is blocked in some regions).
// BLOG_IMAGE_MODEL swaps the first model without a code change.
const DEFAULT_MODEL = "openai/gpt-image-2.6-flare";
const FALLBACK_MODEL = "google/gemini-nano-banana-2.1";
const TIMEOUT_MS = 120_000;

// Articles name the site's brand, and models then paint its logo on bags and
// cups, so packaging is spelled out as plain.
const NO_TEXT =
  "Absolutely no text, words, letters, numbers, logos, brand marks or watermarks, and never render letters or words as objects. Any bags, cups, boxes, labels or signs are plain and unbranded, with no symbols.";

const imageResponseSchema = z.object({
  data: z
    .array(
      z.object({ b64_json: z.string(), media_type: z.string().optional() }),
    )
    .min(1),
  usage: z.object({ cost: z.number() }).optional(),
});

type GeneratedImage = {
  bytes: Uint8Array;
  mediaType: string;
  costUsd: number;
};

/** A header picture for the whole article. */
export function featuredImagePrompt(input: {
  title: string;
  keyword: string;
  customPrompt: string | null;
}) {
  if (input.customPrompt) return `${input.customPrompt}\n${NO_TEXT}`;
  return [
    `A striking, high-quality editorial header image for a blog article titled "${input.title}", about "${input.keyword}".`,
    "Show one concrete, recognisable real-world scene that makes the topic obvious at a glance.",
    "Premium magazine style, natural light, strong composition, rich detail.",
    NO_TEXT,
  ].join(" ");
}

/** A picture for one section, from its heading and a little of its text. */
export function sectionImagePrompt(input: {
  title: string;
  heading: string;
  context: string;
}) {
  const context = input.context.replace(/\s+/g, " ").trim().slice(0, 300);
  return [
    `A striking, high-quality editorial image for one section of a blog article titled "${input.title}".`,
    `The section is about: ${input.heading}. This is not a caption; never write it in the image.`,
    context ? `Background, do not depict literally: ${context}` : "",
    "Show that idea as a single concrete real-world scene or object a reader understands at a glance.",
    "Do not default to hands on a laptop at a desk, and avoid robots and sci-fi cliches unless the section is about them.",
    "Premium magazine style, tasteful colour, strong composition.",
    NO_TEXT,
  ]
    .filter(Boolean)
    .join(" ");
}

function requestBody(
  model: string,
  prompt: string,
  reference: string | null,
): Record<string, unknown> {
  const references = reference
    ? {
        prompt: `${prompt} Match the visual style of the reference image (colour palette, lighting, mood) but not its subject.`,
        input_references: [
          { type: "image_url", image_url: { url: reference } },
        ],
      }
    : { prompt };
  // Only OpenAI's image models take an output format and quality.
  const format = model.startsWith("openai/")
    ? { quality: "medium", output_format: "jpeg", output_compression: 85 }
    : { resolution: "1K" };
  return { model, n: 1, aspect_ratio: "16:9", ...format, ...references };
}

async function callModel(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<GeneratedImage> {
  const response = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      `OpenRouter image ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  const parsed = imageResponseSchema.parse(await response.json());
  const image = parsed.data[0];
  return {
    bytes: Uint8Array.from(atob(image.b64_json), (char) => char.charCodeAt(0)),
    mediaType: image.media_type ?? "image/png",
    costUsd: parsed.usage?.cost ?? 0,
  };
}

/**
 * Generates one 16:9 picture. `reference` is a data URL of a style example.
 * OpenRouter bills only finished pictures, so trying the fallback after a
 * failure doesn't pay twice.
 */
export async function generateImage(
  apiKey: string,
  prompt: string,
  reference: string | null,
): Promise<GeneratedImage> {
  const primary =
    (await getOptionalEnvValue("BLOG_IMAGE_MODEL")) ?? DEFAULT_MODEL;
  let lastError: unknown;
  for (const model of new Set([primary, FALLBACK_MODEL])) {
    try {
      return await callModel(apiKey, requestBody(model, prompt, reference));
    } catch (error) {
      lastError = error;
    }
  }
  console.error("[blog] image generation failed", { error: lastError });
  throw new AppError(
    "UPSTREAM_UNAVAILABLE",
    "Couldn't create the picture right now. Please try again in a minute.",
  );
}

const MAX_ALT_CHARS = 125;

/**
 * A short description of what the picture shows, for its alt text, which
 * Google image search and screen readers read. The model looks at the
 * picture itself, so it can't describe something that isn't there. Null when
 * it can't; callers fall back to the heading. Costs a fraction of a cent.
 */
export async function describeImage(
  apiKey: string,
  image: { bytes: Uint8Array; mediaType: string },
  topic: string,
): Promise<{ alt: string | null; costUsd: number }> {
  let costUsd = 0;
  try {
    const result = await generateText({
      model: buildChatAgentModel(
        apiKey,
        await getOptionalEnvValue("OPENROUTER_MODEL"),
        "low",
      ),
      maxOutputTokens: 600,
      abortSignal: AbortSignal.timeout(45_000),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Write the alt text for this picture in a blog article about "${topic}". One plain sentence under ${MAX_ALT_CHARS} characters saying what the picture shows. Don't start with "Image of" or "Picture of". Answer with the sentence only.`,
            },
            { type: "image", image: image.bytes, mediaType: image.mediaType },
          ],
        },
      ],
      onStepFinish: (step) => {
        costUsd += requireOpenRouterCostUsd(step.providerMetadata);
      },
    });
    const alt = result.text
      .replace(/\s+/g, " ")
      .replace(/^["']|["']$/g, "")
      .trim()
      .slice(0, MAX_ALT_CHARS);
    return { alt: alt || null, costUsd };
  } catch (error) {
    console.error("[blog] picture description failed", { error });
    return { alt: null, costUsd };
  }
}
