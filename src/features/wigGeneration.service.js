import { getErrorMessage, logAppError, logAppEvent } from '../utils/appErrors';

const normalizePreviewOption = (item, index) => ({
  id: item?.id || `variant-${item?.option_index || index + 1}`,
  option_index: Number.isFinite(Number(item?.option_index)) ? Number(item.option_index) : index + 1,
  name: item?.recommended_style_name || item?.name || `Style ${index + 1}`,
  note: item?.note || item?.style_notes || item?.summary || '',
  summary: item?.summary || item?.note || '',
  style_notes: item?.style_notes || item?.note || '',
  family: item?.recommended_style_family || item?.family || '',
  match_label: item?.match_label || item?.matchLabel || `Option ${index + 1}`,
  preview_url: item?.preview_url || item?.generated_image_data_url || item?.generatedImageDataUrl || '',
  generated_image_data_url: item?.generated_image_data_url || item?.generatedImageDataUrl || item?.preview_url || '',
  render_mode: item?.render_mode || item?.renderMode || '',
  selected_wig: item?.selected_wig || item?.selectedWig || null,
  placement: item?.placement || null,
});

const normalizeSelectedWig = (selectedWig = {}) => {
  const physicalSpec = selectedWig?.physical_specification || {};
  const referenceUrl = selectedWig?.thumbnail_url
    || selectedWig?.layer_full_wig_url
    || selectedWig?.layer_front_bangs_url
    || selectedWig?.layer_back_hair_url
    || '';

  return {
    wig_id: selectedWig?.wig_id || selectedWig?.id || null,
    wig_name: selectedWig?.wig_name || physicalSpec?.style || 'Selected wig',
    reference_image_url: referenceUrl,
    physical_specification: {
      color: physicalSpec?.color || selectedWig?.pending_hair_color || '',
      length: physicalSpec?.length ?? selectedWig?.pending_hair_length ?? '',
      hair_texture: physicalSpec?.hair_texture || selectedWig?.pending_hair_texture || '',
      hair_density: physicalSpec?.hair_density || selectedWig?.pending_hair_density || '',
      cap_size: physicalSpec?.cap_size || selectedWig?.pending_cap_size || '',
      style: physicalSpec?.style || selectedWig?.pending_style || '',
    },
  };
};

const normalizePreview = (data) => {
  const rawPreviews = Array.isArray(data?.previews)
    ? data.previews
    : Array.isArray(data?.options)
      ? data.options
      : [];

  const options = rawPreviews
    .map((item, index) => normalizePreviewOption(item, index))
    .filter((item) => item.name || item.note || item.generated_image_data_url);

  const primaryOption = options[0] || null;

  return {
    summary: data?.summary || primaryOption?.summary || '',
    style_notes: data?.style_notes || primaryOption?.style_notes || '',
    recommended_style_name: data?.recommended_style_name || primaryOption?.name || '',
    recommended_style_family: data?.recommended_style_family || primaryOption?.family || '',
    preview_url: data?.preview_url || data?.generated_image_data_url || primaryOption?.preview_url || primaryOption?.generated_image_data_url || '',
    generated_image_data_url: data?.generated_image_data_url || data?.preview_url || primaryOption?.generated_image_data_url || primaryOption?.preview_url || '',
    render_mode: data?.render_mode || primaryOption?.render_mode || '',
    selected_wig: data?.selected_wig || primaryOption?.selected_wig || null,
    placement: data?.placement || primaryOption?.placement || null,
    options,
  };
};

const normalizeReferenceImage = (referenceImage = {}) => {
  const dataUrl = typeof referenceImage?.dataUrl === 'string' ? referenceImage.dataUrl.trim() : '';
  const uri = typeof referenceImage?.uri === 'string' ? referenceImage.uri.trim() : '';

  return {
    dataUrl: dataUrl.startsWith('data:') ? dataUrl : '',
    imageUrl: uri.startsWith('http://') || uri.startsWith('https://') ? uri : '',
  };
};

