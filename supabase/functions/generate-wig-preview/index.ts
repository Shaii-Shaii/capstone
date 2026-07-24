import { createJsonResponse, handleCorsPreflight } from '../_shared/cors.ts';

const MAX_PREVIEW_VARIANTS = 1;
const CLOUDFLARE_AI_API_URL = 'https://api.cloudflare.com/client/v4/accounts';
const CLOUDFLARE_WIG_IMAGE_MODEL = Deno.env.get('CLOUDFLARE_AI_MODEL')
  || '@cf/black-forest-labs/flux-2-klein-4b';
const CLOUDFLARE_OUTPUT_SIZE = Deno.env.get('CLOUDFLARE_AI_IMAGE_SIZE') || '768';
const CLOUDFLARE_STEPS = Deno.env.get('CLOUDFLARE_AI_STEPS') || '12';

const toText = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const toSafeErrorMessage = (value: string) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .slice(0, 500);
};

const getSelectedWigReferenceUrl = (selectedWig: Record<string, unknown>) => (
  toText(selectedWig?.reference_image_url)
  || toText(selectedWig?.thumbnail_url)
  || toText(selectedWig?.layer_full_wig_url)
  || toText(selectedWig?.layer_front_bangs_url)
  || toText(selectedWig?.layer_back_hair_url)
);

const getPatientImageUrl = (referenceImage: Record<string, unknown>) => (
  toText(referenceImage?.dataUrl)
  || toText(referenceImage?.imageUrl)
  || toText(referenceImage?.uri)
);

const extractMimeTypeFromDataUrl = (value: string) => {
  const match = /^data:([^;]+);base64,/i.exec(value || '');
  return match?.[1] || '';
};

