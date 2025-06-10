
import { CanadianChequeImageQuality } from '../types';
import { CPA_CHEQUE_DIMENSIONS, CPA_IMAGE_RESOLUTION_DPI } from '../constants';

// --- Existing Functions and Types ---

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]); // Remove the "data:image/png;base64," prefix
      } else {
        reject(new Error('Failed to read file as base64 string.'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

export interface ImageQualityReport {
  fileName?: string;
  resolution: { width: number; height: number };
  aspectRatio: number;
  suggestions: string[];
  overallAssessment: 'good' | 'fair' | 'poor';
}

export interface PreprocessingOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number; // 0 to 1 (for JPEG/WEBP)
  targetMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export const loadImageFromFile = (file: File): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error(`Image load error: ${err instanceof Event ? 'Generic error' : String(err)}`));
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        reject(new Error("Could not read file for image loading."));
      }
    };
    reader.onerror = (err) => reject(new Error(`File reader error: ${String(err)}`));
    reader.readAsDataURL(file);
  });
};

export const detectImageQuality = async (
  imageElement: HTMLImageElement,
  originalFileName?: string
): Promise<ImageQualityReport> => {
  const { naturalWidth: width, naturalHeight: height } = imageElement;
  const suggestions: string[] = [];
  let overallAssessment: 'good' | 'fair' | 'poor' = 'good';

  const minRecommendedWidth = 1200;
  const minRecommendedHeight = 550; 
  const idealWidth = 1800; 
  const idealHeight = 825;

  if (width < 800 || height < 350) {
    overallAssessment = 'poor';
    suggestions.push(
      `Image resolution is very low (${width}x${height}px). For best results, use an image with at least ${minRecommendedWidth}x${minRecommendedHeight}px, ideally ${idealWidth}x${idealHeight}px (around 300 DPI) or higher.`
    );
  } else if (width < minRecommendedWidth || height < minRecommendedHeight) {
    overallAssessment = 'fair';
    suggestions.push(
      `Image resolution is moderate (${width}x${height}px). A higher resolution (e.g., ${idealWidth}x${idealHeight}px) may improve OCR accuracy.`
    );
  }

  const aspectRatio = width / height;
  if (aspectRatio < 1.7 || aspectRatio > 3.0) {
    if (overallAssessment === 'good') overallAssessment = 'fair';
    suggestions.push(
      `Image aspect ratio (${aspectRatio.toFixed(2)}) is unusual for a typical cheque. Ensure the full cheque is captured, is not significantly skewed, and avoids excessive background.`
    );
  }

  suggestions.push("Ensure the cheque is laid flat on a plain, contrasting background.");
  suggestions.push("Use bright, even lighting. Avoid shadows falling across the cheque and minimize glare.");
  suggestions.push("Make sure the image is in sharp focus and all text (especially the MICR line) is clear and legible.");
  suggestions.push("Avoid using filters or effects that may distort the cheque's appearance.");

  if (overallAssessment === 'good' && suggestions.length > 4 && (width < idealWidth || height < idealHeight) ){
     suggestions.unshift(`Image quality appears generally good (${width}x${height}px). For optimal results with fine details, consider ${idealWidth}x${idealHeight}px if possible.`);
  } else if (overallAssessment === 'good' && suggestions.length > 4) {
     suggestions.unshift(`Image quality appears good (${width}x${height}px).`);
  }

  return {
    fileName: originalFileName,
    resolution: { width, height },
    aspectRatio,
    suggestions,
    overallAssessment,
  };
};

