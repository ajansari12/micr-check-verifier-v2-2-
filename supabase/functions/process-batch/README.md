# Batch Processing Edge Function

## Overview
The `process-batch` edge function orchestrates the complete Canadian cheque verification workflow for multiple cheques at once. It handles batch file uploads (individual images or archives like ZIP/PDF/TIFF), coordinates the processing pipeline through other specialized edge functions, and provides comprehensive batch reporting.

## Key Features
- Extracts individual cheques from batch files (ZIP, multi-page PDF, TIFF)
- Orchestrates the full analysis pipeline for each cheque:
  - `analyze-cheque` for MICR and basic analysis
  - `detect-institution` for financial institution validation
  - `analyze-compliance` for regulatory compliance
  - `generate-decision` for final decision intelligence
- Provides real-time batch status tracking and progress updates
- Generates comprehensive batch reports with risk analysis
- Identifies OSFI-reportable items and high-risk transactions
- Implements robust error handling with retry mechanisms
- Creates detailed audit trails for compliance purposes
- Offers parallel and sequential processing options

## API Usage

### Request Format
```json
{
  "batchId": "BATCH-20250612-001",
  "batchName": "Daily Deposit Batch",
  "batchType": "zip",
  "zipFileBase64": "base64EncodedZipData...",
  "processingOptions": {
    "priorityLevel": "medium",
    "processingMode": "standard",
    "verificationLevel": "enhanced",
    "parallelProcessing": true
  },
  "userId": "user_123"
}
```

### Response Format
```json
{
  "batchId": "BATCH-20250612-001",
  "status": "queued",
  "totalItems": 25,
  "processedItems": 0,
  "successfulItems": 0,
  "failedItems": 0,
  "itemIds": ["item_1", "item_2", "..."],
  "processingStats": {
    "startTime": "2025-06-12T10:30:00Z"
  },
  "processingTime": 154,
  "nextActions": [
    "Check batch status periodically",
    "Retrieve detailed results when processing is complete"
  ]
}
```

## Processing Pipeline
1. **Batch Intake**: Extract items from ZIP/PDF/TIFF or process individual images
2. **Database Initialization**: Create batch record with queued status
3. **Item Processing**: For each item in the batch:
   - Call `analyze-cheque` for MICR data extraction
   - Call `detect-institution` for FI validation
   - Call `analyze-compliance` for regulatory checks
   - Call `generate-decision` for final determination
4. **Progress Tracking**: Update processing status after each item
5. **Batch Completion**: Generate comprehensive batch report with risk profile
6. **Notification**: Flag high-risk items for additional review

## Database Integration
- Updates `batch_processing` table with real-time status
- Creates detailed records in `batch_cheques` for individual items
- Logs audit trail entries in `decision_audit_trail`
- Creates notifications in `decision_notifications` for high-risk items

## Error Handling
- Individual cheque failures don't stop batch processing
- Implements exponential backoff retry for transient errors
- Detailed error logging for troubleshooting
- Gracefully handles interruptions with partial completion status

## Performance Considerations
- Configurable parallel processing with concurrency limits
- Rate limiting to prevent API throttling
- Processing speed control via itemsPerSecond parameter
- Background processing to allow immediate client response

## Canadian Banking Compliance
- OSFI reportability tracking
- CPA Standard 006 compliance verification
- Comprehensive risk scoring
- Complete audit trail for regulatory purposes