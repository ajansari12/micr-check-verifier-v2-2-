# Supabase Edge Functions Setup for MICR Check Verifier

## 🚀 Complete Setup Instructions

### Prerequisites
- Supabase CLI installed (`npm install -g supabase`)
- Docker Desktop running (for local development)
- Node.js 18+ installed

### 1. Project Initialization

```bash
# Initialize Supabase project (if not already done)
supabase init

# Start local Supabase instance
supabase start

# Check status
supabase status
```

### 2. Environment Variables Setup

Create a `.env` file in your project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your_anon_key_here

# Edge Function Secrets (for deployment)
GEMINI_API_KEY=your_gemini_api_key_here
SUPABASE_URL=your_production_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 3. Database Setup

```bash
# Run migrations to create compliance tables
supabase db reset

# Or apply specific migration
supabase migration up
```

### 4. Edge Functions Deployment

```bash
# Deploy all edge functions
supabase functions deploy analyze-cheque
supabase functions deploy analyze-compliance  
supabase functions deploy detect-institution
supabase functions deploy generate-decision

# Deploy the unified function (alternative approach)
supabase functions deploy gemini-analysis
```

### 5. Set Edge Function Secrets

```bash
# Set Gemini API key
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here

# Set Supabase configuration for edge functions
supabase secrets set SUPABASE_URL=your_supabase_project_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 6. Test Edge Functions

```bash
# Test analyze-cheque function
curl -X POST "http://localhost:54321/functions/v1/analyze-cheque" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"imageBase64": "base64_encoded_image_data"}'

# Test analyze-compliance function  
curl -X POST "http://localhost:54321/functions/v1/analyze-compliance" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"imageBase64": "base64_encoded_image_data"}'
```

### 7. Production Deployment

```bash
# Link to production project
supabase link --project-ref your-project-ref

# Deploy to production
supabase functions deploy analyze-cheque --project-ref your-project-ref
supabase functions deploy analyze-compliance --project-ref your-project-ref
supabase functions deploy detect-institution --project-ref your-project-ref
supabase functions deploy generate-decision --project-ref your-project-ref

# Set production secrets
supabase secrets set GEMINI_API_KEY=your_production_gemini_key --project-ref your-project-ref
```

## 📁 Project Structure

```
supabase/
├── config.toml                 # Supabase configuration
├── migrations/
│   └── 001_create_compliance_tables.sql
└── functions/
    ├── _shared/
    │   ├── cors.ts             # CORS utilities
    │   ├── gemini.ts           # Gemini AI utilities  
    │   └── compliance.ts       # Compliance logging
    ├── analyze-cheque/
    │   └── index.ts            # MICR extraction & analysis
    ├── analyze-compliance/
    │   └── index.ts            # Canadian banking compliance
    ├── detect-institution/
    │   └── index.ts            # Financial institution validation
    ├── generate-decision/
    │   └── index.ts            # AI-powered decision intelligence
    └── gemini-analysis/         # Unified function (alternative)
        └── index.ts
```

## 🔧 Function Descriptions

### 1. analyze-cheque
- **Purpose**: MICR line extraction and basic cheque analysis
- **Input**: Base64 encoded cheque image
- **Output**: Extracted MICR data, payee, amounts, dates
- **Compliance**: CPA Standard 006 validation

### 2. analyze-compliance  
- **Purpose**: Canadian banking regulatory compliance checks
- **Input**: Cheque image and optional cheque data
- **Output**: OSFI, PIPEDA, CPA compliance assessment
- **Features**: Date validation, regulatory flag detection

### 3. detect-institution
- **Purpose**: Financial institution identification and validation  
- **Input**: Cheque image and optional transit number
- **Output**: Institution details, risk assessment, OSFI regulation status
- **Features**: Visual + MICR-based validation

### 4. generate-decision
- **Purpose**: AI-powered operational decision intelligence
- **Input**: Aggregated analysis data from other functions
- **Output**: Risk assessment, operational guidance, compliance requirements
- **Features**: Canadian banking context, regulatory compliance

## 🛡️ Security & Compliance Features

- **Row Level Security (RLS)** enabled on all tables
- **Compliance logging** for all operations
- **OSFI reportability** assessment
- **PIPEDA data handling** compliance
- **Audit trail** with session tracking
- **Risk level** classification for all operations

## 🔍 Monitoring & Debugging

```bash
# View function logs
supabase functions logs analyze-cheque

# Monitor in real-time
supabase functions logs analyze-cheque --follow

# Check compliance logs
supabase db inspect
```

## 📋 Troubleshooting

### Common Issues:

1. **CORS Errors**: Ensure CORS headers are properly set in all functions
2. **API Key Issues**: Verify Gemini API key is set in Supabase secrets  
3. **Database Permissions**: Check RLS policies for proper access
4. **Function Timeouts**: Monitor processing times in compliance logs

### Health Check Endpoints:

Each function supports OPTIONS requests for CORS preflight and can be used for basic health checks.

## 🚀 Next Steps

1. Test all functions with sample cheque images
2. Configure production environment variables
3. Set up monitoring and alerting
4. Implement additional security measures as needed
5. Review compliance logs regularly for OSFI reporting requirements

Your MICR Check Verifier is now ready for Canadian banking operations with full regulatory compliance! 🇨🇦