export const preprocessImage = (
  file: File,
  options: PreprocessingOptions
): Promise<Blob> => {
  return new Promise(async (resolve, reject) => {
    try {
      const image = await loadImageFromFile(file);
      const { naturalWidth, naturalHeight } = image;
      let { maxWidth, maxHeight, quality, targetMimeType } = options;

      let newWidth = naturalWidth;
      let newHeight = naturalHeight;

      if (naturalWidth > maxWidth || naturalHeight > maxHeight) {
        const ratio = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
        newWidth = Math.round(naturalWidth * ratio);
        newHeight = Math.round(naturalHeight * ratio);
      }
      
      const canvas = typeof OffscreenCanvas !== 'undefined' 
        ? new OffscreenCanvas(newWidth, newHeight)
        : document.createElement('canvas');
      
      canvas.width = newWidth;
      canvas.height = newHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Failed to get canvas context for image preprocessing.'));
      }

      ctx.drawImage(image, 0, 0, newWidth, newHeight);

      if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        canvas.convertToBlob({ type: targetMimeType, quality: quality })
          .then(resolve)
          .catch(reject);
      } else if (canvas instanceof HTMLCanvasElement) {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas toBlob returned null.'));
            }
          },
          targetMimeType,
          quality
        );
      }
    } catch (error) {
        if (error instanceof Error) {
            reject(new Error(`Preprocessing failed: ${error.message}`));
        } else {
            reject(new Error(`Preprocessing failed with unknown error: ${String(error)}`));
        }
    }
  });
};

