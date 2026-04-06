import { useCallback, useEffect, useState } from 'react';
import {
  generateDonorCertificatePdf,
  getLatestQualifiedDonationCertificate,
  isCertificateSharingSupported,
  shareDonorCertificatePdf,
} from '../features/donorCertificate.service';

export const useDonorCertificate = ({ userId, profile }) => {
  const [certificate, setCertificate] = useState(null);
  const [generatedFileUri, setGeneratedFileUri] = useState('');
  const [isLoadingCertificate, setIsLoadingCertificate] = useState(false);
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false);
  const [isSharingAvailable, setIsSharingAvailable] = useState(false);
  const [certificateError, setCertificateError] = useState(null);

  const refreshCertificate = useCallback(async () => {
    setIsLoadingCertificate(true);
    setCertificateError(null);

    const result = await getLatestQualifiedDonationCertificate({ userId, profile });

    setIsLoadingCertificate(false);
    setCertificate(result.certificate);
    setGeneratedFileUri('');

    if (result.error) {
      setCertificateError(result.error);
      return { success: false, error: result.error };
    }

    return { success: true, certificate: result.certificate };
  }, [profile, userId]);

  useEffect(() => {
    let isMounted = true;

    const loadCapabilities = async () => {
      const sharingSupported = await isCertificateSharingSupported();
      if (isMounted) {
        setIsSharingAvailable(sharingSupported);
      }
    };

    loadCapabilities();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    refreshCertificate();
  }, [refreshCertificate, userId]);

  const generateCertificate = async () => {
    try {
      if (!certificate) {
        throw new Error('No qualified donation certificate is ready yet.');
      }

      setIsGeneratingCertificate(true);
      setCertificateError(null);

      const file = await generateDonorCertificatePdf(certificate);

      setGeneratedFileUri(file.uri);
      setIsGeneratingCertificate(false);

      return { success: true, uri: file.uri };
    } catch (error) {
      setIsGeneratingCertificate(false);
      setCertificateError(error.message || 'Unable to generate the donor certificate.');
      return { success: false, error: error.message || 'Unable to generate the donor certificate.' };
    }
  };

  const shareCertificate = async () => {
    try {
      if (!isSharingAvailable) {
        throw new Error('Sharing is not available on this device.');
      }

      const fileUri = generatedFileUri || (await generateCertificate()).uri;
      if (!fileUri) {
        throw new Error('Unable to prepare the donor certificate file.');
      }

      await shareDonorCertificatePdf(fileUri);
      return { success: true };
    } catch (error) {
      setCertificateError(error.message || 'Unable to share the donor certificate.');
      return { success: false, error: error.message || 'Unable to share the donor certificate.' };
    }
  };

  return {
    certificate,
    generatedFileUri,
    isLoadingCertificate,
    isGeneratingCertificate,
    isSharingAvailable,
    certificateError,
    refreshCertificate,
    generateCertificate,
    shareCertificate,
  };
};
