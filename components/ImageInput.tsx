
import React, { useRef, useState, useCallback, useEffect, DragEvent } from 'react';
import LoadingSpinner from './LoadingSpinner'; // Assuming LoadingSpinner is available
import { APP_FILE_REQUIREMENTS, CPA_CHEQUE_DIMENSIONS, MICR_SYMBOLS_MAP } from '../constants'; // For validation

interface ImageInputProps {
  onImageSelected: (file: File, base64Preview: string) => void;
  onClearImage: () => void;
  isLoading: boolean; // Overall app loading state (e.g., API calls)
  isMobile: boolean;
}

type ImageInputState = 'idle' | 'validatingFile' | 'cameraPreview' | 'error';

const ImageInput: React.FC<ImageInputProps> = React.memo(({ onImageSelected, onClearImage, isLoading, isMobile }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [currentInputState, setCurrentInputState] = useState<ImageInputState>('idle');
  const [validationMessage, setValidationMessage] = useState<{text: string, type: 'error' | 'warning' | 'info'} | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Refs for event handlers to ensure stable references
  const onLoadedMetadataRef = useRef<(() => void) | null>(null);
  const onPlayingRef = useRef<(() => void) | null>(null);
  const onVideoErrorRef = useRef<((event: Event) => void) | null>(null);

  const resetValidationMessage = () => setValidationMessage(null);

  const validateAndProcessFile = useCallback((file: File) => {
    resetValidationMessage();
    setCurrentInputState('validatingFile');

    // 1. File Type Validation
    if (!APP_FILE_REQUIREMENTS.SUPPORTED_FORMATS.includes(file.type)) {
      setValidationMessage({
        text: `Invalid file type: ${file.type}. Please upload JPEG, PNG, or TIFF files only.`,
        type: 'error'
      });
      setCurrentInputState('error');
      return;
    }

    // 2. File Size Validation
    if (file.size < APP_FILE_REQUIREMENTS.MIN_SIZE_BYTES) {
      setValidationMessage({
        text: `File too small (${(file.size / 1024).toFixed(1)}KB). Minimum size is ${(APP_FILE_REQUIREMENTS.MIN_SIZE_BYTES / 1024)}KB for adequate quality.`,
        type: 'error'
      });
      setCurrentInputState('error');
      return;
    }
    if (file.size > APP_FILE_REQUIREMENTS.MAX_SIZE_BYTES) {
      setValidationMessage({
        text: `File too large (${(file.size / (1024*1024)).toFixed(1)}MB). Maximum size is ${APP_FILE_REQUIREMENTS.MAX_SIZE_BYTES / (1024*1024)}MB.`,
        type: 'error'
      });
      setCurrentInputState('error');
      return;
    }
    
    // If validation passes
    setValidationMessage({ text: "File validated. Processing preview...", type: 'info' });
    const reader = new FileReader();
    reader.onloadend = () => {
      onImageSelected(file, reader.result as string);
      setCurrentInputState('idle'); // Parent will handle loading state for API
      resetValidationMessage();
    };
    reader.onerror = () => {
        setValidationMessage({text: "Error reading file.", type: 'error'});
        setCurrentInputState('error');
    }
    reader.readAsDataURL(file);

  }, [onImageSelected]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      validateAndProcessFile(file);
    }
  }, [validateAndProcessFile]);

  const removeVideoEventListeners = useCallback(() => {
    if (videoRef.current) {
      if (onLoadedMetadataRef.current) videoRef.current.removeEventListener('loadedmetadata', onLoadedMetadataRef.current);
      if (onPlayingRef.current) videoRef.current.removeEventListener('playing', onPlayingRef.current);
      if (onVideoErrorRef.current) videoRef.current.removeEventListener('error', onVideoErrorRef.current);
    }
  }, []); 

  const closeCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null); 
    setCurrentInputState('idle');
    setValidationMessage(null);
    setIsVideoReady(false);
    removeVideoEventListeners();
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.pause();
      videoRef.current.removeAttribute('src'); 
      videoRef.current.load(); 
    }
  }, [stream, removeVideoEventListeners]);

  useEffect(() => {
    if (currentInputState === 'cameraPreview' && stream && videoRef.current) {
      const videoElement = videoRef.current;
      videoElement.srcObject = stream;

      onLoadedMetadataRef.current = () => {
        videoElement.play().catch(playError => {
          console.error("Video play() failed:", playError);
          setValidationMessage({text: `Failed to start camera preview. Error: ${playError.name}. Ensure permissions are granted.`, type: 'error'});
          setIsVideoReady(false);
        });
      };
      onPlayingRef.current = () => setIsVideoReady(true);
      onVideoErrorRef.current = (event: Event) => {
        console.error('Video element error:', event);
        setValidationMessage({text: 'Error with video stream. Try reopening camera.', type: 'error'});
        setIsVideoReady(false);
      };

      videoElement.addEventListener('loadedmetadata', onLoadedMetadataRef.current);
      videoElement.addEventListener('playing', onPlayingRef.current);
      videoElement.addEventListener('error', onVideoErrorRef.current);

      return () => { 
        removeVideoEventListeners();
        if (videoElement) { videoElement.pause(); videoElement.srcObject = null; }
      };
    }
  }, [currentInputState, stream, removeVideoEventListeners]);

  const openCamera = useCallback(async () => {
    resetValidationMessage();
    setIsVideoReady(false);
    if (stream) closeCamera();

    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      setValidationMessage({text: "Camera API not supported.", type: 'error'});
      setCurrentInputState('error');
      return;
    }

    try {
      setCurrentInputState('cameraPreview');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: isMobile ? 'environment' : 'user' } });
      setStream(mediaStream);
    } catch (err) {
      console.error("Error accessing camera:", err);
      let msg = "Could not access camera. Check permissions.";
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") msg = "Camera access denied. Please allow permission.";
        else if (err.name === "NotFoundError") msg = `No ${isMobile ? 'rear' : 'front'} camera found.`;
        else if (err.name === "NotReadableError") msg = "Camera in use or unreadable.";
      }
      setValidationMessage({text: msg, type: 'error'});
      setCurrentInputState('error');
      setStream(null); 
    }
  }, [isMobile, closeCamera, stream]);

  const captureImage = useCallback(() => {
    if (currentInputState !== 'cameraPreview' || !isVideoReady || !videoRef.current || !canvasRef.current || !stream) {
        setValidationMessage({text: "Camera not ready for capture.", type: 'warning'});
        return;
    }
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setValidationMessage({text: "Camera has no video data.", type: 'error'});
      setIsVideoReady(false); 
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (context) {
      if (!isMobile && stream.getVideoTracks()[0]?.getSettings().facingMode === 'user') { // Mirror front camera
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (blob) {
          const file = new File([blob], "camera_capture.jpg", { type: "image/jpeg" });
          validateAndProcessFile(file); // Validate before passing up
          closeCamera(); 
        } else {
          setValidationMessage({text: "Failed to create image blob.", type: 'error'});
        }
      }, 'image/jpeg', 0.95);
    } else {
       setValidationMessage({text: "Failed to get canvas context.", type: 'error'});
    }
  }, [currentInputState, isVideoReady, stream, validateAndProcessFile, closeCamera, isMobile]);

  const triggerFileInput = useCallback(() => fileInputRef.current?.click(),[]);
  
  useEffect(() => { // Cleanup stream on component unmount
    const currentStreamForUnmount = stream;
    return () => {
      if (currentStreamForUnmount) currentStreamForUnmount.getTracks().forEach(track => track.stop());
    };
  }, [stream]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    resetValidationMessage();

    if (isLoading || currentInputState === 'cameraPreview') return;

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndProcessFile(files[0]);
      event.dataTransfer.clearData();
    }
  }, [isLoading, currentInputState, validateAndProcessFile]);

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    if (isLoading || currentInputState === 'cameraPreview') return;
    resetValidationMessage();

    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            // Ensure it's a File object
            const file = new File([blob], `pasted_image.${blob.type.split('/')[1] || 'png'}`, { type: blob.type });
            validateAndProcessFile(file);
            return;
          }
        }
      }
      setValidationMessage({text: "No image found in clipboard.", type: 'warning'});
    }
  }, [isLoading, currentInputState, validateAndProcessFile]);

  useEffect(() => {
    document.addEventListener('paste', handlePaste as EventListener);
    return () => {
      document.removeEventListener('paste', handlePaste as EventListener);
    };
  }, [handlePaste]);


  // SVG Cheque Guide
  const ChequeGuideSVG = () => (
    <svg viewBox="0 0 300 130" className="w-full h-auto max-w-xs mx-auto opacity-75 my-2" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="298" height="128" rx="5" stroke="#1e3a8a" strokeWidth="2" strokeDasharray="4 4"/>
      {/* Date */}
      <rect x="230" y="10" width="60" height="15" fill="#1e3a8a" fillOpacity="0.1" rx="2"/>
      <text x="260" y="20" fontSize="8" textAnchor="middle" fill="#1e3a8a">DATE</text>
      {/* Payee */}
      <rect x="15" y="35" width="200" height="15" fill="#1e3a8a" fillOpacity="0.1" rx="2"/>
      <text x="115" y="45" fontSize="8" textAnchor="middle" fill="#1e3a8a">PAY TO THE ORDER OF</text>
      {/* Amount Words */}
      <rect x="15" y="55" width="270" height="15" fill="#1e3a8a" fillOpacity="0.1" rx="2"/>
      <text x="150" y="65" fontSize="8" textAnchor="middle" fill="#1e3a8a">AMOUNT IN WORDS</text>
       {/* Amount Numerals */}
      <rect x="230" y="35" width="60" height="15" fill="#1e3a8a" fillOpacity="0.1" rx="2"/>
      <text x="260" y="45" fontSize="8" textAnchor="middle" fill="#1e3a8a">$ [NUMERALS]</text>
      {/* Memo */}
      <rect x="15" y="75" width="120" height="15" fill="#1e3a8a" fillOpacity="0.1" rx="2"/>
      <text x="75" y="85" fontSize="8" textAnchor="middle" fill="#1e3a8a">MEMO</text>
      {/* Signature */}
      <rect x="150" y="75" width="135" height="25" fill="#1e3a8a" fillOpacity="0.1" rx="2"/>
      <text x="217" y="88" fontSize="8" textAnchor="middle" fill="#1e3a8a">SIGNATURE</text>
      {/* MICR Line */}
      <rect x="15" y="105" width="270" height="15" fill="#dc2626" fillOpacity="0.2" rx="2"/>
      <text x="150" y="115" fontSize="8" textAnchor="middle" fill="#dc2626">
        {MICR_SYMBOLS_MAP.o}ACCOUNT{MICR_SYMBOLS_MAP.o} {MICR_SYMBOLS_MAP.t}TRANSIT{MICR_SYMBOLS_MAP.t} {MICR_SYMBOLS_MAP.a}AMOUNT{MICR_SYMBOLS_MAP.a}
      </text>
    </svg>
  );
  
  const commonButtonClasses = "flex-1 font-semibold py-2.5 px-4 rounded-md transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm sm:text-base";

  if (isLoading && currentInputState !== 'cameraPreview') { // Global loading state, disable most inputs
      return (
          <div className="p-6 bg-white shadow-lg rounded-xl border border-blue-200 text-center">
              <h3 className="text-xl font-semibold text-blue-800 mb-4">Processing Analysis...</h3>
              <LoadingSpinner size="h-12 w-12" color="text-blue-700" />
              <p className="text-slate-600 mt-3 text-sm">Please wait while the cheque details are being analyzed.</p>
          </div>
      );
  }


  return (
    <div 
      className={`p-4 sm:p-6 bg-white shadow-lg rounded-xl border ${isDragging ? 'border-blue-600 ring-2 ring-blue-500' : 'border-blue-200'} transition-all duration-200`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
    
    {currentInputState !== 'cameraPreview' && (
      <>
        <h3 className="text-xl font-semibold text-blue-800 mb-1">Upload or Capture Cheque Image</h3>
        <p className="text-xs text-slate-500 mb-4">Ensure image meets Canadian banking standards for best results.</p>
        
        <div className="grid md:grid-cols-2 gap-6 mb-4 items-start">
            {/* Guidance Section */}
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <h4 className="text-md font-semibold text-blue-700 mb-2">Positioning & Quality Guide:</h4>
                <ChequeGuideSVG />
                <ul className="text-xs text-slate-700 space-y-1 mt-2">
                    <li><strong className="text-blue-700">Format:</strong> JPEG, PNG, or TIFF.</li>
                    <li><strong className="text-blue-700">Size:</strong> 50KB - {APP_FILE_REQUIREMENTS.MAX_SIZE_BYTES / (1024*1024)}MB.</li>
                    <li><strong className="text-blue-700">Clarity:</strong> Image must be clear, in focus.</li>
                    <li><strong className="text-blue-700">Lighting:</strong> Use even lighting, avoid shadows/glare.</li>
                    <li><strong className="text-blue-700">Alignment:</strong> Cheque should be flat, fill most of the frame.</li>
                    <li><strong className="text-blue-700">MICR Line:</strong> Ensure bottom MICR line is fully visible and legible.</li>
                </ul>
                 <p className="text-xs text-slate-500 mt-2 italic">Aspect ratio should be ~{CPA_CHEQUE_DIMENSIONS.ASPECT_RATIO_TYPICAL.toFixed(2)}:1 (e.g., 6.25" x 2.75").</p>
            </div>
            {/* Action Section */}
            <div className="space-y-4">
                 <div 
                    onClick={triggerFileInput}
                    className={`p-6 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
                                ${isDragging ? 'border-blue-600 bg-blue-100' : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'}
                                ${(isLoading || currentInputState === 'validatingFile') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    role="button"
                    tabIndex={0}
                    onKeyPress={(e) => e.key === 'Enter' && triggerFileInput()}
                    aria-label="Upload check image from file by clicking or dragging"
                >
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/jpeg,image/png,image/tiff" className="hidden" disabled={isLoading || currentInputState === 'validatingFile'}/>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 mx-auto text-slate-400 mb-2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338 0 4.5 4.5 0 01-1.41 8.775H6.75z" /></svg>
                    <p className="text-sm text-slate-600 font-medium">
                        <span className="text-blue-600 font-semibold">Click to upload</span> or drag & drop
                    </p>
                    <p className="text-xs text-slate-500 mt-1">You can also paste an image from clipboard.</p>
                </div>

                <button
                    onClick={openCamera}
                    disabled={isLoading || currentInputState === 'validatingFile'}
                    className={`${commonButtonClasses} bg-teal-600 hover:bg-teal-700 text-white`}
                    aria-live="polite"
                    aria-label={`Open ${isMobile ? 'rear' : 'front'} camera`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                    Use Camera
                </button>
            </div>
        </div>
      </>
    )}

      {validationMessage && (
          <div className={`p-3 my-3 rounded-md text-sm border ${
              validationMessage.type === 'error' ? 'bg-red-50 border-red-300 text-red-700' :
              validationMessage.type === 'warning' ? 'bg-yellow-50 border-yellow-300 text-yellow-700' :
              'bg-blue-50 border-blue-300 text-blue-700'
          }`} role={validationMessage.type === 'error' ? 'alert' : 'status'}>
              {validationMessage.text}
          </div>
      )}
      {currentInputState === 'validatingFile' && !validationMessage?.text.includes("validated") && (
        <div className="text-center py-3">
          <LoadingSpinner size="h-6 w-6" color="text-blue-600" />
          <p className="text-sm text-slate-600 mt-1">Validating file...</p>
        </div>
      )}


      {currentInputState === 'cameraPreview' && (
        <div className="mt-4 border border-slate-300 rounded-lg overflow-hidden shadow-inner bg-slate-800">
          <div className="relative aspect-[4/3] max-h-[70vh] w-full mx-auto">
            <video
              ref={videoRef}
              className={`absolute inset-0 w-full h-full object-contain bg-black ${
                !isMobile && stream?.getVideoTracks()[0]?.getSettings().facingMode === 'user'
                  ? '[-webkit-transform:scaleX(-1)] [transform:scaleX(-1)]' 
                  : ''
              }`}
              playsInline
              muted
              aria-label="Live camera preview"
            />
            {/* Alignment Guides Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[90%] h-[85%] border-2 border-dashed border-red-500/70 rounded-md relative opacity-60">
                    <div className="absolute text-xs text-white bg-red-600/80 px-1 py-0.5 rounded -top-2 left-1/2 -translate-x-1/2">Align Cheque Within Red Box</div>
                    {/* MICR Line Guide */}
                    <div className="absolute bottom-[8%] left-[5%] w-[90%] h-[12%] border-t-2 border-dashed border-yellow-400/80 rounded">
                         <div className="absolute text-xs text-black bg-yellow-400/90 px-1 py-0.5 rounded -top-2.5 left-1/2 -translate-x-1/2">MICR Line Area</div>
                    </div>
                </div>
            </div>
             {!isVideoReady && !validationMessage && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white p-4">
                    <LoadingSpinner size="h-8 w-8" />
                    <p className="mt-2 text-sm">Initializing Camera...</p>
                 </div>
             )}
          </div>
          <canvas ref={canvasRef} className="hidden" aria-hidden="true"></canvas>
          <div className="p-3 bg-slate-700 flex space-x-3">
              <button
                  onClick={captureImage}
                  disabled={isLoading || !stream || !isVideoReady} 
                  className={`${commonButtonClasses} bg-green-500 hover:bg-green-600 text-white`}
                  aria-label="Capture image from camera"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /></svg>
                  Capture Image
              </button>
              <button
                  onClick={closeCamera}
                  disabled={isLoading}
                  className={`${commonButtonClasses} bg-red-600 hover:bg-red-700 text-white`}
                  aria-label="Close camera"
                >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 mr-2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                Close Camera
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export default ImageInput;
