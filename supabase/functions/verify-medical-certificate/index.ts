const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OCR_PROVIDER_TIMEOUT_MS = 15000;

const normalizeText = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const extractDoctorName = (text = '') => {
  const match = normalizeText(text).match(/(?:dr\.?|doctor|physician)\s+([a-z][a-z\s.,-]{2,80})/i);
  return match?.[1]?.replace(/\b(prc|license|lic|ptr|md)\b.*$/i, '').trim() || '';
};

const extractLicenseNumber = (text = '') => {
  const normalized = normalizeText(text);
  const patterns = [
    /\b(?:prc|license|lic\.?|registration)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([a-z0-9-]{4,24})/i,
    /\b(?:medical\s+license)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([a-z0-9-]{4,24})/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return match[1].replace(/[^a-z0-9-]/gi, '').toUpperCase();
  }
  return '';
};

const validateCertificateText = (text = '') => {
  const normalized = normalizeText(text);
  const doctorName = extractDoctorName(normalized);
  const licenseNumber = extractLicenseNumber(normalized);
  const hasCertificateKeyword = /\b(medical certificate|certificate|certification|clinical abstract|doctor'?s certificate)\b/i.test(normalized);
  const hasDiagnosisKeyword = /\b(cancer|oncology|chemotherapy|alopecia|diagnosis|diagnosed|medical condition|patient)\b/i.test(normalized);
  const missing: string[] = [];

  if (!hasCertificateKeyword) missing.push('medical certificate label');
  if (!doctorName) missing.push('doctor name');
  if (!licenseNumber) missing.push('PRC/license number');
  if (!hasDiagnosisKeyword) missing.push('diagnosis or medical condition');

  return {
    passed: missing.length === 0,
    status: missing.length === 0 ? 'ocr_passed_prc_pending' : 'ocr_failed',
    missing,
    doctor_name: doctorName,
    license_number: licenseNumber,
    extracted_text: normalized,
    document_legitimacy: 'requires_prc_staff_review',
  };
};

const runOcrSpace = async (documentUrl: string) => {
  const apiKey = Deno.env.get('OCR_SPACE_API_KEY') || '';
  if (!apiKey) {
    throw new Error('OCR_SPACE_API_KEY is not configured in edge function secrets.');
  }

  const formData = new FormData();
  formData.set('url', documentUrl);
  formData.set('language', 'eng');
  formData.set('isOverlayRequired', 'false');
  formData.set('OCREngine', '2');
  formData.set('scale', 'true');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_PROVIDER_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: apiKey },
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('OCR provider timed out. Please scan a clearer document or try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`OCR provider returned ${response.status}.`);
  }

  const payload = await response.json();
  if (payload?.IsErroredOnProcessing) {
    throw new Error(payload?.ErrorMessage?.[0] || 'OCR provider could not process the certificate.');
  }

  return (payload?.ParsedResults || [])
    .map((page: { ParsedText?: string }) => page?.ParsedText || '')
    .join('\n');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const documentUrl = normalizeText(body?.document_url || body?.documentUrl || '');
    if (!documentUrl) {
      return new Response(JSON.stringify({ error: 'document_url is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const extractedText = await runOcrSpace(documentUrl);
    const validation = validateCertificateText(extractedText);

    return new Response(JSON.stringify({
      provider: 'ocr.space',
      ...validation,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Medical certificate OCR failed.',
    }), {
      status: 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