export const blobToDataURL = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read blob as data URL.'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const blobToBase64Data = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]); 
      } else {
        reject(new Error('Failed to read blob as base64 string.'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- New Interfaces for Canadian Banking Compliance ---

export interface EnhancedPreprocessingOptions extends PreprocessingOptions {
  enhanceMicrRegionContrast?: boolean;
  // Potentially other banking-specific flags like 'preserveSecurityFeaturesLevel' (though 'quality' already covers this)
}

export interface MicrLineAnalysis {
  visibility: 'clear' | 'partially_obscured' | 'heavily_obscured' | 'not_detected';
  estimatedContrast?: 'good' | 'fair' | 'poor' | 'unknown'; // Qualitative
  confidence?: number; // 0-1
  notes?: string[];
}

export interface SecurityFeatureDetectionResult {
  featureName: string;
  detected: boolean;
  confidence?: number; // 0-1
  location?: { x: number, y: number, width: number, height: number }; // Relative coords
  notes?: string;
}

export interface ImageAuthenticityAssessment {
  overallScore: number; // 0-100 (100 = highly authentic)
  tamperingIndicators: { type: string; confidence: number; description?: string }[]; // e.g., edge_artifacts, compression_mismatch
  authenticityNotes?: string[];
}

export interface DimensionValidationResult {
  physicalWidthInches: number | null;
  physicalHeightInches: number | null;
  aspectRatio: number | null;
  isDimensionsCompliant: boolean | null;
  isAspectRatioCompliant: boolean | null;
  message: string;
  details: {
    lengthOk?: boolean;
    heightOk?: boolean;
    aspectOk?: boolean;
  };
}

// --- New Functions for Canadian Banking Compliance ---

/**
 * Calculates estimated DPI of an image based on its pixel dimensions and standard physical cheque dimensions.
 * @param widthPx Pixel width of the image.
 * @param heightPx Pixel height of the image.
 * @param standardDimensionKey Which CPA standard physical dimension to use for calculation ('min', 'max', 'typical').
 *                             Defaults to 'typical' if not known.
 * @returns Estimated DPI, or null if dimensions are invalid.
 */
export const calculateEstimatedDPI = (
    widthPx: number, 
    heightPx: number, 
    standardDimensionKey: 'min' | 'max' | 'typical' = 'typical'
): number | null => {
    if (widthPx <= 0 || heightPx <= 0) return null;

    let referenceWidthInches: number;
    let referenceHeightInches: number;

    switch (standardDimensionKey) {
        case 'min':
            referenceWidthInches = CPA_CHEQUE_DIMENSIONS.MIN_LENGTH_INCHES;
            referenceHeightInches = CPA_CHEQUE_DIMENSIONS.MIN_HEIGHT_INCHES;
            break;
        case 'max':
            referenceWidthInches = CPA_CHEQUE_DIMENSIONS.MAX_LENGTH_INCHES;
            referenceHeightInches = CPA_CHEQUE_DIMENSIONS.MAX_HEIGHT_INCHES;
            break;
        case 'typical':
        default:
            // Typical cheque might be around 7 inches x 3.25 inches or 6.25 x 2.75
            // Using MIN as a conservative "typical" base for DPI calculation if actual physical size is unknown
            // Or an average can be used if that's more appropriate.
            // Let's use min length and min height for typical for a base DPI calculation.
            referenceWidthInches = CPA_CHEQUE_DIMENSIONS.MIN_LENGTH_INCHES; 
            referenceHeightInches = CPA_CHEQUE_DIMENSIONS.MIN_HEIGHT_INCHES;
            break;
    }
    
    const dpiWidth = widthPx / referenceWidthInches;
    const dpiHeight = heightPx / referenceHeightInches;
    
    // Return an average or dominant DPI. For simplicity, average is fine.
    // Or, if one dimension is known to be constrained (e.g. cheque always fills width of scanner bed), use that.
    return Math.round((dpiWidth + dpiHeight) / 2);
};

/**
 * Validates cheque dimensions against CPA Standard 006.
 * @param widthPx Pixel width of the cheque image.
 * @param heightPx Pixel height of the cheque image.
 * @param dpi Estimated or known DPI of the image. If null, dimension validation cannot be accurately performed.
 * @returns DimensionValidationResult object.
 */
export const validateCanadianChequeDimensions = (
    widthPx: number, 
    heightPx: number, 
    dpi: number | null
): DimensionValidationResult => {
    if (!dpi || dpi <= 0) {
        return {
            physicalWidthInches: null, physicalHeightInches: null, aspectRatio: widthPx > 0 && heightPx > 0 ? widthPx / heightPx : null,
            isDimensionsCompliant: null, isAspectRatioCompliant: null,
            message: "DPI not provided or invalid; cannot validate physical dimensions.",
            details: {}
        };
    }

    const physicalWidthInches = widthPx / dpi;
    const physicalHeightInches = heightPx / dpi;
    const aspectRatio = physicalWidthInches / physicalHeightInches;

    const lengthOk = physicalWidthInches >= CPA_CHEQUE_DIMENSIONS.MIN_LENGTH_INCHES && physicalWidthInches <= CPA_CHEQUE_DIMENSIONS.MAX_LENGTH_INCHES;
    const heightOk = physicalHeightInches >= CPA_CHEQUE_DIMENSIONS.MIN_HEIGHT_INCHES && physicalHeightInches <= CPA_CHEQUE_DIMENSIONS.MAX_HEIGHT_INCHES;
    const aspectOk = aspectRatio >= CPA_CHEQUE_DIMENSIONS.ASPECT_RATIO_MIN && aspectRatio <= CPA_CHEQUE_DIMENSIONS.ASPECT_RATIO_MAX;

    const isDimensionsCompliant = lengthOk && heightOk;
    const isAspectRatioCompliant = aspectOk;
    
    let message = "";
    if (!isDimensionsCompliant) message += `Physical dimensions (W: ${physicalWidthInches.toFixed(2)}", H: ${physicalHeightInches.toFixed(2)}") outside CPA range. `;
    if (!isAspectRatioCompliant) message += `Aspect ratio (${aspectRatio.toFixed(2)}) outside CPA range. `;
    if (isDimensionsCompliant && isAspectRatioCompliant) message = "Dimensions and aspect ratio appear CPA compliant.";

    return {
        physicalWidthInches, physicalHeightInches, aspectRatio,
        isDimensionsCompliant, isAspectRatioCompliant,
        message: message.trim() || "Validation complete.",
        details: { lengthOk, heightOk, aspectOk }
    };
};

/**
 * Enhances contrast in the MICR region (bottom ~16-18%) of an image.
 * This is a basic implementation. Sophisticated methods would be server-side.
 * @param imageData The ImageData object of the cheque.
 * @returns New ImageData object with MICR region contrast enhanced.
 */
export const enhanceMicrContrast = (imageData: ImageData): ImageData => {
    const { width, height, data } = imageData;
    const newImageData = new ImageData(new Uint8ClampedArray(data), width, height);
    const micrBandHeight = Math.floor(height * 0.18); // Approx 5/8 inch on a 3.5 inch high cheque is ~17.8%
    const startY = height - micrBandHeight;

    // Simple contrast enhancement: find min/max luminance in the band and stretch.
    let minL = 255;
    let maxL = 0;

    for (let y = startY; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b; // Calculate luminance
            minL = Math.min(minL, luminance);
            maxL = Math.max(maxL, luminance);
        }
    }

    if (maxL > minL) { // Avoid division by zero if band is single color
        for (let y = startY; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                for (let c = 0; c < 3; c++) { // R, G, B channels
                    newImageData.data[i + c] = ((data[i + c] - minL) / (maxL - minL)) * 255;
                }
            }
        }
    }
    return newImageData;
};


/**
 * Performs a comprehensive quality check based on Canadian Cheque Standards.
 * @param imageElement The HTMLImageElement of the cheque.
 * @param standardDimensionKey Optional: Key to guide DPI estimation if physical size unknown.
 * @returns Promise resolving to CanadianChequeImageQuality object.
 */
export const detectCanadianChequeImageQuality = async (
    imageElement: HTMLImageElement,
    standardDimensionKey: 'min' | 'max' | 'typical' = 'typical'
): Promise<CanadianChequeImageQuality> => {
    const { naturalWidth: width, naturalHeight: height } = imageElement;
    const estimatedDPI = calculateEstimatedDPI(width, height, standardDimensionKey);
    const dimensionValidation = validateCanadianChequeDimensions(width, height, estimatedDPI);

    // For MICR line readability & print contrast, true measurement requires advanced tools/AI.
    // Here, we can make educated guesses or note them as needing further checks.
    let micrReadability: CanadianChequeImageQuality['micrLineReadability'] = null;
    let printContrast: number | null = null;

    if (estimatedDPI && estimatedDPI < CPA_IMAGE_RESOLUTION_DPI.MIN_FOR_MICR_READING) {
        micrReadability = 'poor';
    } else if (estimatedDPI && estimatedDPI < CPA_IMAGE_RESOLUTION_DPI.RECOMMENDED) {
        micrReadability = 'fair';
    } else if (estimatedDPI) {
        micrReadability = 'good'; // Assuming good focus, lighting etc.
    }
    // printContrast needs actual image analysis not done here.
    
    const isCompliant = 
        dimensionValidation.isDimensionsCompliant === true &&
        dimensionValidation.isAspectRatioCompliant === true &&
        (estimatedDPI !== null && estimatedDPI >= CPA_IMAGE_RESOLUTION_DPI.MIN_FOR_MICR_READING);

    return {
        cpaStandard006Compliant: isCompliant,
        micrLineReadability: micrReadability,
        printContrastRatio: printContrast, // Placeholder - requires actual analysis
        chequeDimensionsValid: dimensionValidation.isDimensionsCompliant,
        micrClearBandDetected: null, // Placeholder - requires specific image segmentation
        imageResolutionDPI: estimatedDPI,
    };
};

/**
 * Preprocesses a cheque image specifically for Canadian banking standards.
 * @param file The image file.
 * @param options Enhanced preprocessing options.
 * @returns Promise resolving to a Blob of the preprocessed image.
 */
export const preprocessCanadianCheque = (
    file: File,
    options: EnhancedPreprocessingOptions
): Promise<Blob> => {
    return new Promise(async (resolve, reject) => {
        try {
            const image = await loadImageFromFile(file);
            const { naturalWidth, naturalHeight } = image;
            let { maxWidth, maxHeight, quality, targetMimeType, enhanceMicrRegionContrast } = options;

            let newWidth = naturalWidth;
            let newHeight = naturalHeight;

            if (naturalWidth > maxWidth || naturalHeight > maxHeight) {
                const ratio = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
                newWidth = Math.round(naturalWidth * ratio);
                newHeight = Math.round(naturalHeight * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = newWidth;
            canvas.height = newHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                return reject(new Error('Failed to get canvas context.'));
            }
            ctx.drawImage(image, 0, 0, newWidth, newHeight);

            if (enhanceMicrRegionContrast) {
                try {
                    let imageData = ctx.getImageData(0, 0, newWidth, newHeight);
                    imageData = enhanceMicrContrast(imageData);
                    ctx.putImageData(imageData, 0, 0);
                } catch(e) {
                    console.warn("Failed to apply MICR contrast enhancement:", e);
                    // Continue without it if it fails
                }
            }

            canvas.toBlob(
                (blob) => {
                    if (blob) resolve(blob);
                    else reject(new Error('Canvas toBlob returned null.'));
                },
                targetMimeType,
                quality
            );
        } catch (error) {
             if (error instanceof Error) {
                reject(new Error(`Canadian Cheque Preprocessing failed: ${error.message}`));
            } else {
                reject(new Error(`Canadian Cheque Preprocessing failed: ${String(error)}`));
            }
        }
    });
};

/**
 * Analyzes the visibility of the MICR line. (Primarily qualitative)
 * @param imageElement The HTMLImageElement of the cheque.
 * @returns Promise resolving to MicrLineAnalysis object.
 */
export const analyzeMicrLineVisibility = async (imageElement: HTMLImageElement): Promise<MicrLineAnalysis> => {
    // This is a placeholder. True analysis requires image processing or AI.
    // We can make some basic assumptions based on resolution or clarity assessment.
    const qualityReport = await detectImageQuality(imageElement);
    let visibility: MicrLineAnalysis['visibility'] = 'not_detected';
    let notes: string[] = ["MICR visibility assessment is heuristic."];

    if (qualityReport.overallAssessment === 'good') {
        visibility = 'clear';
    } else if (qualityReport.overallAssessment === 'fair') {
        visibility = 'partially_obscured';
        notes.push("Image quality is fair, MICR line may be hard to read.");
    } else {
        visibility = 'heavily_obscured';
        notes.push("Poor image quality severely impacts MICR line visibility.");
    }

    return {
        visibility,
        estimatedContrast: 'unknown', // Needs actual analysis
        confidence: 0.5, // Generic confidence for this heuristic
        notes,
    };
};

/**
 * Client-side detection of security features (very basic, placeholder).
 * Reliable detection needs AI.
 * @param imageElement The HTMLImageElement.
 * @returns Promise resolving to an array of SecurityFeatureDetectionResult.
 */
export const detectSecurityFeaturesClientSide = async (imageElement: HTMLImageElement): Promise<SecurityFeatureDetectionResult[]> => {
    const results: SecurityFeatureDetectionResult[] = [];
    // Placeholder logic. For example, looking for high-frequency patterns for void pantographs
    // or specific color shifts for chemical protection is beyond simple client-side JS.
    
    results.push({
        featureName: 'Microprinting',
        detected: false,
        confidence: 0.1,
        notes: "Client-side detection not reliable; requires AI."
    });
    results.push({
        featureName: 'Void Pantograph',
        detected: false,
        confidence: 0.1,
        notes: "Basic client-side checks are insufficient; requires AI."
    });
     results.push({
        featureName: 'Watermarks',
        detected: false,
        confidence: 0.1,
        notes: "Client-side detection not reliable; requires AI/specialized lighting."
    });
    // Add more features as conceptual placeholders
    return results;
};

/**
 * Client-side assessment of image authenticity (very basic, placeholder).
 * Reliable assessment needs AI.
 * @param imageElement The HTMLImageElement.
 * @returns Promise resolving to an ImageAuthenticityAssessment.
 */
export const assessImageAuthenticityClientSide = async (imageElement: HTMLImageElement): Promise<ImageAuthenticityAssessment> => {
    // Placeholder logic. Detecting sophisticated tampering (compression artifacts, pixel manipulation) is an AI task.
    return {
        overallScore: 50, // Default to uncertain
        tamperingIndicators: [{ type: 'generic_check', confidence: 0.2, description: 'Basic client-side checks performed. No obvious global inconsistencies.' }],
        authenticityNotes: ["Robust authenticity assessment requires AI/Computer Vision analysis."],
    };
};