const extractBase64Payload = (value: string) => {
  const commaIndex = value.indexOf(',');
  return commaIndex >= 0 ? value.slice(commaIndex + 1) : '';
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

const loadImageUpload = async (imageUrl: string, label: string) => {
  if (imageUrl.startsWith('data:')) {
    const mimeType = extractMimeTypeFromDataUrl(imageUrl) || 'image/jpeg';
    const data = extractBase64Payload(imageUrl);
    if (!data) throw new Error(`${label} image data is empty.`);
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    return {
      blob: new Blob([bytes], { type: mimeType }),
      filename: `${label.replace(/\s+/g, '-')}.${extension}`,
      mimeType,
    };
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Unable to load ${label} image reference.`);
    }
    const mimeType = response.headers.get('content-type') || 'image/png';
    const extension = mimeType.includes('png') ? 'png' : 'jpg';
    return {
      blob: new Blob([await response.arrayBuffer()], { type: mimeType }),
      filename: `${label.replace(/\s+/g, '-')}.${extension}`,
      mimeType,
    };
  }

  throw new Error(`${label} image reference is not accessible to the server.`);
};

const extractProviderError = async (response: Response) => {
  try {
    const payload = await response.clone().json();
    const firstError = Array.isArray(payload?.errors) ? payload.errors[0] : null;
    const message = payload?.error?.message || firstError?.message || payload?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  } catch {
    // Fall through to text parsing.
  }

  try {
    const text = await response.clone().text();
    if (text?.trim()) return text.trim();
  } catch {
    // Fall through to generic message.
  }

  return 'AI image generation request failed.';
};

const createCloudflareWigImage = async ({
  prompt,
  patientImageUrl,
  wigReferenceUrl,
  model,
}: {
  prompt: string;
  patientImageUrl: string;
  wigReferenceUrl: string;
  model: string;
}) => {
  const accountId = (Deno.env.get('CLOUDFLARE_ACCOUNT_ID') || '').trim();
  const apiToken = (Deno.env.get('CLOUDFLARE_API_TOKEN') || '').trim();
  if (!accountId || !apiToken) {
    throw new Error('Cloudflare Workers AI credentials are not configured in Edge Function Secrets.');
  }

  const [patientImage, wigImage] = await Promise.all([
    loadImageUpload(patientImageUrl, 'patient'),
    loadImageUpload(wigReferenceUrl, 'wig reference'),
  ]);

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('width', CLOUDFLARE_OUTPUT_SIZE);
  form.append('height', CLOUDFLARE_OUTPUT_SIZE);
  form.append('steps', CLOUDFLARE_STEPS);
  form.append('strength', '0.35');
  form.append('guidance', '3.5');
  form.append('image', patientImage.blob, patientImage.filename);
  form.append('image', wigImage.blob, wigImage.filename);
  form.append('input_image', patientImage.blob, patientImage.filename);
  form.append('reference_image', wigImage.blob, wigImage.filename);

  const endpoint = `${CLOUDFLARE_AI_API_URL}/${encodeURIComponent(accountId)}/ai/run/${model}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(await extractProviderError(response));
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.startsWith('image/')) {
    const data = arrayBufferToBase64(await response.arrayBuffer());
    return {
      imageDataUrl: `data:${contentType};base64,${data}`,
      model,
      raw: null,
    };
  }

  const payload = await response.json();
  const image = toText(payload?.result?.image) || toText(payload?.image);
  if (!image) {
    throw new Error(`Cloudflare Workers AI model ${model} returned no generated image.`);
  }

  return {
    imageDataUrl: image.startsWith('data:') ? image : `data:image/png;base64,${image}`,
    model,
    raw: payload,
  };
};

const getWigSpecValue = (
  selectedWig: Record<string, unknown>,
  key: string,
  fallback = '',
) => {
  const spec = selectedWig?.physical_specification as Record<string, unknown> | undefined;
  return toText(spec?.[key]) || fallback;
};

const buildCompositePrompt = ({
  preferredColor,
  preferredLength,
  hairTexture,
  hairDensity,
  capSize,
  stylePreference,
  notes,
  selectedWig,
}: {
  preferredColor: string;
  preferredLength: string;
  hairTexture: string;
  hairDensity: string;
  capSize: string;
  stylePreference: string;
  notes: string;
  selectedWig: Record<string, unknown>;
}) => {
  const wigName = toText(selectedWig?.wig_name) || 'selected wig';
  const wigColor = getWigSpecValue(selectedWig, 'color', preferredColor || 'match the selected wig reference');
  const wigLength = getWigSpecValue(selectedWig, 'length', preferredLength || 'match the selected wig reference');
  const wigTexture = getWigSpecValue(selectedWig, 'hair_texture', hairTexture || 'match the selected wig reference');
  const wigDensity = getWigSpecValue(selectedWig, 'hair_density', hairDensity || 'match the selected wig reference');
  const wigStyle = getWigSpecValue(selectedWig, 'style', stylePreference || 'match the selected wig reference');

  return [
    'Perform an image-to-image edit, not text-to-image generation.',
    'Use Image 1 as the exact base canvas and final composition. Image 1 is the patient photo.',
    'Use Image 2 only as the selected wig reference.',
    'Do not create a new person, new face, new portrait, new background, or new camera angle.',
    'The output must keep the same person from Image 1 in the same pose, crop, room, lighting, clothing, and expression.',
    '',
    'Primary objective: replace only the patient hairstyle with the selected wig. Everything else must remain unchanged.',
    '',
    'Identity preservation requirements:',
    'Do not modify the patient face shape, jawline, cheekbones, chin, eyes, eye color, eyebrows, nose, lips, teeth, skin texture, skin tone, expression, facial proportions, neck, shoulders, body, clothing, jewelry, glasses, earrings, background, camera angle, lighting, or image quality.',
    'Do not beautify, slim the face, enlarge eyes, apply makeup, remove blemishes, recolor skin, add accessories, change composition, or crop differently.',
    '',
    'Analyze the patient photo for head size, head width and height, skull shape, hairline, forehead, temples, ear position, neck position, face orientation, head rotation, camera perspective, existing hair volume, visible hair, and occluded areas. Do not assume symmetry; analyze each side independently.',
    '',
    'Analyze the selected wig for shape, length, volume, density, texture, straightness, waves, curls, layers, bangs or fringe, side or middle part, crown position, hairline design, color, shine, root transition, and thickness.',
    '',
    'Place the selected wig naturally on the patient head. Resize, rotate, warp, bend, scale, and adjust perspective so it wraps around the head and never appears pasted on.',
    'Blend the hairline into the scalp with natural forehead exposure, temple transitions, sideburns, root appearance, and no visible cut lines, floating edges, hard borders, halo, white outline, black outline, jagged edge, or sticker effect.',
    'Hair strands may overlap the forehead, ears, neck, and shoulders where physically appropriate.',
    '',
    'Match the original patient photo lighting: brightness, contrast, white balance, color temperature, ambient light, directional light, shadows, highlights, camera distance, lens perspective, and image quality.',
    'Generate realistic soft shadows from hair to face, ears, neck, and shoulders where needed.',
    '',
    'Preserve the selected wig color and texture faithfully, adjusting only enough to match the patient photo lighting and exposure. Preserve natural strands, flyaways, layering, curls or waves, and density. Avoid plastic, CGI, cartoon, filter, AR overlay, or Photoshop-like results.',
    'Remove or cover the original hairstyle naturally where the wig overlaps. Do not allow both hairstyles to remain visible unless the selected wig placement would physically reveal a small area.',
    '',
    `Selected wig: ${wigName}.`,
    `Wig specification: color ${wigColor}; length ${wigLength}; texture ${wigTexture}; density ${wigDensity}; cap size ${capSize || 'not provided'}; style ${wigStyle}.`,
    notes ? `Patient notes: ${notes}.` : '',
    '',
    'Final output: a single high-resolution realistic photograph of the same patient naturally wearing the selected wig. Only the hairstyle should be changed.',
  ].filter(Boolean).join('\n');
};

const buildPreviewPayload = ({
  generatedImageUrl,
  selectedWig,
  prompt,
}: {
  generatedImageUrl: string;
  selectedWig: Record<string, unknown>;
  prompt: string;
}) => {
  const wigName = toText(selectedWig?.wig_name) || 'Selected wig';
  const wigId = toText(selectedWig?.wig_id) || toText(selectedWig?.id) || null;
  const family = [
    getWigSpecValue(selectedWig, 'style'),
    getWigSpecValue(selectedWig, 'color'),
  ].filter(Boolean).join(' - ') || 'Selected wig';

  const preview = {
    id: wigId || 'selected-wig-preview',
    option_index: 1,
    generated_image_data_url: generatedImageUrl,
    preview_url: generatedImageUrl,
    summary: 'Photorealistic try-on using your uploaded photo and selected wig.',
    style_notes: 'Only the hairstyle was intended to be changed. Face, clothing, lighting, and background are preserved.',
    recommended_style_name: wigName,
    recommended_style_family: family,
    match_label: 'Selected',
    image_prompt_hint: prompt,
    selected_wig_id: wigId,
  };

  const option = {
    id: preview.id,
    option_index: preview.option_index,
    name: preview.recommended_style_name,
    note: preview.style_notes,
    summary: preview.summary,
    style_notes: preview.style_notes,
    family: preview.recommended_style_family,
    match_label: preview.match_label,
    generated_image_data_url: preview.generated_image_data_url,
    preview_url: preview.preview_url,
  };

  return {
    preview_url: generatedImageUrl,
    generated_image_data_url: generatedImageUrl,
    preview: {
      ...preview,
      options: [option],
    },
    previews: [preview],
    selected_preview_url: generatedImageUrl,
  };
};

Deno.serve(async (request) => {
  const preflightResponse = handleCorsPreflight(request);
  if (preflightResponse) return preflightResponse;

  try {
    const body = await request.json();
    const preferredColor = toText(body?.preferred_color);
    const preferredLength = toText(body?.preferred_length);
    const hairTexture = toText(body?.hair_texture);
    const hairDensity = toText(body?.hair_density);
    const capSize = toText(body?.cap_size);
    const stylePreference = toText(body?.style_preference);
    const notes = toText(body?.notes);
    const referenceImage = (body?.reference_image || {}) as Record<string, unknown>;
    const selectedWig = (body?.selected_wig || {}) as Record<string, unknown>;
    const patientImageUrl = getPatientImageUrl(referenceImage);
    const wigReferenceUrl = getSelectedWigReferenceUrl(selectedWig);
    const hasCloudflareCredentials = Boolean(
      Deno.env.get('CLOUDFLARE_ACCOUNT_ID') && Deno.env.get('CLOUDFLARE_API_TOKEN'),
    );
    const model = CLOUDFLARE_WIG_IMAGE_MODEL;

    if (!patientImageUrl) {
      return createJsonResponse({ error: 'A front photo is required before generating a wig preview.' }, 400);
    }

    if (!wigReferenceUrl) {
      return createJsonResponse({ error: 'A selected wig reference image is required before generating a wig preview.' }, 400);
    }

    console.info('[generate-wig-preview] invoked', {
      provider: 'cloudflare',
      model,
      hasCloudflareCredentials,
      hasPatientDataUrl: patientImageUrl.startsWith('data:'),
      hasPatientImageUrl: /^https?:\/\//i.test(patientImageUrl),
      hasWigReferenceUrl: Boolean(wigReferenceUrl),
      selectedWigId: selectedWig?.wig_id || selectedWig?.id || null,
    });

    if (!hasCloudflareCredentials) {
      console.error('[generate-wig-preview] cloudflare credentials missing');
      return createJsonResponse({
        error: 'Wig preview is not configured on the server. Please try again later.',
        errorType: 'configuration_error',
        provider: 'cloudflare',
      }, 500);
    }

    const prompt = buildCompositePrompt({
      preferredColor,
      preferredLength,
      hairTexture,
      hairDensity,
      capSize,
      stylePreference,
      notes,
      selectedWig,
    });

    const generated = await createCloudflareWigImage({
      prompt,
      patientImageUrl,
      wigReferenceUrl,
      model,
    });

    const generatedImageUrl = generated.imageDataUrl || '';
    if (!generatedImageUrl) {
      throw new Error('Cloudflare Workers AI returned no generated wig preview.');
    }

    const payload = buildPreviewPayload({
      generatedImageUrl,
      selectedWig,
      prompt,
    });

    console.info('[generate-wig-preview] image response ready', {
      provider: 'cloudflare',
      model: generated.model || model,
      previewCount: MAX_PREVIEW_VARIANTS,
      hasGeneratedImage: Boolean(generatedImageUrl),
    });

    return createJsonResponse({
      success: true,
      provider: 'cloudflare',
      model: generated.model || model,
      ...payload,
    });
  } catch (error) {
    console.error('[generate-wig-preview]', error);
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    const normalizedMessage = errorMessage.toLowerCase();
    const isConfigurationError = normalizedMessage.includes('cloudflare workers ai credentials');
    const safeErrorMessage = toSafeErrorMessage(errorMessage);

    return createJsonResponse({
      error: isConfigurationError
        ? 'Wig preview is not configured on the server. Please try again later.'
        : 'We could not generate the wig preview right now. Please try again.',
      message: safeErrorMessage,
      errorType: isConfigurationError ? 'configuration_error' : 'provider_error',
      provider: 'cloudflare',
    }, isConfigurationError ? 500 : 502);
  }
});