export const generatePatientWigPreview = async ({ referenceImage, selectedWig }) => {
  try {
    const normalizedReferenceImage = normalizeReferenceImage(referenceImage);
    const normalizedSelectedWig = normalizeSelectedWig(selectedWig);
    if (!normalizedReferenceImage.dataUrl && !normalizedReferenceImage.imageUrl) {
      throw new Error('A front photo is required before generating a wig preview.');
    }
    if (!normalizedSelectedWig.reference_image_url) {
      throw new Error('The selected wig does not have a reference image for preview generation.');
    }

    const localCompositePreviewUrl = referenceImage?.uri || normalizedReferenceImage.imageUrl || normalizedReferenceImage.dataUrl;
    if (selectedWig?.layer_full_wig_url) {
      const option = normalizePreviewOption({
        id: normalizedSelectedWig.wig_id || 'selected-wig-preview',
        option_index: 1,
        name: normalizedSelectedWig.wig_name,
        summary: 'Preview uses your original photo with the selected wig layer placed on the head.',
        style_notes: 'The original photo is retained. The wig layer comes from the selected database wig asset.',
        match_label: 'Selected',
        preview_url: localCompositePreviewUrl,
        generated_image_data_url: localCompositePreviewUrl,
        render_mode: 'wig_overlay',
        selected_wig: selectedWig,
        placement: referenceImage?.placement || null,
      }, 0);

      const preview = normalizePreview({
        summary: option.summary,
        style_notes: option.style_notes,
        recommended_style_name: normalizedSelectedWig.wig_name,
        recommended_style_family: [
          normalizedSelectedWig.physical_specification?.style,
          normalizedSelectedWig.physical_specification?.color,
        ].filter(Boolean).join(' - '),
        preview_url: localCompositePreviewUrl,
        generated_image_data_url: localCompositePreviewUrl,
        render_mode: 'wig_overlay',
        selected_wig: selectedWig,
        placement: referenceImage?.placement || null,
        previews: [option],
      });

      logAppEvent('wigGeneration.localComposite', 'Prepared wig overlay preview from original photo.', {
        selectedWigId: normalizedSelectedWig.wig_id,
        hasFullWigLayer: Boolean(selectedWig?.layer_full_wig_url),
        hasFrontLayer: Boolean(selectedWig?.layer_front_bangs_url),
        hasBackLayer: Boolean(selectedWig?.layer_back_hair_url),
      });

      return {
        preview,
        previews: preview.options,
        error: null,
      };
    }
    throw new Error('The selected wig does not have a main transparent wig layer for preview alignment.');
  } catch (error) {
    const resolvedMessage = getErrorMessage(error);
    const technicalMessage = resolvedMessage.toLowerCase();
    if (
      !technicalMessage.includes('requested function was not found')
      && !technicalMessage.includes('not_found')
      && !technicalMessage.includes('invalid jwt')
    ) {
      logAppError('wigGeneration.generatePatientWigPreview', error, {
        hasReferenceImage: Boolean(referenceImage?.uri || referenceImage?.dataUrl),
      });
    }

    const userMessage = technicalMessage.includes('front photo')
      ? 'Please upload a clear front photo first.'
      : technicalMessage.includes('invalid jwt')
        ? 'Your session has expired. Please sign in again, then retry the wig preview.'
        : technicalMessage.includes('not configured') || technicalMessage.includes('google ai api key')
          ? 'Wig preview is not configured on the server. Please try again later.'
        : technicalMessage.includes('openai api key')
          ? 'Wig preview is not configured on the server. Please try again later.'
        : technicalMessage.includes('requested function was not found') || technicalMessage.includes('not_found')
          ? 'Wig preview is still being connected on the server. Please try again in a moment.'
          : technicalMessage.includes('selected wig') || technicalMessage.includes('reference image')
            ? 'Choose a wig with a valid reference image first.'
            : technicalMessage.includes('incomplete')
              ? "We couldn't prepare your wig preview. Please try again or choose another photo."
              : "We couldn't prepare your wig preview. Please try again or choose another photo.";

    return {
      preview: null,
      error: userMessage,
    };
  }
};
